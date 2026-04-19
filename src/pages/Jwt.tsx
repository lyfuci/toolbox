import { useMemo, useState, type ReactNode } from 'react'
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

function decode(token: string): DecodeState {
  if (!token.trim()) return { ok: false, error: '' }
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    return { ok: false, error: 'Token 必须是 3 段：header.payload.signature' }
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
): Promise<VerifyState> {
  if (!secret.trim()) {
    return { kind: 'invalid', reason: '需要提供密钥/公钥' }
  }
  try {
    let key: Uint8Array | CryptoKey
    if (HMAC_ALGS.has(alg)) {
      key = new TextEncoder().encode(secret)
    } else if (ASYMMETRIC_ALGS.has(alg)) {
      key = await importSPKI(secret.trim(), alg)
    } else {
      return { kind: 'invalid', reason: `不支持的算法: ${alg || '(空)'}` }
    }
    await jwtVerify(token, key)
    return { kind: 'verified' }
  } catch (e) {
    if (e instanceof errors.JWSSignatureVerificationFailed) {
      return { kind: 'invalid', reason: '签名不匹配' }
    }
    if (e instanceof errors.JWTExpired) {
      return { kind: 'invalid', reason: 'Token 已过期' }
    }
    if (e instanceof errors.JWTClaimValidationFailed) {
      return { kind: 'invalid', reason: `claim 校验失败: ${e.message}` }
    }
    return { kind: 'invalid', reason: e instanceof Error ? e.message : String(e) }
  }
}

export function JwtPage() {
  const [token, setToken] = useState(SAMPLE_TOKEN)
  const [secret, setSecret] = useState(SAMPLE_SECRET)
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' })

  const decoded = useMemo(() => decode(token), [token])
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
    setVerify(await runVerify(token, secret, alg))
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">JWT</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          解码、签名校验 JSON Web Token。所有处理都在浏览器本地完成。
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT: encoded token input */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="token" className="text-sm font-medium">
              Encoded
            </Label>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onTokenChange(SAMPLE_TOKEN)}
              >
                示例
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onTokenChange('')}
              >
                清空
              </Button>
            </div>
          </div>
          <Textarea
            id="token"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            spellCheck={false}
            className="min-h-[400px] resize-y break-all font-mono text-sm leading-relaxed"
            placeholder="粘贴 JWT，例如 eyJhbGciOi..."
          />
          {!decoded.ok && decoded.error && (
            <p className="text-xs text-destructive">⚠ {decoded.error}</p>
          )}
        </section>

        {/* RIGHT: decoded panels */}
        <section className="flex flex-col gap-5">
          <Panel title="Header" subtitle={alg ? `Algorithm: ${alg}` : undefined}>
            <JsonView value={decoded.ok ? decoded.header : null} maxHeight="9rem" />
          </Panel>

          <Panel title="Payload">
            <JsonView value={decoded.ok ? decoded.payload : null} maxHeight="14rem" />
          </Panel>

          <Panel title="Signature">
            <div className="flex flex-col gap-3">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">
                  {isHmac
                    ? '密钥 (HMAC secret，文本)'
                    : isAsym
                      ? '公钥 (PEM / SPKI 格式)'
                      : '密钥'}
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
                      ? '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'
                      : 'your-secret'
                  }
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleVerify}
                  disabled={!decoded.ok || verify.kind === 'verifying'}
                  size="sm"
                >
                  验证签名
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

function JsonView({
  value,
  maxHeight,
}: {
  value: Record<string, unknown> | null
  maxHeight: string
}) {
  return (
    <pre
      className="overflow-auto rounded-md border border-border bg-card/50 p-3 font-mono text-sm text-foreground/90"
      style={{ maxHeight }}
    >
      {value ? JSON.stringify(value, null, 2) : '—'}
    </pre>
  )
}

function VerifyBadge({ state }: { state: VerifyState }) {
  if (state.kind === 'idle') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldQuestion className="h-4 w-4" />
        未验证
      </span>
    )
  }
  if (state.kind === 'verifying') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        验证中…
      </span>
    )
  }
  if (state.kind === 'verified') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-500">
        <CheckCircle2 className="h-4 w-4" />
        签名有效
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
