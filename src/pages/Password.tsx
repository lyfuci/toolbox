import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { SHORT_WORDS } from '@/lib/wordlist'

const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{}<>?,.:;'
const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
}
type Toggle = 'lower' | 'upper' | 'digit' | 'symbol'

// Rejection sampling for an unbiased uniform pick from the pool.
function randomPool(pool: string, length: number): string {
  if (!pool || length <= 0) return ''
  const out: string[] = []
  const max = Math.floor(256 / pool.length) * pool.length
  while (out.length < length) {
    const buf = new Uint8Array(length * 2)
    crypto.getRandomValues(buf)
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < max) out.push(pool[buf[i] % pool.length])
    }
  }
  return out.join('')
}

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0
  // 32-bit rejection sampling.
  const max = Math.floor(0xffffffff / maxExclusive) * maxExclusive
  const buf = new Uint32Array(1)
  let v: number
  do {
    crypto.getRandomValues(buf)
    v = buf[0]
  } while (v >= max)
  return v % maxExclusive
}

function generatePassword(
  length: number,
  classes: Record<Toggle, boolean>,
  symbolPool: string,
): string {
  const pools: string[] = []
  if (classes.lower) pools.push(SETS.lower)
  if (classes.upper) pools.push(SETS.upper)
  if (classes.digit) pools.push(SETS.digit)
  if (classes.symbol && symbolPool) pools.push(symbolPool)
  if (pools.length === 0) return ''
  const combined = pools.join('')
  return randomPool(combined, length)
}

function poolSize(classes: Record<Toggle, boolean>, symbolPool: string): number {
  let n = 0
  if (classes.lower) n += SETS.lower.length
  if (classes.upper) n += SETS.upper.length
  if (classes.digit) n += SETS.digit.length
  if (classes.symbol) n += symbolPool.length
  return n
}

function entropyBitsPwd(
  length: number,
  classes: Record<Toggle, boolean>,
  symbolPool: string,
): number {
  const p = poolSize(classes, symbolPool)
  if (p === 0) return 0
  return length * Math.log2(p)
}

function generatePassphrase(
  count: number,
  separator: string,
  capitalize: boolean,
  includeNumber: boolean,
): string {
  const words: string[] = []
  for (let i = 0; i < count; i++) {
    let w = SHORT_WORDS[randomInt(SHORT_WORDS.length)]
    if (capitalize) w = w[0].toUpperCase() + w.slice(1)
    words.push(w)
  }
  let out = words.join(separator)
  if (includeNumber) {
    const digit = String(randomInt(10))
    out += separator + digit
  }
  return out
}

function entropyBitsPhrase(count: number, includeNumber: boolean): number {
  const wordBits = count * Math.log2(SHORT_WORDS.length)
  const numberBits = includeNumber ? Math.log2(10) : 0
  return wordBits + numberBits
}

// 5 segments. Boundaries chosen to bracket the typical entropy bands:
// 0 / >0-32 / 32-50 / 50-70 / 70-90 / 90+.
function strengthSegments(bits: number): number {
  if (bits <= 0) return 0
  if (bits < 32) return 1
  if (bits < 50) return 2
  if (bits < 70) return 3
  if (bits < 90) return 4
  return 5
}

const SEGMENT_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-emerald-500',
]

