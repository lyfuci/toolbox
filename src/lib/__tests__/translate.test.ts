import { describe, expect, it, vi } from 'vitest'
import {
  batchLines,
  normalizeLang,
  protectSpans,
  restoreSpans,
  translatableLines,
  translate,
  TranslateError,
} from '../translate'

/** A fetch that answers Google's shape, recording what it was asked. */
function googleFetch(reply: (texts: string[]) => unknown, calls: URL[] = []) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push(url)
    return new Response(JSON.stringify(reply(url.searchParams.getAll('q'))), { status: 200 })
  }) as unknown as typeof fetch
}

const echo = (texts: string[]) => texts.map((t) => `<${t}>`)

describe('normalizeLang', () => {
  it('expands the shorthands people actually type', () => {
    expect(normalizeLang('zh')).toBe('zh-CN')
    expect(normalizeLang('JP')).toBe('ja')
    expect(normalizeLang(' tw ')).toBe('zh-TW')
  })

  it('passes through anything it does not know', () => {
    expect(normalizeLang('pt-BR')).toBe('pt-BR')
    expect(normalizeLang('auto')).toBe('auto')
  })
})

describe('protecting things translation would ruin', () => {
  it('masks inline code and bare URLs, and puts them back verbatim', () => {
    const { masked, kept } = protectSpans('Run `atm doctor` then read https://a.dev/x for why')
    expect(masked).toBe('Run ⟦0⟧ then read ⟦1⟧ for why')
    expect(restoreSpans(masked, kept)).toBe('Run `atm doctor` then read https://a.dev/x for why')
  })

  it('survives the placeholder appearing more than once', () => {
    const { masked, kept } = protectSpans('`x` and `x`')
    expect(restoreSpans(masked, kept)).toBe('`x` and `x`')
  })

  it('leaves plain prose untouched', () => {
    const { masked, kept } = protectSpans('nothing special here')
    expect(masked).toBe('nothing special here')
    expect(kept).toEqual([])
  })
})

describe('translatableLines', () => {
  it('skips fenced code blocks entirely, fences included', () => {
    const lines = ['intro', '```bash', 'atm config memory.high auto', '```', 'outro']
    expect(translatableLines(lines)).toEqual([true, false, false, false, true])
  })

  it('handles ~~~ fences and an unclosed fence', () => {
    expect(translatableLines(['a', '~~~', 'code', '~~~', 'b'])).toEqual([
      true,
      false,
      false,
      false,
      true,
    ])
    // An unclosed fence swallows the rest — better than translating code.
    expect(translatableLines(['a', '```', 'code', 'more'])).toEqual([true, false, false, false])
  })

  it('does not send blank lines', () => {
    expect(translatableLines(['a', '', 'b'])).toEqual([true, false, true])
  })
})

describe('batchLines', () => {
  it('caps a batch by line count', () => {
    const lines = Array.from({ length: 45 }, (_, i) => `line ${i}`)
    const groups = batchLines(lines, lines.map(() => true))
    expect(groups.length).toBe(3)
    expect(groups[0].length).toBe(20)
  })

  it('caps a batch by size, and skips lines marked untranslatable', () => {
    const lines = [ 'x'.repeat(1000), 'y'.repeat(1000), 'skipped' ]
    const groups = batchLines(lines, [true, true, false])
    expect(groups).toEqual([[0], [1]])
  })
})

