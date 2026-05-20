import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Globe, Loader2, Clock } from 'lucide-react'
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

// Build the PTR query name for an IPv4 address (reverse octets + .in-addr.arpa).
// IPv6 reverse zones are `.ip6.arpa` and require nibble expansion; left out
// for now since most user-entered IPs are v4.
function ipv4ToPtrName(ip: string): string | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return null
  return `${m[4]}.${m[3]}.${m[2]}.${m[1]}.in-addr.arpa`
}

type DohResp = {
  Status: number
  Answer?: { name: string; type: number; TTL: number; data: string }[]
}

async function reverseDns(ip: string): Promise<string[]> {
  const ptr = ipv4ToPtrName(ip)
  if (!ptr) return []
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(ptr)}&type=PTR`
  const resp = await fetch(url, { headers: { Accept: 'application/dns-json' } })
  if (!resp.ok) return []
  const data: DohResp = await resp.json()
  if (!data.Answer) return []
  return data.Answer.map((a) => a.data.replace(/\.$/, ''))
}

// Map tile URL given lat/lon and zoom. We render a single tile and place a
// CSS pin in its centre. For a city-scale view, zoom 6 works well.
function tileUrlFor(lat: number, lon: number, zoom: number): string {
  const n = Math.pow(2, zoom)
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  const xClamped = Math.max(0, Math.min(n - 1, x))
  const yClamped = Math.max(0, Math.min(n - 1, y))
  return `https://tile.openstreetmap.org/${zoom}/${xClamped}/${yClamped}.png`
}

// Pixel offset inside the chosen tile for the precise marker position.
function pinPercent(lat: number, lon: number, zoom: number): { left: number; top: number } {
  const n = Math.pow(2, zoom)
  const fx = ((lon + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { left: (fx - Math.floor(fx)) * 100, top: (fy - Math.floor(fy)) * 100 }
}

export function IpInfoPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [data, setData] = useState<LookupResult | null>(null)
  const [ptr, setPtr] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<string[]>([])

  const run = async (ip: string) => {
    setError(null)
    setLoading(true)
    setPtr([])
    try {
      const result = await lookup(ip)
      setData(result)
      // Push into recent list (session-only, in-memory). Key by ipapi's
      // resolved IP so blank-lookup also gets recorded.
      const key = result.ip ?? ip
      if (key) {
        setRecent((r) => [key, ...r.filter((x) => x !== key)].slice(0, 8))
      }
      // Reverse DNS (PTR) — only IPv4 supported here. Non-fatal if it
      // throws or returns nothing.
      if (result.ip) {
        try {
          const names = await reverseDns(result.ip)
          setPtr(names)
        } catch {
          setPtr([])
        }
      }
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
        [t('pages.ipInfo.rowPtr'), ptr.length ? ptr.join(', ') : '—'],
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

      {recent.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>{t('pages.ipInfo.recent')}</span>
          {recent.map((ip) => (
            <button
              key={ip}
              type="button"
              onClick={() => {
                setInput(ip)
                run(ip)
              }}
              className="rounded border border-border bg-card/40 px-2 py-0.5 font-mono text-xs hover:text-foreground"
            >
              {ip}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <div className="mb-4 text-xs text-destructive">⚠ {error}</div> : null}

      {data ? (
        <>
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

          {data.latitude != null && data.longitude != null ? (
            <MapPreview lat={data.latitude} lon={data.longitude} />
          ) : null}
        </>
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

function MapPreview({ lat, lon }: { lat: number; lon: number }) {
  const { t } = useTranslation()
  const zoom = 6
  const tile = tileUrlFor(lat, lon, zoom)
  const pin = pinPercent(lat, lon, zoom)
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-xs text-muted-foreground">{t('pages.ipInfo.map')}</div>
      <div className="relative w-fit overflow-hidden rounded-md border border-border bg-card/40">
        <img
          src={tile}
          alt={t('pages.ipInfo.map')}
          width={256}
          height={256}
          // OSM tile servers send `Access-Control-Allow-Origin: *`. Opt into
          // CORS so the response is usable under our cross-origin-isolated
          // (COEP: require-corp) page.
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        {/* Pin marker — absolute over the tile at the computed offset. */}
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-full rounded-full bg-rose-500 ring-2 ring-background"
          style={{ left: `${pin.left}%`, top: `${pin.top}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        <a
          href={osmUrl}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          {t('pages.ipInfo.openInOsm')}
        </a>
        {' · © OpenStreetMap'}
      </div>
    </div>
  )
}
