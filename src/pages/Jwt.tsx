import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  SignJWT,
  importSPKI,
  importPKCS8,
  importJWK,
  base64url,
  errors,
} from 'jose'
import {
  CheckCircle2,
  ShieldQuestion,
  XCircle,
  Loader2,
  Clock,
  CircleAlert,
  CircleDot,
} from 'lucide-react'
import { hoverTooltip, EditorView } from '@codemirror/view'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CodeEditor } from '@/components/CodeEditor'
import { formatRelative, formatTimestampBreakdown } from '@/lib/time'
import { stripBearerPrefix } from '@/lib/jwt'

const SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const SAMPLE_SECRET = 'your-256-bit-secret'

const HMAC_ALGS = ['HS256', 'HS384', 'HS512'] as const
const RSA_ALGS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512'] as const
const EC_ALGS = ['ES256', 'ES384'] as const
const ALL_ALGS = [...HMAC_ALGS, ...RSA_ALGS, ...EC_ALGS] as const
type Alg = (typeof ALL_ALGS)[number]

const HMAC_SET = new Set<string>(HMAC_ALGS)
const ASYMMETRIC_SET = new Set<string>([...RSA_ALGS, ...EC_ALGS])

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'verifying' }
  | { kind: 'verified' }
  | { kind: 'invalid'; reason: string }

type Translator = (key: string, opts?: Record<string, unknown>) => string

function pretty(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}