describe('translate', () => {
  it('keeps blank lines, indentation and code blocks exactly where they were', async () => {
    const input = ['# Title', '', '  - nested item', '```bash', 'do not touch me', '```'].join('\n')

    const result = await translate(input, {
      source: 'en',
      target: 'zh-CN',
      fetchImpl: googleFetch(echo),
    })

    expect(result.text).toBe(
      ['<# Title>', '', '  <- nested item>', '```bash', 'do not touch me', '```'].join('\n'),
    )
  })

  it('reports the detected language only when the source was auto', async () => {
    const reply = (texts: string[]) => texts.map((t) => [`<${t}>`, 'de'])
    const auto = await translate('Guten Morgen', {
      source: 'auto',
      target: 'en',
      fetchImpl: googleFetch(reply),
    })
    expect(auto.detected).toBe('de')

    const pinned = await translate('Guten Morgen', {
      source: 'de',
      target: 'en',
      fetchImpl: googleFetch(reply),
    })
    expect(pinned.detected).toBeUndefined()
  })

  it('falls back to the second provider when the first refuses', async () => {
    // Mirrors the real failure: the free Google quota is per source IP, so a
    // shared proxy exit can start returning 429 through no fault of the user.
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('clients5.google.com')) return new Response('rate limited', { status: 429 })
      return new Response(
        JSON.stringify({ responseData: { translatedText: 'fallback output' } }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const result = await translate('hello', { source: 'en', target: 'zh-CN', fetchImpl })

    expect(result.provider).toBe('mymemory')
    expect(result.text).toBe('fallback output')
    expect(result.failures).toEqual([])
  })

  it('degrades to a partial translation instead of losing everything', async () => {
    // 40 lines = 2 batches. Fail only the second one.
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i}`)
    let seen = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const texts = url.searchParams.getAll('q')
      if (url.href.includes('clients5')) {
        seen += 1
        if (seen > 1) return new Response('nope', { status: 500 })
        return new Response(JSON.stringify(echo(texts)), { status: 200 })
      }
      return new Response('nope', { status: 500 })
    }) as unknown as typeof fetch

    const result = await translate(lines.join('\n'), {
      source: 'en',
      target: 'zh-CN',
      fetchImpl,
    })

    expect(result.text.split('\n')[0]).toBe('<line 0>') // first batch translated
    expect(result.text.split('\n')[39]).toBe('line 39') // second batch left alone
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('lines 21-40')
  })

  it('throws only when nothing at all could be translated', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch
    await expect(translate('hello', { source: 'en', target: 'zh-CN', fetchImpl })).rejects.toBeInstanceOf(
      TranslateError,
    )
  })

  it('rejects a mismatched segment count rather than pairing text with the wrong line', async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify(['only one']), { status: 200 })) as unknown as typeof fetch
    await expect(
      translate('a\nb', { source: 'en', target: 'zh-CN', fetchImpl: bad }),
    ).rejects.toBeInstanceOf(TranslateError)
  })

  it('sends nothing at all for empty input', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const result = await translate('   ', { source: 'en', target: 'zh-CN', fetchImpl })
    expect(result.text).toBe('')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('batches many lines into one request rather than one request per line', async () => {
    const calls: URL[] = []
    await translate(['a', 'b', 'c'].join('\n'), {
      source: 'en',
      target: 'zh-CN',
      fetchImpl: googleFetch(echo, calls),
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].searchParams.getAll('q')).toEqual(['a', 'b', 'c'])
  })

  it('translates code blocks too when markdown preservation is off', async () => {
    const input = ['```', 'code line', '```'].join('\n')
    const result = await translate(input, {
      source: 'en',
      target: 'zh-CN',
      preserveMarkdown: false,
      fetchImpl: googleFetch(echo),
    })
    expect(result.text).toBe(['<```>', '<code line>', '<```>'].join('\n'))
  })
})

describe('provider stickiness', () => {
  it('stops re-trying a provider that already failed this run', async () => {
    // Measured on a network that cannot reach the primary: retrying it once per
    // batch paid its timeout every time (13s for a single batch).
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i}`) // 2 batches
    let googleCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.href.includes('clients5')) {
        googleCalls += 1
        return new Response('unreachable', { status: 502 })
      }
      return new Response(
        JSON.stringify({ responseData: { translatedText: 'ok' } }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const result = await translate(lines.join('\n'), { source: 'en', target: 'zh-CN', fetchImpl })

    expect(result.provider).toBe('mymemory')
    expect(result.failures).toEqual([])
    expect(googleCalls).toBe(1) // asked once, then dropped for the rest of the run
  })

  it('gives every provider another chance after a batch fails outright', async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i}`) // 2 batches
    let attempt = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (!url.href.includes('clients5')) return new Response('no', { status: 500 })
      attempt += 1
      // First batch: fail. Second batch: succeed — a 429 can pass.
      if (attempt === 1) return new Response('rate limited', { status: 429 })
      return new Response(JSON.stringify(url.searchParams.getAll('q').map((q) => `<${q}>`)), {
        status: 200,
      })
    }) as unknown as typeof fetch

    const result = await translate(lines.join('\n'), { source: 'en', target: 'zh-CN', fetchImpl })

    expect(result.failures).toHaveLength(1) // first batch lost
    expect(result.text.split('\n')[39]).toBe('<line 39>') // second batch recovered
  })
})
