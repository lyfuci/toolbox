import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { diffLines, diffWords, diffWordsWithSpace, type Change } from 'diff'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CodeEditor } from '@/components/CodeEditor'
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
type ViewMode = 'inline' | 'side'

// One row in the side-by-side view.
type SideRow = {
  left: { line?: number; text: string; segments?: Change[] }
  right: { line?: number; text: string; segments?: Change[] }
  kind: 'equal' | 'removed' | 'added' | 'changed'
}

// Walk the diff parts and align them into side-by-side rows. Lines that are
// "removed" on the left and "added" on the right at the same position are
// paired up so we can show intra-line word-level diffs.
//
// `originalA` / `originalB` carry the user's original-case line arrays so
// that with `ignoreCase` on we still render their actual casing — only the
// alignment is done on lowercased text.
function buildSideRows(
  parts: Change[],
  ignoreCase: boolean,
  originalA: string[],
  originalB: string[],
): SideRow[] {
  // Convert each part into per-line entries first.
  type Entry = { tag: 'equal' | 'add' | 'remove'; count: number }
  const entries: Entry[] = []
  for (const p of parts) {
    const raw = p.value.endsWith('\n') ? p.value.slice(0, -1) : p.value
    const count = raw === '' ? 0 : raw.split('\n').length
    const tag: Entry['tag'] = p.added ? 'add' : p.removed ? 'remove' : 'equal'
    entries.push({ tag, count })
  }

  const rows: SideRow[] = []
  let aIdx = 0 // 0-indexed pointer into originalA
  let bIdx = 0 // 0-indexed pointer into originalB

  for (let i = 0; i < entries.length; i++) {
    const cur = entries[i]
    if (cur.tag === 'equal') {
      for (let k = 0; k < cur.count; k++) {
        rows.push({
          left: { line: aIdx + 1, text: originalA[aIdx] ?? '' },
          right: { line: bIdx + 1, text: originalB[bIdx] ?? '' },
          kind: 'equal',
        })
        aIdx++
        bIdx++
      }
    } else if (cur.tag === 'remove') {
      const next = entries[i + 1]
      if (next && next.tag === 'add') {
        const minLen = Math.min(cur.count, next.count)
        for (let k = 0; k < minLen; k++) {
          const a = originalA[aIdx] ?? ''
          const b = originalB[bIdx] ?? ''
          const segs = diffWordsWithSpace(a, b, { ignoreCase })
          rows.push({
            left: { line: aIdx + 1, text: a, segments: segs.filter((s) => !s.added) },
            right: { line: bIdx + 1, text: b, segments: segs.filter((s) => !s.removed) },
            kind: 'changed',
          })
          aIdx++
          bIdx++
        }
        if (cur.count > minLen) {
          for (let k = minLen; k < cur.count; k++) {
            rows.push({
              left: { line: aIdx + 1, text: originalA[aIdx] ?? '' },
              right: { text: '' },
              kind: 'removed',
            })
            aIdx++
          }
        }
        if (next.count > minLen) {
          for (let k = minLen; k < next.count; k++) {
            rows.push({
              left: { text: '' },
              right: { line: bIdx + 1, text: originalB[bIdx] ?? '' },
              kind: 'added',
            })
            bIdx++
          }
        }
        i++ // consume next
      } else {
        for (let k = 0; k < cur.count; k++) {
          rows.push({
            left: { line: aIdx + 1, text: originalA[aIdx] ?? '' },
            right: { text: '' },
            kind: 'removed',
          })
          aIdx++
        }
      }
    } else {
      for (let k = 0; k < cur.count; k++) {
        rows.push({
          left: { text: '' },
          right: { line: bIdx + 1, text: originalB[bIdx] ?? '' },
          kind: 'added',
        })
        bIdx++
      }
    }
  }
  return rows
}

