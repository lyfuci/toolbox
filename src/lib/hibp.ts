/**
 * Have I Been Pwned — Pwned Passwords lookup via k-anonymity.
 *
 * PRIVACY: the password never leaves the browser. We SHA-1 it locally, send
 * only the first 5 hex chars of the hash to the range API, and match the rest
 * against the returned suffix list in-page. The server only ever sees a 5-char
 * prefix shared by thousands of hashes (k-anonymity), so it can't learn which
 * password was checked. See https://haveibeenpwned.com/API/v3#PwnedPasswords.
 *
 * This is an EXTERNAL network call and must only run on an explicit user action
 * (a button), per the project's no-silent-network rule.
 */

const RANGE_API = 'https://api.pwnedpasswords.com/range/'

/** SHA-1 of `input` as UPPERCASE hex (HIBP returns uppercase suffixes). */
async function sha1HexUpper(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-1', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export type PwnedOpts = {
  signal?: AbortSignal
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Return how many times `password` appears in known breach corpora — 0 means it
 * wasn't found (which is NOT a guarantee of strength, only that it hasn't
 * leaked). Throws on a non-OK HTTP response or a network/CORS failure.
 */
export async function pwnedPasswordCount(
  password: string,
  opts: PwnedOpts = {},
): Promise<number> {
  const doFetch = opts.fetchImpl ?? fetch
  const hash = await sha1HexUpper(password)
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)

  // Plain GET, no custom headers → a CORS "simple request" (no preflight).
  const res = await doFetch(`${RANGE_API}${prefix}`, { signal: opts.signal })
  if (!res.ok) throw new Error(`HIBP request failed (${res.status})`)
  const text = await res.text()

  for (const line of text.split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    if (line.slice(0, idx).trim().toUpperCase() === suffix) {
      const count = parseInt(line.slice(idx + 1).trim(), 10)
      return Number.isFinite(count) ? count : 0
    }
  }
  return 0
}
