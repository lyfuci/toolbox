import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { analyzeCron, type CronLocale } from '@/lib/cron'

const PRESET_TZS = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
]

function nowLocalTZ(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

type Preset = { expr: string; key: string }

// Common crontab lines, labelled via i18n (pages.cron.presets.<key>).
const PRESETS: Preset[] = [
  { expr: '* * * * *', key: 'everyMinute' },
  { expr: '*/15 * * * *', key: 'every15' },
  { expr: '0 * * * *', key: 'hourly' },
  { expr: '0 0 * * *', key: 'daily' },
  { expr: '0 9 * * 1-5', key: 'weekdays9' },
  { expr: '0 0 * * 0', key: 'weekly' },
  { expr: '0 0 1 * *', key: 'monthly' },
  { expr: '0 0 1 1 *', key: 'yearly' },
]

const FIELD_KEYS = ['minute', 'hour', 'dom', 'month', 'dow'] as const

function formatInTz(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hour12: false,
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

export function CronPage() {
  const { t, i18n } = useTranslation()
  const [expr, setExpr] = useState('*/15 9-17 * * 1-5')
  const [tz, setTz] = useState<string>(nowLocalTZ())

  const cronLocale: CronLocale = i18n.language.startsWith('zh') ? 'zh_CN' : 'en'

  const analysis = useMemo(
    () => analyzeCron(expr, { locale: cronLocale, count: 6, tz }),
    [expr, cronLocale, tz],
  )

  // Split into fields purely for the labelled breakdown (macros like @daily
  // have no five fields, so we only show this for standard 5-field lines).
  const fields = useMemo(() => {
    const parts = expr.trim().split(/\s+/)
    return parts.length === 5 ? parts : null
  }, [expr])

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value)
    toast.success(t('common.copiedLabel', { label }))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.cron.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.cron.description')}</p>
      </header>

      <div className="mb-3">
        <Label className="mb-1.5 block text-xs text-muted-foreground">
          {t('pages.cron.expression')}
        </Label>
        <Input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          spellCheck={false}
          className="font-mono text-base"
          placeholder="*/5 * * * *"
        />
      </div>

      {/* Quick presets */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setExpr(p.expr)}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              expr.trim() === p.expr
                ? 'border-foreground/40 bg-accent text-accent-foreground'
                : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent/30'
            }`}
            title={p.expr}
          >
            {t(`pages.cron.presets.${p.key}`)}
          </button>
        ))}
      </div>

      {/* Human description */}
      {analysis.ok ? (
        <Card className="mb-5 flex flex-row items-start gap-3 p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{t('pages.cron.meaning')}</p>
            <p className="mt-0.5 text-base font-medium">{analysis.description}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => copy(analysis.description, t('pages.cron.meaning'))}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </Card>
      ) : analysis.error === 'empty' ? (
        <Card className="mb-5 p-4 text-sm text-muted-foreground">{t('pages.cron.enterHint')}</Card>
      ) : (
        <Card className="mb-5 flex flex-row items-start gap-3 border-destructive/40 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">{t('pages.cron.invalid')}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{analysis.error}</p>
          </div>
        </Card>
      )}

      {/* Field breakdown */}
      {fields ? (
        <div className="mb-5 grid grid-cols-5 gap-2">
          {FIELD_KEYS.map((k, i) => (
            <div key={k} className="rounded-md border border-border bg-card/40 px-2 py-2 text-center">
              <div className="font-mono text-sm">{fields[i]}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {t(`pages.cron.fields.${k}`)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Next runs */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">{t('pages.cron.timezone')}</Label>
        <select
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {[...new Set([nowLocalTZ(), ...PRESET_TZS])].map((z) => (
            <option key={z} value={z} className="bg-background">
              {z}
            </option>
          ))}
        </select>
      </div>

      {analysis.ok ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-card/60 px-4 py-2 text-xs font-medium text-muted-foreground">
            {t('pages.cron.nextRuns')}
          </div>
          <ul className="divide-y divide-border">
            {analysis.runs.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="font-mono text-sm">{formatInTz(r, tz)}</span>
                <span className="text-xs text-muted-foreground">{r.toISOString()}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
