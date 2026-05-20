import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, ChevronLeft, Copy } from 'lucide-react'
import { EditorSelection, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { Button } from '@/components/ui/button'
import { CodeEditor } from '@/components/CodeEditor'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { FieldTooltip } from '@/components/FieldTooltip'

const SAMPLE_PATTERN = String.raw`(\w+)@(\w+)\.com`
const SAMPLE_TEXT = `Contact: alice@example.com or bob@toolbox.com
Other: invalid@nope, another@example.com`

const FLAG_LIST = ['g', 'i', 'm', 's', 'u', 'y'] as const
type Flag = (typeof FLAG_LIST)[number]

type Match = {
  match: string
  index: number
  groups: string[]
  named: Record<string, string> | undefined
}

function evalRegex(pattern: string, flags: string, text: string) {
  if (!pattern) return { ok: true as const, regex: null, matches: [] as Match[] }
  const fl = flags.includes('g') ? flags : flags + 'g'
  let re: RegExp
  try {
    re = new RegExp(pattern, fl)
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
  const matches: Match[] = []
  let m: RegExpExecArray | null
  let safetyBudget = 5000
  while ((m = re.exec(text)) !== null && safetyBudget-- > 0) {
    matches.push({
      match: m[0],
      index: m.index,
      groups: m.slice(1),
      named: m.groups ? { ...m.groups } : undefined,
    })
    if (m[0].length === 0) re.lastIndex++ // avoid infinite loop on zero-width matches
  }
  return { ok: true as const, regex: re, matches }
}

// Detect PCRE-only features that JS RegExp does not implement. We try to be
// conservative: variable-width lookbehind is allowed in modern JS as of
// ES2018, so we only warn about features the JS engine still rejects.
function detectPcreOnly(pattern: string): string[] {
  const issues: string[] = []
  if (/\(\?R\)/.test(pattern)) issues.push('recursion')
  if (/\(\?[+-]?\d+\)/.test(pattern)) issues.push('recursionNum')
  if (/\[\[:[a-z]+:\]\]/.test(pattern)) issues.push('posixClass')
  if (/\\K\b/.test(pattern)) issues.push('keepOut')
  if (/\(\?#/.test(pattern)) issues.push('inlineComment')
  if (/\(\*[A-Z]+/.test(pattern)) issues.push('verbs')
  if (/\\[gG]\{/.test(pattern)) issues.push('backrefBraces')
  return issues
}

// Cheatsheet rows — patterns + plain-English meaning. Rendered statically.
const CHEATSHEET: { sec: string; rows: [string, string][] }[] = [
  {
    sec: 'classes',
    rows: [
      ['\\d', 'cheat.digit'],
      ['\\D', 'cheat.nonDigit'],
      ['\\w', 'cheat.word'],
      ['\\W', 'cheat.nonWord'],
      ['\\s', 'cheat.space'],
      ['\\S', 'cheat.nonSpace'],
      ['.', 'cheat.dot'],
      ['[abc]', 'cheat.set'],
      ['[^abc]', 'cheat.negSet'],
      ['[a-z]', 'cheat.range'],
    ],
  },
  {
    sec: 'anchors',
    rows: [
      ['^', 'cheat.start'],
      ['$', 'cheat.end'],
      ['\\b', 'cheat.boundary'],
      ['\\B', 'cheat.nonBoundary'],
    ],
  },
  {
    sec: 'quant',
    rows: [
      ['*', 'cheat.zeroPlus'],
      ['+', 'cheat.onePlus'],
      ['?', 'cheat.zeroOne'],
      ['{n}', 'cheat.exact'],
      ['{n,m}', 'cheat.range2'],
      ['*?', 'cheat.lazy'],
    ],
  },
  {
    sec: 'groups',
    rows: [
      ['(...)', 'cheat.capture'],
      ['(?:...)', 'cheat.nonCapture'],
      ['(?<name>...)', 'cheat.named'],
      ['(?=...)', 'cheat.lookahead'],
      ['(?!...)', 'cheat.negLook'],
      ['(?<=...)', 'cheat.lookbehind'],
    ],
  },
]

// ── CodeMirror match-highlight machinery ─────────────────────────────────
//
// State-driven decorations: the host component dispatches a `setMatchRanges`
// effect whenever the matches / active index change, and the state field
// rebuilds its DecorationSet. Separated into a state field (vs. a view
// plugin) so the same decoration survives editor blur / state shuffling.
type MatchRange = { from: number; to: number; active: boolean }
const setMatchRanges = StateEffect.define<MatchRange[]>()

const matchField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setMatchRanges)) {
        const ranges = e.value
          .filter((r) => r.to > r.from)
          .sort((a, b) => a.from - b.from)
        deco = Decoration.set(
          ranges.map((r) =>
            Decoration.mark({
              class: r.active ? 'cm-regex-match-active' : 'cm-regex-match',
            }).range(r.from, r.to),
          ),
        )
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

const matchTheme = EditorView.theme({
  '.cm-regex-match': {
    backgroundColor: 'color-mix(in oklab, oklch(0.7 0.18 145) 35%, transparent)',
    borderRadius: '2px',
  },
  '.cm-regex-match-active': {
    backgroundColor: 'color-mix(in oklab, oklch(0.85 0.18 80) 60%, transparent)',
    borderRadius: '2px',
    outline: '1px solid oklch(0.85 0.18 80)',
  },
})

export function RegexPage() {
  const { t } = useTranslation()
  const [pattern, setPattern] = useState(SAMPLE_PATTERN)
  const [flagSet, setFlagSet] = useState<Set<Flag>>(new Set<Flag>(['g']))
  const [text, setText] = useState(SAMPLE_TEXT)
  const [replacement, setReplacement] = useState('<$1@$2.com>')
  const [activeMatchRaw, setActiveMatch] = useState(0)
  const [showCheat, setShowCheat] = useState(false)

  const flags = Array.from(flagSet).join('')
  const result = useMemo(() => evalRegex(pattern, flags, text), [pattern, flags, text])
  const pcreIssues = useMemo(() => detectPcreOnly(pattern), [pattern])

  const replacePreview = useMemo(() => {
    if (!result.ok || !result.regex) return ''
    try {
      return text.replace(result.regex, replacement)
    } catch (err) {
      return `(replace error: ${err instanceof Error ? err.message : String(err)})`
    }
  }, [result, text, replacement])

  // Clamp activeMatch into a valid range derived from current match count.
  // Doing this during render (rather than in an effect) avoids cascading
  // renders and keeps render output consistent.
  const matchCount = result.ok ? result.matches.length : 0
  const activeMatch = matchCount === 0 ? 0 : Math.min(activeMatchRaw, matchCount - 1)

  const handleCopy = async (v: string) => {
    if (!v) return
    await navigator.clipboard.writeText(v)
    toast.success(t('common.copied'))
  }

  const flagLabel = (flag: Flag): string => t(`pages.regex.flag${flag.toUpperCase()}`)

  // ----- CodeMirror view ref + match decoration sync -----
  const viewRef = useRef<EditorView | null>(null)

  // Dispatch updated match ranges to the editor's StateField whenever the
  // computed matches or active-index changes. Effect-driven (vs. controlled
  // by render) so we can target the imperative EditorView.dispatch API.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const ranges: MatchRange[] = result.ok
      ? result.matches.map((m, i) => ({
          from: m.index,
          to: m.index + m.match.length,
          active: i === activeMatch,
        }))
      : []
    view.dispatch({ effects: setMatchRanges.of(ranges) })
  }, [result, activeMatch])

  // Prev/next jump — programmatically set the editor's selection to the
  // active match's range so the user is scrolled to + sees the highlight.
  const jumpTo = (i: number) => {
    if (!result.ok || result.matches.length === 0) return
    const idx = ((i % matchCount) + matchCount) % matchCount
    setActiveMatch(idx)
    const m = result.matches[idx]
    const view = viewRef.current
    if (!view) return
    view.focus()
    view.dispatch({
      selection: EditorSelection.single(m.index, m.index + m.match.length),
      scrollIntoView: true,
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.regex.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.regex.description')}</p>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <code className="text-muted-foreground">/</code>
        <Input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          spellCheck={false}
          className="flex-1 font-mono text-sm"
          placeholder={t('pages.regex.patternPlaceholder')}
        />
        <code className="text-muted-foreground">/</code>
        <code className="font-mono text-sm">{flags}</code>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        {FLAG_LIST.map((flag) => (
          <label
            key={flag}
            className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none"
          >
            <input
              type="checkbox"
              checked={flagSet.has(flag)}
              onChange={(e) => {
                setFlagSet((s) => {
                  const next = new Set(s)
                  if (e.target.checked) next.add(flag)
                  else next.delete(flag)
                  return next
                })
              }}
              className="accent-primary"
            />
            <FieldTooltip body={`fieldMeta.regexFlag.${flag}`} bodyIsKey>
              {flagLabel(flag)}
            </FieldTooltip>
          </label>
        ))}
      </div>

      {pcreIssues.length > 0 ? (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <div className="mb-1 font-medium">{t('pages.regex.pcreWarn')}</div>
          <ul className="ml-4 list-disc">
            {pcreIssues.map((k) => (
              <li key={k}>{t(`pages.regex.pcre.${k}`)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-4">
        <Label className="mb-1.5 block text-xs text-muted-foreground">
          {t('pages.regex.testText')}
        </Label>
        {/* CodeMirror replaces the textarea+overlay pair. Match highlight
            lives in a StateField (see matchField above) driven by a useEffect
            that fires `setMatchRanges` whenever the regex result changes. */}
        <CodeEditor
          value={text}
          onChange={(v) => setText(v)}
          language="plain"
          onCreateEditor={(view) => {
            viewRef.current = view
          }}
          extraExtensions={[matchField, matchTheme]}
          height="200px"
          className="min-h-[200px]"
        />
      </div>

      {!result.ok ? (
        <div className="text-xs text-destructive">⚠ {result.error}</div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Label className="text-xs text-muted-foreground">
              {t('pages.regex.matches')} ({result.matches.length})
            </Label>
            {result.matches.length > 0 ? (
              <div className="flex items-center gap-1.5 text-xs">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => jumpTo(activeMatch - 1)}
                  disabled={result.matches.length === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="font-mono text-muted-foreground">
                  {t('pages.regex.matchNOfM', {
                    n: activeMatch + 1,
                    m: result.matches.length,
                  })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => jumpTo(activeMatch + 1)}
                  disabled={result.matches.length === 0}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </div>

          {result.matches.length === 0 ? (
            <div className="text-xs text-muted-foreground">{t('pages.regex.noMatch')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {result.matches.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-md border px-3 py-2 font-mono text-xs ${
                    i === activeMatch
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-border bg-card/40'
                  }`}
                  onClick={() => jumpTo(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') jumpTo(i)
                  }}
                >
                  <div>
                    <span className="text-muted-foreground">[{m.index}]</span>{' '}
                    <span className="text-emerald-700 dark:text-emerald-300">{m.match}</span>
                  </div>
                  {m.groups.length > 0 ? (
                    <div className="mt-1 text-muted-foreground">
                      groups: [
                      {m.groups.map((g, j) => (
                        <span key={j}>
                          {j > 0 ? ', ' : ''}
                          <span className="text-foreground">{JSON.stringify(g)}</span>
                        </span>
                      ))}
                      ]
                    </div>
                  ) : null}
                  {m.named ? (
                    <div className="mt-1 text-muted-foreground">
                      named: {JSON.stringify(m.named)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 mb-2">
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              {t('pages.regex.replacement')}
            </Label>
            <Input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              spellCheck={false}
              className="font-mono text-sm"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {t('pages.regex.replacePreview')}
              </Label>
              <Button size="sm" variant="ghost" onClick={() => handleCopy(replacePreview)}>
                <Copy className="h-3.5 w-3.5" />
                {t('common.copy')}
              </Button>
            </div>
            <CodeEditor
              value={replacePreview}
              language="plain"
              readOnly
              editable={false}
              height="140px"
              className="min-h-[140px]"
            />
          </div>
        </>
      )}

      <section className="mt-8 rounded-md border border-border bg-card/30">
        <button
          type="button"
          onClick={() => setShowCheat((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
        >
          {showCheat ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {t('pages.regex.cheatTitle')}
        </button>
        {showCheat ? (
          <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2">
            {CHEATSHEET.map((sec) => (
              <div key={sec.sec}>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t(`pages.regex.cheatSec.${sec.sec}`)}
                </div>
                <div className="flex flex-col gap-1">
                  {sec.rows.map(([pat, key]) => (
                    <div
                      key={pat}
                      className="flex items-center gap-3 rounded border border-border/50 bg-background/40 px-2 py-1 font-mono text-xs"
                    >
                      <code className="w-24 shrink-0 text-emerald-500">{pat}</code>
                      <span className="text-muted-foreground">{t(`pages.regex.${key}`)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
