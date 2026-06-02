import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { slugify } from '@/lib/slugify'

export function SlugifyPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('The Quick Brown Fox — Crème Brûlée (2024)!')
  const [separator, setSeparator] = useState('-')
  const [lowercase, setLowercase] = useState(true)
  const [keepUnicode, setKeepUnicode] = useState(false)
  const [maxLength, setMaxLength] = useState<number | ''>('')

  const slug = useMemo(
    () =>
      slugify(input, {
        separator,
        lowercase,
        keepUnicode,
        maxLength: maxLength === '' ? null : maxLength,
      }),
    [input, separator, lowercase, keepUnicode, maxLength],
  )

  // Per-line slugs for batch input.
  const lines = useMemo(
    () =>
      input
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => slugify(l, { separator, lowercase, keepUnicode, maxLength: maxLength === '' ? null : maxLength })),
    [input, separator, lowercase, keepUnicode, maxLength],
  )

  const copy = async (value: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success(t('pages.slugify.copied'))
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.slugify.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.slugify.description')}</p>
      </header>

      <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.slugify.inputLabel')}</Label>
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        className="min-h-[100px] text-sm"
        placeholder={t('pages.slugify.placeholder')}
      />

      <div className="mt-4 flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{t('pages.slugify.separator')}</Label>
          <div className="flex rounded-md border border-input text-sm">
            {['-', '_', '.'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeparator(s)}
                className={`px-3 py-1 font-mono transition-colors ${
                  separator === s ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
          <input type="checkbox" checked={lowercase} onChange={(e) => setLowercase(e.target.checked)} className="h-4 w-4 accent-primary" />
          {t('pages.slugify.lowercase')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
          <input type="checkbox" checked={keepUnicode} onChange={(e) => setKeepUnicode(e.target.checked)} className="h-4 w-4 accent-primary" />
          {t('pages.slugify.keepUnicode')}
        </label>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{t('pages.slugify.maxLength')}</Label>
          <Input
            type="number"
            min={1}
            value={maxLength}
            onChange={(e) => setMaxLength(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
            placeholder="—"
            className="h-8 w-20 font-mono text-sm"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-3">
        <code className="flex-1 break-all font-mono text-base">{slug || <span className="text-muted-foreground">—</span>}</code>
        <Button size="sm" variant="ghost" onClick={() => copy(slug)} disabled={!slug}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>

      {lines.length > 1 && (
        <div className="mt-6">
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{t('pages.slugify.batchLabel')}</Label>
            <Button size="sm" variant="ghost" onClick={() => copy(lines.join('\n'))}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              {t('pages.slugify.copyAll')}
            </Button>
          </div>
          <Textarea readOnly value={lines.join('\n')} spellCheck={false} className="min-h-[120px] font-mono text-sm" />
        </div>
      )}
    </div>
  )
}
