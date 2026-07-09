// Pure page-range parsing, split out from `pdf.ts` so it carries no dependency
// on pdf.js (which needs browser globals at import time) and stays unit-testable
// in a plain Node/vitest environment.

/**
 * Parse a page-range string like "1-3, 5, 8-" against a total page count.
 * Empty / whitespace input falls back to all pages. Returns a sorted, unique
 * list of 1-based page numbers, clamped to `[1, total]`. An unparseable token
 * yields `[]`, which callers treat as an invalid range.
 */
export function parsePageRange(input: string, total: number): number[] {
  const trimmed = input.trim()
  if (!trimmed) return range(1, total)

  const pages = new Set<number>()
  for (const part of trimmed.split(',')) {
    const seg = part.trim()
    if (!seg) continue
    const m = seg.match(/^(\d+)?\s*-\s*(\d+)?$/)
    if (m) {
      const from = m[1] ? Number(m[1]) : 1
      const to = m[2] ? Number(m[2]) : total
      for (let p = Math.min(from, to); p <= Math.max(from, to); p++) {
        if (p >= 1 && p <= total) pages.add(p)
      }
    } else if (/^\d+$/.test(seg)) {
      const p = Number(seg)
      if (p >= 1 && p <= total) pages.add(p)
    } else {
      // Unparseable token — treat the whole input as invalid.
      return []
    }
  }
  return [...pages].sort((a, b) => a - b)
}

function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let i = from; i <= to; i++) out.push(i)
  return out
}
