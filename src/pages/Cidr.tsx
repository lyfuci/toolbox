import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// IPv4 parsing (kept on `number` for backwards compatibility with the previous
// implementation, but we mirror it onto BigInt for the unified containment /
// overlap helpers below).
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.')
  if (parts.length !== 4) throw new Error('IPv4 must have 4 octets')
  const nums = parts.map((p) => {
    const n = Number(p)
    if (!/^\d+$/.test(p) || n < 0 || n > 255) throw new Error(`Invalid octet: ${p}`)
    return n
  })
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0
}

function intToIpv4(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.')
}

// ---------------------------------------------------------------------------
// IPv6 parsing (BigInt-backed; supports `::` shorthand, IPv4-mapped tail
// `::ffff:a.b.c.d`, strips zone IDs `%eth0`).
// ---------------------------------------------------------------------------

function ipv6ToBig(input: string): bigint {
  // Strip zone identifier — purely a routing hint, irrelevant to math.
  const zoneIdx = input.indexOf('%')
  const ip = zoneIdx >= 0 ? input.slice(0, zoneIdx) : input

  // Handle IPv4-mapped tail by expanding to two 16-bit groups.
  let expanded = ip
  const lastColon = ip.lastIndexOf(':')
  const tail = lastColon >= 0 ? ip.slice(lastColon + 1) : ip
  if (tail.includes('.')) {
    const v4 = ipv4ToInt(tail)
    const high = (v4 >>> 16) & 0xffff
    const low = v4 & 0xffff
    expanded = ip.slice(0, lastColon + 1) + high.toString(16) + ':' + low.toString(16)
  }

  const dcIdx = expanded.indexOf('::')
  let groups: string[]
  if (dcIdx >= 0) {
    const left = expanded.slice(0, dcIdx).split(':').filter((p) => p !== '')
    const right = expanded.slice(dcIdx + 2).split(':').filter((p) => p !== '')
    const missing = 8 - left.length - right.length
    if (missing < 0) throw new Error('Too many groups in IPv6 address')
    groups = [...left, ...Array(missing).fill('0'), ...right]
  } else {
    groups = expanded.split(':')
  }
  if (groups.length !== 8) throw new Error('IPv6 must have 8 groups')

  let out = 0n
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) throw new Error(`Invalid IPv6 group: ${g}`)
    out = (out << 16n) | BigInt(parseInt(g, 16))
  }
  return out
}

function bigToIpv6(n: bigint): string {
  const groups: string[] = []
  for (let i = 7; i >= 0; i--) {
    groups.push(((n >> BigInt(i * 16)) & 0xffffn).toString(16))
  }
  // Collapse the longest run of "0" groups into "::".
  let bestStart = -1
  let bestLen = 0
  let runStart = -1
  let runLen = 0
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === '0') {
      if (runStart < 0) runStart = i
      runLen++
      if (runLen > bestLen) {
        bestLen = runLen
        bestStart = runStart
      }
    } else {
      runStart = -1
      runLen = 0
    }
  }
  if (bestLen < 2) return groups.join(':')
  return (
    groups.slice(0, bestStart).join(':') +
    '::' +
    groups.slice(bestStart + bestLen).join(':')
  )
}

// ---------------------------------------------------------------------------
// Unified CIDR description (works for both v4 and v6 via BigInt).
// ---------------------------------------------------------------------------

type Family = 4 | 6

type CidrParsed = {
  family: Family
  network: bigint
  prefix: number
  bits: number
}

function parseCidr(text: string): CidrParsed {
  const trimmed = text.trim()
  const slash = trimmed.indexOf('/')
  if (slash === -1) throw new Error('Missing /prefix')
  const ipPart = trimmed.slice(0, slash)
  const prefixPart = trimmed.slice(slash + 1)
  const prefix = Number(prefixPart)
  if (!/^\d+$/.test(prefixPart)) throw new Error('prefix must be an integer')

  const family: Family = ipPart.includes(':') ? 6 : 4
  const bits = family === 4 ? 32 : 128
  if (prefix < 0 || prefix > bits) throw new Error(`prefix must be 0-${bits}`)

  const ip = family === 4 ? BigInt(ipv4ToInt(ipPart)) : ipv6ToBig(ipPart)
  const hostBits = BigInt(bits - prefix)
  const mask = hostBits === BigInt(bits) ? 0n : ((1n << BigInt(bits)) - 1n) ^ ((1n << hostBits) - 1n)
  const network = ip & mask
  return { family, network, prefix, bits }
}

