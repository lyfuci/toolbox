import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
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
  if (data.error) throw new Error(data.reason || 'lookup failed')
  return data
}

export function IpInfoPage() {
  const { t } = useTranslation()
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
        [t('pages.ipInfo.rowIp'), `${data.ip ?? '—'}${data.version ? `  (${data.version})` : ''}`],
        [t('pages.ipInfo.rowNetwork'), data.network ?? '—'],
        [
          t('pages.ipInfo.rowCountry'),
          `${data.country_name ?? data.country ?? '—'} (${data.country_code ?? '—'})`,
        ],
        [t('pages.ipInfo.rowRegion'), data.region ?? '—'],
        [t('pages.ipInfo.rowCity'), data.city ?? '—'],
        [t('pages.ipInfo.rowPostal'), data.postal ?? '—'],
        [
          t('pages.ipInfo.rowLatLng'),
          data.latitude != null && data.longitude != null
            ? `${data.latitude}, ${data.longitude}`
            : '—',
        ],
        [
          t('pages.ipInfo.rowTimezone'),
          `${data.timezone ?? '—'}${data.utc_offset ? ` (${data.utc_offset})` : ''}`,
        ],
        [t('pages.ipInfo.rowAsn'), data.asn ?? '—'],
        [t('pages.ipInfo.rowOrg'), data.org ?? '—'],
      ]
    : []

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.ip-info.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.ipInfo.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('pages.ipInfo.inputPlaceholder')}
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
          {t('common.lookup')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setInput('')
            run('')
          }}
          disabled={loading}
        >
          {t('common.lookupSelf')}
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
          <Trans
            i18nKey="pages.ipInfo.empty"
            components={{ 1: <strong />, 3: <strong /> }}
          />
        </div>
      ) : null}
    </div>
  )
}
