import { describe, it, expect } from 'vitest'
import { jsonToTs } from '@/lib/json-to-ts'

function gen(json: string, root = 'Root'): string {
  const r = jsonToTs(json, root)
  if (!r.ok) throw new Error(r.error)
  return r.code
}

describe('jsonToTs', () => {
  it('generates an interface for a flat object', () => {
    const code = gen('{"name":"Sean","age":30,"active":true}')
    expect(code).toContain('export interface Root {')
    expect(code).toContain('name: string')
    expect(code).toContain('age: number')
    expect(code).toContain('active: boolean')
  })

  it('nests child interfaces', () => {
    const code = gen('{"user":{"id":1,"email":"a@b.c"}}')
    expect(code).toContain('user: User')
    expect(code).toContain('export interface User {')
    expect(code).toContain('id: number')
  })

  it('merges array element shapes with optional keys', () => {
    const code = gen('{"items":[{"a":1},{"a":2,"b":"x"}]}')
    expect(code).toContain('items: Item[]')
    expect(code).toContain('export interface Item {')
    expect(code).toMatch(/a: number/)
    expect(code).toMatch(/b\?: string/)
  })

  it('represents null and arrays of primitives', () => {
    const code = gen('{"tags":["a","b"],"deleted":null}')
    expect(code).toContain('tags: string[]')
    expect(code).toContain('deleted: null')
  })

  it('handles an array root of objects', () => {
    const code = gen('[{"x":1},{"x":2}]', 'Row')
    expect(code).toContain('export interface Row {')
    expect(code).toContain('x: number')
  })

  it('quotes invalid identifier keys', () => {
    const code = gen('{"first-name":"a","valid":1}')
    expect(code).toContain('"first-name": string')
    expect(code).toContain('valid: number')
  })

  it('emits a type alias for a primitive root', () => {
    expect(gen('42', 'Answer')).toContain('export type Answer = number')
  })

  it('reports invalid JSON without throwing', () => {
    const r = jsonToTs('{not json}')
    expect(r.ok).toBe(false)
  })

  it('flags empty input', () => {
    expect(jsonToTs('   ')).toEqual({ ok: false, error: 'empty' })
  })

  it('produces valid-looking output for nested arrays of objects', () => {
    const code = gen('{"data":{"rows":[{"id":1,"meta":{"k":"v"}}]}}')
    expect(code).toContain('export interface Root {')
    expect(code).toContain('data: Data')
    expect(code).toContain('rows: Row[]')
    expect(code).toContain('meta: Meta')
  })
})
