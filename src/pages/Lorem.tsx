import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

const WORDS = `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod
tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis
nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis
aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur
excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt
mollit anim id est laborum`.split(/\s+/)

function pick(): string {
  const i = Math.floor(Math.random() * WORDS.length)
  return WORDS[i]
}

function genWords(n: number): string[] {
  return Array.from({ length: n }, pick)
}

function genSentence(): string {
  const len = 8 + Math.floor(Math.random() * 12)
  const words = genWords(len)
  return words[0][0].toUpperCase() + words[0].slice(1) + ' ' + words.slice(1).join(' ') + '.'
}

function genParagraph(): string {
  const len = 4 + Math.floor(Math.random() * 5)
  return Array.from({ length: len }, genSentence).join(' ')
}

type Mode = 'paragraphs' | 'sentences' | 'words'

function generate(mode: Mode, count: number): string {
  switch (mode) {
    case 'paragraphs':
      return Array.from({ length: count }, genParagraph).join('\n\n')
    case 'sentences':
      return Array.from({ length: count }, genSentence).join(' ')
    case 'words': {
      const ws = genWords(count)
      ws[0] = ws[0][0].toUpperCase() + ws[0].slice(1)
      return ws.join(' ') + '.'
    }
  }
}

export function LoremPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('paragraphs')
  const [count, setCount] = useState(3)
  const [nonce, setNonce] = useState(0)
  const text = useMemo(() => {
    void nonce
    return generate(mode, count)
  }, [mode, count, nonce])

  const handleCopy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    toast.success(t('common.copied'))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.lorem.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.lorem.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(
            [
              ['paragraphs', t('pages.lorem.paragraphs')],
              ['sentences', t('pages.lorem.sentences')],
              ['words', t('pages.lorem.words')],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 transition-colors ${
                mode === m
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Label htmlFor="count" className="text-xs text-muted-foreground">
          {t('pages.lorem.count')}
        </Label>
        <Input
          id="count"
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (n >= 1 && n <= 50) setCount(n)
          }}
          className="w-20 font-mono text-sm"
        />
        <Button size="sm" variant="secondary" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="h-4 w-4" />
          {t('common.regenerate')}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!text} className="ml-auto">
          <Copy className="h-4 w-4" />
          {t('common.copy')}
        </Button>
      </div>

      <Textarea
        value={text}
        readOnly
        spellCheck={false}
        className="min-h-[420px] text-sm leading-relaxed"
      />
    </div>
  )
}
