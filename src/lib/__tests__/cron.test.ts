import { describe, it, expect } from 'vitest'
import { analyzeCron, describeCron, nextRuns } from '@/lib/cron'

describe('describeCron', () => {
  it('describes the every-minute wildcard', () => {
    expect(describeCron('* * * * *').toLowerCase()).toContain('every minute')
  })

  it('describes a step value', () => {
    expect(describeCron('*/15 * * * *').toLowerCase()).toContain('every 15 minutes')
  })

  it('describes a weekday range with a fixed time', () => {
    const d = describeCron('0 9 * * 1-5').toLowerCase()
    expect(d).toContain('monday through friday')
  })

  it('expands @daily macro to a midnight description', () => {
    // cronstrue renders @daily as "At 12:00 AM".
    expect(describeCron('@daily')).toMatch(/12:00\s*AM/i)
  })

  it('renders a Chinese description in the zh_CN locale', () => {
    const d = describeCron('*/15 * * * *', 'zh_CN')
    expect(d).toMatch(/分钟/)
    // Must not leak the English sentence.
    expect(d.toLowerCase()).not.toContain('every')
  })
})

describe('nextRuns', () => {
  it('returns the requested count', () => {
    expect(nextRuns('* * * * *', 7)).toHaveLength(7)
  })

  it('spaces */15 runs exactly 15 minutes apart, aligned to the quarter hour', () => {
    const runs = nextRuns('*/15 * * * *', 5, 'UTC')
    for (const r of runs) {
      expect(r.getUTCSeconds()).toBe(0)
      expect(r.getUTCMinutes() % 15).toBe(0)
    }
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].getTime() - runs[i - 1].getTime()).toBe(15 * 60 * 1000)
    }
  })

  it('fires @daily at local midnight of the given timezone, 24h apart', () => {
    const runs = nextRuns('0 0 * * *', 3, 'UTC')
    for (const r of runs) {
      expect(r.getUTCHours()).toBe(0)
      expect(r.getUTCMinutes()).toBe(0)
    }
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].getTime() - runs[i - 1].getTime()).toBe(24 * 60 * 60 * 1000)
    }
  })

  it('honours the timezone offset (Asia/Shanghai midnight = 16:00 UTC prior day)', () => {
    const runs = nextRuns('0 0 * * *', 1, 'Asia/Shanghai')
    expect(runs[0].getUTCHours()).toBe(16)
  })
})

describe('analyzeCron', () => {
  it('returns description + runs for a valid expression', () => {
    const r = analyzeCron('0 9 * * 1-5', { count: 3, tz: 'UTC' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.runs).toHaveLength(3)
      expect(r.description.length).toBeGreaterThan(0)
    }
  })

  it('flags an empty expression', () => {
    const r = analyzeCron('   ')
    expect(r).toEqual({ ok: false, error: 'empty' })
  })

  it('flags an invalid expression without throwing', () => {
    const r = analyzeCron('not a cron line')
    expect(r.ok).toBe(false)
  })

  it('rejects an out-of-range field', () => {
    // minute 99 is invalid
    expect(analyzeCron('99 * * * *').ok).toBe(false)
  })
})