function StrengthBar({ bits }: { bits: number }) {
  const filled = strengthSegments(bits)
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded ${
            i < filled ? SEGMENT_COLORS[filled - 1] : 'bg-border'
          }`}
        />
      ))}
    </div>
  )
}

function strengthLabel(bits: number, t: (k: string) => string): string {
  if (bits <= 0) return t('pages.password.strengthNone')
  if (bits < 32) return t('pages.password.strengthWeak')
  if (bits < 50) return t('pages.password.strengthMedium')
  if (bits < 70) return t('pages.password.strengthStrong')
  return t('pages.password.strengthVeryStrong')
}

const SEPARATORS: { value: string; key: string }[] = [
  { value: '-', key: 'dash' },
  { value: '.', key: 'dot' },
  { value: ' ', key: 'space' },
  { value: '_', key: 'underscore' },
]

export function PasswordPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'random' | 'passphrase'>('random')

  // ----- Random password state -----
  const [length, setLength] = useState(20)
  const [classes, setClasses] = useState<Record<Toggle, boolean>>({
    lower: true,
    upper: true,
    digit: true,
    symbol: true,
  })
  const [symbolPool, setSymbolPool] = useState(DEFAULT_SYMBOLS)
  const [nonceP, setNonceP] = useState(0)

  // ----- Passphrase state -----
  const [phraseCount, setPhraseCount] = useState(5)
  const [separator, setSeparator] = useState('-')
  const [phraseCap, setPhraseCap] = useState(true)
  const [phraseNum, setPhraseNum] = useState(true)
  const [noncePh, setNoncePh] = useState(0)

  const passwordValue = useMemo(() => {
    void nonceP
    return generatePassword(length, classes, symbolPool)
  }, [length, classes, symbolPool, nonceP])

  const passwordBits = useMemo(
    () => entropyBitsPwd(length, classes, symbolPool),
    [length, classes, symbolPool],
  )

  const phraseValue = useMemo(() => {
    void noncePh
    return generatePassphrase(phraseCount, separator, phraseCap, phraseNum)
  }, [phraseCount, separator, phraseCap, phraseNum, noncePh])

  const phraseBits = useMemo(
    () => entropyBitsPhrase(phraseCount, phraseNum),
    [phraseCount, phraseNum],
  )

  const handleCopy = async (value: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success(t('common.copied'))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.password.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.password.description')}</p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'random' | 'passphrase')}>
        <TabsList>
          <TabsTrigger value="random">{t('pages.password.tabRandom')}</TabsTrigger>
          <TabsTrigger value="passphrase">{t('pages.password.tabPassphrase')}</TabsTrigger>
        </TabsList>

        <TabsContent value="random" className="mt-4">
          <div className="mb-3 flex items-center gap-3">
            <Input
              value={passwordValue}
              readOnly
              spellCheck={false}
              className="flex-1 font-mono text-sm"
            />
            <Button size="sm" onClick={() => setNonceP((n) => n + 1)}>
              <RefreshCw className="h-4 w-4" />
              {t('common.regenerate')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleCopy(passwordValue)} disabled={!passwordValue}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-2">
            <StrengthBar bits={passwordBits} />
          </div>
          <div className="mb-4 text-xs text-muted-foreground">
            {t('pages.password.entropy')}{' '}
            <code className="font-mono">{passwordBits.toFixed(1)} bits</code> ·{' '}
            {t('pages.password.strength')} {strengthLabel(passwordBits, t)}
          </div>

          <div className="mb-4 flex items-center gap-3">
            <Label htmlFor="length" className="w-16 shrink-0 text-xs text-muted-foreground">
              {t('pages.password.length')}
            </Label>
            <input
              id="length"
              type="range"
              min={4}
              max={128}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <Input
              type="number"
              min={4}
              max={128}
              value={length}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (n >= 4 && n <= 128) setLength(n)
              }}
              className="w-20 font-mono text-sm"
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-4">
            {(['lower', 'upper', 'digit', 'symbol'] as Toggle[]).map((k) => (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-2 text-sm select-none"
              >
                <input
                  type="checkbox"
                  checked={classes[k]}
                  onChange={(e) =>
                    setClasses((c) => ({ ...c, [k]: e.target.checked }))
                  }
                  className="accent-primary"
                />
                <span className="capitalize">{k}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Label className="w-32 shrink-0 text-xs text-muted-foreground">
              {t('pages.password.symbolPool')}
            </Label>
            <Input
              value={symbolPool}
              onChange={(e) => setSymbolPool(e.target.value)}
              spellCheck={false}
              disabled={!classes.symbol}
              className="font-mono text-sm"
              placeholder={DEFAULT_SYMBOLS}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSymbolPool(DEFAULT_SYMBOLS)}
              disabled={symbolPool === DEFAULT_SYMBOLS}
            >
              {t('pages.password.symbolReset')}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="passphrase" className="mt-4">
          <div className="mb-3 flex items-center gap-3">
            <Input
              value={phraseValue}
              readOnly
              spellCheck={false}
              className="flex-1 font-mono text-sm"
            />
            <Button size="sm" onClick={() => setNoncePh((n) => n + 1)}>
              <RefreshCw className="h-4 w-4" />
              {t('common.regenerate')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleCopy(phraseValue)} disabled={!phraseValue}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-2">
            <StrengthBar bits={phraseBits} />
          </div>
          <div className="mb-4 text-xs text-muted-foreground">
            {t('pages.password.entropy')}{' '}
            <code className="font-mono">{phraseBits.toFixed(1)} bits</code> ·{' '}
            {t('pages.password.strength')} {strengthLabel(phraseBits, t)}
          </div>

          <div className="mb-4 flex items-center gap-3">
            <Label htmlFor="phraseCount" className="w-32 shrink-0 text-xs text-muted-foreground">
              {t('pages.password.phraseCount')}
            </Label>
            <input
              id="phraseCount"
              type="range"
              min={4}
              max={8}
              value={phraseCount}
              onChange={(e) => setPhraseCount(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <Input
              type="number"
              min={4}
              max={8}
              value={phraseCount}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (n >= 4 && n <= 8) setPhraseCount(n)
              }}
              className="w-20 font-mono text-sm"
            />
          </div>

          <div className="mb-4 flex items-center gap-3">
            <Label className="w-32 shrink-0 text-xs text-muted-foreground">
              {t('pages.password.separator')}
            </Label>
            <div className="flex rounded-md border border-input bg-transparent text-sm">
              {SEPARATORS.map(({ value, key }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSeparator(value)}
                  className={`px-3 py-1.5 font-mono transition-colors ${
                    separator === value
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={t(`pages.password.separators.${key}`)}
                >
                  {value === ' ' ? '␣' : value}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={phraseCap}
                onChange={(e) => setPhraseCap(e.target.checked)}
                className="accent-primary"
              />
              <span>{t('pages.password.capitalizeFirst')}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={phraseNum}
                onChange={(e) => setPhraseNum(e.target.checked)}
                className="accent-primary"
              />
              <span>{t('pages.password.includeNumber')}</span>
            </label>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
