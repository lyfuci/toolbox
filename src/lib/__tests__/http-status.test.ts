import { describe, it, expect } from 'vitest'
import { HTTP_STATUSES, getStatus, searchStatuses } from '@/lib/http-status'

describe('http-status table', () => {
  it('includes common codes', () => {
    for (const c of [200, 301, 404, 418, 429, 500, 503]) {
      expect(getStatus(c)).toBeTruthy()
    }
  })
  it('derives the category from the code', () => {
    expect(getStatus(404)?.category).toBe(4)
    expect(getStatus(200)?.category).toBe(2)
    expect(getStatus(503)?.category).toBe(5)
  })
  it('names are correct for a few', () => {
    expect(getStatus(404)?.name).toBe('Not Found')
    expect(getStatus(418)?.name).toBe("I'm a teapot")
  })
  it('returns undefined for unknown codes', () => {
    expect(getStatus(299)).toBeUndefined()
    expect(getStatus(999)).toBeUndefined()
  })
  it('every entry has a unique code and a 1..5 category', () => {
    const seen = new Set<number>()
    for (const s of HTTP_STATUSES) {
      expect(seen.has(s.code)).toBe(false)
      seen.add(s.code)
      expect([1, 2, 3, 4, 5]).toContain(s.category)
    }
  })
})

describe('searchStatuses', () => {
  it('matches by code substring', () => {
    expect(searchStatuses('404').some((s) => s.code === 404)).toBe(true)
  })
  it('matches by name (case-insensitive)', () => {
    const r = searchStatuses('forbidden')
    expect(r.length).toBe(1)
    expect(r[0].code).toBe(403)
  })
  it('returns everything for an empty query', () => {
    expect(searchStatuses('').length).toBe(HTTP_STATUSES.length)
  })
})
