import { describe, it, expect } from 'vitest'
import { fromOctal, toOctal, toSymbolic, fromSymbolic, describe as describePerms } from '@/lib/chmod'

describe('chmod octal <-> symbolic', () => {
  it('755 -> rwxr-xr-x', () => {
    const p = fromOctal('755')!
    expect(toSymbolic(p)).toBe('rwxr-xr-x')
    expect(toOctal(p)).toBe('0755')
  })
  it('644 -> rw-r--r--', () => {
    expect(toSymbolic(fromOctal('644')!)).toBe('rw-r--r--')
  })
  it('777 -> rwxrwxrwx', () => {
    expect(toSymbolic(fromOctal('777')!)).toBe('rwxrwxrwx')
  })
  it('000 -> ---------', () => {
    expect(toSymbolic(fromOctal('000')!)).toBe('---------')
  })
  it('handles setuid (4755 -> rwsr-xr-x)', () => {
    const p = fromOctal('4755')!
    expect(toSymbolic(p)).toBe('rwsr-xr-x')
    expect(toOctal(p)).toBe('4755')
  })
  it('handles setgid (2755 -> rwxr-sr-x)', () => {
    expect(toSymbolic(fromOctal('2755')!)).toBe('rwxr-sr-x')
  })
  it('handles sticky (1777 -> rwxrwxrwt)', () => {
    const p = fromOctal('1777')!
    expect(toSymbolic(p)).toBe('rwxrwxrwt')
    expect(toOctal(p)).toBe('1777')
  })
  it('uppercase S when setuid but no execute (4644 -> rwSr--r--)', () => {
    expect(toSymbolic(fromOctal('4644')!)).toBe('rwSr--r--')
  })
})

describe('chmod fromSymbolic', () => {
  it('parses rwxr-xr-x back to 0755', () => {
    expect(toOctal(fromSymbolic('rwxr-xr-x')!)).toBe('0755')
  })
  it('parses rwsr-sr-t (setuid+setgid+sticky+all x) to 7755', () => {
    expect(toOctal(fromSymbolic('rwsr-sr-t')!)).toBe('7755')
  })
  it('tolerates a leading file-type char', () => {
    expect(toOctal(fromSymbolic('-rw-r--r--')!)).toBe('0644')
  })
  it('rejects bad length', () => {
    expect(fromSymbolic('rwx')).toBeNull()
  })
  it('rejects bad chars', () => {
    expect(fromSymbolic('rwxr-xr-z')).toBeNull()
  })
})

describe('chmod validation + describe', () => {
  it('rejects non-octal', () => {
    expect(fromOctal('888')).toBeNull()
    expect(fromOctal('75')).toBeNull()
    expect(fromOctal('75x')).toBeNull()
  })
  it('describes 755 in English', () => {
    const d = describePerms(fromOctal('755')!)
    expect(d).toContain('Owner: read, write, execute')
    expect(d).toContain('Group: read, execute')
  })
  it('octal round-trips through symbolic for every 3-digit value', () => {
    for (let n = 0; n <= 0o777; n++) {
      const oct = n.toString(8).padStart(3, '0')
      const p = fromOctal(oct)!
      const back = fromSymbolic(toSymbolic(p))!
      expect(toOctal(back)).toBe('0' + oct)
    }
  })
})
