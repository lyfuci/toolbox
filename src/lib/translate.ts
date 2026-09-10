/**
 * Machine translation via free, key-less endpoints.
 *
 * This is an EXTERNAL network call and must only run on an explicit user action
 * (a button / a shortcut), per the project's no-silent-network rule.
 *
 * PRIVACY: the text you translate is sent to the chosen provider. That is
 * unavoidable for machine translation and is stated in the UI — unlike the rest
 * of the toolbox, this tool cannot be purely local.
 *
 * ## Why these two providers
 *
 * Both were verified from a browser origin on 2026-09-10: both answer with
 * `access-control-allow-origin: *`, and Google additionally sends
 * `cross-origin-resource-policy: cross-origin`. That matters here because the
 * site is cross-origin isolated (COEP `require-corp`), which rejects
 * cross-origin responses that are neither CORS-successful nor explicitly
 * CORP-marked. Neither needs an API key or any signup.
 *
 * A warning for whoever picks the endpoint next: the *other* well-known free
 * Google endpoint, `translate.googleapis.com/translate_a/single?client=gtx`,
 * returns **429** ("your computer or network may be sending automated
 * queries"). Its free quota is counted per source IP, so anyone behind a shared
 * VPN/proxy exit inherits everyone else's usage. `clients5.google.com` with
 * `client=dict-chrome-ex` is a different bucket and answered fine from the same
 * IP at the same moment. Both are UNOFFICIAL and can start refusing at any
 * time, which is exactly why `translate()` falls back rather than trusting one.
 *
 * ## Markdown-preserving mode
 *
 * Pasting a README into a translation box mangles it: fenced code blocks get
 * "translated" (`atm config memory.high auto` came back as
 * `atm 配置内存.高自动` — no longer copy-pasteable), ``` turns into ````, and
 * indentation is eaten. So `preserveMarkdown` translates line by line, skips
 * fenced blocks entirely, and swaps inline code / bare URLs for placeholders.
 *
 * The placeholder is `⟦0⟧`, chosen by testing candidates through the endpoint:
 * `⟦0⟧`, `%%0%%` and `ZQX0QZ` all survived a round trip untouched, while
 * `<x0>` came back escaped as `<x0>`.
 */

const GOOGLE = 'https://clients5.google.com/translate_a/t'
const MYMEMORY = 'https://api.mymemory.translated.net/get'

/**
 * Characters per request. A single 6000-char segment was accepted in testing;
 * this sits well under that because these endpoints publish no contract and
 * riding the limit invites 414/429.
 */
const BUDGET = 1800
const MAX_LINES = 20

export type ProviderId = 'google' | 'mymemory'

export type TranslateOpts = {
  source: string // BCP-47-ish code, or 'auto'
  target: string
  preserveMarkdown?: boolean
  signal?: AbortSignal
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

export type TranslateResult = {
  text: string
  /** Which provider actually answered. */
  provider: ProviderId
  /** Detected source language, when the provider reports one and source is 'auto'. */
  detected?: string
  /**
   * Segments that could not be translated and were left as the original.
   * A partial translation beats an error page, so these are reported, not thrown.
   */
  failures: string[]
}

export class TranslateError extends Error {}

/** Common shorthands people type → codes the endpoints accept. */
const ALIASES: Record<string, string> = {
  zh: 'zh-CN',
  cn: 'zh-CN',
  tw: 'zh-TW',
  jp: 'ja',
  kr: 'ko',
}

export function normalizeLang(lang: string): string {
  const key = lang.trim().toLowerCase()
  return ALIASES[key] ?? lang.trim()
}

/** Inline code spans and bare URLs — translating either makes them unusable. */
const PROTECT_RE = /`[^`]+`|https?:\/\/\S+/g

export function protectSpans(text: string): { masked: string; kept: string[] } {
  const kept: string[] = []
  const masked = text.replace(PROTECT_RE, (match) => {
    kept.push(match)
    return `⟦${kept.length - 1}⟧`
  })
  return { masked, kept }
}

export function restoreSpans(text: string, kept: string[]): string {
  let out = text
  kept.forEach((original, i) => {
    out = out.split(`⟦${i}⟧`).join(original)
  })
  return out
}

/**
 * Which lines should be sent for translation. Fenced code blocks are excluded
 * as a whole, fence markers included — see the module note for why.
 */
export function translatableLines(lines: string[]): boolean[] {
  const out: boolean[] = []
  let fence: string | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (fence === null && (trimmed.startsWith('```') || trimmed.startsWith('~~~'))) {
      fence = trimmed.slice(0, 3)
      out.push(false)
      continue
    }
    if (fence !== null) {
      out.push(false)
      if (trimmed.startsWith(fence)) fence = null
      continue
    }
    out.push(trimmed.length > 0)
  }
  return out
}

/** Group line indices into requests that stay under the size budget. */
export function batchLines(lines: string[], keep: boolean[]): number[][] {
  const groups: number[][] = []
  let current: number[] = []
  let size = 0
  lines.forEach((line, i) => {
    if (!keep[i]) return
    const cost = line.length + 8 // rough &q= + escaping overhead
    if (current.length > 0 && (size + cost > BUDGET || current.length >= MAX_LINES)) {
      groups.push(current)
      current = []
      size = 0
    }
    current.push(i)
    size += cost
  })
  if (current.length > 0) groups.push(current)
  return groups
}

type Batch = { texts: string[]; source: string; target: string }
type BatchOut = { texts: string[]; detected?: string }

