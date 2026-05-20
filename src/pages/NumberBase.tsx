import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const VALID_DIGITS_FOR_BASE: Record<number, RegExp> = {}
function digitsRegex(base: number): RegExp {
  if (!VALID_DIGITS_FOR_BASE[base]) {
    const last = base <= 10 ? base - 1 : 9
    let pattern = `[-+]?[0-${last}`
    if (base > 10) {
      const lastLetter = String.fromCharCode('a'.charCodeAt(0) + base - 11)
      pattern += `a-${lastLetter}A-${lastLetter.toUpperCase()}`
    }
    pattern += ']+'
    VALID_DIGITS_FOR_BASE[base] = new RegExp(`^${pattern}$`)
  }
  return VALID_DIGITS_FOR_BASE[base]
}

function parseToBigInt(input: string, base: number): bigint | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  if (!digitsRegex(base).test(s)) return null
  const negative = s.startsWith('-')
  const body = s.replace(/^[+-]/, '')
  let n = 0n
  const b = BigInt(base)
  for (const c of body) {
    const d = parseInt(c, base)
    if (isNaN(d)) return null
    n = n * b + BigInt(d)
  }
  return negative ? -n : n
}

// Parse an input that may carry a prefix: 0x, 0b, 0o. Otherwise use the
// supplied fallback base.
function parseSmart(input: string, fallbackBase: number): { value: bigint; base: number } | null {
  const s = input.trim()
  if (!s) return null
  const sign = s.startsWith('-') ? '-' : ''
  const body = sign ? s.slice(1) : s
  if (/^0x/i.test(body)) {
    const v = parseToBigInt(sign + body.slice(2), 16)
    return v == null ? null : { value: v, base: 16 }
  }
  if (/^0b/i.test(body)) {
    const v = parseToBigInt(sign + body.slice(2), 2)
    return v == null ? null : { value: v, base: 2 }
  }
  if (/^0o/i.test(body)) {
    const v = parseToBigInt(sign + body.slice(2), 8)
    return v == null ? null : { value: v, base: 8 }
  }
  const v = parseToBigInt(s, fallbackBase)
  return v == null ? null : { value: v, base: fallbackBase }
}

type Width = 8 | 16 | 32 | 64
const WIDTHS: Width[] = [8, 16, 32, 64]

function widthMask(width: Width): bigint {
  return (1n << BigInt(width)) - 1n
}

// Display the value as unsigned in the given width. Negative values become
// two's-complement positive within the width.
function toUnsigned(value: bigint, width: Width): bigint {
  const mask = widthMask(width)
  return value < 0n ? (value & mask) + 0n : value & mask
}

// Convert back to signed representation if the top bit is set.
function toSigned(value: bigint, width: Width): bigint {
  const u = toUnsigned(value, width)
  const sign = 1n << BigInt(width - 1)
  return u >= sign ? u - (1n << BigInt(width)) : u
}

function bitToggled(value: bigint, bit: number, width: Width): bigint {
  const u = toUnsigned(value, width)
  return toSigned(u ^ (1n << BigInt(bit)), width)
}

