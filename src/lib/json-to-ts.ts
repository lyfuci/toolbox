/**
 * JSON -> TypeScript interface generator. Pure, client-side. Infers a tree of
 * named interfaces from a parsed JSON value, merging object shapes seen inside
 * the same array so `[{a},{a,b}]` yields `{ a: T; b?: T }`.
 *
 * Not a full type-inference engine — it covers the shapes a typical API
 * response uses (nested objects, arrays, primitives, null/optional).
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

type ObjShape = Map<string, { types: Set<string>; optional: boolean }>

function pascal(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  if (!cleaned) return 'T'
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

function singularize(name: string): string {
  if (/ies$/i.test(name)) return name.slice(0, -3) + 'y'
  if (/ses$/i.test(name)) return name.slice(0, -2)
  if (/s$/i.test(name) && !/ss$/i.test(name)) return name.slice(0, -1)
  return name
}

const VALID_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export class JsonToTs {
  private interfaces: Map<string, ObjShape> = new Map()
  private usedNames = new Set<string>()
  private rootName: string

  constructor(rootName = 'Root') {
    this.rootName = rootName
  }

  private uniqueName(base: string): string {
    const name = pascal(base) || 'T'
    if (!this.usedNames.has(name)) {
      this.usedNames.add(name)
      return name
    }
    let i = 2
    while (this.usedNames.has(`${name}${i}`)) i++
    const final = `${name}${i}`
    this.usedNames.add(final)
    return final
  }

  // Returns the TS type string for a value, registering interfaces as needed.
  private typeOf(value: Json, nameHint: string): string {
    if (value === null) return 'null'
    if (Array.isArray(value)) return this.arrayType(value, nameHint)
    switch (typeof value) {
      case 'boolean':
        return 'boolean'
      case 'number':
        return 'number'
      case 'string':
        return 'string'
      case 'object':
        return this.objectType(value as { [k: string]: Json }, nameHint)
      default:
        return 'unknown'
    }
  }

  private arrayType(arr: Json[], nameHint: string): string {
    if (arr.length === 0) return 'unknown[]'
    const elemName = singularize(nameHint)
    const types = new Set<string>()
    // Merge object elements into one shape under elemName.
    const objs = arr.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) as {
      [k: string]: Json
    }[]
    const nonObjs = arr.filter((v) => !(v && typeof v === 'object' && !Array.isArray(v)))
    if (objs.length) types.add(this.mergedObjectType(objs, elemName))
    for (const v of nonObjs) types.add(this.typeOf(v, elemName))
    const union = [...types].join(' | ')
    return types.size > 1 ? `(${union})[]` : `${union}[]`
  }

  private objectType(obj: { [k: string]: Json }, nameHint: string): string {
    return this.mergedObjectType([obj], nameHint)
  }

  private mergedObjectType(objs: { [k: string]: Json }[], nameHint: string): string {
    const name = this.uniqueName(nameHint)
    const shape: ObjShape = new Map()
    const allKeys = new Set<string>()
    for (const o of objs) for (const k of Object.keys(o)) allKeys.add(k)
    for (const key of allKeys) {
      const entry = { types: new Set<string>(), optional: false }
      for (const o of objs) {
        if (!(key in o)) {
          entry.optional = true
          continue
        }
        entry.types.add(this.typeOf(o[key], key))
      }
      shape.set(key, entry)
    }
    this.interfaces.set(name, shape)
    return name
  }

  generate(root: Json): string {
    // Kick off from the root; for a root array we still name the element type.
    const rootType = this.typeOf(root, this.rootName)
    const blocks: string[] = []
    for (const [name, shape] of this.interfaces) {
      const lines: string[] = [`export interface ${name} {`]
      for (const [key, { types, optional }] of shape) {
        const keyStr = VALID_KEY.test(key) ? key : JSON.stringify(key)
        const typeStr = [...types].join(' | ') || 'unknown'
        lines.push(`  ${keyStr}${optional ? '?' : ''}: ${typeStr}`)
      }
      lines.push('}')
      blocks.push(lines.join('\n'))
    }
    // If the root wasn't an object/array-of-objects (e.g. a bare array of
    // primitives or a scalar), emit a type alias so the output is usable.
    if (!this.interfaces.size) {
      return `export type ${pascal(this.rootName)} = ${rootType}\n`
    }
    if (rootType !== this.rootName && !this.usedNames.has(rootType.replace(/\[\]$/, ''))) {
      blocks.push(`export type ${pascal(this.rootName)} = ${rootType}`)
    }
    return blocks.join('\n\n') + '\n'
  }
}

export type JsonToTsResult = { ok: true; code: string } | { ok: false; error: string }

export function jsonToTs(jsonText: string, rootName = 'Root'): JsonToTsResult {
  const trimmed = jsonText.trim()
  if (!trimmed) return { ok: false, error: 'empty' }
  let parsed: Json
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  try {
    const code = new JsonToTs(rootName).generate(parsed)
    return { ok: true, code }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
