import { describe, it, expect } from 'vitest'
import { TOOL_ALIASES, toolSearchKeywords } from '@/lib/tool-search'
import { tools } from '@/lib/tools'
import en from '@/i18n/en.json'
import zhCN from '@/i18n/zh-CN.json'

type Catalog = {
  tools: Record<string, { name: string; description: string }>
  categories: Record<string, { name: string }>
}
const CATALOGS: Catalog[] = [en as unknown as Catalog, zhCN as unknown as Catalog]

/** The keyword list the palette builds for a tool, both locales included. */
function keywordsFor(slug: string): string[] {
  const tool = tools.find((tl) => tl.slug === slug)
  if (!tool) throw new Error(`unknown tool: ${slug}`)
  return toolSearchKeywords(
    CATALOGS.flatMap((c) => [
      c.tools[slug].name,
      c.tools[slug].description,
      c.categories[tool.category].name,
    ]),
    TOOL_ALIASES[slug],
  )
}

/** cmdk's default filter scores `value` with keywords appended, lower-cased. */
const matches = (slug: string, query: string) =>
  [slug, ...keywordsFor(slug)].join(' ').toLowerCase().includes(query.toLowerCase())

describe('toolSearchKeywords', () => {
  it('keeps every localized string, de-duplicated', () => {
    expect(toolSearchKeywords(['Image Editor', '图片编辑', 'Image Editor'])).toEqual([
      'Image Editor',
      '图片编辑',
    ])
  })

  it('drops an alias the localized text already contains', () => {
    // "image" is inside "Image Editor", so it adds no reach.
    expect(toolSearchKeywords(['Image Editor'], ['image', 'picture'])).toEqual([
      'Image Editor',
      'picture',
    ])
  })

  it('is case-insensitive when de-duplicating', () => {
    expect(toolSearchKeywords(['PDF'], ['pdf', 'Pdf', 'pdf to jpg'])).toEqual(['PDF', 'pdf to jpg'])
  })

  it('ignores blank entries and trims', () => {
    expect(toolSearchKeywords(['  Diff  ', '', '   '], ['  compare  '])).toEqual(['Diff', 'compare'])
  })

  it('does not match an alias across the boundary between two texts', () => {
    // Naive concatenation would make "ab" look present in ["a", "b"].
    expect(toolSearchKeywords(['a', 'b'], ['ab'])).toEqual(['a', 'b', 'ab'])
  })

  it('works with no aliases at all', () => {
    expect(toolSearchKeywords(['Hash'])).toEqual(['Hash'])
  })
})

describe('TOOL_ALIASES', () => {
  it('covers every registered tool', () => {
    const missing = tools.filter((t) => !TOOL_ALIASES[t.slug]?.length).map((t) => t.slug)
    expect(missing).toEqual([])
  })

  it('has no entry for a tool that no longer exists', () => {
    const slugs = new Set(tools.map((t) => t.slug))
    expect(Object.keys(TOOL_ALIASES).filter((s) => !slugs.has(s))).toEqual([])
  })

  it('gives every tool both Latin and Chinese aliases', () => {
    const hasHan = (s: string) => /\p{Script=Han}/u.test(s)
    const hasLatin = (s: string) => /[a-z0-9]/i.test(s)
    const gaps = tools
      .map((t) => ({ slug: t.slug, list: TOOL_ALIASES[t.slug] ?? [] }))
      .filter(({ list }) => !list.some(hasHan) || !list.some(hasLatin))
      .map(({ slug }) => slug)
    expect(gaps).toEqual([])
  })

  it('has no duplicate alias within one tool', () => {
    for (const [slug, list] of Object.entries(TOOL_ALIASES)) {
      const lower = list.map((a) => a.toLowerCase())
      expect({ slug, dupes: lower.filter((a, i) => lower.indexOf(a) !== i) }).toEqual({
        slug,
        dupes: [],
      })
    }
  })

  it('has no blank or whitespace-padded alias', () => {
    for (const [slug, list] of Object.entries(TOOL_ALIASES)) {
      for (const alias of list) expect({ slug, alias }).toEqual({ slug, alias: alias.trim() })
      expect(list.filter((a) => !a)).toEqual([])
    }
  })
})

describe('what a user types finds the tool they meant', () => {
  // Each row is a real query and the tool it must reach. These are the
  // searches that returned nothing before keywords existed.
  const CASES: Array<[query: string, slug: string]> = [
    // the report that started this: English words, Chinese UI
    ['image', 'image-editor'],
    ['picture', 'image-editor'],
    ['photo', 'image-editor'],
    ['pic', 'image-editor'],
    ['crop', 'image-editor'],
    ['resize', 'image-editor'],
    ['watermark', 'image-editor'],
    ['compress', 'image-compress'],
    ['shrink', 'image-compress'],
    ['tinypng', 'image-compress'],
    // Chinese words, English UI
    ['图片', 'image-editor'],
    ['压缩', 'image-compress'],
    ['正则', 'regex'],
    ['时间戳', 'timestamp'],
    ['子网', 'cidr'],
    ['二维码', 'qr-code'],
    ['去重', 'sort-dedupe'],
    ['字数', 'text-stats'],
    ['视频', 'media'],
    ['环境变量', 'dotenv'],
    ['域名', 'dns'],
    ['状态码', 'http-status'],
    // synonyms and abbreviations in either language
    ['regexp', 'regex'],
    ['epoch', 'timestamp'],
    ['subnet', 'cidr'],
    ['guid', 'uuid'],
    ['crontab', 'cron'],
    ['yml', 'yaml'],
    ['nslookup', 'dns'],
    ['404', 'http-status'],
    ['755', 'chmod'],
    ['ffmpeg', 'media'],
    ['token', 'jwt'],
    ['md5', 'hash'],
    ['compare', 'diff'],
    ['camelcase', 'case'],
    // the two file-convert directions stay distinguishable
    ['pdf to jpg', 'pdf'],
    ['jpg to pdf', 'images-to-pdf'],
    ['合并图片', 'images-to-pdf'],
  ]

  it.each(CASES)('%s → %s', (query, slug) => {
    expect(matches(slug, query)).toBe(true)
  })

  it('does not put every image word on the video tool', () => {
    for (const q of ['crop', 'watermark', 'tinypng']) expect(matches('media', q)).toBe(false)
  })

  it('keeps radix conversion out of the hex encoder', () => {
    // Number Base owns 进制转换; Hex converts text to hexadecimal.
    expect(matches('number-base', '进制转换')).toBe(true)
    expect(matches('hex', '进制转换')).toBe(false)
  })
})
