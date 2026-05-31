import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { textStats } from '@/lib/text-stats'

const SAMPLE =
  'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs!\n\nA second paragraph follows here, with a few more words to count.'

function formatDuration(sec: number): string {
  if (sec < 1) return '<1s'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m}m ${s}s` : `${m}m`
}

export function TextStatsPage() {
  const { t } = useTranslation()
  const [text, setText] = useState(SAMPLE)
  const stats = useMemo(() => textStats(text), [text])

  const cards: { key: string; value: string }[] = [
    { key: 'chars', value: stats.chars.toLocaleString() },
    { key: 'charsNoSpaces', value: stats.charsNoSpaces.toLocaleString() },
    { key: 'words', value: stats.words.toLocaleString() },
    { key: 'sentences', value: stats.sentences.toLocaleString() },
    { key: 'lines', value: stats.lines.toLocaleString() },
    { key: 'paragraphs', value: stats.paragraphs.toLocaleString() },
    { key: 'bytes', value: stats.bytes.toLocaleString() },
    { key: 'readingTime', value: formatDuration(stats.readingTimeSec) },
  ]

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.text-stats.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.textStats.description')}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.key} className="rounded-lg border border-border bg-card/40 px-4 py-3">
            <div className="font-mono text-2xl font-semibold tabular-nums">{c.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t(`pages.textStats.${c.key}`)}</div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.textStats.inputLabel')}</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="min-h-[240px] font-mono text-sm"
          placeholder={t('pages.textStats.placeholder')}
        />
      </div>
    </div>
  )
}
