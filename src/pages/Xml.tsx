import { useMemo, useState } from 'react'
import { Copy, Minimize2, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { formatXml, minifyXml } from '@/lib/xml'

const SAMPLE = `<?xml version="1.0"?><root><item id="1">first</item><item id="2"><nested>value</nested></item></root>`

export function XmlPage() {
  const [input, setInput] = useState(SAMPLE)
  const [indent, setIndent] = useState<2 | 4>(2)

  const formatted = useMemo(() => {
    if (!input.trim()) return { ok: true as const, value: '' }
    try {
      return { ok: true as const, value: formatXml(input, indent) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input, indent])

  const handleFormat = () => {
    if (!formatted.ok) return toast.error(`解析失败：${formatted.error}`)
    setInput(formatted.value)
  }
  const handleMinify = () => {
    try {
      setInput(minifyXml(input))
    } catch (err) {
      toast.error(`解析失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const handleCopy = async () => {
    if (!input) return
    await navigator.clipboard.writeText(input)
    toast.success('已复制')
  }
  const handleClear = () => setInput('')

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">XML</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          XML 格式化、压缩、校验。基于浏览器原生 DOMParser（无第三方依赖）。
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleFormat}>
          <Sparkles className="h-4 w-4" />
          格式化
        </Button>
        <Button size="sm" variant="secondary" onClick={handleMinify}>
          <Minimize2 className="h-4 w-4" />
          压缩
        </Button>
        <Button size="sm" variant="secondary" onClick={handleCopy}>
          <Copy className="h-4 w-4" />
          复制
        </Button>
        <Button size="sm" variant="ghost" onClick={handleClear}>
          <Trash2 className="h-4 w-4" />
          清空
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="indent" className="text-xs text-muted-foreground">
            缩进
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

      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        className="min-h-[420px] font-mono text-sm leading-relaxed"
        placeholder="在此粘贴 XML…"
      />

      <div className="mt-3 text-xs">
        {formatted.ok ? (
          <span className="text-muted-foreground">
            {input.length.toLocaleString()} chars
          </span>
        ) : (
          <span className="text-destructive">⚠ {formatted.error}</span>
        )}
      </div>
    </div>
  )
}
