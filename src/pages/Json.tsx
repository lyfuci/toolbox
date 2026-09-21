import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Copy, Minimize2, Sparkles, Trash2 } from 'lucide-react'
import { JSONPath } from 'jsonpath-plus'
import { Button } from '@/components/ui/button'
import { CodeEditor } from '@/components/CodeEditor'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  buildPath,
  toFriendlyPath,
  valueToClipboardText,
  type JsonValue,
} from '@/lib/json-tree'
import { toast } from 'sonner'

const SAMPLE = `{"name":"toolbox","version":1,"tools":["json","jwt","media"],"meta":{"local":true}}`

type ParseState =
  | { ok: true; value: unknown }
  | { ok: false; error: string }

function parse(input: string, emptyMsg: string): ParseState {
  if (!input.trim()) return { ok: false, error: emptyMsg }
  try {
    return { ok: true, value: JSON.parse(input) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function isObject(v: unknown): v is Record<string, JsonValue> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function valueClass(v: unknown): string {
  if (v === null) return 'text-muted-foreground italic'
  switch (typeof v) {
    case 'string':
      return 'text-emerald-400'
    case 'number':
      return 'text-amber-400'
    case 'boolean':
      return 'text-sky-400'
    default:
      return ''
  }
}

function renderPrimitive(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return JSON.stringify(v)
  return String(v)
}

type NodeProps = {
  label: string | number | null
  value: JsonValue
  path: string
  depth: number
  matched: Set<string>
  hasFilter: boolean
  onCopyPath: (path: string) => void
  onCopyValue: (path: string, value: JsonValue) => void
  firstMatchRef: React.MutableRefObject<HTMLDivElement | null>
}

function JsonNode({
  label,
  value,
  path,
  depth,
  matched,
  hasFilter,
  onCopyPath,
  onCopyValue,
  firstMatchRef,
}: NodeProps) {
  const { t } = useTranslation()
  const isMatch = matched.has(path)
  const hasMatchedKid = pathHasMatchedDescendant(path, matched)
  const isDim = hasFilter && !isMatch && !hasMatchedKid
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  // Default: open if shallow OR (filter active AND a descendant matches).
  // Manual toggle overrides the default until the filter context changes.
  const defaultOpen = depth < 2 || (hasFilter && hasMatchedKid)
  const open = userOpen ?? defaultOpen

  const isArr = Array.isArray(value)
  const isObj = isObject(value)
  const isContainer = isArr || isObj

  const labelText = label === null ? '' : typeof label === 'number' ? `[${label}]` : `${label}`
  const colon = label === null ? '' : ': '

  const rowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (isMatch && firstMatchRef.current === null && rowRef.current) {
      firstMatchRef.current = rowRef.current
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isMatch, firstMatchRef])

  // Two targets, because a row answers two different questions: the key is
  // "where is this?" (JSONPath), the value is "what is this?" (the value).
  // One row-wide button meant clicking a value handed back a path.
  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCopyPath(path)
  }
  const handleCopyValue = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCopyValue(path, value)
  }

  return (
    <div className={cn('font-mono text-sm leading-6', isDim && 'opacity-30')}>
      <div
        ref={rowRef}
        className={cn(
          'group flex items-start gap-1 rounded px-1 hover:bg-accent/40',
          isMatch && hasFilter && 'bg-amber-500/15 ring-1 ring-amber-500/40',
        )}
      >
        {isContainer ? (
          <button
            type="button"
            onClick={() => setUserOpen(!open)}
            aria-label={open ? 'Collapse' : 'Expand'}
            className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="mt-1 inline-block h-4 w-4 shrink-0" />
        )}
        <div className="flex flex-1 flex-wrap items-center gap-1 text-left">
          {label !== null && (
            <button
              type="button"
              title={t('pages.json.copyPathTitle', { path: toFriendlyPath(path) })}
              onClick={handleCopyPath}
              className={cn(
                'cursor-pointer rounded hover:underline',
                typeof label === 'number' ? 'text-muted-foreground' : 'text-fuchsia-400',
              )}
            >
              {labelText}
            </button>
          )}
          <span className="text-muted-foreground">{colon}</span>
          <button
            type="button"
            title={t('pages.json.copyValueTitle')}
            onClick={handleCopyValue}
            className="cursor-pointer rounded hover:underline"
          >
            {isContainer ? (
              <span className="text-muted-foreground">
                {isArr
                  ? `[${(value as JsonValue[]).length}]`
                  : `{${Object.keys(value as Record<string, JsonValue>).length}}`}
              </span>
            ) : (
              <span className={valueClass(value)}>{renderPrimitive(value)}</span>
            )}
          </button>
        </div>
      </div>
      {isContainer && open && (
        <div className="ml-4 border-l border-border/60 pl-2">
          {isArr
            ? (value as JsonValue[]).map((child, i) => (
                <JsonNode
                  key={i}
                  label={i}
                  value={child}
                  path={buildPath(path, i)}
                  depth={depth + 1}
                  matched={matched}
                  hasFilter={hasFilter}
                  onCopyPath={onCopyPath}
                  onCopyValue={onCopyValue}
                  firstMatchRef={firstMatchRef}
                />
              ))
            : Object.entries(value as Record<string, JsonValue>).map(([k, child]) => (
                <JsonNode
                  key={k}
                  label={k}
                  value={child}
                  path={buildPath(path, k)}
                  depth={depth + 1}
                  matched={matched}
                  hasFilter={hasFilter}
                  onCopyPath={onCopyPath}
                  onCopyValue={onCopyValue}
                  firstMatchRef={firstMatchRef}
                />
              ))}
        </div>
      )}
    </div>
  )
}

