import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CodeEditor } from '@/components/CodeEditor'
import { toast } from 'sonner'
import { envToJson, jsonToEnv } from '@/lib/dotenv'

type Dir = 'envToJson' | 'jsonToEnv'

const SAMPLE_ENV = `# App config
NODE_ENV=production
PORT=3000
DATABASE_URL="postgres://user:pass@localhost:5432/app?sslmode=require"
GREETING="Hello\\nWorld"
FEATURE_FLAG=true`

export function DotEnvPage() {
  const { t } = useTranslation()
  const [dir, setDir] = useState<Dir>('envToJson')
  const [input, setInput] = useState(SAMPLE_ENV)

  const result = useMemo(() => {
    if (dir === 'envToJson') {
      const r = envToJson(input)
      return r.ok ? { ok: true as const, text: r.json } : { ok: false as const, error: r.error }
    }
    const r = jsonToEnv(input)
    return r.ok ? { ok: true as const, text: r.env } : { ok: false as const, error: r.error }
  }, [input, dir])

  const swap = () => {
    // When swapping, feed the current output back in as the new input if valid.
    if (result.ok) setInput(result.text.trimEnd())
    setDir((d) => (d === 'envToJson' ? 'jsonToEnv' : 'envToJson'))
  }

  const copy = async () => {
    if (!result.ok) return
    await navigator.clipboard.writeText(result.text)
    toast.success(t('pages.dotenv.copied'))
  }

  const errorText = (code: string): string => {
    if (code === 'empty') return t('pages.dotenv.enterHint')
    if (code === 'notObject') return t('pages.dotenv.errNotObject')
    if (code.startsWith('nested:')) return t('pages.dotenv.errNested', { key: code.slice(7) })
    if (code.startsWith('badKey:')) return t('pages.dotenv.errBadKey', { key: code.slice(7) })
    return code
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.dotenv.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.dotenv.description')}</p>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(['envToJson', 'jsonToEnv'] as Dir[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDir(d)}
              className={`px-3 py-1.5 transition-colors ${
                dir === d
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {d === 'envToJson' ? t('pages.dotenv.envToJson') : t('pages.dotenv.jsonToEnv')}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={swap} title={t('pages.dotenv.swap')}>
          <ArrowRightLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {dir === 'envToJson' ? t('pages.dotenv.envLabel') : t('pages.dotenv.jsonLabel')}
          </Label>
          <CodeEditor
            language={dir === 'envToJson' ? 'plain' : 'json'}
            value={input}
            onChange={setInput}
            height="420px"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              {dir === 'envToJson' ? t('pages.dotenv.jsonLabel') : t('pages.dotenv.envLabel')}
            </Label>
            <Button size="sm" variant="ghost" onClick={copy} disabled={!result.ok}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          {result.ok ? (
            <CodeEditor
              language={dir === 'envToJson' ? 'json' : 'plain'}
              value={result.text}
              readOnly
              height="420px"
            />
          ) : (
            <div className="flex h-[420px] items-start rounded-md border border-destructive/40 p-3 text-sm">
              <span className={result.error === 'empty' ? 'text-muted-foreground' : 'text-destructive'}>
                {result.error === 'empty' ? '' : '⚠ '}
                {errorText(result.error)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