function fmtIp(family: Family, n: bigint): string {
  return family === 4 ? intToIpv4(Number(n & 0xffffffffn)) : bigToIpv6(n)
}

type V4Info = {
  network: string
  broadcast: string
  netmask: string
  wildcard: string
  prefix: number
  hostCount: number
  totalCount: number
  firstUsable: string
  lastUsable: string
  classLabel: string
}

function classify(firstOctet: number): string {
  if (firstOctet < 128) return 'A'
  if (firstOctet < 192) return 'B'
  if (firstOctet < 224) return 'C'
  if (firstOctet < 240) return 'D (multicast)'
  return 'E (reserved)'
}

function computeV4(cidr: string): V4Info {
  const slash = cidr.indexOf('/')
  if (slash === -1) throw new Error('Missing /prefix')
  const ipPart = cidr.slice(0, slash)
  const prefixPart = cidr.slice(slash + 1)
  const prefix = Number(prefixPart)
  if (!/^\d+$/.test(prefixPart) || prefix < 0 || prefix > 32) {
    throw new Error('prefix must be 0-32')
  }
  const ip = ipv4ToInt(ipPart)
  const mask = prefix === 0 ? 0 : ((-1 << (32 - prefix)) >>> 0)
  const wildcard = ~mask >>> 0
  const network = ip & mask
  const broadcast = (network | wildcard) >>> 0
  const totalCount = prefix === 32 ? 1 : Math.pow(2, 32 - prefix)
  const hostCount = prefix >= 31 ? totalCount : totalCount - 2
  const firstUsable = prefix >= 31 ? intToIpv4(network) : intToIpv4(network + 1)
  const lastUsable = prefix >= 31 ? intToIpv4(broadcast) : intToIpv4(broadcast - 1)
  return {
    network: intToIpv4(network),
    broadcast: intToIpv4(broadcast),
    netmask: intToIpv4(mask),
    wildcard: intToIpv4(wildcard),
    prefix,
    hostCount,
    totalCount,
    firstUsable,
    lastUsable,
    classLabel: classify((ip >>> 24) & 0xff),
  }
}

type V6Info = {
  network: string
  prefix: number
  netmask: string
  firstAddr: string
  lastAddr: string
  totalCount: string
}

function computeV6(cidr: string): V6Info {
  const parsed = parseCidr(cidr)
  if (parsed.family !== 6) throw new Error('Not an IPv6 address')
  const { network, prefix, bits } = parsed
  const hostBits = BigInt(bits - prefix)
  const mask = hostBits === BigInt(bits) ? 0n : ((1n << BigInt(bits)) - 1n) ^ ((1n << hostBits) - 1n)
  const wildcard = (1n << hostBits) - 1n
  const last = network | wildcard
  const total = 1n << hostBits
  return {
    network: bigToIpv6(network),
    prefix,
    netmask: bigToIpv6(mask),
    firstAddr: bigToIpv6(network),
    lastAddr: bigToIpv6(last),
    totalCount: total.toLocaleString('en-US'),
  }
}

// ---------------------------------------------------------------------------
// Binary breakdown — render the netmask and IP, with the host portion dimmed.
// ---------------------------------------------------------------------------

function binaryDotted(n: bigint, family: Family): string {
  if (family === 4) {
    const v = Number(n & 0xffffffffn)
    const bits = v.toString(2).padStart(32, '0')
    return [bits.slice(0, 8), bits.slice(8, 16), bits.slice(16, 24), bits.slice(24, 32)].join('.')
  }
  // IPv6: 128 bits grouped per 16 bits → eight colon-separated chunks.
  const bits = n.toString(2).padStart(128, '0')
  const groups: string[] = []
  for (let i = 0; i < 8; i++) groups.push(bits.slice(i * 16, i * 16 + 16))
  return groups.join(':')
}

