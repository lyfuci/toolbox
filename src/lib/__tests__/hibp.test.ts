import { describe, it, expect, vi } from 'vitest'
import { pwnedPasswordCount } from '../hibp'

/**
 * HIBP k-anonymity lookup. We inject a fake fetch so no network is touched.
 * The FOUND case uses the REAL SHA-1 of "password"
 * (5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8) so the test would catch the
 * silent-failure bugs (lowercase hex, wrong slice, prefix left in the suffix)
 * that all masquerade as "not found".
 */

const PASSWORD_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8' // SHA-1("password")[5:]
const PASSWORD_PREFIX = '5BAA6'

function fakeFetch(body: string, ok = true, status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status,
    text: async () => body,
  })) as unknown as typeof fetch
}

describe('pwnedPasswordCount', () => {
  it('requests the correct 5-char prefix and never sends the suffix', async () => {
    const f = fakeFetch(`${PASSWORD_SUFFIX}:42\n`)
    await pwnedPasswordCount('password', { fetchImpl: f })
    const url = (f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PASSWORD_PREFIX}`)
    expect(url).not.toContain(PASSWORD_SUFFIX)
  })

  it('returns the breach count for a found password', async () => {
    const body =
      '0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n' +
      `${PASSWORD_SUFFIX}:3730471\r\n` +
      '00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2'
    const count = await pwnedPasswordCount('password', { fetchImpl: fakeFetch(body) })
    expect(count).toBe(3730471)
  })

  it('matches case-insensitively on the returned suffix', async () => {
    const body = `${PASSWORD_SUFFIX.toLowerCase()}:7\n`
    const count = await pwnedPasswordCount('password', { fetchImpl: fakeFetch(body) })
    expect(count).toBe(7)
  })

  it('returns 0 when the suffix is absent from the range', async () => {
    const body = '0018A45C4D1DEF81644B54AB7F969B88D65:1\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:9\n'
    const count = await pwnedPasswordCount('password', { fetchImpl: fakeFetch(body) })
    expect(count).toBe(0)
  })

  it('throws on a non-OK response', async () => {
    await expect(
      pwnedPasswordCount('password', { fetchImpl: fakeFetch('', false, 503) }),
    ).rejects.toThrow(/503/)
  })
})
