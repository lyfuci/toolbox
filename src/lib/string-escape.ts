/**
 * String escape / unescape across common developer targets. All transforms
 * are pure and run client-side. Each mode aims to be round-trippable
 * (unescape(escape(x)) === x) for typical inputs.
 */

export type EscapeMode = 'json' | 'html' | 'url' | 'csv' | 'unicode'

export const ESCAPE_MODES: EscapeMode[] = ['json', 'html', 'url', 'csv', 'unicode']

// ---- JSON / JS string body (no surrounding quotes) ----
function escapeJson(s: string): string {
  // JSON.stringify gives a fully-quoted string; strip the outer quotes.
  const quoted = JSON.stringify(s)
  return quoted.slice(1, -1)
}
function unescapeJson(s: string): string {
  // The escaped body already has its quotes backslashed (escapeJson emits
  // `\"`), so wrap-and-parse directly. Tolerate a bare `"` by escaping only
  // quotes that aren't already preceded by a backslash.
  const safe = s.replace(/(^|[^\\])"/g, '$1\\"')
  return JSON.parse(`"${safe}"`) as string
}

// ---- HTML entities ----
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}
function unescapeHtml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&') // ampersand last so it doesn't double-decode
}

// ---- URL component ----
function escapeUrl(s: string): string {
  return encodeURIComponent(s)
}
function unescapeUrl(s: string): string {
  return decodeURIComponent(s)
}

// ---- CSV single field (RFC 4180) ----
function escapeCsv(s: string): string {
  // Quote if it contains a comma, quote, CR or LF; double internal quotes.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
function unescapeCsv(s: string): string {
  const t = s.trim()
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/""/g, '"')
  }
  return s
}

// ---- Unicode \uXXXX (escapes non-ASCII; keeps ASCII readable) ----
function escapeUnicode(s: string): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) {
      out += ch
    } else if (cp > 0xffff) {
      // Emit as a surrogate pair so the \u form stays 4-hex-digit.
      const high = Math.floor((cp - 0x10000) / 0x400) + 0xd800
      const low = ((cp - 0x10000) % 0x400) + 0xdc00
      out += `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`
    } else {
      out += `\\u${cp.toString(16).padStart(4, '0')}`
    }
  }
  return out
}
function unescapeUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

const ESCAPERS: Record<EscapeMode, (s: string) => string> = {
  json: escapeJson,
  html: escapeHtml,
  url: escapeUrl,
  csv: escapeCsv,
  unicode: escapeUnicode,
}
const UNESCAPERS: Record<EscapeMode, (s: string) => string> = {
  json: unescapeJson,
  html: unescapeHtml,
  url: unescapeUrl,
  csv: unescapeCsv,
  unicode: unescapeUnicode,
}

export type Direction = 'escape' | 'unescape'

/**
 * Transform `text` for `mode` in the given `direction`. Throws only when the
 * underlying decoder rejects malformed input (e.g. a bad %xx in URL mode);
 * callers should surface the message.
 */
export function transform(text: string, mode: EscapeMode, direction: Direction): string {
  const fn = direction === 'escape' ? ESCAPERS[mode] : UNESCAPERS[mode]
  return fn(text)
}