export function DiffPage() {
  const { t } = useTranslation()
  const [a, setA] = useState(SAMPLE_A)
  const [b, setB] = useState(SAMPLE_B)
  const [granularity, setGranularity] = useState<Granularity>('lines')
  const [view, setView] = useState<ViewMode>('side')
  const [ignoreWs, setIgnoreWs] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)

  // For inline mode we keep the simple legacy rendering, but with ignore-case
  // / ignore-whitespace honored where the diff lib supports them.
  const parts = useMemo<Change[]>(() => {
    if (granularity === 'lines') {
      // diffLines doesn't accept ignoreCase — manually lowercase for the
      // comparison while keeping the original text in the output is not
      // supported either, so when ignoreCase is on we lowercase both inputs.
      const aIn = ignoreCase ? a.toLowerCase() : a
      const bIn = ignoreCase ? b.toLowerCase() : b
      return diffLines(aIn, bIn, { ignoreWhitespace: ignoreWs })
    }
    return diffWords(a, b, { ignoreCase })
  }, [a, b, granularity, ignoreWs, ignoreCase])

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

  // Side-by-side rows. Only computed when needed. We diff on lowercased
  // copies (when ignoreCase is on) for alignment, but render the user's
  // original casing via parallel `originalA` / `originalB` arrays.
  const sideRows = useMemo(() => {
    if (view !== 'side') return []
    const aIn = ignoreCase ? a.toLowerCase() : a
    const bIn = ignoreCase ? b.toLowerCase() : b
    const linePartsForAlign = diffLines(aIn, bIn, { ignoreWhitespace: ignoreWs })
    const stripTrailing = (s: string) => (s.endsWith('\n') ? s.slice(0, -1) : s)
    const originalA = stripTrailing(a).split('\n')
    const originalB = stripTrailing(b).split('\n')
    return buildSideRows(linePartsForAlign, ignoreCase, originalA, originalB)
  }, [a, b, view, ignoreWs, ignoreCase])

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.diff.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.diff.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(['inline', 'side'] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1.5 transition-colors ${
                view === v
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === 'inline' ? t('pages.diff.inline') : t('pages.diff.sideBySide')}
            </button>
          ))}
        </div>

        {view === 'inline' ? (
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
        ) : null}

        {[
          { label: t('pages.diff.ignoreWs'), state: ignoreWs, setter: setIgnoreWs },
          { label: t('pages.diff.ignoreCase'), state: ignoreCase, setter: setIgnoreCase },
        ].map(({ label, state, setter }) => (
          <label
            key={label}
            className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none"
          >
            <input
              type="checkbox"
              checked={state}
              onChange={(e) => setter(e.target.checked)}
              className="accent-primary"
            />
            {label}
          </label>
        ))}

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
          <CodeEditor
            value={a}
            onChange={(v) => setA(v)}
            language="plain"
            className="min-h-[240px]"
            height="240px"
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('pages.diff.modified')}
          </Label>
          <CodeEditor
            value={b}
            onChange={(v) => setB(v)}
            language="plain"
            className="min-h-[240px]"
            height="240px"
          />
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.diff.diff')}</Label>
        {view === 'inline' ? (
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
        ) : (
          <SideBySide rows={sideRows} />
        )}
      </div>
    </div>
  )
}

function renderSegments(segs: Change[] | undefined, fallback: string, side: 'left' | 'right'): ReactNode {
  if (!segs) return fallback
  return segs.map((s, i) => {
    if (side === 'left' && s.added) return null
    if (side === 'right' && s.removed) return null
    if (s.added || s.removed) {
      return (
        <span
          key={i}
          className={
            side === 'left'
              ? 'bg-rose-500/30 text-rose-100'
              : 'bg-emerald-500/30 text-emerald-100'
          }
        >
          {s.value}
        </span>
      )
    }
    return <span key={i}>{s.value}</span>
  })
}

function SideBySide({ rows }: { rows: SideRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card/40 font-mono text-xs leading-relaxed">
      <table className="w-full border-collapse">
        <colgroup>
          <col style={{ width: '3.5rem' }} />
          <col style={{ width: '1.25rem' }} />
          <col />
          <col style={{ width: '3.5rem' }} />
          <col style={{ width: '1.25rem' }} />
          <col />
        </colgroup>
        <tbody>
          {rows.map((row, i) => {
            const leftBg =
              row.kind === 'removed' || row.kind === 'changed'
                ? 'bg-rose-500/10'
                : ''
            const rightBg =
              row.kind === 'added' || row.kind === 'changed'
                ? 'bg-emerald-500/10'
                : ''
            return (
              <tr key={i} className="align-top">
                <td className="select-none px-2 text-right text-muted-foreground">
                  {row.left.line ?? ''}
                </td>
                <td className={`select-none text-center text-muted-foreground ${leftBg}`}>
                  {row.kind === 'removed' || row.kind === 'changed' ? '-' : ''}
                </td>
                <td className={`px-2 whitespace-pre-wrap break-all ${leftBg}`}>
                  {row.left.segments ? renderSegments(row.left.segments, row.left.text, 'left') : row.left.text}
                </td>
                <td className="select-none px-2 text-right text-muted-foreground">
                  {row.right.line ?? ''}
                </td>
                <td className={`select-none text-center text-muted-foreground ${rightBg}`}>
                  {row.kind === 'added' || row.kind === 'changed' ? '+' : ''}
                </td>
                <td className={`px-2 whitespace-pre-wrap break-all ${rightBg}`}>
                  {row.right.segments ? renderSegments(row.right.segments, row.right.text, 'right') : row.right.text}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