// ---------------------------------------------------------------------------
// VLSM / subnet split planner.
// ---------------------------------------------------------------------------

type Allocation = {
  requested: number
  prefix: number
  cidr: string
  firstAddr: string
  lastAddr: string
  totalAddrs: string
}

function planVlsm(parent: CidrParsed, sizes: number[]): Allocation[] {
  // Round each requested host count up to the smallest block whose size >=
  // (requested + 2 for v4 nw/bcast, just `requested` for v6).
  const overhead = parent.family === 4 ? 2 : 0
  const sorted = [...sizes].sort((a, b) => b - a)
  const allocs: Allocation[] = []
  let cursor = parent.network
  const parentEnd =
    parent.network +
    (parent.prefix === parent.bits ? 0n : (1n << BigInt(parent.bits - parent.prefix)) - 1n)

  for (const requested of sorted) {
    if (requested <= 0) throw new Error(`Subnet size must be positive: ${requested}`)
    // Find smallest hostBits such that 2^hostBits >= requested + overhead.
    const need = requested + overhead
    let hostBits = 0
    while (1n << BigInt(hostBits) < BigInt(need)) hostBits++
    const subnetBits = parent.bits - hostBits
    if (subnetBits < parent.prefix) {
      throw new Error(`Subnet too large for parent: requested ${requested}`)
    }
    // Align cursor to this block size.
    const blockSize = 1n << BigInt(hostBits)
    const remainder = cursor % blockSize
    if (remainder !== 0n) cursor += blockSize - remainder
    if (cursor + blockSize - 1n > parentEnd) {
      throw new Error(`Out of space: requested ${requested} won't fit`)
    }
    const last = cursor + blockSize - 1n
    allocs.push({
      requested,
      prefix: subnetBits,
      cidr: `${fmtIp(parent.family, cursor)}/${subnetBits}`,
      firstAddr: fmtIp(parent.family, cursor),
      lastAddr: fmtIp(parent.family, last),
      totalAddrs: blockSize.toLocaleString('en-US'),
    })
    cursor = cursor + blockSize
  }
  return allocs
}

// ---------------------------------------------------------------------------
// Containment / overlap helpers.
// ---------------------------------------------------------------------------

function rangeOf(p: CidrParsed): { start: bigint; end: bigint } {
  const hostBits = BigInt(p.bits - p.prefix)
  const wildcard = hostBits === BigInt(p.bits) ? (1n << BigInt(p.bits)) - 1n : (1n << hostBits) - 1n
  return { start: p.network, end: p.network + wildcard }
}

type Relation = 'equal' | 'aContainsB' | 'bContainsA' | 'overlap' | 'disjoint' | 'familyMismatch'

