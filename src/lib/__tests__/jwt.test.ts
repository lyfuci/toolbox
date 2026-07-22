import { describe, it, expect } from 'vitest'
import { stripBearerPrefix } from '@/lib/jwt'

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