function tryParseJson(text: string):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string } {
  try {
    const value = JSON.parse(text)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'must be a JSON object' }
    }
    return { ok: true, value: value as Record<string, unknown> }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function decodeToken(token: string):
  | {
      ok: true
      header: Record<string, unknown>
      payload: Record<string, unknown>
      signaturePart: string
    }
  | { ok: false; error: string } {
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    return { ok: false, error: 'structure' }
  }
  try {
    return {
      ok: true,
      header: decodeProtectedHeader(token) as Record<string, unknown>,
      payload: decodeJwt(token) as Record<string, unknown>,
      signaturePart: parts[2],
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Tries hard to parse text as JWK; returns null if it doesn't look like a JWK. */
function tryParseJwk(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const obj = JSON.parse(trimmed)
    if (obj && typeof obj === 'object' && typeof obj.kty === 'string') {
      return obj as Record<string, unknown>
    }
  } catch {
    /* not JSON */
  }
  return null
}

/** Decode base64 (standard or url) into Uint8Array. Throws on failure. */
function decodeBase64Loose(input: string): Uint8Array {
  // jose's base64url.decode accepts URL-safe; convert standard b64 first
  const normalized = input.trim().replace(/\s+/g, '')
  // try base64url first
  try {
    return base64url.decode(normalized)
  } catch {
    /* fall through */
  }
  // standard base64: convert to url-safe, strip padding
  const urlSafe = normalized.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return base64url.decode(urlSafe)
}

type LoadKeyResult =
  | { ok: true; key: Uint8Array | CryptoKey }
  | { ok: false; reason: string }

async function loadKey(
  alg: string,
  secret: string,
  secretIsBase64: boolean,
  forSigning: boolean,
  t: Translator,
): Promise<LoadKeyResult> {
  if (!secret.trim()) {
    return {
      ok: false,
      reason: forSigning && ASYMMETRIC_SET.has(alg)
        ? t('pages.jwt.needPrivateKey')
        : t('pages.jwt.needSecret'),
    }
  }
  try {
    if (HMAC_SET.has(alg)) {
      let bytes: Uint8Array
      if (secretIsBase64) {
        try {
          bytes = decodeBase64Loose(secret)
        } catch {
          return { ok: false, reason: t('pages.jwt.base64DecodeError') }
        }
      } else {
        bytes = new TextEncoder().encode(secret)
      }
      return { ok: true, key: bytes }
    }
    if (ASYMMETRIC_SET.has(alg)) {
      const jwk = tryParseJwk(secret)
      if (jwk) {
        const key = await importJWK(jwk as never, alg)
        // importJWK can return Uint8Array (oct keys) — for asymmetric we need CryptoKey
        if (!(key instanceof Uint8Array)) {
          return { ok: true, key }
        }
        // Got a symmetric (oct) JWK for an asymmetric alg — not valid
        return { ok: false, reason: t('pages.jwt.unsupportedAlg', { alg }) }
      }
      const pem = secret.trim()
      if (forSigning) {
        const key = await importPKCS8(pem, alg)
        return { ok: true, key }
      }
      const key = await importSPKI(pem, alg)
      return { ok: true, key }
    }
    return { ok: false, reason: t('pages.jwt.unsupportedAlg', { alg }) }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

async function runVerify(
  token: string,
  secret: string,
  secretIsBase64: boolean,
  alg: string,
  t: Translator,
): Promise<VerifyState> {
  const loaded = await loadKey(alg, secret, secretIsBase64, false, t)
  if (!loaded.ok) return { kind: 'invalid', reason: loaded.reason }
  try {
    await jwtVerify(token, loaded.key)
    return { kind: 'verified' }
  } catch (e) {
    if (e instanceof errors.JWSSignatureVerificationFailed) {
      return { kind: 'invalid', reason: t('pages.jwt.sigMismatch') }
    }
    if (e instanceof errors.JWTExpired) {
      return { kind: 'invalid', reason: t('pages.jwt.expired') }
    }
    if (e instanceof errors.JWTClaimValidationFailed) {
      return {
        kind: 'invalid',
        reason: t('pages.jwt.claimFailed', { message: e.message }),
      }
    }
    return { kind: 'invalid', reason: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Build a token from header + payload. If a key is loadable, we sign;
 * otherwise we produce header.payload.<placeholder> so the user still sees
 * how their edits affect the encoded form.
 */
async function reSign(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  alg: string,
  secret: string,
  secretIsBase64: boolean,
  placeholder: string,
  t: Translator,
): Promise<{ token: string; signed: boolean; error?: string }> {
  const headerWithAlg = { ...header, alg }
  // If no secret provided OR not a supported alg, emit placeholder.
  const trimmed = secret.trim()
  if (!trimmed || (!HMAC_SET.has(alg) && !ASYMMETRIC_SET.has(alg))) {
    const h = base64url.encode(new TextEncoder().encode(JSON.stringify(headerWithAlg)))
    const p = base64url.encode(new TextEncoder().encode(JSON.stringify(payload)))
    return { token: `${h}.${p}.${placeholder}`, signed: false }
  }
  const loaded = await loadKey(alg, secret, secretIsBase64, true, t)
  if (!loaded.ok) {
    const h = base64url.encode(new TextEncoder().encode(JSON.stringify(headerWithAlg)))
    const p = base64url.encode(new TextEncoder().encode(JSON.stringify(payload)))
    return { token: `${h}.${p}.${placeholder}`, signed: false, error: loaded.reason }
  }
  try {
    const jwt = await new SignJWT(payload)
      .setProtectedHeader(headerWithAlg as never)
      .sign(loaded.key as never)
    return { token: jwt, signed: true }
  } catch (e) {
    const h = base64url.encode(new TextEncoder().encode(JSON.stringify(headerWithAlg)))
    const p = base64url.encode(new TextEncoder().encode(JSON.stringify(payload)))
    return {
      token: `${h}.${p}.${placeholder}`,
      signed: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// -- Status badge ------------------------------------------------------------

type ExpStatus =
  | { kind: 'valid' }
  | { kind: 'expired'; date: Date }
  | { kind: 'not-yet'; date: Date }
  | { kind: 'none' }

function computeExpStatus(payload: Record<string, unknown> | null): ExpStatus {
  if (!payload) return { kind: 'none' }
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined
  const nbf = typeof payload.nbf === 'number' ? payload.nbf : undefined
  if (exp === undefined && nbf === undefined) return { kind: 'none' }
  const now = Date.now() / 1000
  if (exp !== undefined && exp < now) {
    return { kind: 'expired', date: new Date(exp * 1000) }
  }
  if (nbf !== undefined && nbf > now) {
    return { kind: 'not-yet', date: new Date(nbf * 1000) }
  }
  return { kind: 'valid' }
}

// Pre-compute decoded sample once at module load.
const INITIAL: { headerText: string; payloadText: string; alg: Alg } = (() => {
  const d = decodeToken(SAMPLE_TOKEN)
  if (!d.ok) {
    return {
      headerText: pretty({ alg: 'HS256', typ: 'JWT' }),
      payloadText: pretty({ sub: '1234567890', name: 'John Doe', iat: 1516239022 }),
      alg: 'HS256',
    }
  }
  const headerAlg =
    typeof d.header.alg === 'string' ? (d.header.alg as string) : 'HS256'
  return {
    headerText: pretty(d.header),
    payloadText: pretty(d.payload),
    alg: ((ALL_ALGS as readonly string[]).includes(headerAlg)
      ? headerAlg
      : 'HS256') as Alg,
  }
})()

// -- Page --------------------------------------------------------------------

export function JwtPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language

  const [token, setToken] = useState(SAMPLE_TOKEN)
  const [headerText, setHeaderText] = useState(INITIAL.headerText)
  const [payloadText, setPayloadText] = useState(INITIAL.payloadText)
  const [secret, setSecret] = useState(SAMPLE_SECRET)
  const [secretB64, setSecretB64] = useState(false)
  const [algState, setAlgState] = useState<Alg>(INITIAL.alg)
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' })
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [tokenDecodeError, setTokenDecodeError] = useState<string | null>(null)
  const [unsigned, setUnsigned] = useState(false)

  // Bumped before every async re-sign; the .then() bails if a newer one started.
  const reSignVersionRef = useRef(0)

  // Parse header / payload texts.
  const headerParse = useMemo(() => tryParseJson(headerText), [headerText])
  const payloadParse = useMemo(() => tryParseJson(payloadText), [payloadText])

  // Hover annotations layered onto the JSON editors: field-name descriptions
  // and readable times on time-claim values (see makeJsonHover).
  const headerHover = useMemo(
    () =>
      makeJsonHover({
        keyPrefix: 'pages.jwt.headerField.',
        withTime: false,
        locale,
        t,
        hasKey: (k) => i18n.exists(k),
      }),
    [locale, t, i18n],
  )
  const payloadHover = useMemo(
    () =>
      makeJsonHover({
        keyPrefix: 'pages.jwt.claim.',
        withTime: true,
        locale,
        t,
        hasKey: (k) => i18n.exists(k),
      }),
    [locale, t, i18n],
  )

  const headerObj = headerParse.ok ? headerParse.value : null
  const payloadObj = payloadParse.ok ? payloadParse.value : null

  const alg: string = algState

  const isHmac = HMAC_SET.has(alg)
  const isAsym = ASYMMETRIC_SET.has(alg)

  /**
   * Kick off an async re-sign. Captures the latest inputs at call time; uses
   * a version counter to ignore the result of any prior in-flight sign. All
   * setState happens inside the async body — never in a render effect —
   * which keeps React 19's cascading-render lint happy.
   */
  const reSignNow = useCallback(
    async (
      h: Record<string, unknown>,
      p: Record<string, unknown>,
      a: string,
      sec: string,
      b64: boolean,
    ) => {
      const version = ++reSignVersionRef.current
      setSigning(true)
      setSignError(null)
      setVerify({ kind: 'idle' })
      const result = await reSign(
        h,
        p,
        a,
        sec,
        b64,
        t('pages.jwt.placeholderSignature'),
        t,
      )
      if (reSignVersionRef.current !== version) return
      setToken(result.token)
      setUnsigned(!result.signed)
      setSignError(result.error ?? null)
      setSigning(false)
    },
    [t],
  )

  /** Try to re-sign with whatever the latest header/payload JSON parses to. */
  const reSignWith = useCallback(
    (nextHeaderText: string, nextPayloadText: string, a: string, sec: string, b64: boolean) => {
      const hp = tryParseJson(nextHeaderText)
      const pp = tryParseJson(nextPayloadText)
      if (!hp.ok || !pp.ok) {
        // JSON broken — leave the encoded token alone; the JSON error notice
        // is already shown next to the offending pane.
        return
      }
      void reSignNow(hp.value, pp.value, a, sec, b64)
    },
    [reSignNow],
  )

  // ---- Handlers ----
  const onTokenChange = (raw: string) => {
    // Auto-clean a copied Authorization header value ("Bearer eyJ…").
    const next = stripBearerPrefix(raw)
    setToken(next)
    setVerify({ kind: 'idle' })
    if (!next.trim()) {
      setTokenDecodeError(null)
      setHeaderText('')
      setPayloadText('')
      setUnsigned(false)
      setSignError(null)
      return
    }
    const decoded = decodeToken(next)
    if (!decoded.ok) {
      setTokenDecodeError(
        decoded.error === 'structure' ? t('pages.jwt.structureError') : decoded.error,
      )
      return
    }
    setTokenDecodeError(null)
    setHeaderText(pretty(decoded.header))
    setPayloadText(pretty(decoded.payload))
    const newAlg =
      typeof decoded.header.alg === 'string' ? (decoded.header.alg as string) : ''
    if (newAlg && (ALL_ALGS as readonly string[]).includes(newAlg)) {
      setAlgState(newAlg as Alg)
    }
    setUnsigned(false)
    setSignError(null)
    // Discard any in-flight sign for the previous decoded state.
    reSignVersionRef.current++
  }
  const onHeaderTextChange = (next: string) => {
    setHeaderText(next)
    // If the user edits `alg` inside the header JSON itself, mirror it back
    // into the picker so the UI stays consistent.
    const parsed = tryParseJson(next)
    if (parsed.ok && typeof parsed.value.alg === 'string') {
      const v = parsed.value.alg as string
      if ((ALL_ALGS as readonly string[]).includes(v) && v !== algState) {
        setAlgState(v as Alg)
        reSignWith(next, payloadText, v, secret, secretB64)
        return
      }
    }
    reSignWith(next, payloadText, alg, secret, secretB64)
  }
  const onPayloadTextChange = (next: string) => {
    setPayloadText(next)
    reSignWith(headerText, next, alg, secret, secretB64)
  }
  const onSecretChange = (next: string) => {
    setSecret(next)
    reSignWith(headerText, payloadText, alg, next, secretB64)
  }
  const onSecretB64Change = (next: boolean) => {
    setSecretB64(next)
    reSignWith(headerText, payloadText, alg, secret, next)
  }
  const onAlgChange = (next: Alg) => {
    setAlgState(next)
    let nextHeaderText = headerText
    if (headerObj) {
      nextHeaderText = pretty({ ...headerObj, alg: next })
      setHeaderText(nextHeaderText)
    }
    reSignWith(nextHeaderText, payloadText, next, secret, secretB64)
  }
  const onSample = () => {
    onTokenChange(SAMPLE_TOKEN)
    setSecret(SAMPLE_SECRET)
    setSecretB64(false)
  }
  const onClear = () => {
    setToken('')
    setHeaderText('')
    setPayloadText('')
    setSignError(null)
    setUnsigned(false)
    setTokenDecodeError(null)
    setVerify({ kind: 'idle' })
    reSignVersionRef.current++
  }

  const handleVerify = async () => {
    if (!token.trim() || tokenDecodeError) return
    setVerify({ kind: 'verifying' })
    setVerify(await runVerify(token, secret, secretB64, alg, t))
  }

  const expStatus = useMemo(() => computeExpStatus(payloadObj), [payloadObj])

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.jwt.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.jwt.description')}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT: encoded token */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="token" className="text-sm font-medium">
              {t('pages.jwt.encoded')}
            </Label>
            <div className="flex items-center gap-1">
              {signing && (
                <span className="flex items-center gap-1 pr-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('pages.jwt.signing')}
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={onSample}>
                {t('common.sample')}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClear}>
                {t('common.clear')}
              </Button>
            </div>
          </div>
          <Textarea
            id="token"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            spellCheck={false}
            className={`min-h-[400px] resize-y break-all font-mono text-sm leading-relaxed ${
              unsigned ? 'text-muted-foreground/70' : ''
            }`}
            placeholder={t('pages.jwt.tokenPlaceholder')}
          />
          {tokenDecodeError && (
            <p className="text-xs text-destructive">⚠ {tokenDecodeError}</p>
          )}
          {!tokenDecodeError && unsigned && token.trim() && (
            <p className="text-xs text-muted-foreground">
              {signError ?? t('pages.jwt.statusNoSig')}
            </p>
          )}
        </section>

        {/* RIGHT: decoded panels */}
        <section className="flex flex-col gap-5">
          {/* Header pane */}
          <Panel
            title={t('pages.jwt.header')}
            subtitle={t('pages.jwt.algorithm', { alg })}
          >
            <CodeEditor
              language="json"
              value={headerText}
              onChange={onHeaderTextChange}
              extraExtensions={headerHover}
              height="7rem"
              className="rounded-md border border-input text-sm"
            />
            {!headerParse.ok && headerText.trim() && (
              <p className="mt-1 text-xs text-destructive">
                ⚠ {t('pages.jwt.jsonError')}: {headerParse.error}
              </p>
            )}
          </Panel>

          {/* Payload pane */}
          <Panel
            title={t('pages.jwt.payload')}
            subtitle={
              <ExpStatusPill status={expStatus} locale={locale} t={t} />
            }
          >
            <CodeEditor
              language="json"
              value={payloadText}
              onChange={onPayloadTextChange}
              extraExtensions={payloadHover}
              height="12rem"
              className="rounded-md border border-input text-sm"
            />
            {!payloadParse.ok && payloadText.trim() && (
              <p className="mt-1 text-xs text-destructive">
                ⚠ {t('pages.jwt.jsonError')}: {payloadParse.error}
              </p>
            )}
          </Panel>

          {/* Signature pane */}
          <Panel title={t('pages.jwt.signature')}>
            <div className="flex flex-col gap-3">
              {/* Algorithm picker */}
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground">
                  {t('pages.jwt.algLabel')}
                </Label>
                <select
                  value={alg}
                  onChange={(e) => onAlgChange(e.target.value as Alg)}
                  className="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground"
                >
                  {ALL_ALGS.map((a) => (
                    <option key={a} value={a} className="bg-background text-foreground">
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {/* Secret / key input */}
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">
                  {isHmac
                    ? t('pages.jwt.secretLabel')
                    : isAsym
                      ? t('pages.jwt.privateKeyLabel')
                      : t('pages.jwt.secretGeneric')}
                </Label>
                <Textarea
                  value={secret}
                  onChange={(e) => onSecretChange(e.target.value)}
                  spellCheck={false}
                  className={`resize-y font-mono text-xs ${
                    isAsym ? 'min-h-32' : 'min-h-12'
                  }`}
                  placeholder={
                    isAsym
                      ? t('pages.jwt.secretPlaceholderPrivate')
                      : t('pages.jwt.secretPlaceholderHmac')
                  }
                />
              </div>

              {/* base64 toggle — only meaningful for HMAC */}
              {isHmac && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={secretB64}
                    onChange={(e) => onSecretB64Change(e.target.checked)}
                    className="accent-primary"
                  />
                  {t('pages.jwt.base64Secret')}
                </label>
              )}

              {/* Verify row */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleVerify}
                  disabled={
                    !token.trim() || !!tokenDecodeError || verify.kind === 'verifying'
                  }
                  size="sm"
                >
                  {t('pages.jwt.verify')}
                </Button>
                <VerifyBadge state={verify} />
              </div>
            </div>
          </Panel>
        </section>
      </div>
    </div>
  )
}

// -- Sub-components ----------------------------------------------------------

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {typeof subtitle === 'string' ? (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        ) : (
          subtitle ?? null
        )}
      </div>
      {children}
    </div>
  )
}

// Time-bearing claims whose value gets a readable-time hover tooltip.
const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time'])

/** Small DOM node for a CodeMirror hover tooltip (pre-line keeps the breaks). */
function hoverDom(text: string): HTMLElement {
  const dom = document.createElement('div')
  dom.style.cssText =
    'padding:6px 8px;font-size:12px;line-height:1.5;max-width:22rem;white-space:pre-line'
  dom.textContent = text
  return dom
}

// CodeMirror's default tooltip is a light card; restyle it with the app's
// popover tokens so it reads in dark mode.
const hoverTheme = EditorView.theme({
  '.cm-tooltip': {
    background: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
  },
})

/**
 * A CodeMirror hover extension that annotates the JSON IN PLACE — no separate
 * panel. Hovering a field NAME shows its RFC description (resolved from
 * `${keyPrefix}${name}`; skipped for unknown/custom keys), and — when
 * `withTime` — hovering a numeric time claim's VALUE shows its local / UTC /
 * relative time. Pretty-printed JSON keeps one key per line, so a per-line
 * parse pinpoints the key and value spans without a full JSON syntax tree.
 */
function makeJsonHover(args: {
  keyPrefix: string
  withTime: boolean
  locale: string
  t: Translator
  hasKey: (key: string) => boolean
}) {
  const { keyPrefix, withTime, locale, t, hasKey } = args
  const ext = hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos)
    const m = /^(\s*)"([^"]+)"(\s*:\s*)(.*?)(,?\s*)$/.exec(line.text)
    if (!m) return null
    const indent = m[1].length
    const key = m[2]
    const keyStart = indent // opening quote
    const keyEnd = indent + 1 + key.length + 1 // just past the closing quote
    const valueStart = keyEnd + m[3].length
    const valueEnd = valueStart + m[4].length
    const col = pos - line.from

    // Field name → description.
    if (col >= keyStart && col <= keyEnd) {
      const dk = keyPrefix + key
      if (!hasKey(dk)) return null
      return {
        pos: line.from + keyStart,
        end: line.from + keyEnd,
        above: true,
        create: () => ({ dom: hoverDom(t(dk)) }),
      }
    }
    // Numeric time value → readable time.
    if (
      withTime &&
      TIME_CLAIMS.has(key) &&
      col >= valueStart &&
      col <= valueEnd
    ) {
      const num = Number(m[4])
      if (Number.isFinite(num)) {
        const d = new Date(num * 1000)
        // Guard nonsensical timestamps — no "Invalid Date" tooltip.
        if (!Number.isNaN(d.getTime())) {
          const { utc, local, relative } = formatTimestampBreakdown(num, locale)
          const body =
            `${t('pages.jwt.timeLocal')}: ${local}\n` +
            `${t('pages.jwt.timeUtc')}: ${utc}\n` +
            `${t('pages.jwt.timeRelative')}: ${relative}`
          return {
            pos: line.from + valueStart,
            end: line.from + valueEnd,
            above: true,
            create: () => ({ dom: hoverDom(body) }),
          }
        }
      }
    }
    return null
  })
  return [ext, hoverTheme]
}

function ExpStatusPill({
  status,
  locale,
  t,
}: {
  status: ExpStatus
  locale: string
  t: Translator
}) {
  if (status.kind === 'none') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <CircleDot className="h-3 w-3" />
        {t('pages.jwt.statusNoClaims')}
      </span>
    )
  }
  if (status.kind === 'valid') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-500">
        <CheckCircle2 className="h-3 w-3" />
        {t('pages.jwt.statusValid')}
      </span>
    )
  }
  if (status.kind === 'expired') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
        <CircleAlert className="h-3 w-3" />
        {t('pages.jwt.statusExpired', { when: formatRelative(status.date, locale) })}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
      <Clock className="h-3 w-3" />
      {t('pages.jwt.statusNotYet', { when: formatRelative(status.date, locale) })}
    </span>
  )
}

function VerifyBadge({ state }: { state: VerifyState }) {
  const { t } = useTranslation()
  if (state.kind === 'idle') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldQuestion className="h-4 w-4" />
        {t('pages.jwt.badgeIdle')}
      </span>
    )
  }
  if (state.kind === 'verifying') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('pages.jwt.badgeVerifying')}
      </span>
    )
  }
  if (state.kind === 'verified') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-500">
        <CheckCircle2 className="h-4 w-4" />
        {t('pages.jwt.badgeValid')}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <XCircle className="h-4 w-4" />
      {state.reason}
    </span>
  )
}
