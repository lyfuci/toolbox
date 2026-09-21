import { describe, it, expect } from 'vitest'
import {
  buildPath,
  isContainer,
  toFriendlyPath,
  valueToClipboardText,
} from '@/lib/json-tree'

describe('buildPath', () => {
  it('uses bracket indices for arrays and quoted keys for objects', () => {
    expect(buildPath('$', 'features')).toBe("$['features']")
    expect(buildPath("$['features']", 9)).toBe("$['features'][9]")
  })
  it('escapes quotes and backslashes in keys', () => {
    expect(buildPath('$', "it's")).toBe("$['it\\'s']")
    expect(buildPath('$', 'back\\slash')).toBe("$['back\\\\slash']")
  })
})

describe('toFriendlyPath', () => {
  it('shortens identifier keys to dot notation', () => {
    expect(toFriendlyPath("$['features'][9]['geometry']")).toBe('$.features[9].geometry')
  })
  it('keeps brackets for keys that need quoting', () => {
    expect(toFriendlyPath("$['a-b']")).toBe("$['a-b']")
    expect(toFriendlyPath("$['a.b']")).toBe("$['a.b']")
    expect(toFriendlyPath("$['with space']")).toBe("$['with space']")
  })
})

describe('valueToClipboardText', () => {
  it('copies a string without the JSON quotes', () => {
    // The reported case: clicking an id should give the id, not a quoted literal.
    expect(valueToClipboardText('T_GEO_SZ_DISTRICT.441521')).toBe('T_GEO_SZ_DISTRICT.441521')
  })
  it('keeps inner characters literal rather than escaped', () => {
    expect(valueToClipboardText('line\nbreak "quoted"')).toBe('line\nbreak "quoted"')
  })
  it('copies numbers, booleans and null as they read in the tree', () => {
    expect(valueToClipboardText(115.177512)).toBe('115.177512')
    expect(valueToClipboardText(false)).toBe('false')
    expect(valueToClipboardText(null)).toBe('null')
  })
  it('copies an object as pretty-printed JSON', () => {
    expect(valueToClipboardText({ type: 'Feature', id: 7 })).toBe(
      '{\n  "type": "Feature",\n  "id": 7\n}',
    )
  })
  it('copies an array as pretty-printed JSON, honouring the indent setting', () => {
    expect(valueToClipboardText([1, 2], 4)).toBe('[\n    1,\n    2\n]')
  })
  it('round-trips a container through JSON.parse', () => {
    const value = { a: [1, { b: null }], c: 'x' }
    expect(JSON.parse(valueToClipboardText(value))).toEqual(value)
  })
})

describe('isContainer', () => {
  it('is true for objects and arrays only', () => {
    expect(isContainer({})).toBe(true)
    expect(isContainer([])).toBe(true)
    expect(isContainer(null)).toBe(false)
    expect(isContainer('s')).toBe(false)
    expect(isContainer(0)).toBe(false)
  })
})
