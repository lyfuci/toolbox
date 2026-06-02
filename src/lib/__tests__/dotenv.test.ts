import { describe, it, expect } from 'vitest'
import { parseEnv, stringifyEnv, envToJson, jsonToEnv } from '@/lib/dotenv'

describe('parseEnv', () => {
  it('parses simple KEY=value', () => {
    expect(parseEnv('FOO=bar\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })
  it('skips comments and blank lines', () => {
    expect(parseEnv('# comment\n\nFOO=bar\n')).toEqual({ FOO: 'bar' })
  })
  it('ignores the export prefix', () => {
    expect(parseEnv('export FOO=bar')).toEqual({ FOO: 'bar' })
  })
  it('trims whitespace around key and value', () => {
    expect(parseEnv('  FOO = bar  ')).toEqual({ FOO: 'bar' })
  })
  it('strips inline comments on unquoted values', () => {
    expect(parseEnv('FOO=bar # trailing')).toEqual({ FOO: 'bar' })
  })
  it('keeps # inside quoted values', () => {
    expect(parseEnv('FOO="a # b"')).toEqual({ FOO: 'a # b' })
  })
  it('applies escapes in double-quoted values', () => {
    expect(parseEnv('FOO="line1\\nline2\\ttab"')).toEqual({ FOO: 'line1\nline2\ttab' })
  })
  it('treats single quotes as literal', () => {
    expect(parseEnv("FOO='a\\nb'")).toEqual({ FOO: 'a\\nb' })
  })
  it('keeps = inside the value', () => {
    expect(parseEnv('URL=postgres://u:p@h/db?x=1')).toEqual({ URL: 'postgres://u:p@h/db?x=1' })
  })
})

describe('stringifyEnv', () => {
  it('emits plain lines for simple values', () => {
    expect(stringifyEnv({ FOO: 'bar', BAZ: 'qux' })).toBe('FOO=bar\nBAZ=qux\n')
  })
  it('quotes values with spaces or specials', () => {
    expect(stringifyEnv({ A: 'a b', B: 'has#hash' })).toBe('A="a b"\nB="has#hash"\n')
  })
  it('escapes newlines', () => {
    expect(stringifyEnv({ A: 'x\ny' })).toBe('A="x\\ny"\n')
  })
  it('round-trips through parseEnv', () => {
    const map = { A: 'simple', B: 'with space', C: 'tab\there', D: 'quote"inside', URL: 'a=b&c=d' }
    expect(parseEnv(stringifyEnv(map))).toEqual(map)
  })
})

describe('envToJson', () => {
  it('produces a JSON object', () => {
    const r = envToJson('FOO=bar\nN=1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(JSON.parse(r.json)).toEqual({ FOO: 'bar', N: '1' })
  })
  it('flags empty', () => {
    expect(envToJson('  ')).toEqual({ ok: false, error: 'empty' })
  })
})

describe('jsonToEnv', () => {
  it('converts a flat object', () => {
    const r = jsonToEnv('{"FOO":"bar","N":1,"B":true}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.env).toBe('FOO=bar\nN=1\nB=true\n')
  })
  it('rejects nested objects', () => {
    const r = jsonToEnv('{"A":{"x":1}}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^nested:/)
  })
  it('rejects arrays at the root', () => {
    expect(jsonToEnv('[1,2]')).toEqual({ ok: false, error: 'notObject' })
  })
  it('rejects invalid env keys', () => {
    const r = jsonToEnv('{"bad-key":"v"}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^badKey:/)
  })
  it('reports invalid JSON', () => {
    expect(jsonToEnv('{nope}').ok).toBe(false)
  })
})
