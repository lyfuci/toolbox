import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

function genMany(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID())
}

export function UuidPage() {
  const { t } = useTranslation()
  const [count, setCount] = useState(5)
  // Bumping nonce reroles the values without writing into state from an effect.
  const [nonce, setNonce] = useState(0)
  const values = useMemo(() => {
    void nonce
    return genMany(count)
  }, [count, nonce])

  const regenerate = () => setNonce((n) => n + 1)

  const handleCopyOne = async (uuid: string) => {
    await navigator.clipboard.writeText(uuid)
    toast.success(t('common.copied'))
  }
  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(values.join('\n'))
    toast.success(t('pages.uuid.copiedMany', { count: values.length }))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.uuid.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.uuid.description')}</p>
      </header>

      <div className="mb-4 flex items-center gap-3">
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
          className="w-24 font-mono text-sm"
        />
        <Button size="sm" onClick={regenerate}>
          <RefreshCw className="h-4 w-4" />
          {t('common.regenerate')}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCopyAll}>
          <Copy className="h-4 w-4" />
          {t('common.copyAll')}
        </Button>
      </div>

      {values.length <= 10 ? (
        <div className="flex flex-col gap-2">
          {values.map((uuid) => (
            <div
              key={uuid}
              className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
            >
              <code className="flex-1 font-mono text-sm">{uuid}</code>
              <Button size="sm" variant="ghost" onClick={() => handleCopyOne(uuid)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Textarea
          value={values.join('\n')}
          readOnly
          spellCheck={false}
          className="min-h-[420px] font-mono text-sm leading-relaxed"
        />
      )}
    </div>
  )
}
