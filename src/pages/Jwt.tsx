import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  importSPKI,
  errors,
} from 'jose'
import { CheckCircle2, ShieldQuestion, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FieldTooltip } from '@/components/FieldTooltip'
import { formatTimestampBreakdown } from '@/lib/time'

const SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const SAMPLE_SECRET = 'your-256-bit-secret'

const HMAC_ALGS = new Set(['HS256', 'HS384', 'HS512'])
const ASYMMETRIC_ALGS = new Set([
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES256K', 'ES384', 'ES512',
  'EdDSA',
])

// Payload claims that are Unix-second timestamps (RFC 7519 + OIDC).
const TIMESTAMP_CLAIMS = new Set(['iat', 'exp', 'nbf', 'auth_time', 'updated_at'])

type DecodeOk = {
  ok: true
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signaturePart: string
}
type DecodeState = DecodeOk | { ok: false; error: string }

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'verifying' }
  | { kind: 'verified' }
  | { kind: 'invalid'; reason: string }

type Translator = (key: string, opts?: Record<string, unknown>) => string

function decode(token: string, t: Translator): DecodeState {
  if (!token.trim()) return { ok: false, error: '' }
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    return { ok: false, error: t('pages.jwt.structureError') }
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

async function runVerify(
  token: string,
  secret: string,
  alg: string,
  t: Translator,
): Promise<VerifyState> {
  if (!secret.trim()) {
    return { kind: 'invalid', reason: t('pages.jwt.needSecret') }
  }
  try {
    let key: Uint8Array | CryptoKey
    if (HMAC_ALGS.has(alg)) {
      key = new TextEncoder().encode(secret)
    } else if (ASYMMETRIC_ALGS.has(alg)) {
      key = await importSPKI(secret.trim(), alg)
    } else {
      return {
        kind: 'invalid',
        reason: t('pages.jwt.unsupportedAlg', { alg: alg || '(empty)' }),
      }
    }
    await jwtVerify(token, key)
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

export function JwtPage() {
  const { t } = useTranslation()
  const [token, setToken] = useState(SAMPLE_TOKEN)
  const [secret, setSecret] = useState(SAMPLE_SECRET)
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' })

  const decoded = useMemo(() => decode(token, t), [token, t])
  const alg = decoded.ok ? String(decoded.header.alg ?? '') : ''
  const isHmac = HMAC_ALGS.has(alg)
  const isAsym = ASYMMETRIC_ALGS.has(alg)

  const onTokenChange = (next: string) => {
    setToken(next)
    setVerify({ kind: 'idle' })
  }
  const onSecretChange = (next: string) => {
    setSecret(next)
    setVerify({ kind: 'idle' })
  }
  const handleVerify = async () => {
    if (!decoded.ok) return
    setVerify({ kind: 'verifying' })
    setVerify(await runVerify(token, secret, alg, t))
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.jwt.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.jwt.description')}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT: encoded token input */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="token" className="text-sm font-medium">
              {t('pages.jwt.encoded')}
            </Label>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onTokenChange(SAMPLE_TOKEN)}
              >
                {t('common.sample')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onTokenChange('')}
              >
                {t('common.clear')}
              </Button>
            </div>
          </div>
          <Textarea
            id="token"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            spellCheck={false}
            className="min-h-[400px] resize-y break-all font-mono text-sm leading-relaxed"
            placeholder={t('pages.jwt.tokenPlaceholder')}
          />
          {!decoded.ok && decoded.error && (
            <p className="text-xs text-destructive">⚠ {decoded.error}</p>
          )}
        </section>

        {/* RIGHT: decoded panels */}
        <section className="flex flex-col gap-5">
          <Panel
            title={t('pages.jwt.header')}
            subtitle={alg ? t('pages.jwt.algorithm', { alg }) : undefined}
          >
            <ClaimsView
              panel="header"
              value={decoded.ok ? decoded.header : null}
              maxHeight="9rem"
            />
          </Panel>

          <Panel title={t('pages.jwt.payload')}>
            <ClaimsView
              panel="payload"
              value={decoded.ok ? decoded.payload : null}
              maxHeight="14rem"
            />
          </Panel>

          <Panel title={t('pages.jwt.signature')}>
            <div className="flex flex-col gap-3">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">
                  {isHmac
                    ? t('pages.jwt.secretHmac')
                    : isAsym
                      ? t('pages.jwt.secretAsymmetric')
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
                      ? t('pages.jwt.secretPlaceholderAsymmetric')
                      : t('pages.jwt.secretPlaceholderHmac')
                  }
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleVerify}
                  disabled={!decoded.ok || verify.kind === 'verifying'}
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

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * Pretty-print a JWT header or payload object with hover tooltips on:
 * - top-level claim keys (RFC 7515/7519/OIDC explanations)
 * - timestamp values like iat/exp/nbf (formatted date breakdown)
 *
 * Nested objects/arrays are inlined as JSON.stringify for now — could expand
 * later if we have nested claims worth annotating.
 */
function ClaimsView({
  panel,
  value,
  maxHeight,
}: {
  panel: 'header' | 'payload'
  value: Record<string, unknown> | null
  maxHeight: string
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language

  if (!value) {
    return (
      <pre
        className="overflow-auto rounded-md border border-border bg-card/50 p-3 font-mono text-sm text-foreground/90"
        style={{ maxHeight }}
      >
        —
      </pre>
    )
  }

  const entries = Object.entries(value)
  const keyMetaPrefix = panel === 'header' ? 'pages.jwt.headerField' : 'pages.jwt.claim'

  return (
    <div
      className="overflow-auto rounded-md border border-border bg-card/50 p-3 font-mono text-sm leading-relaxed text-foreground/90"
      style={{ maxHeight }}
    >
      <span className="text-muted-foreground">{'{'}</span>
      {entries.map(([key, val], idx) => {
        const isLast = idx === entries.length - 1
        const isTimestamp =
          panel === 'payload' &&
          TIMESTAMP_CLAIMS.has(key) &&
          typeof val === 'number' &&
          isFinite(val)
        return (
          <div key={key} className="pl-4">
            <span className="text-muted-foreground">{'"'}</span>
            <FieldTooltip body={`${keyMetaPrefix}.${key}`} bodyIsKey>
              <span className="text-sky-600 dark:text-sky-300">{key}</span>
            </FieldTooltip>
            <span className="text-muted-foreground">{'": '}</span>
            {isTimestamp ? (
              <TimestampValue unixSeconds={val as number} locale={locale} t={t} />
            ) : (
              <span className="text-foreground/90">{stringifyValue(val)}</span>
            )}
            {!isLast && <span className="text-muted-foreground">,</span>}
          </div>
        )
      })}
      <span className="text-muted-foreground">{'}'}</span>
    </div>
  )
}

function stringifyValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
    return JSON.stringify(v)
  }
  // arrays / objects: compact one-line
  return JSON.stringify(v)
}

function TimestampValue({
  unixSeconds,
  locale,
  t,
}: {
  unixSeconds: number
  locale: string
  t: Translator
}) {
  const { utc, local, relative } = formatTimestampBreakdown(unixSeconds, locale)
  const body = t('tooltip.tsBreakdown', { utc, local, relative })
  return (
    <FieldTooltip body={body}>
      <span className="text-amber-600 dark:text-amber-300">{unixSeconds}</span>
    </FieldTooltip>
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
