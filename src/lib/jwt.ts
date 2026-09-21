/**
 * Pure JWT input helpers, split out of the page so they stay unit-testable
 * without pulling in jose / CodeMirror.
 */

/**
 * Strip a leading `Bearer ` (and an optional `Authorization:`) prefix that comes
 * along when a token is copied straight from an HTTP Authorization header, so the
 * pasted value decodes as a bare JWT. Case-insensitive; a no-op otherwise.
 */
export function stripBearerPrefix(input: string): string {
  return input.replace(/^\s*(?:authorization\s*:\s*)?bearer\s+/i, '')
}

/**
 * Claims whose value is a Unix-seconds timestamp. Hovering either the claim
 * NAME or its VALUE shows the readable time.
 */
export const TIME_CLAIMS: ReadonlySet<string> = new Set([
  'exp',
  'nbf',
  'iat',
  'auth_time',
])

/** Where a key and its value sit on one line of pretty-printed JSON. */
export type JsonLineSpans = {
  key: string
  rawValue: string
  keyStart: number
  keyEnd: number
  valueStart: number
  valueEnd: number
}

/**
 * Locate the key and value spans on a single line of pretty-printed JSON.
 *
 * `JSON.stringify(obj, null, 2)` puts one key per line, so a per-line regex
 * pinpoints both spans without building a syntax tree. Returns null for lines
 * that are not `"key": value` (braces, array items, blank lines).
 */
export function parseJsonLine(text: string): JsonLineSpans | null {
  const m = /^(\s*)"([^"]+)"(\s*:\s*)(.*?)(,?\s*)$/.exec(text)
  if (!m) return null
  const indent = m[1].length
  const key = m[2]
  const keyEnd = indent + 1 + key.length + 1 // just past the closing quote
  const valueStart = keyEnd + m[3].length
  return {
    key,
    rawValue: m[4],
    keyStart: indent, // opening quote
    keyEnd,
    valueStart,
    valueEnd: valueStart + m[4].length,
  }
}

// A JS Date tops out at ±8.64e15 ms; Unix seconds far outside the plausible
// range would only render as "Invalid Date", so they get no time tooltip.
const MAX_UNIX_SECONDS = 8.64e12

/**
 * Read a raw JSON value as a Unix-seconds timestamp, or null when it is not a
 * finite number that maps to a real date. Quoted numbers (`"1789..."`) count:
 * some issuers emit them, and the claim still means a time.
 */
export function timestampFromRawValue(raw: string): number | null {
  const trimmed = raw.trim().replace(/^"(.*)"$/, '$1')
  if (trimmed === '') return null
  const num = Number(trimmed)
  if (!Number.isFinite(num) || Math.abs(num) > MAX_UNIX_SECONDS) return null
  return Number.isNaN(new Date(num * 1000).getTime()) ? null : num
}

/** What a hover over one line of JSON should show, and which span it points at. */
export type JsonHover = { from: number; to: number; body: string }

/**
 * Decide the hover for column `col` of one pretty-printed JSON line.
 *
 * Kept out of the page (and away from CodeMirror) so the decisions are
 * testable: which span the pointer is over, whether a key is documented, and
 * whether a time claim contributes a readable time. Returns null when there is
 * nothing worth showing.
 */
export function jsonHoverAt(
  lineText: string,
  col: number,
  opts: {
    /** RFC description for a claim name, or null when the key is unknown/custom. */
    describe: (key: string) => string | null
    /** Readable time for a time claim's value, or null when it has none. */
    formatTime: ((seconds: number) => string) | null
  },
): JsonHover | null {
  const spans = parseJsonLine(lineText)
  if (!spans) return null
  const { key, rawValue, keyStart, keyEnd, valueStart, valueEnd } = spans

  const timeBody = (): string | null => {
    if (!opts.formatTime || !TIME_CLAIMS.has(key)) return null
    const seconds = timestampFromRawValue(rawValue)
    return seconds === null ? null : opts.formatTime(seconds)
  }

  // The name carries the time too: "what does exp mean" and "when does this
  // expire" are the same question in practice, and the raw number answers
  // neither on its own.
  if (col >= keyStart && col <= keyEnd) {
    const parts = [opts.describe(key), timeBody()].filter(
      (part): part is string => Boolean(part),
    )
    if (parts.length === 0) return null
    return { from: keyStart, to: keyEnd, body: parts.join('\n\n') }
  }
  if (col >= valueStart && col <= valueEnd) {
    const time = timeBody()
    return time === null ? null : { from: valueStart, to: valueEnd, body: time }
  }
  return null
}
