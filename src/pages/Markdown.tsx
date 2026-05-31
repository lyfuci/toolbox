import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { renderMarkdown } from '@/lib/markdown'

const SAMPLE = `# Markdown preview

Type **Markdown** on the left, see _rendered_ HTML on the right.

- Lists
- [Links](https://toolbox.seansun.net)
- \`inline code\`

\`\`\`ts
const greeting = "hello"
\`\`\`

> Blockquotes and tables too.

| Tool | Local |
| ---- | ----- |
| Markdown | yes |
`

export function MarkdownPage() {
  const { t } = useTranslation()
  const [src, setSrc] = useState(SAMPLE)

  const html = useMemo(() => renderMarkdown(src), [src])

  const copyHtml = async () => {
    await navigator.clipboard.writeText(html)
    toast.success(t('pages.markdown.copiedHtml'))
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.markdown.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.markdown.description')}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.markdown.sourceLabel')}</Label>
          <Textarea
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            spellCheck={false}
            className="min-h-[520px] font-mono text-sm"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{t('pages.markdown.previewLabel')}</Label>
            <Button size="sm" variant="ghost" onClick={copyHtml}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              {t('pages.markdown.copyHtml')}
            </Button>
          </div>
          <div
            className="markdown-preview min-h-[520px] overflow-auto rounded-md border border-input bg-background px-4 py-3 text-sm"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  )
}
