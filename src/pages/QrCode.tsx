import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode, { type QRCodeErrorCorrectionLevel } from 'qrcode'
import { Copy, Download, ExternalLink, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { FileDrop } from '@/components/FileDrop'
import { decodeQrFromBlob } from '@/lib/qr-decode'

const ERROR_LEVELS = ['L', 'M', 'Q', 'H'] as const satisfies readonly QRCodeErrorCorrectionLevel[]
type ShortLevel = (typeof ERROR_LEVELS)[number]
const ERROR_LABELS: Record<ShortLevel, string> = {
  L: 'L (~7%)',
  M: 'M (~15%)',
  Q: 'Q (~25%)',
  H: 'H (~30%)',
}

type Mode = 'text' | 'wifi' | 'vcard' | 'email' | 'sms' | 'geo'

function escapeWifi(s: string): string {
  return s.replace(/([\\;,":])/g, '\\$1')
}

function buildWifi(ssid: string, password: string, auth: string, hidden: boolean): string {
  const e = (s: string) => escapeWifi(s)
  const t = auth === 'nopass' ? 'nopass' : auth
  let s = `WIFI:T:${t};S:${e(ssid)};`
  if (auth !== 'nopass') s += `P:${e(password)};`
  if (hidden) s += `H:true;`
  s += ';'
  return s
}

// vCard 3.0 escapes (RFC 2426 §4): backslash, comma, semicolon and CRLF.
function escapeVCard(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r?\n/g, '\\n')
}

function buildVCard(
  name: string,
  org: string,
  title: string,
  phone: string,
  email: string,
  url: string,
): string {
  const e = escapeVCard
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    name && `FN:${e(name)}`,
    org && `ORG:${e(org)}`,
    title && `TITLE:${e(title)}`,
    phone && `TEL;TYPE=CELL:${e(phone)}`,
    email && `EMAIL:${e(email)}`,
    url && `URL:${e(url)}`,
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildEmail(to: string, subject: string, body: string): string {
  const params: string[] = []
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`)
  if (body) params.push(`body=${encodeURIComponent(body)}`)
  return `mailto:${to}${params.length ? '?' + params.join('&') : ''}`
}

function buildSms(to: string, body: string): string {
  return `sms:${to}${body ? `?body=${encodeURIComponent(body)}` : ''}`
}

function buildGeo(lat: string, lng: string): string {
  return `geo:${lat},${lng}`
}

type View = 'generate' | 'decode'

type DecodeState =
  | { kind: 'idle' }
  | { kind: 'decoding' }
  | { kind: 'done'; text: string }
  | { kind: 'empty' } // image decoded, but no QR found
  | { kind: 'error'; message: string }

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim())
}

export function QrCodePage() {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('generate')
  const [mode, setMode] = useState<Mode>('text')
  // Decode side — local file → canvas → jsQR; nothing leaves the browser.
  const [decoded, setDecoded] = useState<DecodeState>({ kind: 'idle' })

  // Text / URL
  const [text, setText] = useState('https://toolbox.seansun.net')
  // WiFi
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [wifiAuth, setWifiAuth] = useState('WPA')
  const [wifiHidden, setWifiHidden] = useState(false)
  // vCard
  const [vName, setVName] = useState('')
  const [vOrg, setVOrg] = useState('')
  const [vTitle, setVTitle] = useState('')
  const [vPhone, setVPhone] = useState('')
  const [vEmail, setVEmail] = useState('')
  const [vUrl, setVUrl] = useState('')
  // Email
  const [eTo, setETo] = useState('')
  const [eSubject, setESubject] = useState('')
  const [eBody, setEBody] = useState('')
  // SMS
  const [sTo, setSTo] = useState('')
  const [sBody, setSBody] = useState('')
  // Geo
  const [gLat, setGLat] = useState('')
  const [gLng, setGLng] = useState('')

  // Common
  const [size, setSize] = useState(320)
  const [level, setLevel] = useState<ShortLevel>('M')
  const [margin, setMargin] = useState(2)
  const [fg, setFg] = useState('#000000')
  const [bg, setBg] = useState('#ffffff')
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string>('')
  const linkRef = useRef<HTMLAnchorElement>(null)

  const payload = useMemo(() => {
    switch (mode) {
      case 'text':
        return text
      case 'wifi':
        return buildWifi(wifiSsid, wifiPassword, wifiAuth, wifiHidden)
      case 'vcard':
        return buildVCard(vName, vOrg, vTitle, vPhone, vEmail, vUrl)
      case 'email':
        return buildEmail(eTo, eSubject, eBody)
      case 'sms':
        return buildSms(sTo, sBody)
      case 'geo':
        return buildGeo(gLat || '0', gLng || '0')
    }
  }, [
    mode,
    text,
    wifiSsid,
    wifiPassword,
    wifiAuth,
    wifiHidden,
    vName,
    vOrg,
    vTitle,
    vPhone,
    vEmail,
    vUrl,
    eTo,
    eSubject,
    eBody,
    sTo,
    sBody,
    gLat,
    gLng,
  ])

  useEffect(() => {
    if (!payload) return
    let cancelled = false
    QRCode.toString(payload, {
      type: 'svg',
      errorCorrectionLevel: level,
      width: size,
      margin,
      color: { dark: fg, light: bg },
    })
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
  }, [payload, size, level, margin, fg, bg])

  // When the payload clears, the rendered preview should drop too. We track
  // this as derived state so the effect above stays free of synchronous
  // setState calls.
  const displaySvg = payload ? svg : ''
  const displayError = payload ? error : null

  const handleDownloadSvg = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = linkRef.current!
    a.href = url
    a.download = 'qrcode.svg'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(t('pages.qr.downloaded', { format: 'SVG' }))
  }
  const handleDownloadPng = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: level,
        width: size,
        margin,
        color: { dark: fg, light: bg },
      })
      const a = linkRef.current!
      a.href = dataUrl
      a.download = 'qrcode.png'
      a.click()
      toast.success(t('pages.qr.downloaded', { format: 'PNG' }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDecodeFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setDecoded({ kind: 'error', message: t('pages.qr.decode.notImage') })
      return
    }
    setDecoded({ kind: 'decoding' })
    try {
      const result = await decodeQrFromBlob(file)
      setDecoded(result ? { kind: 'done', text: result.text } : { kind: 'empty' })
    } catch (err) {
      setDecoded({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleCopyDecoded = async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success(t('pages.qr.decode.copied'))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.qr-code.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.qr.description')}</p>
      </header>

      <div className="mb-4 flex rounded-md border border-input bg-transparent text-sm w-fit">
        {(['generate', 'decode'] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-3 py-1.5 transition-colors ${
              view === v
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {v === 'generate' ? t('pages.qr.viewGenerate') : t('pages.qr.viewDecode')}
          </button>
        ))}
      </div>

      {view === 'decode' ? (
        <div className="space-y-4">
          <FileDrop
            onFile={handleDecodeFile}
            accept="image/*"
            label={t('pages.qr.decode.drop')}
            hint={t('pages.qr.decode.hint')}
          />
          {decoded.kind === 'decoding' ? (
            <p className="text-sm text-muted-foreground">{t('pages.qr.decode.decoding')}</p>
          ) : null}
          {decoded.kind === 'empty' ? (
            <p className="text-sm text-destructive">⚠ {t('pages.qr.decode.notFound')}</p>
          ) : null}
          {decoded.kind === 'error' ? (
            <p className="text-sm text-destructive">⚠ {decoded.message}</p>
          ) : null}
          {decoded.kind === 'done' ? (
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ScanLine className="h-4 w-4 text-muted-foreground" />
                  {t('pages.qr.decode.result')}
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleCopyDecoded(decoded.text)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <pre className="whitespace-pre-wrap break-all font-mono text-sm">{decoded.text}</pre>
              {looksLikeUrl(decoded.text) ? (
                <a
                  href={decoded.text}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {t('pages.qr.decode.open')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
      <>
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList>
          <TabsTrigger value="text">{t('pages.qr.tabText')}</TabsTrigger>
          <TabsTrigger value="wifi">{t('pages.qr.tabWifi')}</TabsTrigger>
          <TabsTrigger value="vcard">{t('pages.qr.tabVcard')}</TabsTrigger>
          <TabsTrigger value="email">{t('pages.qr.tabEmail')}</TabsTrigger>
          <TabsTrigger value="sms">{t('pages.qr.tabSms')}</TabsTrigger>
          <TabsTrigger value="geo">{t('pages.qr.tabGeo')}</TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-4">
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('pages.qr.content')}
          </Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="min-h-[120px] font-mono text-sm"
            placeholder={t('pages.qr.contentPlaceholder')}
          />
        </TabsContent>

        <TabsContent value="wifi" className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={t('pages.qr.wifiSsid')}>
            <Input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} />
          </Field>
          <Field label={t('pages.qr.wifiPassword')}>
            <Input value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} />
          </Field>
          <Field label={t('pages.qr.wifiAuth')}>
            <select
              value={wifiAuth}
              onChange={(e) => setWifiAuth(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="WPA" className="bg-background">WPA / WPA2</option>
              <option value="WEP" className="bg-background">WEP</option>
              <option value="nopass" className="bg-background">{t('pages.qr.wifiNone')}</option>
            </select>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={wifiHidden}
              onChange={(e) => setWifiHidden(e.target.checked)}
              className="accent-primary"
            />
            <span>{t('pages.qr.wifiHidden')}</span>
          </label>
        </TabsContent>

        <TabsContent value="vcard" className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={t('pages.qr.vcardName')}>
            <Input value={vName} onChange={(e) => setVName(e.target.value)} />
          </Field>
          <Field label={t('pages.qr.vcardOrg')}>
            <Input value={vOrg} onChange={(e) => setVOrg(e.target.value)} />
          </Field>
          <Field label={t('pages.qr.vcardTitle')}>
            <Input value={vTitle} onChange={(e) => setVTitle(e.target.value)} />
          </Field>
          <Field label={t('pages.qr.vcardPhone')}>
            <Input value={vPhone} onChange={(e) => setVPhone(e.target.value)} />
          </Field>
          <Field label={t('pages.qr.vcardEmail')}>
            <Input value={vEmail} onChange={(e) => setVEmail(e.target.value)} />
          </Field>
          <Field label={t('pages.qr.vcardUrl')}>
            <Input value={vUrl} onChange={(e) => setVUrl(e.target.value)} />
          </Field>
        </TabsContent>

        <TabsContent value="email" className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={t('pages.qr.emailTo')}>
            <Input value={eTo} onChange={(e) => setETo(e.target.value)} />
          </Field>
          <Field label={t('pages.qr.emailSubject')}>
            <Input value={eSubject} onChange={(e) => setESubject(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('pages.qr.emailBody')}>
              <Textarea
                value={eBody}
                onChange={(e) => setEBody(e.target.value)}
                className="min-h-[80px] text-sm"
              />
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="sms" className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={t('pages.qr.smsTo')}>
            <Input value={sTo} onChange={(e) => setSTo(e.target.value)} />
          </Field>
          <Field label={t('pages.qr.smsBody')}>
            <Input value={sBody} onChange={(e) => setSBody(e.target.value)} />
          </Field>
        </TabsContent>

        <TabsContent value="geo" className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={t('pages.qr.geoLat')}>
            <Input
              value={gLat}
              onChange={(e) => setGLat(e.target.value)}
              placeholder="37.7749"
              className="font-mono"
            />
          </Field>
          <Field label={t('pages.qr.geoLng')}>
            <Input
              value={gLng}
              onChange={(e) => setGLng(e.target.value)}
              placeholder="-122.4194"
              className="font-mono"
            />
          </Field>
        </TabsContent>
      </Tabs>

      <div className="my-4 flex flex-wrap items-center gap-3">
        <Label className="text-xs text-muted-foreground">{t('pages.qr.size')}</Label>
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
        <Label className="text-xs text-muted-foreground">{t('pages.qr.level')}</Label>
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
        <Label className="text-xs text-muted-foreground">{t('pages.qr.margin')}</Label>
        <input
          type="range"
          min={0}
          max={10}
          value={margin}
          onChange={(e) => setMargin(Number(e.target.value))}
          className="w-32 accent-primary"
        />
        <span className="w-6 text-right font-mono text-xs">{margin}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleDownloadSvg} disabled={!displaySvg}>
            <Download className="h-4 w-4" />
            SVG
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDownloadPng} disabled={!displaySvg}>
            <Download className="h-4 w-4" />
            PNG
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Label className="text-xs text-muted-foreground">{t('pages.qr.fgColor')}</Label>
        <input
          type="color"
          value={fg}
          onChange={(e) => setFg(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
        />
        <Input value={fg} onChange={(e) => setFg(e.target.value)} className="w-28 font-mono text-xs" />
        <Label className="text-xs text-muted-foreground">{t('pages.qr.bgColor')}</Label>
        <input
          type="color"
          value={bg}
          onChange={(e) => setBg(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
        />
        <Input value={bg} onChange={(e) => setBg(e.target.value)} className="w-28 font-mono text-xs" />
      </div>

      <div className="flex justify-center rounded-lg border border-border bg-card/40 p-6">
        {!payload ? (
          <div className="text-sm text-muted-foreground">{t('pages.qr.placeholder')}</div>
        ) : displayError ? (
          <div className="text-sm text-destructive">⚠ {displayError}</div>
        ) : displaySvg ? (
          <div
            className="overflow-hidden"
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: displaySvg }}
          />
        ) : (
          <div className="text-sm text-muted-foreground">{t('pages.qr.generating')}</div>
        )}
      </div>

      <a ref={linkRef} className="hidden" />
      </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
