/**
 * .env ↔ JSON conversion. Pure, client-side. Implements a pragmatic subset of
 * the dotenv format that matches what dotenv/docker-compose actually parse:
 *
 *  - `KEY=value` lines; whitespace around the key and `=` is trimmed.
 *  - `#` starts a comment (full-line, or inline when preceded by whitespace
 *    on an unquoted value).
 *  - Optional `export ` prefix is ignored.
 *  - Single-quoted values are literal (no escape/interpolation).
 *  - Double-quoted values support \n \r \t \\ \" escapes and may span the
 *    quoted region.
 *  - Unquoted values are trimmed.
 *
 * JSON output is a flat string→string map (env values are always strings).
 */

export type EnvMap = Record<string, string>

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/

export function parseEnv(text: string): EnvMap {
  const out: EnvMap = {}
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    let line = raw
    if (!line.trim() || line.trim().startsWith('#')) continue
    // Strip optional `export ` prefix.
    line = line.replace(/^\s*export\s+/, '')
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!key) continue
    let value = line.slice(eq + 1).trim()

    if (value.startsWith('"')) {
      // Double-quoted: consume up to the closing unescaped quote, apply escapes.
      const m = value.match(/^"((?:\\.|[^"\\])*)"/)
      if (m) {
        value = m[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
      } else {
        // Unterminated quote: drop the leading quote, keep the rest.
        value = value.slice(1)
      }
    } else if (value.startsWith("'")) {
      const m = value.match(/^'([^']*)'/)
      value = m ? m[1] : value.slice(1)
    } else {
      // Unquoted: strip an inline comment (space + #) and trim.
      const hash = value.search(/\s#/)
      if (hash !== -1) value = value.slice(0, hash)
      value = value.trim()
    }
    out[key] = value
  }
  return out
}

/** Whether a double-quoted .env value is needed for this string. */
function needsQuoting(v: string): boolean {
  return /[\n\r\t"'#\\]/.test(v) || v !== v.trim() || v === '' || /\s/.test(v)
}

function quote(v: string): string {
  const escaped = v
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

export function stringifyEnv(map: EnvMap): string {
  return (
    Object.entries(map)
      .map(([k, v]) => `${k}=${needsQuoting(v) ? quote(v) : v}`)
      .join('\n') + (Object.keys(map).length ? '\n' : '')
  )
}

export type EnvToJsonResult = { ok: true; json: string } | { ok: false; error: string }

/** Parse .env text → pretty JSON object. */
export function envToJson(text: string): EnvToJsonResult {
  if (!text.trim()) return { ok: false, error: 'empty' }
  try {
    return { ok: true, json: JSON.stringify(parseEnv(text), null, 2) + '\n' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export type JsonToEnvResult = { ok: true; env: string } | { ok: false; error: string }

/** JSON object → .env text. Coerces scalar values to strings; rejects nesting. */
export function jsonToEnv(text: string): JsonToEnvResult {
  if (!text.trim()) return { ok: false, error: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'notObject' }
  }
  const map: EnvMap = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!KEY_RE.test(k)) return { ok: false, error: `badKey:${k}` }
    if (v === null || typeof v === 'object') {
      return { ok: false, error: `nested:${k}` }
    }
    map[k] = typeof v === 'string' ? v : String(v)
  }
  return { ok: true, env: stringifyEnv(map) }
}
