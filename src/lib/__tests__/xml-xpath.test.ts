import { describe, it, expect } from 'vitest'
import { attributeXPath, formatXPath, stepIndex, textXPath } from '@/lib/xml'

describe('stepIndex', () => {
  it('is null when the tag is unique among siblings', () => {
    // `/root/nested` already means the only nested there — an index adds noise.
    expect(stepIndex('nested', ['nested'], 0)).toBeNull()
    expect(stepIndex('nested', ['head', 'nested', 'tail'], 1)).toBeNull()
  })
  it('numbers repeated tags from 1, counting only same-tag siblings', () => {
    const siblings = ['item', 'item', 'item']
    expect(stepIndex('item', siblings, 0)).toBe(1)
    expect(stepIndex('item', siblings, 1)).toBe(2)
    expect(stepIndex('item', siblings, 2)).toBe(3)
  })
  it('ignores other tags when counting the position', () => {
    // XPath positions are per name: the second <item> is item[2] even with a
    // <note> wedged between them.
    const siblings = ['item', 'note', 'item']
    expect(stepIndex('item', siblings, 2)).toBe(2)
  })
  it('survives an element that is not in the sibling list', () => {
    expect(stepIndex('item', [], 0)).toBeNull()
  })
})

describe('formatXPath', () => {
  it('joins steps into an absolute path', () => {
    expect(
      formatXPath([
        { tag: 'root', index: null },
        { tag: 'item', index: 2 },
        { tag: 'nested', index: null },
      ]),
    ).toBe('/root/item[2]/nested')
  })
  it('returns the document root for no steps', () => {
    expect(formatXPath([])).toBe('/')
  })
  it('keeps namespace prefixes as written', () => {
    expect(formatXPath([{ tag: 'soap:Envelope', index: null }])).toBe('/soap:Envelope')
  })
})

describe('attributeXPath / textXPath', () => {
  it('appends the attribute axis', () => {
    expect(attributeXPath('/root/item[2]', 'id')).toBe('/root/item[2]/@id')
  })
  it('appends the text node test', () => {
    expect(textXPath('/root/item[2]')).toBe('/root/item[2]/text()')
  })
})