function pathHasMatchedDescendant(prefix: string, matched: Set<string>): boolean {
  for (const m of matched) {
    if (m !== prefix && m.startsWith(prefix)) return true
  }
  return false
}

export function JsonPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState(SAMPLE)
  const [indent, setIndent] = useState<2 | 4>(2)
  const [pathQuery, setPathQuery] = useState('')

  const state = useMemo(() => parse(input, t('common.emptyInput')), [input, t])

  const formatted = state.ok ? JSON.stringify(state.value, null, indent) : ''
  const minified = state.ok ? JSON.stringify(state.value) : ''

  const { matched, pathError } = useMemo(() => {
    if (!state.ok || !pathQuery.trim()) {
      return { matched: new Set<string>(), pathError: null as string | null }
    }
    try {
      const paths = JSONPath({
        path: pathQuery,
        json: state.value as object,
        resultType: 'path',
      }) as string[]
      return { matched: new Set(paths), pathError: null }
    } catch (err) {
      return {
        matched: new Set<string>(),
        pathError: err instanceof Error ? err.message : String(err),
      }
    }
  }, [state, pathQuery])

  const firstMatchRef = useRef<HTMLDivElement | null>(null)
  // Reset the "first match" anchor whenever the filter or data changes.
  useEffect(() => {
    firstMatchRef.current = null
  }, [pathQuery, input])

  const handleFormat = () => {
    if (!state.ok) return toast.error(t('common.parseFailed', { error: state.error }))
    setInput(formatted)
  }
  const handleMinify = () => {
    if (!state.ok) return toast.error(t('common.parseFailed', { error: state.error }))
    setInput(minified)
  }
  const handleCopy = async () => {
    if (!input) return
    await navigator.clipboard.writeText(input)
    toast.success(t('common.copied'))
  }
  const handleClear = () => setInput('')

  const handleCopyPath = async (rawPath: string) => {
    const friendly = toFriendlyPath(rawPath)
    await navigator.clipboard.writeText(friendly)
    toast.success(t('pages.json.copiedPath', { path: friendly }))
  }

  const handleCopyValue = async (rawPath: string, value: JsonValue) => {
    const text = valueToClipboardText(value, indent)
    await navigator.clipboard.writeText(text)
    // Say how much came along: a collapsed `{6}` can be a megabyte of subtree.
    toast.success(
      t('pages.json.copiedValue', {
        path: toFriendlyPath(rawPath),
        chars: text.length.toLocaleString(),
      }),
    )
  }

  const stats = state.ok
    ? t('pages.json.stats', {
        chars: input.length.toLocaleString(),
        minified: minified.length.toLocaleString(),
      })
    : null

  const matchCount = matched.size
  const hasFilter = pathQuery.trim().length > 0

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.json.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.json.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleFormat}>
          <Sparkles className="h-4 w-4" />
          {t('common.format')}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleMinify}>
          <Minimize2 className="h-4 w-4" />
          {t('common.minify')}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleCopy}>
          <Copy className="h-4 w-4" />
          {t('common.copy')}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleClear}>
          <Trash2 className="h-4 w-4" />
          {t('common.clear')}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="indent" className="text-xs text-muted-foreground">
            {t('pages.json.indent')}
          </Label>
          <div className="flex rounded-md border border-input bg-transparent text-sm">
            {[2, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setIndent(n as 2 | 4)}
                className={`px-3 py-1 transition-colors ${
                  indent === n
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('common.input')}
          </Label>
          <CodeEditor
            value={input}
            onChange={(v) => setInput(v)}
            language="json"
            placeholder={t('pages.json.placeholder')}
            className="min-h-[480px]"
            height="480px"
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            {state.ok ? (
              <span className="text-muted-foreground">{stats}</span>
            ) : (
              <span className="text-destructive">⚠ {state.error}</span>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="jsonpath" className="mb-1.5 block text-xs text-muted-foreground">
            {t('pages.json.jsonpathLabel')}
          </Label>
          <Input
            id="jsonpath"
            value={pathQuery}
            onChange={(e) => setPathQuery(e.target.value)}
            placeholder={t('pages.json.jsonpathPlaceholder')}
            spellCheck={false}
            className="font-mono text-sm"
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            {pathError ? (
              <span className="text-destructive">⚠ {pathError}</span>
            ) : hasFilter ? (
              <span className="text-muted-foreground">
                {t('pages.json.matchCount', { n: matchCount })}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t('pages.json.clickHint')}
              </span>
            )}
          </div>
          <div className="mt-2 max-h-[480px] min-h-[440px] overflow-auto rounded-md border border-border bg-muted/20 p-2">
            {state.ok ? (
              <JsonNode
                label={null}
                value={state.value as JsonValue}
                path="$"
                depth={0}
                matched={matched}
                hasFilter={hasFilter}
                onCopyPath={handleCopyPath}
                onCopyValue={handleCopyValue}
                firstMatchRef={firstMatchRef}
              />
            ) : (
              <div className="px-1 py-2 text-xs text-muted-foreground">
                {t('common.noResult')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
