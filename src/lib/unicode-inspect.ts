/**
 * Unicode inspector — break a string into codepoints with per-character detail:
 * the codepoint (U+XXXX), the character itself, its UTF-8 / UTF-16 byte
 * representations, and a coarse category/name hint. Pure and client-side.
 *
 * We deliberately avoid bundling the full Unicode name database (megabytes);
 * instead we derive a readable label from Unicode block ranges plus a small
 * set of named control/whitespace characters. Good enough to answer
 * "what is this character?" for debugging encoding issues.
 */

export type CharInfo = {
  char: string
  codePoint: number
  hex: string // e.g. "U+1F600"
  decimal: number
  utf8: string // space-separated hex bytes
  utf16: string // space-separated hex units
  name: string // best-effort label
  category: string
}

const CONTROL_NAMES: Record<number, string> = {
  0x00: 'NULL',
  0x07: 'BELL',
  0x08: 'BACKSPACE',
  0x09: 'CHARACTER TABULATION (Tab)',
  0x0a: 'LINE FEED (LF)',
  0x0b: 'LINE TABULATION',
  0x0c: 'FORM FEED',
  0x0d: 'CARRIAGE RETURN (CR)',
  0x1b: 'ESCAPE',
  0x7f: 'DELETE',
  0x20: 'SPACE',
  0xa0: 'NO-BREAK SPACE',
  0x200b: 'ZERO WIDTH SPACE',
  0x200d: 'ZERO WIDTH JOINER',
  0xfeff: 'BYTE ORDER MARK / ZERO WIDTH NO-BREAK SPACE',
}

// Coarse block table: [start, end, label]. First match wins.
const BLOCKS: [number, number, string][] = [
  [0x0000, 0x001f, 'Control'],
  [0x0020, 0x007f, 'Basic Latin'],
  [0x0080, 0x00ff, 'Latin-1 Supplement'],
  [0x0100, 0x017f, 'Latin Extended-A'],
  [0x0180, 0x024f, 'Latin Extended-B'],
  [0x0370, 0x03ff, 'Greek and Coptic'],
  [0x0400, 0x04ff, 'Cyrillic'],
  [0x0590, 0x05ff, 'Hebrew'],
  [0x0600, 0x06ff, 'Arabic'],
  [0x0900, 0x097f, 'Devanagari'],
  [0x2000, 0x206f, 'General Punctuation'],
  [0x20a0, 0x20cf, 'Currency Symbols'],
  [0x2190, 0x21ff, 'Arrows'],
  [0x2200, 0x22ff, 'Mathematical Operators'],
  [0x2600, 0x26ff, 'Miscellaneous Symbols'],
  [0x2700, 0x27bf, 'Dingbats'],
  [0x3000, 0x303f, 'CJK Symbols and Punctuation'],
  [0x3040, 0x309f, 'Hiragana'],
  [0x30a0, 0x30ff, 'Katakana'],
  [0x3400, 0x4dbf, 'CJK Extension A'],
  [0x4e00, 0x9fff, 'CJK Unified Ideographs'],
  [0xac00, 0xd7af, 'Hangul Syllables'],
  [0xf900, 0xfaff, 'CJK Compatibility Ideographs'],
  [0x1f300, 0x1f5ff, 'Miscellaneous Symbols and Pictographs'],
  [0x1f600, 0x1f64f, 'Emoticons'],
  [0x1f680, 0x1f6ff, 'Transport and Map Symbols'],
  [0x1f900, 0x1f9ff, 'Supplemental Symbols and Pictographs'],
]

function blockLabel(cp: number): string {
  for (const [start, end, label] of BLOCKS) {
    if (cp >= start && cp <= end) return label
  }
  return 'Unknown block'
}

function categoryOf(cp: number, ch: string): string {
  if (cp <= 0x1f || cp === 0x7f) return 'Control'
  if (/\s/.test(ch)) return 'Whitespace'
  if (/\p{Letter}/u.test(ch)) return 'Letter'
  if (/\p{Number}/u.test(ch)) return 'Number'
  if (/\p{Punctuation}/u.test(ch)) return 'Punctuation'
  if (/\p{Symbol}/u.test(ch)) return 'Symbol'
  if (/\p{Emoji}/u.test(ch)) return 'Emoji'
  return 'Other'
}

function utf8Bytes(cp: number): string {
  const bytes = [...new TextEncoder().encode(String.fromCodePoint(cp))]
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

function utf16Units(ch: string): string {
  const units: string[] = []
  for (let i = 0; i < ch.length; i++) {
    units.push(ch.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase())
  }
  return units.join(' ')
}

export function inspectChar(ch: string): CharInfo {
  const cp = ch.codePointAt(0)!
  const name = CONTROL_NAMES[cp] ?? blockLabel(cp)
  return {
    char: ch,
    codePoint: cp,
    hex: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
    decimal: cp,
    utf8: utf8Bytes(cp),
    utf16: utf16Units(ch),
    name,
    category: categoryOf(cp, ch),
  }
}

/** Inspect every codepoint in a string (grapheme-by-codepoint via spread). */
export function inspect(text: string): CharInfo[] {
  return [...text].map(inspectChar)
}
