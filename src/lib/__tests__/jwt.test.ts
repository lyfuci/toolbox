import { describe, it, expect } from 'vitest'
import {
  jsonHoverAt,
  parseJsonLine,
  stripBearerPrefix,
  timestampFromRawValue,
  TIME_CLAIMS,
} from '@/lib/jwt'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.sig'

describe('stripBearerPrefix', () => {
  it('leaves a bare token untouched', () => {
    expect(stripBearerPrefix(TOKEN)).toBe(TOKEN)
  })
  it('strips a leading "Bearer " prefix', () => {
    expect(stripBearerPrefix(`Bearer ${TOKEN}`)).toBe(TOKEN)
  })
  it('is case-insensitive and tolerates extra whitespace', () => {
    expect(stripBearerPrefix(`bearer   ${TOKEN}`)).toBe(TOKEN)
    expect(stripBearerPrefix(`BEARER\t${TOKEN}`)).toBe(TOKEN)
    expect(stripBearerPrefix(`   Bearer ${TOKEN}`)).toBe(TOKEN)
  })
  it('also strips a full "Authorization: Bearer" header value', () => {
    expect(stripBearerPrefix(`Authorization: Bearer ${TOKEN}`)).toBe(TOKEN)
    expect(stripBearerPrefix(`authorization:bearer ${TOKEN}`)).toBe(TOKEN)
  })
  it('does not strip "Bearer" without a following token', () => {
    expect(stripBearerPrefix('Bearer')).toBe('Bearer')
  })
  it('does not touch "Bearer" appearing later in the string', () => {
    expect(stripBearerPrefix(`${TOKEN} Bearer`)).toBe(`${TOKEN} Bearer`)
  })
  it('only strips the first Bearer, keeping a token that itself is bearer-like', () => {
    // A pathological value: header + the word bearer inside — only the prefix goes.
    expect(stripBearerPrefix('Bearer Bearer-lookalike.b.c')).toBe('Bearer-lookalike.b.c')
  })
})

describe('parseJsonLine', () => {
  const line = '  "exp": 1789698399,'

  it('locates the key and value spans', () => {
    const spans = parseJsonLine(line)
    expect(spans).not.toBeNull()
    expect(spans!.key).toBe('exp')
    expect(spans!.rawValue).toBe('1789698399')
    // The spans must cover exactly the quoted key and the bare value.
    expect(line.slice(spans!.keyStart, spans!.keyEnd)).toBe('"exp"')
    expect(line.slice(spans!.valueStart, spans!.valueEnd)).toBe('1789698399')
  })

  it('handles a string value and a last line without a comma', () => {
    const l = '  "iss": "https://kc.example.com/auth"'
    const spans = parseJsonLine(l)!
    expect(spans.key).toBe('iss')
    expect(l.slice(spans.valueStart, spans.valueEnd)).toBe('"https://kc.example.com/auth"')
  })

  it('returns null for lines that are not "key": value', () => {
    expect(parseJsonLine('{')).toBeNull()
    expect(parseJsonLine('}')).toBeNull()
    expect(parseJsonLine('')).toBeNull()
    expect(parseJsonLine('    "just-a-string-item",')).toBeNull()
  })
})

describe('timestampFromRawValue', () => {
  it('reads a plain Unix-seconds number', () => {
    expect(timestampFromRawValue('1789698399')).toBe(1789698399)
  })
  it('reads a quoted number, which some issuers emit', () => {
    expect(timestampFromRawValue('"1789698399"')).toBe(1789698399)
  })
  it('accepts zero and negative (pre-1970) timestamps', () => {
    expect(timestampFromRawValue('0')).toBe(0)
    expect(timestampFromRawValue('-86400')).toBe(-86400)
  })
  it('rejects values that would render as Invalid Date', () => {
    expect(timestampFromRawValue('"not a time"')).toBeNull()
    expect(timestampFromRawValue('null')).toBeNull()
    expect(timestampFromRawValue('')).toBeNull()
    expect(timestampFromRawValue('   ')).toBeNull()
    expect(timestampFromRawValue('1e400')).toBeNull() // Infinity
    expect(timestampFromRawValue('99999999999999999')).toBeNull() // beyond Date range
  })
})

describe('TIME_CLAIMS', () => {
  it('covers the registered time claims and nothing else', () => {
    expect([...TIME_CLAIMS].sort()).toEqual(['auth_time', 'exp', 'iat', 'nbf'])
  })
})

describe('jsonHoverAt', () => {
  const EXP_LINE = '  "exp": 1789698399,'
  const DESCRIPTION = 'Expiration Time — Unix seconds (RFC 7519 §4.1.4)'
  const opts = {
    describe: (key: string) => (key === 'exp' ? DESCRIPTION : null),
    formatTime: (seconds: number) => `local/utc/relative for ${seconds}`,
  }
  // Columns inside the quoted key and inside the number, per the spans above.
  const ON_KEY = 4
  const ON_VALUE = 12

  it('shows the description AND the time when hovering a time claim NAME', () => {
    // The reported bug: hovering "exp" explained what exp means but never said
    // which day the token expires.
    const hover = jsonHoverAt(EXP_LINE, ON_KEY, opts)!
    expect(hover.body).toBe(`${DESCRIPTION}\n\nlocal/utc/relative for 1789698399`)
    expect(EXP_LINE.slice(hover.from, hover.to)).toBe('"exp"')
  })

  it('shows just the time when hovering the VALUE', () => {
    const hover = jsonHoverAt(EXP_LINE, ON_VALUE, opts)!
    expect(hover.body).toBe('local/utc/relative for 1789698399')
    expect(EXP_LINE.slice(hover.from, hover.to)).toBe('1789698399')
  })

  it('shows only the description for a non-time claim', () => {
    const line = '  "iss": "https://kc.example.com",'
    const hover = jsonHoverAt(line, 4, {
      ...opts,
      describe: () => 'Issuer — identifies the principal that issued the JWT',
    })!
    expect(hover.body).toBe('Issuer — identifies the principal that issued the JWT')
  })

  it('still shows the time for a time claim the catalog does not describe', () => {
    const line = '  "auth_time": 1789698099,'
    const hover = jsonHoverAt(line, 4, { ...opts, describe: () => null })!
    expect(hover.body).toBe('local/utc/relative for 1789698099')
  })

  it('shows nothing for an unknown claim with no time', () => {
    expect(jsonHoverAt('  "jti": "abc",', 4, { ...opts, describe: () => null })).toBeNull()
  })

  it('shows nothing when the header editor passes no time formatter', () => {
    // The header pane has no time claims, so exp-looking values stay bare.
    const hover = jsonHoverAt(EXP_LINE, ON_VALUE, { ...opts, formatTime: null })
    expect(hover).toBeNull()
  })

  it('shows nothing for a time claim whose value is not a usable timestamp', () => {
    expect(jsonHoverAt('  "exp": "never",', 12, { ...opts, describe: () => null })).toBeNull()
  })

  it('shows nothing between the spans or off the line', () => {
    // Spans are '  "exp": 1789698399,' → key 2..7, value 9..19; column 8 is the gap.
    expect(jsonHoverAt(EXP_LINE, 8, opts)).toBeNull()
    expect(jsonHoverAt(EXP_LINE, 7, opts)!.body).toContain('Expiration') // key edge included
    expect(jsonHoverAt(EXP_LINE, 9, opts)!.body).toBe('local/utc/relative for 1789698399')
    expect(jsonHoverAt('{', 0, opts)).toBeNull()
  })
})
