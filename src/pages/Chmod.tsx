import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  type PermSet,
  type Klass,
  type Perm,
  CLASSES,
  fromOctal,
  toOctal,
  toSymbolic,
  describe,
  emptyPerms,
} from '@/lib/chmod'

const PERMS: Perm[] = ['r', 'w', 'x']

export function ChmodPage() {
  const { t } = useTranslation()
  const [perms, setPerms] = useState<PermSet>(() => fromOctal('755')!)
  const [octalInput, setOctalInput] = useState('755')
  const [octalError, setOctalError] = useState(false)

  const octal = useMemo(() => toOctal(perms), [perms])
  const symbolic = useMemo(() => toSymbolic(perms), [perms])
  const description = useMemo(() => describe(perms), [perms])

  const setFromOctal = (raw: string) => {
    setOctalInput(raw)
    const p = fromOctal(raw)
    if (p) {
      setPerms(p)
      setOctalError(false)
    } else {
      setOctalError(true)
    }
  }

  const togglePerm = (klass: Klass, perm: Perm) => {
    setPerms((p) => {
      const next = { ...p, [klass]: { ...p[klass], [perm]: !p[klass][perm] } }
      setOctalInput(toOctal(next))
      setOctalError(false)
      return next
    })
  }

  const toggleSpecial = (flag: 'setuid' | 'setgid' | 'sticky') => {
    setPerms((p) => {
      const next = { ...p, [flag]: !p[flag] }
      setOctalInput(toOctal(next))
      setOctalError(false)
      return next
    })
  }

  const reset = () => {
    setPerms(emptyPerms())
    setOctalInput('0000')
    setOctalError(false)
  }

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value)
    toast.success(t('common.copiedLabel', { label }))
  }

  const SPECIAL: { flag: 'setuid' | 'setgid' | 'sticky'; label: string }[] = [
    { flag: 'setuid', label: t('pages.chmod.setuid') },
    { flag: 'setgid', label: t('pages.chmod.setgid') },
    { flag: 'sticky', label: t('pages.chmod.sticky') },
  ]

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.chmod.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.chmod.description')}</p>
      </header>

      {/* Matrix */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/60 text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">{t('pages.chmod.class')}</th>
              {PERMS.map((p) => (
                <th key={p} className="px-4 py-2 text-center font-medium">
                  {t(`pages.chmod.perm.${p}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((klass) => (
              <tr key={klass} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{t(`pages.chmod.${klass}`)}</td>
                {PERMS.map((p) => (
                  <td key={p} className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={perms[klass][p]}
                      onChange={() => togglePerm(klass, p)}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Special bits */}
      <div className="mt-4 flex flex-wrap gap-4">
        {SPECIAL.map(({ flag, label }) => (
          <label key={flag} className="flex cursor-pointer items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={perms[flag]}
              onChange={() => toggleSpecial(flag)}
              className="h-4 w-4 accent-primary"
            />
            {label}
          </label>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={reset}>
          {t('pages.chmod.reset')}
        </Button>
      </div>

      {/* Outputs */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-3">
          <Label className="w-28 shrink-0 text-xs text-muted-foreground">{t('pages.chmod.octal')}</Label>
          <Input
            value={octalInput}
            onChange={(e) => setFromOctal(e.target.value)}
            spellCheck={false}
            className={`w-32 font-mono text-base ${octalError ? 'border-destructive' : ''}`}
          />
          <code className="text-xs text-muted-foreground">{octalError ? t('pages.chmod.invalid') : `= ${octal}`}</code>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => copy(octal, t('pages.chmod.octal'))}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Label className="w-28 shrink-0 text-xs text-muted-foreground">{t('pages.chmod.symbolic')}</Label>
          <code className="flex-1 font-mono text-base">{symbolic}</code>
          <Button size="sm" variant="ghost" onClick={() => copy(symbolic, t('pages.chmod.symbolic'))}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Label className="w-28 shrink-0 text-xs text-muted-foreground">{t('pages.chmod.commandLabel')}</Label>
          <code className="flex-1 font-mono text-sm text-muted-foreground">chmod {octal} file</code>
          <Button size="sm" variant="ghost" onClick={() => copy(`chmod ${octal} file`, 'chmod')}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <p className="mt-5 rounded-md border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
