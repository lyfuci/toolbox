/**
 * Slugify — turn arbitrary text into a URL-safe slug. Pure, client-side.
 *
 * Uses Unicode NFKD normalization to strip diacritics (café → cafe) and the
 * \p{Diacritic} property to drop combining marks, so it handles accented Latin
 * out of the box. Non-Latin scripts that don't decompose (CJK, etc.) are
 * dropped by the allowed-characters filter unless `keepUnicode` is set.
 */

export type SlugifyOptions = {
  separator?: string // default '-'
  lowercase?: boolean // default true
  /** Keep Unicode letters/numbers instead of restricting to ASCII. */
  keepUnicode?: boolean // default false
  /** Max length of the resulting slug (trimmed at a separator boundary). */
  maxLength?: number | null
}

export function slugify(input: string, opts: SlugifyOptions = {}): string {
  const sep = opts.separator ?? '-'
  const lowercase = opts.lowercase ?? true
  const keepUnicode = opts.keepUnicode ?? false
  const maxLength = opts.maxLength ?? null

  let s = input.normalize('NFKD').replace(/\p{Diacritic}/gu, '')

  if (lowercase) s = s.toLowerCase()

  // Replace any run of disallowed characters with a single separator.
  const allowed = keepUnicode ? /[^\p{L}\p{N}]+/gu : /[^a-zA-Z0-9]+/g
  s = s.replace(allowed, ' ').trim().replace(/\s+/g, sep)

  // Collapse repeated separators and trim them from the ends.
  if (sep) {
    const escSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`${escSep}{2,}`, 'g'), sep)
    s = s.replace(new RegExp(`^${escSep}+|${escSep}+$`, 'g'), '')
  }

  if (maxLength && s.length > maxLength) {
    s = s.slice(0, maxLength)
    // Don't end on a partial separator.
    if (sep) {
      const escSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      s = s.replace(new RegExp(`${escSep}+$`, 'g'), '')
    }
  }

  return s
}
