import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Copy, Minimize2, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatXml, minifyXml } from '@/lib/xml'

const SAMPLE = `<?xml version="1.0"?><root><item id="1">first</item><item id="2"><nested>value</nested></item></root>`

type ParsedDoc =
  | { ok: true; doc: Document }
  | { ok: false; error: string }

function parseXml(input: string, emptyMsg: string): ParsedDoc {
  if (!input.trim()) return { ok: false, error: emptyMsg }
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(input, 'application/xml')
    const err = doc.querySelector('parsererror')
    if (err) {
      return { ok: false, error: err.textContent?.trim() || 'XML parse failed' }
    }
    return { ok: true, doc }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

type XmlNodeProps = {
  node: Node
  depth: number
  matched: Set<Node>
  hasQuery: boolean
  firstMatchRef: React.MutableRefObject<HTMLDivElement | null>
}

function XmlElementNode({ node, depth, matched, hasQuery, firstMatchRef }: XmlNodeProps) {
  const isMatch = matched.has(node)
  // Auto-expand to reveal matched descendants. Derived from `matched` rather
  // than synced via effect → avoids the setState-in-effect lint rule and the
  // accompanying double render. `useMemo` recomputes only when inputs change.
  const autoOpen = useMemo(
    () => hasQuery && hasMatchedDescendant(node, matched),
    [hasQuery, matched, node],
  )
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? (autoOpen || depth < 2)
  const setOpen = (v: boolean) => setUserOpen(v)

  const rowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (isMatch && firstMatchRef.current === null && rowRef.current) {
      firstMatchRef.current = rowRef.current
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isMatch, firstMatchRef])

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim()
    if (!text) return null
    return (
      <div className="font-mono text-sm leading-6">
        <div className="flex items-start gap-1 rounded px-1 pl-5">
          <span className="text-emerald-400">{text}</span>
        </div>
      </div>
    )
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return (
      <div className="font-mono text-sm leading-6">
        <div className="flex items-start gap-1 rounded px-1 pl-5 text-muted-foreground italic">
          {`<!-- ${node.textContent ?? ''} -->`}
        </div>
      </div>
    )
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const el = node as Element
  const children = Array.from(el.childNodes).filter((c) => {
    if (c.nodeType === Node.TEXT_NODE) return (c.textContent?.trim() ?? '') !== ''
    return c.nodeType === Node.ELEMENT_NODE || c.nodeType === Node.COMMENT_NODE
  })
  const hasContainerChildren = children.some(
    (c) => c.nodeType === Node.ELEMENT_NODE || c.nodeType === Node.COMMENT_NODE,
  )
  const attrs = Array.from(el.attributes)

  return (
    <div className="font-mono text-sm leading-6">
      <div
        ref={rowRef}
        className={cn(
          'flex items-start gap-1 rounded px-1 hover:bg-accent/40',
          isMatch && hasQuery && 'bg-amber-500/15 ring-1 ring-amber-500/40',
        )}
      >
        {hasContainerChildren ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
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
        <div className="flex flex-1 flex-wrap items-center gap-1">
          <span className="text-muted-foreground">&lt;</span>
          <span className="text-sky-400">{el.tagName}</span>
          {attrs.map((a) => (
            <span key={a.name} className="ml-1">
              <span className="text-fuchsia-400">{a.name}</span>
              <span className="text-muted-foreground">=</span>
              <span className="text-amber-400">"{a.value}"</span>
            </span>
          ))}
          <span className="text-muted-foreground">
            {children.length === 0 ? ' />' : '>'}
          </span>
          {!hasContainerChildren && children.length === 1 && children[0].nodeType === Node.TEXT_NODE && (
            <>
              <span className="text-emerald-400">{children[0].textContent?.trim()}</span>
              <span className="text-muted-foreground">&lt;/</span>
              <span className="text-sky-400">{el.tagName}</span>
              <span className="text-muted-foreground">&gt;</span>
            </>
          )}
        </div>
      </div>
      {hasContainerChildren && open && (
        <>
          <div className="ml-4 border-l border-border/60 pl-2">
            {children.map((child, i) => (
              <XmlElementNode
                key={i}
                node={child}
                depth={depth + 1}
                matched={matched}
                hasQuery={hasQuery}
                firstMatchRef={firstMatchRef}
              />
            ))}
          </div>
          <div className="flex items-start gap-1 px-1 pl-5">
            <span className="text-muted-foreground">&lt;/</span>
            <span className="text-sky-400">{el.tagName}</span>
            <span className="text-muted-foreground">&gt;</span>
          </div>
        </>
      )}
    </div>
  )
}

function hasMatchedDescendant(node: Node, matched: Set<Node>): boolean {
  for (const child of Array.from(node.childNodes)) {
    if (matched.has(child)) return true
    if (hasMatchedDescendant(child, matched)) return true
  }
  return false
}

export function XmlPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState(SAMPLE)
  const [indent, setIndent] = useState<2 | 4>(2)
  const [xpath, setXpath] = useState('')

  const parsed = useMemo(() => parseXml(input, t('common.emptyInput')), [input, t])

  const formatted = useMemo(() => {
    if (!input.trim()) return { ok: true as const, value: '' }
    try {
      return { ok: true as const, value: formatXml(input, indent) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input, indent])

  const { matched, xpathError, matchCount } = useMemo(() => {
    if (!parsed.ok || !xpath.trim()) {
      return { matched: new Set<Node>(), xpathError: null as string | null, matchCount: 0 }
    }
    try {
      const snap = parsed.doc.evaluate(
        xpath,
        parsed.doc,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      )
      const set = new Set<Node>()
      for (let i = 0; i < snap.snapshotLength; i++) {
        const item = snap.snapshotItem(i)
        if (item) set.add(item)
      }
      return { matched: set, xpathError: null, matchCount: snap.snapshotLength }
    } catch (err) {
      return {
        matched: new Set<Node>(),
        xpathError: err instanceof Error ? err.message : String(err),
        matchCount: 0,
      }
    }
  }, [parsed, xpath])

  const firstMatchRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    firstMatchRef.current = null
  }, [xpath, input])

  const handleFormat = () => {
    if (!formatted.ok) return toast.error(t('common.parseFailed', { error: formatted.error }))
    setInput(formatted.value)
  }
  const handleMinify = () => {
    try {
      setInput(minifyXml(input))
    } catch (err) {
      toast.error(
        t('common.parseFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }
  const handleCopy = async () => {
    if (!input) return
    await navigator.clipboard.writeText(input)
    toast.success(t('common.copied'))
  }
  const handleClear = () => setInput('')

  const hasQuery = xpath.trim().length > 0

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.xml.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.xml.description')}</p>
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
            {t('pages.xml.indent')}
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
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="min-h-[480px] font-mono text-sm leading-relaxed"
            placeholder={t('pages.xml.placeholder')}
          />
          <div className="mt-2 text-xs">
            {formatted.ok ? (
              <span className="text-muted-foreground">
                {t('pages.xml.stats', { chars: input.length.toLocaleString() })}
              </span>
            ) : (
              <span className="text-destructive">⚠ {formatted.error}</span>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="xpath" className="mb-1.5 block text-xs text-muted-foreground">
            {t('pages.xml.xpathLabel')}
          </Label>
          <Input
            id="xpath"
            value={xpath}
            onChange={(e) => setXpath(e.target.value)}
            placeholder={t('pages.xml.xpathPlaceholder')}
            spellCheck={false}
            className="font-mono text-sm"
          />
          <div className="mt-2 text-xs">
            {xpathError ? (
              <span className="text-destructive">⚠ {xpathError}</span>
            ) : hasQuery ? (
              <span className="text-muted-foreground">
                {t('pages.xml.matchCount', { n: matchCount })}
              </span>
            ) : (
              <span className="text-muted-foreground">{t('pages.xml.treeHint')}</span>
            )}
          </div>
          <div className="mt-2 max-h-[480px] min-h-[440px] overflow-auto rounded-md border border-border bg-muted/20 p-2">
            {parsed.ok && parsed.doc.documentElement ? (
              <XmlElementNode
                node={parsed.doc.documentElement}
                depth={0}
                matched={matched}
                hasQuery={hasQuery}
                firstMatchRef={firstMatchRef}
              />
            ) : (
              <div className="px-1 py-2 text-xs text-muted-foreground">
                {parsed.ok ? t('common.noResult') : `⚠ ${parsed.error}`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