export function NumberBasePage() {
  const { t } = useTranslation()
  const [value, setValue] = useState<bigint>(255n)
  const [width, setWidth] = useState<Width>(32)
  const [customBase, setCustomBase] = useState(36)
  const [errors, setErrors] = useState<Record<number, boolean>>({})
  // Bitwise ops
  const [op, setOp] = useState<'AND' | 'OR' | 'XOR' | 'SHL' | 'SHR'>('AND')
  const [operand, setOperand] = useState('1')

  const FIXED_BASES: { base: number; label: string }[] = [
    { base: 2, label: t('pages.numberBase.base2') },
    { base: 8, label: t('pages.numberBase.base8') },
    { base: 10, label: t('pages.numberBase.base10') },
    { base: 16, label: t('pages.numberBase.base16') },
  ]

  const updateFrom = (base: number, raw: string) => {
    if (!raw.trim()) {
      setValue(0n)
      setErrors((e) => ({ ...e, [base]: false }))
      return
    }
    if (base === 10) {
      // Smart parse: detect 0x/0b/0o prefix automatically.
      const r = parseSmart(raw, 10)
      if (r) {
        setValue(r.value)
        setErrors((e) => ({ ...e, [base]: false }))
        return
      }
      setErrors((e) => ({ ...e, [base]: true }))
      return
    }
    const parsed = parseToBigInt(raw, base)
    if (parsed === null) {
      setErrors((e) => ({ ...e, [base]: true }))
      return
    }
    setValue(parsed)
    setErrors((e) => ({ ...e, [base]: false }))
  }

  const handleCopy = async (label: string, v: string) => {
    await navigator.clipboard.writeText(v)
    toast.success(t('common.copiedLabel', { label }))
  }

  const renderRow = (base: number, label: string) => {
    const display = value.toString(base)
    return (
      <div key={base} className="flex items-center gap-3">
        <Label className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        <Input
          value={display}
          onChange={(e) => updateFrom(base, e.target.value)}
          spellCheck={false}
          className={`font-mono text-sm ${errors[base] ? 'border-destructive' : ''}`}
        />
        <Button size="sm" variant="ghost" onClick={() => handleCopy(label, display)}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  // ----- Bitwise ops -----
  const applyOp = () => {
    const r = parseSmart(operand, 10)
    if (!r) {
      toast.error(t('pages.numberBase.invalidOperand'))
      return
    }
    const a = toUnsigned(value, width)
    const b = toUnsigned(r.value, width)
    const mask = widthMask(width)
    // Clamp shift count to width to avoid runaway BigInt allocations on
    // pathological inputs (e.g. SHL by 1_000_000).
    const shift = BigInt(Math.min(Number(b), width))
    let res: bigint
    switch (op) {
      case 'AND':
        res = a & b
        break
      case 'OR':
        res = a | b
        break
      case 'XOR':
        res = a ^ b
        break
      case 'SHL':
        res = (a << shift) & mask
        break
      case 'SHR':
        res = a >> shift
        break
    }
    setValue(toSigned(res, width))
  }

  const applyNot = () => {
    const a = toUnsigned(value, width)
    const mask = widthMask(width)
    setValue(toSigned(~a & mask, width))
  }

  // ----- Bit grid -----
  const unsigned = toUnsigned(value, width)
  const signed = toSigned(value, width)
  const bits: number[] = []
  for (let i = width - 1; i >= 0; i--) {
    bits.push(Number((unsigned >> BigInt(i)) & 1n))
  }

  const handleBitClick = (bitIndex: number) => {
    // bitIndex 0 = MSB in our `bits` array; convert to bit position from LSB.
    const pos = width - 1 - bitIndex
    setValue(bitToggled(value, pos, width))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.number-base.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.numberBase.description')}</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Label className="text-xs text-muted-foreground">{t('pages.numberBase.width')}</Label>
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              className={`px-2.5 py-1 transition-colors ${
                width === w
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w}-bit
            </button>
          ))}
        </div>
        <span className="ml-2 text-xs text-muted-foreground">
          {t('pages.numberBase.signed')}: <code className="font-mono">{signed.toString()}</code>
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {FIXED_BASES.map(({ base, label }) => renderRow(base, label))}

        <div className="mt-2 flex items-center gap-3">
          <Label className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
            {t('pages.numberBase.custom')}
          </Label>
          <Input
            type="number"
            min={2}
            max={36}
            value={customBase}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (n >= 2 && n <= 36) setCustomBase(n)
            }}
            className="w-20 font-mono text-sm"
          />
          <span className="text-xs text-muted-foreground">{t('pages.numberBase.customBaseLabel')}</span>
        </div>
        {renderRow(customBase, t('pages.numberBase.baseN', { base: customBase }))}
      </div>

      {/* Bit grid */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium">{t('pages.numberBase.bitGrid')}</h2>
        <div className="overflow-x-auto rounded-md border border-border bg-card/40 p-3">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${Math.min(width, 32)}, minmax(0, 1fr))` }}
          >
            {bits.map((b, i) => {
              const pos = width - 1 - i
              const isByteEdge = pos % 8 === 7 && i !== 0
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleBitClick(i)}
                  className={`relative flex aspect-square min-w-[18px] items-center justify-center rounded font-mono text-xs transition-colors ${
                    b
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-accent/40'
                  } ${isByteEdge ? 'ml-1.5' : ''} border border-border`}
                  title={`bit ${pos}`}
                >
                  {b}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>MSB · bit {width - 1}</span>
            <span>LSB · bit 0</span>
          </div>
        </div>
      </section>

      {/* Bitwise ops */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium">{t('pages.numberBase.bitwise')}</h2>
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/40 p-3">
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as 'AND' | 'OR' | 'XOR' | 'SHL' | 'SHR')}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="AND" className="bg-background">AND (&amp;)</option>
            <option value="OR" className="bg-background">OR (|)</option>
            <option value="XOR" className="bg-background">XOR (^)</option>
            <option value="SHL" className="bg-background">SHL (&lt;&lt;)</option>
            <option value="SHR" className="bg-background">SHR (&gt;&gt;)</option>
          </select>
          <Input
            value={operand}
            onChange={(e) => setOperand(e.target.value)}
            placeholder={t('pages.numberBase.operandPlaceholder')}
            className="w-40 font-mono text-sm"
          />
          <Button size="sm" onClick={applyOp}>
            {t('pages.numberBase.apply')}
          </Button>
          <Button size="sm" variant="secondary" onClick={applyNot}>
            NOT (~)
          </Button>
          <span className="ml-2 text-[11px] text-muted-foreground">
            {t('pages.numberBase.opsHint')}
          </span>
        </div>
      </section>
    </div>
  )
}
