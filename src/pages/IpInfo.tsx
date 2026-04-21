import { useState } from 'react'
import { Globe, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ipapi.co response shape (subset we use).
type LookupResult = {
  ip?: string
  network?: string
  version?: string
  city?: string
  region?: string
  region_code?: string
  country?: string
  country_name?: string
  country_code?: string
  postal?: string
  latitude?: number
  longitude?: number
  timezone?: string
  utc_offset?: string
  asn?: string
  org?: string
  // Error shape
  error?: boolean
  reason?: string
}

async function lookup(ip: string): Promise<LookupResult> {
  const url = ip
    ? `https://ipapi.co/${encodeURIComponent(ip)}/json/`
    : 'https://ipapi.co/json/'
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data: LookupResult = await resp.json()
  if (data.error) throw new Error(data.reason || '查询失败')
  return data
}

export function IpInfoPage() {
  const [input, setInput] = useState('')
  const [data, setData] = useState<LookupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async (ip: string) => {
    setError(null)
    setLoading(true)
    try {
      const result = await lookup(ip)
      setData(result)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const rows: [string, string][] = data
    ? [
        ['IP', `${data.ip ?? '—'}${data.version ? `  (${data.version})` : ''}`],
        ['网段', data.network ?? '—'],
        [
          '国家 / 地区',
          `${data.country_name ?? data.country ?? '—'} (${data.country_code ?? '—'})`,
        ],
        ['省 / 州', data.region ?? '—'],
        ['城市', data.city ?? '—'],
        ['邮编', data.postal ?? '—'],
        [
          '经纬度',
          data.latitude != null && data.longitude != null
            ? `${data.latitude}, ${data.longitude}`
            : '—',
        ],
        ['时区', `${data.timezone ?? '—'}${data.utc_offset ? ` (${data.utc_offset})` : ''}`],
        ['ASN', data.asn ?? '—'],
        ['组织', data.org ?? '—'],
      ]
    : []

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">IP Info</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          IP 归属查询。点击按钮才会向 <code className="font-mono">ipapi.co</code> 公共服务发起请求（免费档 1k 次/天/IP）。
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="留空查自己的 IP，或填 IPv4 / IPv6"
          className="flex-1 font-mono text-sm"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run(input.trim())
          }}
        />
        <Button onClick={() => run(input.trim())} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          查询
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setInput('')
            run('')
          }}
          disabled={loading}
        >
          查我自己
        </Button>
      </div>

      {error ? <div className="mb-4 text-xs text-destructive">⚠ {error}</div> : null}

      {data ? (
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
            </div>
          ))}
        </div>
      ) : !loading && !error ? (
        <div className="rounded-md border border-dashed border-border bg-card/20 p-6 text-center text-xs text-muted-foreground">
          点击 <strong>查询</strong> 或 <strong>查我自己</strong> 开始
        </div>
      ) : null}
    </div>
  )
}
