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

export function NumberBasePage() {
  const { t } = useTranslation()
  // Source-of-truth value, big enough to handle 64-bit and beyond.
  const [value, setValue] = useState<bigint>(255n)
  const [customBase, setCustomBase] = useState(36)
  const [errors, setErrors] = useState<Record<number, boolean>>({})

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

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.number-base.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.numberBase.description')}</p>
      </header>

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
    </div>
  )
}
