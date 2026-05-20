import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldTooltip } from '@/components/FieldTooltip'

// The "ANY" pseudo-type fans out to these RR types in parallel. This is the
// pragmatic equivalent of `dig ANY` against modern resolvers (which generally
// refuse real ANY queries — RFC 8482).
const ANY_FANOUT = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CAA', 'SOA'] as const

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA', 'PTR', 'ANY'] as const
type RecordType = (typeof RECORD_TYPES)[number]

type Answer = { name: string; type: number; TTL: number; data: string }
type DohResp = {
  Status: number
  Answer?: Answer[]
  Authority?: Answer[]
  Question?: { name: string; type: number }[]
}

const TYPE_NAMES: Record<number, string> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
  257: 'CAA',
}

const STATUS_LABELS: Record<number, string> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
}

type Resolver = {
  id: 'cloudflare' | 'google' | 'quad9'
  name: string
  url: (name: string, type: string) => string
  // Headers needed per resolver (Cloudflare strictly wants application/dns-json).
  headers?: Record<string, string>
}

const RESOLVERS: Resolver[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    url: (n, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${t}`,
    headers: { Accept: 'application/dns-json' },
  },
  {
    id: 'google',
    name: 'Google',
    url: (n, t) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${t}`,
  },
  {
    id: 'quad9',
    name: 'Quad9',
    // Quad9's JSON DoH lives on dns.quad9.net at the same path; the public
    // port-5053 endpoint serves DNS-message (binary) only. Use the standard
    // 443/JSON form here.
    url: (n, t) => `https://dns.quad9.net:5053/dns-query?name=${encodeURIComponent(n)}&type=${t}`,
    headers: { Accept: 'application/dns-json' },
  },
]

async function queryOne(resolver: Resolver, name: string, type: string): Promise<DohResp> {
  const resp = await fetch(resolver.url(name, type), { headers: resolver.headers })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

// Detect if user typed a raw IP and convert to the reverse zone form so the
// PTR query works without making them type it out by hand.
function maybeReverse(name: string): string {
  const v4 = name.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) return `${v4[4]}.${v4[3]}.${v4[2]}.${v4[1]}.in-addr.arpa`
  // IPv6 reverse zone: expand to full nibbles and reverse.
  if (name.includes(':')) {
    try {
      const big = ipv6ToBig(name)
      let hex = big.toString(16).padStart(32, '0')
      hex = hex.split('').reverse().join('.')
      return `${hex}.ip6.arpa`
    } catch {
      return name
    }
  }
  return name
}

function ipv6ToBig(input: string): bigint {
  const ip = input.indexOf('%') >= 0 ? input.slice(0, input.indexOf('%')) : input
  const dcIdx = ip.indexOf('::')
  let groups: string[]
  if (dcIdx >= 0) {
    const left = ip.slice(0, dcIdx).split(':').filter((p) => p !== '')
    const right = ip.slice(dcIdx + 2).split(':').filter((p) => p !== '')
    const missing = 8 - left.length - right.length
    if (missing < 0) throw new Error('Too many groups in IPv6 address')
    groups = [...left, ...Array(missing).fill('0'), ...right]
  } else {
    groups = ip.split(':')
  }
  if (groups.length !== 8) throw new Error('IPv6 must have 8 groups')
  let out = 0n
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) throw new Error(`Invalid IPv6 group: ${g}`)
    out = (out << 16n) | BigInt(parseInt(g, 16))
  }
  return out
}

// Parse "v=spf1 include:_spf.google.com ~all" / DKIM / DMARC into structured
// tokens for prettier rendering.
type ParsedTxt = {
  family: 'spf' | 'dkim' | 'dmarc'
  tokens: { key: string; value: string }[]
} | null

function parseTxt(raw: string): ParsedTxt {
  // TXT records often come quoted; strip surrounding double quotes.
  const t = raw.replace(/^"|"$/g, '')
  if (/^v=spf1\b/i.test(t)) {
    const parts = t.split(/\s+/)
    return {
      family: 'spf',
      tokens: parts.map((p) => {
        const eq = p.indexOf('=')
        const colon = p.indexOf(':')
        if (eq >= 0) return { key: p.slice(0, eq), value: p.slice(eq + 1) }
        if (colon >= 0) return { key: p.slice(0, colon), value: p.slice(colon + 1) }
        return { key: p, value: '' }
      }),
    }
  }
  if (/^v=DKIM1\b/i.test(t) || /^v=DMARC1\b/i.test(t)) {
    const family = /DMARC/i.test(t) ? 'dmarc' : 'dkim'
    return {
      family,
      tokens: t
        .split(';')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const eq = p.indexOf('=')
          if (eq < 0) return { key: p, value: '' }
          return { key: p.slice(0, eq).trim(), value: p.slice(eq + 1).trim() }
        }),
    }
  }
  return null
}

type GroupedResult = {
  type: RecordType | string
  status: number
  answers: Answer[]
}

type ResolverResult = {
  resolver: Resolver['id']
  ok: boolean
  error?: string
  groups: GroupedResult[]
}

