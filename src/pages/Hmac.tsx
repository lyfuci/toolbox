import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { HMAC_ALGOS, type HmacAlgo, bytesToBase64, bytesToHex, hmacText } from '@/lib/hash'

type Encoding = 'hex' | 'base64'

export function HmacPage() {
  const [input, setInput] = useState('hello world')
  const [key, setKey] = useState('your-256-bit-secret')
  const [algo, setAlgo] = useState<HmacAlgo>('SHA-256')
  const [encoding, setEncoding] = useState<Encoding>('hex')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    hmacText(algo, key, input)
      .then((bytes) => {
        if (cancelled) return
        setOutput(encoding === 'hex' ? bytesToHex(bytes) : bytesToBase64(bytes))
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setOutput('')
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [input, key, algo, encoding])

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    toast.success('已复制')
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">HMAC</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          基于 Web Crypto 的 HMAC（SHA-1 / 256 / 384 / 512）。本地计算，密钥不出浏览器。
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {HMAC_ALGOS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAlgo(a)}
              className={`px-3 py-1.5 transition-colors ${
                algo === a
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {a.replace('SHA-', 'HS')}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">输出</Label>
          <div className="flex rounded-md border border-input bg-transparent text-xs">
            {(['hex', 'base64'] as Encoding[]).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEncoding(e)}
                className={`px-2.5 py-1 transition-colors ${
                  encoding === e
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <Label className="mb-1.5 block text-xs text-muted-foreground">密钥</Label>
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          spellCheck={false}
          className="font-mono text-sm"
          placeholder="HMAC secret…"
        />
      </div>

      <div className="mb-4">
        <Label className="mb-1.5 block text-xs text-muted-foreground">数据</Label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          className="min-h-[180px] font-mono text-sm leading-relaxed"
          placeholder="要签名的内容…"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">签名</Label>
          <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!output}>
            <Copy className="h-3.5 w-3.5" />
            复制
          </Button>
        </div>
        <Textarea
          value={output}
          readOnly
          spellCheck={false}
          className="min-h-[100px] font-mono text-xs leading-relaxed"
        />
      </div>

      {error ? <div className="mt-3 text-xs text-destructive">⚠ {error}</div> : null}
    </div>
  )
}
