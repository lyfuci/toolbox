import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inspect } from '@/lib/unicode-inspect'

export function UnicodeInspectPage() {
  const { t } = useTranslation()
  const [text, setText] = useState('Aa中😀\t€')

  const chars = useMemo(() => inspect(text), [text])

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.unicode.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.unicode.description')}</p>
      </header>

      <div className="mb-5">
        <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.unicode.inputLabel')}</Label>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="font-mono text-base"
          placeholder={t('pages.unicode.placeholder')}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t('pages.unicode.count', { count: chars.length })}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/60 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-center font-medium">{t('pages.unicode.colChar')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('pages.unicode.colCode')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('pages.unicode.colDec')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('pages.unicode.colUtf8')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('pages.unicode.colUtf16')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('pages.unicode.colCategory')}</th>
              <th className="px-3 py-2 text-left font-medium">{t('pages.unicode.colName')}</th>
            </tr>
          </thead>
          <tbody>
            {chars.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  {t('pages.unicode.empty')}
                </td>
              </tr>
            ) : (
              chars.map((c, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-center font-mono text-lg">
                    {c.category === 'Control' || c.category === 'Whitespace' ? (
                      <span className="text-muted-foreground">·</span>
                    ) : (
                      c.char
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">{c.hex}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.decimal}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.utf8}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.utf16}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.category}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
