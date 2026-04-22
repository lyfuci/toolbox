import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA'] as const
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

async function lookup(name: string, type: RecordType): Promise<DohResp> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`
  const resp = await fetch(url, { headers: { Accept: 'application/dns-json' } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

export function DnsPage() {
  const { t } = useTranslation()
  const [name, setName] = useState('toolbox.seansun.xyz')
  const [type, setType] = useState<RecordType>('A')
  const [data, setData] = useState<DohResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    if (!name.trim()) return
    setError(null)
    setLoading(true)
    try {
      const result = await lookup(name.trim(), type)
      setData(result)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
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
          {RECORD_TYPES.map((t) => (
            <option key={t} value={t} className="bg-background text-foreground">
              {t}
            </option>
          ))}
        </select>
        <Button onClick={run} disabled={loading || !name.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t('common.lookup')}
        </Button>
      </div>

      {error ? <div className="mb-4 text-xs text-destructive">⚠ {error}</div> : null}

      {data ? (
        <>
          <div className="mb-3 text-xs text-muted-foreground">
            {t('pages.dns.status')}:{' '}
            <code className="font-mono text-foreground">
              {STATUS_LABELS[data.Status] ?? data.Status}
            </code>
            {'  ·  '}
            {data.Answer
              ? t('pages.dns.answers', { n: data.Answer.length })
              : t('pages.dns.noAnswers')}
          </div>
          {data.Answer && data.Answer.length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.Answer.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
                >
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                    {TYPE_NAMES[a.type] ?? a.type}
                  </span>
                  <code className="flex-1 truncate font-mono text-sm">{a.data}</code>
                  <span className="font-mono text-xs text-muted-foreground">TTL {a.TTL}</span>
                </div>
              ))}
            </div>
          ) : data.Authority && data.Authority.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              {t('pages.dns.noDirect', {
                authority: data.Authority.map((a) => a.data).join('; '),
              })}
            </div>
          ) : null}
        </>
      ) : !loading && !error ? (
        <div className="rounded-md border border-dashed border-border bg-card/20 p-6 text-center text-xs text-muted-foreground">
          <Trans i18nKey="pages.dns.empty" components={{ 1: <strong /> }} />
        </div>
      ) : null}
    </div>
  )
}
