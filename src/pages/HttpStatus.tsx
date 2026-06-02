import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { searchStatuses, CATEGORY_LABELS, type HttpStatus } from '@/lib/http-status'

const CATEGORY_STYLE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'text-sky-400 border-sky-500/30',
  2: 'text-emerald-400 border-emerald-500/30',
  3: 'text-amber-400 border-amber-500/30',
  4: 'text-orange-400 border-orange-500/30',
  5: 'text-red-400 border-red-500/30',
}

export function HttpStatusPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const results = useMemo(() => searchStatuses(query), [query])

  const grouped = useMemo(() => {
    const map = new Map<1 | 2 | 3 | 4 | 5, HttpStatus[]>()
    for (const s of results) {
      const arr = map.get(s.category) ?? []
      arr.push(s)
      map.set(s.category, arr)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [results])

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.http-status.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.httpStatus.description')}</p>
      </header>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('pages.httpStatus.searchPlaceholder')}
        spellCheck={false}
        className="mb-6 font-mono text-sm"
      />

      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pages.httpStatus.noResults')}</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, list]) => (
            <section key={cat}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                {cat}xx · {t(`pages.httpStatus.category.${cat}`, CATEGORY_LABELS[cat])}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {list.map((s) => (
                      <tr key={s.code} className="border-b border-border last:border-0">
                        <td className="w-16 px-3 py-2 align-top">
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 font-mono text-xs font-semibold ${CATEGORY_STYLE[s.category]}`}
                          >
                            {s.code}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {t(`pages.httpStatus.desc.${s.descKey}`, '')}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
