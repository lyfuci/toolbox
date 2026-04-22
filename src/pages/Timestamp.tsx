import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

function parseInput(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  // All-digit input → Unix timestamp. Heuristic: 13+ digits → ms, otherwise s.
  if (/^-?\d+$/.test(s)) {
    const n = Number(s)
    if (!isFinite(n)) return null
    return new Date(Math.abs(n) >= 1e12 ? n : n * 1000)
  }
  // Otherwise try Date constructor (ISO 8601, RFC 2822, etc).
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

export function TimestampPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const [input, setInput] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [, setTick] = useState(0)

  // Re-render the relative-time row every 30s so "X seconds ago" stays fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((tv) => tv + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const date = useMemo(() => parseInput(input), [input])

  const rows: [string, string][] = date
    ? [
        [t('pages.timestamp.unixSeconds'), String(Math.floor(date.getTime() / 1000))],
        [t('pages.timestamp.unixMs'), String(date.getTime())],
        [t('pages.timestamp.iso8601'), date.toISOString()],
        [t('pages.timestamp.localTime'), date.toLocaleString(locale, { timeZoneName: 'short' })],
        [t('pages.timestamp.relativeTime'), relativeTime(date, locale)],
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
              <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
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
    </div>
  )
}
