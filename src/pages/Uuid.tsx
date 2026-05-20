import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  UUID_NAMESPACES,
  type UuidNamespace,
  uuidv1,
  uuidv3,
  uuidv4,
  uuidv5,
  uuidv7,
  decodeUuid,
  formatUuid,
  uuidToBase64,
  type UuidFormat,
} from '@/lib/uuid'

type Version = 'v1' | 'v3' | 'v4' | 'v5' | 'v7'

function applyFormat(uuid: string, fmt: UuidFormat, asBase64: boolean): string {
  if (asBase64) return uuidToBase64(uuid)
  return formatUuid(uuid, fmt)
}

export function UuidPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const [tab, setTab] = useState<'generate' | 'decode'>('generate')

  // ----- Generate state -----
  const [version, setVersion] = useState<Version>('v4')
  const [count, setCount] = useState(5)
  const [namespace, setNamespace] = useState<UuidNamespace>('DNS')
  const [name, setName] = useState('example.com')
  const [fmt, setFmt] = useState<UuidFormat>({
    uppercase: false,
    noHyphens: false,
    braces: false,
  })
  const [base64, setBase64] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [values, setValues] = useState<string[]>([])

  // Recompute UUID list whenever inputs change. v5 needs async SHA-1.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const out: string[] = []
      const nsId = UUID_NAMESPACES[namespace]
      for (let i = 0; i < count; i++) {
        try {
          if (version === 'v1') out.push(uuidv1())
          else if (version === 'v4') out.push(uuidv4())
          else if (version === 'v7') out.push(uuidv7())
          else if (version === 'v3') out.push(uuidv3(nsId, name))
          else if (version === 'v5') out.push(await uuidv5(nsId, name))
        } catch {
          /* swallow, leave list short */
        }
      }
      if (!cancelled) setValues(out)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [version, count, namespace, name, nonce])

  const formatted = useMemo(
    () => values.map((u) => applyFormat(u, fmt, base64)),
    [values, fmt, base64],
  )

  const regenerate = () => setNonce((n) => n + 1)

  const handleCopyOne = async (uuid: string) => {
    await navigator.clipboard.writeText(uuid)
    toast.success(t('common.copied'))
  }
  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(formatted.join('\n'))
    toast.success(t('pages.uuid.copiedMany', { count: formatted.length }))
  }

  // v3 / v5 generate the same UUID for fixed inputs, so showing multiple
  // identical rows is pointless. Hide the count widget in that case.
  const isHashed = version === 'v3' || version === 'v5'
  const effectiveCount = isHashed ? 1 : count

  // ----- Decode state -----
  const [decodeInput, setDecodeInput] = useState('018f2c9a-b400-7d6f-9f7a-9b3e8b2d1f55')
  const decoded = useMemo(() => decodeUuid(decodeInput), [decodeInput])

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.uuid.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.uuid.description')}</p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'generate' | 'decode')}>
        <TabsList>
          <TabsTrigger value="generate">{t('pages.uuid.tabGenerate')}</TabsTrigger>
          <TabsTrigger value="decode">{t('pages.uuid.tabDecode')}</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Label className="text-xs text-muted-foreground">{t('pages.uuid.version')}</Label>
            <div className="flex rounded-md border border-input bg-transparent text-sm">
              {(['v1', 'v3', 'v4', 'v5', 'v7'] as Version[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVersion(v)}
                  className={`px-2.5 py-1 transition-colors ${
                    version === v
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            {!isHashed && (
              <>
                <Label htmlFor="count" className="text-xs text-muted-foreground">
                  {t('pages.uuid.count')}
                </Label>
                <Input
                  id="count"
                  type="number"
                  min={1}
                  max={1000}
                  value={count}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (n >= 1 && n <= 1000) setCount(n)
                  }}
                  className="w-20 font-mono text-sm"
                />
              </>
            )}
            <Button size="sm" onClick={regenerate}>
              <RefreshCw className="h-4 w-4" />
              {t('common.regenerate')}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCopyAll}>
              <Copy className="h-4 w-4" />
              {t('common.copyAll')}
            </Button>
          </div>

          {isHashed && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Label className="text-xs text-muted-foreground">
                {t('pages.uuid.namespace')}
              </Label>
              <select
                value={namespace}
                onChange={(e) => setNamespace(e.target.value as UuidNamespace)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {(Object.keys(UUID_NAMESPACES) as UuidNamespace[]).map((n) => (
                  <option key={n} value={n} className="bg-background">
                    {n} ({UUID_NAMESPACES[n]})
                  </option>
                ))}
              </select>
              <Label className="text-xs text-muted-foreground">{t('pages.uuid.name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
                placeholder="example.com"
                className="w-64 font-mono text-sm"
              />
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-xs text-muted-foreground">{t('pages.uuid.format')}</span>
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={fmt.uppercase}
                onChange={(e) => setFmt((f) => ({ ...f, uppercase: e.target.checked }))}
                disabled={base64}
                className="accent-primary"
              />
              <span>{t('pages.uuid.uppercase')}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={fmt.noHyphens}
                onChange={(e) => setFmt((f) => ({ ...f, noHyphens: e.target.checked }))}
                disabled={base64}
                className="accent-primary"
              />
              <span>{t('pages.uuid.noHyphens')}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={fmt.braces}
                onChange={(e) => setFmt((f) => ({ ...f, braces: e.target.checked }))}
                disabled={base64}
                className="accent-primary"
              />
              <span>{t('pages.uuid.braces')}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={base64}
                onChange={(e) => setBase64(e.target.checked)}
                className="accent-primary"
              />
              <span>{t('pages.uuid.base64')}</span>
            </label>
          </div>

          {effectiveCount <= 10 ? (
            <div className="flex flex-col gap-2">
              {formatted.map((u, i) => (
                <div
                  key={`${u}-${i}`}
                  className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
                >
                  <code className="flex-1 font-mono text-sm">{u}</code>
                  <Button size="sm" variant="ghost" onClick={() => handleCopyOne(u)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Textarea
              value={formatted.join('\n')}
              readOnly
              spellCheck={false}
              className="min-h-[420px] font-mono text-sm leading-relaxed"
            />
          )}
        </TabsContent>

        <TabsContent value="decode" className="mt-4">
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('pages.uuid.decodeInput')}
          </Label>
          <Input
            value={decodeInput}
            onChange={(e) => setDecodeInput(e.target.value)}
            spellCheck={false}
            className="mb-4 font-mono text-sm"
            placeholder="e.g. 018f2c9a-b400-7d6f-9f7a-9b3e8b2d1f55"
          />

          {decoded ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2">
                <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
                  {t('pages.uuid.dVersion')}
                </span>
                <code className="font-mono text-sm">v{decoded.version}</code>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2">
                <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
                  {t('pages.uuid.dVariant')}
                </span>
                <code className="font-mono text-sm">{decoded.variant}</code>
              </div>
              {decoded.timestampMs != null && (
                <div className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2">
                  <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
                    {t('pages.uuid.dTimestamp')}
                  </span>
                  <code className="font-mono text-sm">
                    {new Date(decoded.timestampMs).toISOString()} (
                    {new Date(decoded.timestampMs).toLocaleString(locale)})
                  </code>
                </div>
              )}
            </div>
          ) : decodeInput.trim() ? (
            <div className="text-xs text-destructive">⚠ {t('pages.uuid.dCannotParse')}</div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
