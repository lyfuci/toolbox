import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { diffLines, diffWords } from 'diff'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const SAMPLE_A = `function greet(name) {
  console.log('Hello, ' + name);
  return name;
}`

const SAMPLE_B = `function greet(name) {
  console.log(\`Hello, \${name}!\`);
  return name.trim();
}`

type Granularity = 'lines' | 'words'

export function DiffPage() {
  const { t } = useTranslation()
  const [a, setA] = useState(SAMPLE_A)
  const [b, setB] = useState(SAMPLE_B)
  const [granularity, setGranularity] = useState<Granularity>('lines')

  const parts = useMemo(
    () => (granularity === 'lines' ? diffLines(a, b, {}) : diffWords(a, b, {})),
    [a, b, granularity],
  )

  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const p of parts) {
      const len = p.count ?? p.value.split(/\n/).filter(Boolean).length
      if (p.added) added += len
      if (p.removed) removed += len
    }
    return { added, removed }
  }, [parts])

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.diff.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.diff.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(['lines', 'words'] as Granularity[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 transition-colors ${
                granularity === g
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {g === 'lines' ? t('pages.diff.byLines') : t('pages.diff.byWords')}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setA(''); setB('') }}>
          <Trash2 className="h-4 w-4" />
          {t('common.clear')}
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          <span className="text-emerald-500">+{stats.added}</span>{' '}
          <span className="text-rose-500">-{stats.removed}</span>
        </div>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('pages.diff.original')}
          </Label>
          <Textarea
            value={a}
            onChange={(e) => setA(e.target.value)}
            spellCheck={false}
            className="min-h-[240px] font-mono text-sm leading-relaxed"
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('pages.diff.modified')}
          </Label>
          <Textarea
            value={b}
            onChange={(e) => setB(e.target.value)}
            spellCheck={false}
            className="min-h-[240px] font-mono text-sm leading-relaxed"
          />
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.diff.diff')}</Label>
        <pre className="min-h-[200px] overflow-x-auto rounded-md border border-border bg-card/40 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {parts.map((p, i) => (
            <span
              key={i}
              className={
                p.added
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                  : p.removed
                    ? 'bg-rose-500/15 text-rose-700 line-through decoration-rose-400/40 dark:text-rose-200'
                    : 'text-muted-foreground'
              }
            >
              {p.value}
            </span>
          ))}
        </pre>
      </div>
    </div>
  )
}
