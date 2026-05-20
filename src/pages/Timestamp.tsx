import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'

function parseInput(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  if (/^-?\d+$/.test(s)) {
    const n = Number(s)
    if (!isFinite(n)) return null
    return new Date(Math.abs(n) >= 1e12 ? n : n * 1000)
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function relativeTime(date: Date, locale: string): string {
  const diffMs = date.getTime() - Date.now()
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const abs = Math.abs(diffMs)
  if (abs < 60_000) return fmt.format(Math.round(diffMs / 1000), 'second')
  if (abs < 3_600_000) return fmt.format(Math.round(diffMs / 60_000), 'minute')
  if (abs < 86_400_000) return fmt.format(Math.round(diffMs / 3_600_000), 'hour')
  if (abs < 30 * 86_400_000) return fmt.format(Math.round(diffMs / 86_400_000), 'day')
  if (abs < 365 * 86_400_000) return fmt.format(Math.round(diffMs / (30 * 86_400_000)), 'month')
  return fmt.format(Math.round(diffMs / (365 * 86_400_000)), 'year')
}

// Windows FILETIME: 100-ns intervals since 1601-01-01 UTC.
const FILETIME_EPOCH_MS = 11644473600000n
function toFiletime(date: Date): string {
  const ms = BigInt(date.getTime())
  const ft = (ms + FILETIME_EPOCH_MS) * 10000n
  return ft.toString()
}

// Excel serial: days since 1899-12-30 (the off-by-one accounts for the
// fictional 1900 leap day Excel preserves for Lotus compatibility).
const EXCEL_EPOCH_MS = -2209161600000 // 1899-12-30T00:00:00Z
function toExcel(date: Date): string {
  return ((date.getTime() - EXCEL_EPOCH_MS) / 86_400_000).toFixed(6)
}

// Build a list of IANA zones, falling back to a common subset on older
// engines that don't expose Intl.supportedValuesOf.
function getZones(): string[] {
  type IntlMaybe = { supportedValuesOf?: (key: string) => string[] }
  const it = (Intl as unknown as IntlMaybe).supportedValuesOf
  if (typeof it === 'function') {
    try {
      return it('timeZone')
    } catch {
      /* fall through */
    }
  }
  return [
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Australia/Sydney',
  ]
}

function formatInZone(date: Date, zone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: zone,
      timeZoneName: 'short',
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

// Convert discrete fields in a target zone to a UTC ms epoch.
// Approach: Date.UTC gives the candidate timestamp as if fields were UTC;
// then compute the zone's offset at that instant and shift.
function fieldsToEpoch(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  s: number,
  zone: string,
): number | null {
  const baseUtc = Date.UTC(y, m - 1, d, h, min, s)
  if (!isFinite(baseUtc)) return null
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts = dtf.formatToParts(new Date(baseUtc))
    const obj: Record<string, string> = {}
    for (const p of parts) obj[p.type] = p.value
    const asUtc = Date.UTC(
      Number(obj.year),
      Number(obj.month) - 1,
      Number(obj.day),
      Number(obj.hour) === 24 ? 0 : Number(obj.hour),
      Number(obj.minute),
      Number(obj.second),
    )
    const offset = asUtc - baseUtc
    return baseUtc - offset
  } catch {
    return null
  }
}

export function TimestampPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const [tab, setTab] = useState<'parse' | 'compose' | 'batch'>('parse')
  const [input, setInput] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((tv) => tv + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const date = useMemo(() => parseInput(input), [input])

  const zones = useMemo(() => getZones(), [])
  const localZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const [thirdZone, setThirdZone] = useState<string>(() =>
    zones.includes('Asia/Shanghai') ? 'Asia/Shanghai' : zones[0],
  )

  // Compose-mode state.
  const now = new Date()
  const [cYear, setCYear] = useState(now.getUTCFullYear())
  const [cMonth, setCMonth] = useState(now.getUTCMonth() + 1)
  const [cDay, setCDay] = useState(now.getUTCDate())
  const [cHour, setCHour] = useState(now.getUTCHours())
  const [cMin, setCMin] = useState(now.getUTCMinutes())
  const [cSec, setCSec] = useState(now.getUTCSeconds())
  const [cZone, setCZone] = useState<string>('UTC')

  const composed = useMemo(
    () => fieldsToEpoch(cYear, cMonth, cDay, cHour, cMin, cSec, cZone),
    [cYear, cMonth, cDay, cHour, cMin, cSec, cZone],
  )

  // Batch mode.
  const [batchInput, setBatchInput] = useState(
    '1700000000\n2024-01-01T00:00:00Z\n1577836800000',
  )
  const batchOutput = useMemo(() => {
    return batchInput
      .split('\n')
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed) return ''
        const d = parseInput(trimmed)
        if (!d) return `${trimmed.padEnd(30)} → ⚠ invalid`
        return `${trimmed.padEnd(30)} → ${d.toISOString()}`
      })
      .join('\n')
  }, [batchInput])

  const rows: [string, string][] = date
    ? [
        [t('pages.timestamp.unixSeconds'), String(Math.floor(date.getTime() / 1000))],
        [t('pages.timestamp.unixMs'), String(date.getTime())],
        [t('pages.timestamp.iso8601'), date.toISOString()],
        [t('pages.timestamp.localTime'), date.toLocaleString(locale, { timeZoneName: 'short' })],
        [t('pages.timestamp.relativeTime'), relativeTime(date, locale)],
        [t('pages.timestamp.filetime'), toFiletime(date)],
        [t('pages.timestamp.excel'), toExcel(date)],
      ]
    : []

  const handleCopy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success(t('common.copiedLabel', { label }))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.timestamp.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.timestamp.description')}</p>
      </header>

      {/* Current-time multi-zone strip */}
      <section className="mb-6 rounded-lg border border-border bg-card/40 p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          {t('pages.timestamp.nowInZones')}
        </div>
        <div className="grid gap-1.5 text-sm sm:grid-cols-3">
          <ZoneNow label="UTC" zone="UTC" locale={locale} />
          <ZoneNow label={t('pages.timestamp.zoneLocal')} zone={localZone} locale={locale} />
          <div className="flex items-center gap-2">
            <select
              value={thirdZone}
              onChange={(e) => setThirdZone(e.target.value)}
              className="h-7 max-w-[12rem] rounded-md border border-input bg-transparent px-1 text-xs"
            >
              {zones.map((z) => (
                <option key={z} value={z} className="bg-background">
                  {z}
                </option>
              ))}
            </select>
            <code className="font-mono text-xs">{formatInZone(new Date(), thirdZone, locale)}</code>
          </div>
        </div>
      </section>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'parse' | 'compose' | 'batch')}>
        <TabsList>
          <TabsTrigger value="parse">{t('pages.timestamp.tabParse')}</TabsTrigger>
          <TabsTrigger value="compose">{t('pages.timestamp.tabCompose')}</TabsTrigger>
          <TabsTrigger value="batch">{t('pages.timestamp.tabBatch')}</TabsTrigger>
        </TabsList>

        <TabsContent value="parse" className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t('pages.timestamp.input')}</Label>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <Clock className="h-3.5 w-3.5" />
              {t('pages.timestamp.now')}
            </Button>
          </div>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="mb-6 font-mono text-sm"
            placeholder="1700000000 / 2023-11-14T22:13:20Z / Tue, 14 Nov 2023 22:13:20 GMT"
          />

          {date ? (
            <div className="flex flex-col gap-2">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
                >
                  <span className="w-32 shrink-0 text-xs font-medium text-muted-foreground">
                    {label}
                  </span>
                  <code className="flex-1 truncate font-mono text-sm">{value}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy(label, value)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : input.trim() ? (
            <div className="text-xs text-destructive">⚠ {t('pages.timestamp.cannotParse')}</div>
          ) : null}
        </TabsContent>

        <TabsContent value="compose" className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <NumField label="Y" value={cYear} onChange={setCYear} min={1} max={9999} />
            <NumField label="M" value={cMonth} onChange={setCMonth} min={1} max={12} />
            <NumField label="D" value={cDay} onChange={setCDay} min={1} max={31} />
            <NumField label="h" value={cHour} onChange={setCHour} min={0} max={23} />
            <NumField label="m" value={cMin} onChange={setCMin} min={0} max={59} />
            <NumField label="s" value={cSec} onChange={setCSec} min={0} max={59} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t('pages.timestamp.zone')}</Label>
            <select
              value={cZone}
              onChange={(e) => setCZone(e.target.value)}
              className="h-9 max-w-[18rem] rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {zones.map((z) => (
                <option key={z} value={z} className="bg-background">
                  {z}
                </option>
              ))}
            </select>
          </div>

          {composed !== null && isFinite(composed) ? (
            <div className="mt-4 flex flex-col gap-2">
              <ResultRow
                label={t('pages.timestamp.unixSeconds')}
                value={String(Math.floor(composed / 1000))}
                onCopy={handleCopy}
              />
              <ResultRow
                label={t('pages.timestamp.unixMs')}
                value={String(composed)}
                onCopy={handleCopy}
              />
              <ResultRow
                label={t('pages.timestamp.iso8601')}
                value={new Date(composed).toISOString()}
                onCopy={handleCopy}
              />
            </div>
          ) : (
            <div className="mt-4 text-xs text-destructive">
              ⚠ {t('pages.timestamp.cannotCompose')}
            </div>
          )}
        </TabsContent>

        <TabsContent value="batch" className="mt-4">
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('pages.timestamp.batchInput')}
          </Label>
          <Textarea
            value={batchInput}
            onChange={(e) => setBatchInput(e.target.value)}
            spellCheck={false}
            className="min-h-[150px] font-mono text-sm"
            placeholder={'1700000000\n2024-01-01T00:00:00Z'}
          />
          <Label className="mt-3 mb-1.5 block text-xs text-muted-foreground">
            {t('pages.timestamp.batchOutput')}
          </Label>
          <Textarea
            value={batchOutput}
            readOnly
            spellCheck={false}
            className="min-h-[200px] font-mono text-xs"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ZoneNow({ label, zone, locale }: { label: string; zone: string; locale: string }) {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <code className="font-mono">{formatInZone(new Date(), zone, locale)}</code>
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!isNaN(n)) onChange(n)
        }}
        className="font-mono text-sm"
      />
    </div>
  )
}

function ResultRow({
  label,
  value,
  onCopy,
}: {
  label: string
  value: string
  onCopy: (l: string, v: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2">
      <span className="w-32 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <code className="flex-1 truncate font-mono text-sm">{value}</code>
      <Button size="sm" variant="ghost" onClick={() => onCopy(label, value)}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
