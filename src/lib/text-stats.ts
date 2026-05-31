/**
 * Text statistics — pure, client-side. Counts characters (with and without
 * whitespace), words, lines, sentences, paragraphs, byte size (UTF-8), and an
 * estimated reading time. Uses Intl.Segmenter for word counting when available
 * so CJK text is counted sensibly, with a regex fallback.
 */

export type TextStats = {
  chars: number
  charsNoSpaces: number
  words: number
  lines: number
  sentences: number
  paragraphs: number
  bytes: number
  readingTimeSec: number
}

const WORDS_PER_MIN = 200

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  type SegCtor = {
    new (locale?: string, opts?: { granularity: 'word' }): {
      segment: (s: string) => Iterable<{ segment: string; isWordLike?: boolean }>
    }
  }
  const Seg = (Intl as unknown as { Segmenter?: SegCtor }).Segmenter
  if (typeof Seg === 'function') {
    try {
      const seg = new Seg(undefined, { granularity: 'word' })
      let n = 0
      for (const part of seg.segment(trimmed)) if (part.isWordLike) n++
      return n
    } catch {
      /* fall through */
    }
  }
  return trimmed.split(/\s+/).filter(Boolean).length
}

export function textStats(text: string): TextStats {
  const chars = [...text].length // codepoint count (handles surrogate pairs)
  const charsNoSpaces = [...text.replace(/\s/g, '')].length
  const words = countWords(text)
  // Lines: count newlines + 1, but an empty string is 0 lines.
  const lines = text === '' ? 0 : text.split(/\r\n|\r|\n/).length
  // Sentences: runs ending in . ! ? (or CJK 。！？), at least one non-space.
  const sentenceMatches = text.match(/[^.!?。！？\s][^.!?。！？]*[.!?。！？]+/g)
  const sentences = sentenceMatches ? sentenceMatches.length : text.trim() ? 1 : 0
  // Paragraphs: blocks separated by one-or-more blank lines.
  const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/).filter((p) => p.trim()).length : 0
  const bytes = new TextEncoder().encode(text).length
  const readingTimeSec = Math.round((words / WORDS_PER_MIN) * 60)
  return { chars, charsNoSpaces, words, lines, sentences, paragraphs, bytes, readingTimeSec }
}