async function runQueries(
  name: string,
  type: RecordType,
  resolvers: Resolver[],
): Promise<ResolverResult[]> {
  return Promise.all(
    resolvers.map(async (r) => {
      try {
        if (type === 'ANY') {
          const responses = await Promise.all(
            ANY_FANOUT.map(async (sub) => ({ sub, resp: await queryOne(r, name, sub) })),
          )
          return {
            resolver: r.id,
            ok: true,
            groups: responses.map((x) => ({
              type: x.sub,
              status: x.resp.Status,
              answers: x.resp.Answer ?? [],
            })),
          }
        }
        const resp = await queryOne(r, name, type)
        return {
          resolver: r.id,
          ok: true,
          groups: [{ type, status: resp.Status, answers: resp.Answer ?? [] }],
        }
      } catch (err) {
        return {
          resolver: r.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          groups: [],
        }
      }
    }),
  )
}

export function DnsPage() {
  const { t } = useTranslation()
  const [name, setName] = useState('toolbox.seansun.net')
  const [type, setType] = useState<RecordType>('A')
  const [multi, setMulti] = useState(false)
  const [results, setResults] = useState<ResolverResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [globalErr, setGlobalErr] = useState<string | null>(null)

  const run = async () => {
    if (!name.trim()) return
    setGlobalErr(null)
    setLoading(true)
    // If user typed a raw IP and didn't pick PTR explicitly, auto-pivot to
    // reverse-zone PTR — that's almost always what they meant.
    const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(name.trim()) || name.includes(':')
    const effectiveType: RecordType = looksLikeIp && type === 'A' ? 'PTR' : type
    const effectiveName = effectiveType === 'PTR' ? maybeReverse(name.trim()) : name.trim()
    const resolvers = multi ? RESOLVERS : [RESOLVERS[0]]
    try {
      const r = await runQueries(effectiveName, effectiveType, resolvers)
      setResults(r)
    } catch (err) {
      setResults(null)
      setGlobalErr(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.dns.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.dns.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="example.com"
          className="flex-1 font-mono text-sm"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run()
          }}
        />
        <Label className="text-xs text-muted-foreground">{t('pages.dns.typeLabel')}</Label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RecordType)}
          className="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground"
        >
          {RECORD_TYPES.map((tn) => (
            <option key={tn} value={tn} className="bg-background text-foreground">
              {tn}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={multi}
            onChange={(e) => setMulti(e.target.checked)}
            className="accent-primary"
          />
          {t('pages.dns.compareResolvers')}
        </label>
        <Button onClick={run} disabled={loading || !name.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t('common.lookup')}
        </Button>
      </div>

      {globalErr ? <div className="mb-4 text-xs text-destructive">⚠ {globalErr}</div> : null}

      {results ? (
        <div className={`grid gap-3 ${multi ? 'md:grid-cols-3' : ''}`}>
          {results.map((r) => (
            <div key={r.resolver} className="rounded-md border border-border bg-card/30 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {RESOLVERS.find((x) => x.id === r.resolver)?.name}
              </div>
              {!r.ok ? (
                <div className="text-xs text-destructive">⚠ {r.error}</div>
              ) : (
                <ResolverPanel groups={r.groups} />
              )}
            </div>
          ))}
        </div>
      ) : !loading && !globalErr ? (
        <div className="rounded-md border border-dashed border-border bg-card/20 p-6 text-center text-xs text-muted-foreground">
          <Trans i18nKey="pages.dns.empty" components={{ 1: <strong /> }} />
        </div>
      ) : null}
    </div>
  )
}

function ResolverPanel({ groups }: { groups: GroupedResult[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center gap-2 text-xs">
            <FieldTooltip body={`fieldMeta.dnsType.${g.type}`} bodyIsKey>
              <span className="font-mono font-medium text-foreground">{g.type}</span>
            </FieldTooltip>
            <span className="text-muted-foreground">
              {t('pages.dns.status')}:{' '}
              <FieldTooltip body={`fieldMeta.dnsStatus.${g.status}`} bodyIsKey>
                <code className="font-mono">{STATUS_LABELS[g.status] ?? g.status}</code>
              </FieldTooltip>
            </span>
          </div>
          {g.answers.length > 0 ? (
            <div className="flex flex-col gap-1">
              {g.answers.map((a, j) => {
                const typeName = TYPE_NAMES[a.type] ?? String(a.type)
                const txt = typeName === 'TXT' ? parseTxt(a.data) : null
                return (
                  <div
                    key={j}
                    className="rounded border border-border/60 bg-background/40 px-2 py-1.5 font-mono text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-muted-foreground">{typeName}</span>
                      <code className="flex-1 break-all">{a.data}</code>
                      <span className="text-muted-foreground">TTL {a.TTL}</span>
                    </div>
                    {txt ? (
                      <div className="mt-1 ml-14 flex flex-wrap gap-1">
                        {txt.tokens.map((tk, k) => (
                          <span
                            key={k}
                            className="rounded bg-card/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <span className="text-emerald-500">{tk.key}</span>
                            {tk.value ? <span>={tk.value}</span> : null}
                          </span>
                        ))}
                        <div className="basis-full text-[10px] text-muted-foreground/80">
                          {t(`pages.dns.txt.${txt.family}Hint`)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">{t('pages.dns.noAnswers')}</div>
          )}
        </div>
      ))}
    </div>
  )
}
