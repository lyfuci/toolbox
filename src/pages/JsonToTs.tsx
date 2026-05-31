import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CodeEditor } from '@/components/CodeEditor'
import { toast } from 'sonner'
import { jsonToTs } from '@/lib/json-to-ts'

const SAMPLE = JSON.stringify(
  {
    id: 1,
    name: 'Sean',
    active: true,
    roles: ['admin', 'user'],
    profile: { email: 'a@b.c', age: 30 },
    posts: [
      { id: 1, title: 'Hello' },
      { id: 2, title: 'World', pinned: true },
    ],
  },
  null,
  2,
)

export function JsonToTsPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState(SAMPLE)
  const [rootName, setRootName] = useState('Root')

  const result = useMemo(() => jsonToTs(input, rootName || 'Root'), [input, rootName])

  const copy = async () => {
    if (!result.ok) return
    await navigator.clipboard.writeText(result.code)
    toast.success(t('pages.jsonToTs.copied'))
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.json-to-ts.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.jsonToTs.description')}</p>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">{t('pages.jsonToTs.rootName')}</Label>
        <Input
          value={rootName}
          onChange={(e) => setRootName(e.target.value)}
          spellCheck={false}
          className="h-8 w-48 font-mono text-sm"
          placeholder="Root"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.jsonToTs.jsonLabel')}</Label>
          <CodeEditor language="json" value={input} onChange={setInput} height="460px" />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{t('pages.jsonToTs.tsLabel')}</Label>
            <Button size="sm" variant="ghost" onClick={copy} disabled={!result.ok}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          {result.ok ? (
            <CodeEditor language="plain" value={result.code} readOnly height="460px" />
          ) : (
            <div className="flex h-[460px] items-start rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              {result.error === 'empty' ? (
                <span className="text-muted-foreground">{t('pages.jsonToTs.enterHint')}</span>
              ) : (
                <span>⚠ {result.error}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
