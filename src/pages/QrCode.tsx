import { useEffect, useRef, useState } from 'react'
import QRCode, { type QRCodeErrorCorrectionLevel } from 'qrcode'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

const SAMPLE = 'https://toolbox.seansun.xyz'

const ERROR_LEVELS = ['L', 'M', 'Q', 'H'] as const satisfies readonly QRCodeErrorCorrectionLevel[]
type ShortLevel = (typeof ERROR_LEVELS)[number]
const ERROR_LABELS: Record<ShortLevel, string> = {
  L: 'L (~7%)',
  M: 'M (~15%)',
  Q: 'Q (~25%)',
  H: 'H (~30%)',
}

export function QrCodePage() {
  const [text, setText] = useState(SAMPLE)
  const [size, setSize] = useState(320)
  const [level, setLevel] = useState<ShortLevel>('M')
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string>('')
  const linkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (!text) return
    let cancelled = false
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: level, width: size, margin: 2 })
      .then((s) => {
        if (cancelled) return
        setSvg(s)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setSvg('')
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [text, size, level])

  const handleDownloadSvg = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = linkRef.current!
    a.href = url
    a.download = 'qrcode.svg'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success('已下载 SVG')
  }
  const handleDownloadPng = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        errorCorrectionLevel: level,
        width: size,
        margin: 2,
      })
      const a = linkRef.current!
      a.href = dataUrl
      a.download = 'qrcode.png'
      a.click()
      toast.success('已下载 PNG')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">QR Code</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          生成二维码（SVG / PNG）。本地渲染，输入内容不出浏览器。
        </p>
      </header>

      <div className="mb-4">
        <Label className="mb-1.5 block text-xs text-muted-foreground">内容</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="min-h-[120px] font-mono text-sm"
          placeholder="URL / 文本 / vCard…"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Label className="text-xs text-muted-foreground">尺寸 (px)</Label>
        <Input
          type="number"
          min={64}
          max={1024}
          step={32}
          value={size}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (n >= 64 && n <= 1024) setSize(n)
          }}
          className="w-24 font-mono text-sm"
        />
        <Label className="text-xs text-muted-foreground">纠错等级</Label>
        <div className="flex rounded-md border border-input bg-transparent text-xs">
          {ERROR_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={`px-2.5 py-1 transition-colors ${
                level === l
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {ERROR_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleDownloadSvg} disabled={!svg}>
            <Download className="h-4 w-4" />
            SVG
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDownloadPng} disabled={!svg}>
            <Download className="h-4 w-4" />
            PNG
          </Button>
        </div>
      </div>

      <div className="flex justify-center rounded-lg border border-border bg-card/40 p-6">
        {!text ? (
          <div className="text-sm text-muted-foreground">输入内容生成二维码…</div>
        ) : error ? (
          <div className="text-sm text-destructive">⚠ {error}</div>
        ) : svg ? (
          <div
            className="overflow-hidden"
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="text-sm text-muted-foreground">生成中…</div>
        )}
      </div>

      <a ref={linkRef} className="hidden" />
    </div>
  )
}