/**
 * Google's response has two shapes (reverse-observed, not a published
 * contract): `["out", ...]` when a source language was given, and
 * `[["out","de"], ...]` when it was `auto`. A single item sometimes arrives
 * without the outer array at all.
 */
async function viaGoogle(batch: Batch, opts: TranslateOpts): Promise<BatchOut> {
  const params = new URLSearchParams({
    client: 'dict-chrome-ex',
    sl: batch.source,
    tl: batch.target,
  })
  for (const text of batch.texts) params.append('q', text)

  const doFetch = opts.fetchImpl ?? fetch
  const resp = await doFetch(`${GOOGLE}?${params}`, { signal: opts.signal })
  if (!resp.ok) throw new TranslateError(`HTTP ${resp.status}`)
  const raw: unknown = await resp.json()

  const items = Array.isArray(raw) ? raw : [raw]
  const texts: string[] = []
  let detected: string | undefined
  for (const item of items) {
    if (Array.isArray(item)) {
      texts.push(String(item[0] ?? ''))
      if (!detected && typeof item[1] === 'string') detected = item[1]
    } else {
      texts.push(String(item ?? ''))
    }
  }
  if (texts.length !== batch.texts.length) {
    throw new TranslateError(`got ${texts.length} segments, expected ${batch.texts.length}`)
  }
  return { texts, detected }
}

/** Fallback. No batching and no auto-detect, so it goes one at a time. */
async function viaMyMemory(batch: Batch, opts: TranslateOpts): Promise<BatchOut> {
  const source = batch.source === 'auto' ? 'en' : batch.source
  const doFetch = opts.fetchImpl ?? fetch
  const texts: string[] = []
  for (const text of batch.texts) {
    const params = new URLSearchParams({ q: text, langpair: `${source}|${batch.target}` })
    const resp = await doFetch(`${MYMEMORY}?${params}`, { signal: opts.signal })
    if (!resp.ok) throw new TranslateError(`HTTP ${resp.status}`)
    const payload = (await resp.json()) as {
      responseData?: { translatedText?: string }
      responseDetails?: string
    }
    const out = payload.responseData?.translatedText
    if (!out) throw new TranslateError(payload.responseDetails || 'no translatedText')
    texts.push(out)
  }
  return { texts }
}

const PROVIDERS: Record<ProviderId, (b: Batch, o: TranslateOpts) => Promise<BatchOut>> = {
  google: viaGoogle,
  mymemory: viaMyMemory,
}

/**
 * Translate `input`, preserving line structure. One failing batch degrades to
 * "that part stays in the original language" rather than failing the whole run;
 * `failures` says which. Throws only when nothing at all could be translated.
 */
export async function translate(input: string, opts: TranslateOpts): Promise<TranslateResult> {
  const source = normalizeLang(opts.source)
  const target = normalizeLang(opts.target)
  if (!input.trim()) return { text: '', provider: 'google', failures: [] }

  const lines = input.split('\n')
  const keep = opts.preserveMarkdown === false ? lines.map((l) => l.trim().length > 0) : translatableLines(lines)
  const groups = batchLines(lines, keep)
  if (groups.length === 0) return { text: input, provider: 'google', failures: [] }

  const out = [...lines]
  const failures: string[] = []
  let provider: ProviderId = 'google'
  let detected: string | undefined
  let anySuccess = false
  let lastError: unknown

  // Which providers are still worth asking, best first. A provider that fails
  // is dropped for the rest of the run: when the primary is simply unreachable
  // (no proxy, or a network that blocks it), retrying it once per batch means
  // paying its timeout N times over. Measured: one unreachable batch cost 13s.
  let candidates: ProviderId[] = ['google', 'mymemory']

  for (const group of groups) {
    // Leading whitespace is structure (lists, nesting) and translation eats it.
    const indents = group.map((i) => lines[i].slice(0, lines[i].length - lines[i].trimStart().length))
    const prepared = group.map((i) => protectSpans(lines[i].trim()))
    const batch: Batch = { texts: prepared.map((p) => p.masked), source, target }

    let done = false
    for (const id of [...candidates]) {
      try {
        const result = await PROVIDERS[id](batch, opts)
        result.texts.forEach((text, n) => {
          out[group[n]] = indents[n] + restoreSpans(text, prepared[n].kept)
        })
        provider = id
        if (!detected && result.detected) detected = result.detected
        anySuccess = true
        done = true
        break
      } catch (err) {
        if (opts.signal?.aborted) throw err
        lastError = err
        candidates = candidates.filter((c) => c !== id)
      }
    }
    // Everything failed for this batch — the next one deserves a fresh try
    // rather than being skipped outright (a 429 can pass).
    if (candidates.length === 0) candidates = ['google', 'mymemory']
    if (!done) {
      const where = group.length > 1 ? `lines ${group[0] + 1}-${group[group.length - 1] + 1}` : `line ${group[0] + 1}`
      failures.push(`${where}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
    }
  }

  if (!anySuccess) {
    throw new TranslateError(
      lastError instanceof Error ? lastError.message : 'all translation providers failed',
    )
  }
  return { text: out.join('\n'), provider, detected: source === 'auto' ? detected : undefined, failures }
}

/** Offered in the language pickers. `auto` is source-only. */
export const LANGUAGES = [
  { code: 'zh-CN', label: '中文（简体）' },
  { code: 'zh-TW', label: '中文（繁體）' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
] as const
