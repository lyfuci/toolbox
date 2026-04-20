import { useMemo, useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!@#$%^&*()-_=+[]{}<>?,.:;',
}
type Toggle = keyof typeof SETS

function generate(length: number, classes: Record<Toggle, boolean>): string {
  const enabled = (Object.keys(SETS) as Toggle[]).filter((k) => classes[k])
  if (enabled.length === 0) return ''
  const pool = enabled.map((k) => SETS[k]).join('')
  // Use rejection sampling to avoid modulo bias on a 256-byte alphabet boundary.
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

function entropyBits(length: number, classes: Record<Toggle, boolean>): number {
  const enabled = (Object.keys(SETS) as Toggle[]).filter((k) => classes[k])
  if (enabled.length === 0) return 0
  const poolSize = enabled.reduce((sum, k) => sum + SETS[k].length, 0)
  return length * Math.log2(poolSize)
}

export function PasswordPage() {
  const [length, setLength] = useState(20)
  const [classes, setClasses] = useState<Record<Toggle, boolean>>({
    lower: true,
    upper: true,
    digit: true,
    symbol: true,
  })
  // Bumping nonce reroles the password without writing into state from an effect.
  const [nonce, setNonce] = useState(0)
  const value = useMemo(() => {
    void nonce
    return generate(length, classes)
  }, [length, classes, nonce])

  const bits = useMemo(() => entropyBits(length, classes), [length, classes])
  const strength = bits >= 80 ? '极强' : bits >= 60 ? '强' : bits >= 40 ? '中等' : bits > 0 ? '弱' : '空'

  const handleCopy = async () => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success('已复制')
  }
  const regenerate = () => setNonce((n) => n + 1)

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          基于 <code className="font-mono">crypto.getRandomValues</code> 的密码生成器（CSPRNG，无模偏置）。
        </p>
      </header>

      <div className="mb-3 flex items-center gap-3">
        <Input
          value={value}
          readOnly
          spellCheck={false}
          className="flex-1 font-mono text-sm"
        />
        <Button size="sm" onClick={regenerate}>
          <RefreshCw className="h-4 w-4" />
          重新生成
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!value}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-4 text-xs text-muted-foreground">
        熵 ≈ <code className="font-mono">{bits.toFixed(1)} bits</code> · 强度: {strength}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Label htmlFor="length" className="w-12 shrink-0 text-xs text-muted-foreground">
          长度
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

      <div className="flex flex-wrap gap-4">
        {(Object.keys(SETS) as Toggle[]).map((k) => (
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
            <code className="text-xs text-muted-foreground">({SETS[k].slice(0, 6)}…)</code>
          </label>
        ))}
      </div>
    </div>
  )
}