function relate(a: CidrParsed, b: CidrParsed): Relation {
  if (a.family !== b.family) return 'familyMismatch'
  const ra = rangeOf(a)
  const rb = rangeOf(b)
  if (ra.start === rb.start && ra.end === rb.end) return 'equal'
  const aContains = ra.start <= rb.start && ra.end >= rb.end
  const bContains = rb.start <= ra.start && rb.end >= ra.end
  if (aContains) return 'aContainsB'
  if (bContains) return 'bContainsA'
  const overlaps = ra.start <= rb.end && rb.start <= ra.end
  return overlaps ? 'overlap' : 'disjoint'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CidrPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('192.168.1.10/24')

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: parseCidr(input.trim()) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input])

  const v4Result = useMemo(() => {
    if (!parsed.ok || parsed.value.family !== 4) return null
    try {
      return { ok: true as const, value: computeV4(input.trim()) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [parsed, input])

  const v6Result = useMemo(() => {
    if (!parsed.ok || parsed.value.family !== 6) return null
    try {
      return { ok: true as const, value: computeV6(input.trim()) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [parsed, input])

  const handleCopy = async (label: string, v: string) => {
    await navigator.clipboard.writeText(v)
    toast.success(t('common.copiedLabel', { label }))
  }

  const v4Rows: [string, string][] = v4Result && v4Result.ok
    ? [
        [t('pages.cidr.rowNetwork'), `${v4Result.value.network}/${v4Result.value.prefix}`],
        [t('pages.cidr.rowBroadcast'), v4Result.value.broadcast],
        [t('pages.cidr.rowNetmask'), v4Result.value.netmask],
        [t('pages.cidr.rowWildcard'), v4Result.value.wildcard],
        [t('pages.cidr.rowFirstUsable'), v4Result.value.firstUsable],
        [t('pages.cidr.rowLastUsable'), v4Result.value.lastUsable],
        [t('pages.cidr.rowHosts'), v4Result.value.hostCount.toLocaleString()],
        [t('pages.cidr.rowTotal'), v4Result.value.totalCount.toLocaleString()],
        [t('pages.cidr.rowClass'), v4Result.value.classLabel],
      ]
    : []

  const v6Rows: [string, string][] = v6Result && v6Result.ok
    ? [
        [t('pages.cidr.rowNetwork'), `${v6Result.value.network}/${v6Result.value.prefix}`],
        [t('pages.cidr.rowNetmask'), v6Result.value.netmask],
        [t('pages.cidr.rowFirstAddr'), v6Result.value.firstAddr],
        [t('pages.cidr.rowLastAddr'), v6Result.value.lastAddr],
        [t('pages.cidr.rowTotal'), v6Result.value.totalCount],
      ]
    : []

  // Binary breakdown — IPv4 only (IPv6 binary at 128 bits is unwieldy in a row).
  const binaryRow = useMemo(() => {
    if (!parsed.ok || parsed.value.family !== 4) return null
    const p = parsed.value
    const hostBits = p.bits - p.prefix
    const fullMask = hostBits === p.bits ? 0n : ((1n << BigInt(p.bits)) - 1n) ^ ((1n << BigInt(hostBits)) - 1n)
    return {
      ip: binaryDotted(BigInt(ipv4ToInt(input.trim().split('/')[0])), 4),
      mask: binaryDotted(fullMask, 4),
      prefix: p.prefix,
    }
  }, [parsed, input])

  // VLSM planner state.
  const [vlsmParent, setVlsmParent] = useState('10.0.0.0/24')
  const [vlsmSizes, setVlsmSizes] = useState('50\n25\n10\n5')
  const vlsm = useMemo(() => {
    try {
      const p = parseCidr(vlsmParent.trim())
      const sizes = vlsmSizes
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const n = Number(s)
          if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid size: ${s}`)
          return n
        })
      if (sizes.length === 0) return { ok: true as const, allocs: [] as Allocation[] }
      return { ok: true as const, allocs: planVlsm(p, sizes) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [vlsmParent, vlsmSizes])

  // Containment / overlap.
  const [overlapA, setOverlapA] = useState('10.0.0.0/16')
  const [overlapB, setOverlapB] = useState('10.0.1.0/24')
  const overlap = useMemo<{ ok: true; relation: Relation } | { ok: false; error: string }>(() => {
    try {
      const a = parseCidr(overlapA.trim())
      const b = parseCidr(overlapB.trim())
      return { ok: true, relation: relate(a, b) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [overlapA, overlapB])

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.cidr.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.cidr.description')}</p>
      </header>

      <div className="mb-6">
        <Label className="mb-1.5 block text-xs text-muted-foreground">
          {t('pages.cidr.cidrLabel')}
        </Label>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('pages.cidr.placeholder')}
          spellCheck={false}
          className="font-mono text-sm"
        />
      </div>

      {!parsed.ok ? (
        <div className="text-xs text-destructive">⚠ {parsed.error}</div>
      ) : (
        <>
          {parsed.value.family === 4 && v4Result && v4Result.ok ? (
            <div className="flex flex-col gap-2">
              {v4Rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
                >
                  <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
                    {label}
                  </span>
                  <code className="flex-1 truncate font-mono text-sm">{value}</code>
                  <Button size="sm" variant="ghost" onClick={() => handleCopy(label, value)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : parsed.value.family === 6 && v6Result && v6Result.ok ? (
            <div className="flex flex-col gap-2">
              {v6Rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
                >
                  <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
                    {label}
                  </span>
                  <code className="flex-1 truncate font-mono text-sm">{value}</code>
                  <Button size="sm" variant="ghost" onClick={() => handleCopy(label, value)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {/* Binary breakdown (IPv4 only). */}
          {binaryRow ? (
            <div className="mt-6">
              <Label className="mb-2 block text-xs text-muted-foreground">
                {t('pages.cidr.binaryBreakdown')}
              </Label>
              <div className="space-y-1 rounded-md border border-border bg-card/40 px-3 py-2 font-mono text-xs">
                <BinaryLine
                  label={t('pages.cidr.rowIp')}
                  text={binaryRow.ip}
                  prefix={binaryRow.prefix}
                />
                <BinaryLine
                  label={t('pages.cidr.rowNetmask')}
                  text={binaryRow.mask}
                  prefix={binaryRow.prefix}
                />
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* VLSM / Subnet Split Planner */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          {t('pages.cidr.vlsmTitle')}
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">{t('pages.cidr.vlsmHint')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              {t('pages.cidr.vlsmParent')}
            </Label>
            <Input
              value={vlsmParent}
              onChange={(e) => setVlsmParent(e.target.value)}
              spellCheck={false}
              className="font-mono text-sm"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              {t('pages.cidr.vlsmSizes')}
            </Label>
            <Textarea
              value={vlsmSizes}
              onChange={(e) => setVlsmSizes(e.target.value)}
              spellCheck={false}
              className="min-h-[80px] font-mono text-sm leading-relaxed"
            />
          </div>
        </div>
        {!vlsm.ok ? (
          <div className="mt-3 text-xs text-destructive">⚠ {vlsm.error}</div>
        ) : vlsm.allocs.length === 0 ? null : (
          <div className="mt-3 flex flex-col gap-1.5">
            {vlsm.allocs.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2 font-mono text-xs"
              >
                <span className="w-16 shrink-0 text-muted-foreground">/{a.prefix}</span>
                <code className="w-40 shrink-0">{a.cidr}</code>
                <span className="text-muted-foreground">{a.firstAddr} → {a.lastAddr}</span>
                <span className="ml-auto text-muted-foreground">
                  {t('pages.cidr.vlsmAllocated', { requested: a.requested, total: a.totalAddrs })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Containment / Overlap */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          {t('pages.cidr.overlapTitle')}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              {t('pages.cidr.overlapA')}
            </Label>
            <Input
              value={overlapA}
              onChange={(e) => setOverlapA(e.target.value)}
              spellCheck={false}
              className="font-mono text-sm"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              {t('pages.cidr.overlapB')}
            </Label>
            <Input
              value={overlapB}
              onChange={(e) => setOverlapB(e.target.value)}
              spellCheck={false}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <div className="mt-3 text-sm">
          {overlap.ok ? (
            <span
              className={
                overlap.relation === 'familyMismatch'
                  ? 'text-destructive'
                  : overlap.relation === 'disjoint'
                    ? 'text-muted-foreground'
                    : overlap.relation === 'overlap'
                      ? 'text-amber-500'
                      : 'text-emerald-500'
              }
            >
              {t(`pages.cidr.relation.${overlap.relation}`)}
            </span>
          ) : (
            <span className="text-destructive">⚠ {overlap.error}</span>
          )}
        </div>
      </section>
    </div>
  )
}

function BinaryLine({ label, text, prefix }: { label: string; text: string; prefix: number }) {
  // text is dotted binary "11000000.10101000.00000001.00001010"; we need to
  // colour the first `prefix` bits as "network" and the rest as "host". The
  // dots themselves count for 0 bits so we splice them in as needed.
  const chars: { ch: string; isBit: boolean }[] = []
  for (const ch of text) chars.push({ ch, isBit: /[01]/.test(ch) })
  let seen = 0
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all">
        {chars.map(({ ch, isBit }, i) => {
          let cls = ''
          if (isBit) {
            seen++
            cls = seen <= prefix ? 'text-emerald-500' : 'text-muted-foreground'
          } else {
            cls = 'text-border'
          }
          return (
            <span key={i} className={cls}>
              {ch}
            </span>
          )
        })}
      </span>
    </div>
  )
}
