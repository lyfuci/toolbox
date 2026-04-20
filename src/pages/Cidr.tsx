import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.')
  if (parts.length !== 4) throw new Error('IPv4 需要 4 段')
  const nums = parts.map((p) => {
    const n = Number(p)
    if (!/^\d+$/.test(p) || n < 0 || n > 255) throw new Error(`非法字节: ${p}`)
    return n
  })
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0
}

function intToIpv4(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.')
}

type CidrInfo = {
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

function compute(cidr: string): CidrInfo {
  const slash = cidr.indexOf('/')
  if (slash === -1) throw new Error('缺少 /prefix')
  const ipPart = cidr.slice(0, slash)
  const prefixPart = cidr.slice(slash + 1)
  const prefix = Number(prefixPart)
  if (!/^\d+$/.test(prefixPart) || prefix < 0 || prefix > 32) {
    throw new Error('prefix 须在 0-32')
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

export function CidrPage() {
  const [input, setInput] = useState('192.168.1.10/24')

  const result = useMemo(() => {
    try {
      return { ok: true as const, value: compute(input.trim()) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input])

  const handleCopy = async (label: string, v: string) => {
    await navigator.clipboard.writeText(v)
    toast.success(`已复制 ${label}`)
  }

  const rows: [string, string][] = result.ok
    ? [
        ['网络地址', `${result.value.network}/${result.value.prefix}`],
        ['广播地址', result.value.broadcast],
        ['子网掩码', result.value.netmask],
        ['通配符掩码', result.value.wildcard],
        ['首个可用', result.value.firstUsable],
        ['最后可用', result.value.lastUsable],
        ['可用主机数', result.value.hostCount.toLocaleString()],
        ['地址总数', result.value.totalCount.toLocaleString()],
        ['类别', result.value.classLabel],
      ]
    : []

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">CIDR Calculator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          IPv4 子网计算：网络 / 广播 / 掩码 / 可用范围 / 主机数。
        </p>
      </header>

      <div className="mb-6">
        <Label className="mb-1.5 block text-xs text-muted-foreground">CIDR</Label>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="192.168.1.0/24"
          spellCheck={false}
          className="font-mono text-sm"
        />
      </div>

      {!result.ok ? (
        <div className="text-xs text-destructive">⚠ {result.error}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(([label, value]) => (
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
      )}
    </div>
  )
}
