/**
 * Minimal RFC 4180-ish CSV parser with configurable options.
 * - `delimiter` selects the field separator (default `,`).
 * - `quote` selects the quote character (default `"`).
 * - Supports quoted fields containing the delimiter, newlines, and escaped
 *   quotes (the quote char doubled).
 * - Treats both \r\n and \n as row separators.
 */
export type ParseCSVOptions = {
  delimiter?: string
  quote?: string
}

export type CsvToJsonOptions = ParseCSVOptions & {
  /** If true, the first row of the CSV becomes the key list. Default true. */
  header?: boolean
  /** If true, numeric and boolean string fields are coerced. Default false. */
  infer?: boolean
}

export type JsonToCsvOptions = ParseCSVOptions

export function parseCSV(text: string, opts: ParseCSVOptions = {}): string[][] {
  const delimiter = opts.delimiter ?? ','
  const quote = opts.quote ?? '"'
  if (delimiter.length !== 1) throw new Error('delimiter must be a single character')
  if (quote.length !== 1) throw new Error('quote must be a single character')

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuote = false
  let i = 0
  const n = text.length

  while (i < n) {
    const c = text[i]
    if (inQuote) {
      if (c === quote) {
        if (text[i + 1] === quote) {
          field += quote
          i += 2
          continue
        }
        inQuote = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === quote && field === '') {
      inQuote = true
      i++
      continue
    }
    if (c === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  // Flush the final field/row if the input doesn't end with a newline.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function coerce(value: string): unknown {
  if (value === '') return ''
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  // Strict numeric — no leading + or NaN/Infinity strings.
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(value)) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return value
}

export function csvToJson(
  text: string,
  opts: CsvToJsonOptions = {},
): Record<string, unknown>[] {
  const header = opts.header ?? true
  const infer = opts.infer ?? false
  const rows = parseCSV(text, opts)
  if (rows.length === 0) return []
  let keys: string[]
  let data: string[][]
  if (header) {
    keys = rows[0]
    data = rows.slice(1)
  } else {
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0)
    keys = Array.from({ length: width }, (_, i) => `col${i + 1}`)
    data = rows
  }
  return data.map((row) =>
    Object.fromEntries(
      keys.map((h, i) => {
        const raw = row[i] ?? ''
        return [h, infer ? coerce(raw) : raw]
      }),
    ),
  )
}

function escapeField(s: string, delimiter: string, quote: string): string {
  const needsQuote =
    s.includes(delimiter) || s.includes(quote) || s.includes('\n') || s.includes('\r')
  if (needsQuote) {
    return quote + s.split(quote).join(quote + quote) + quote
  }
  return s
}

export function jsonToCsv(data: unknown, opts: JsonToCsvOptions = {}): string {
  const delimiter = opts.delimiter ?? ','
  const quote = opts.quote ?? '"'
  if (!Array.isArray(data)) {
    throw new Error('Expected root to be an array of objects')
  }
  if (data.length === 0) return ''
  // Collect keys in insertion order, but include any keys later rows introduce.
  const keys: string[] = []
  for (const row of data) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new Error('Each array element must be an object')
    }
    for (const k of Object.keys(row as object)) {
      if (!keys.includes(k)) keys.push(k)
    }
  }
  const lines = [keys.map((k) => escapeField(k, delimiter, quote)).join(delimiter)]
  for (const row of data) {
    const obj = row as Record<string, unknown>
    lines.push(
      keys
        .map((k) => {
          const v = obj[k]
          if (v == null) return ''
          if (typeof v === 'object') return escapeField(JSON.stringify(v), delimiter, quote)
          return escapeField(String(v), delimiter, quote)
        })
        .join(delimiter),
    )
  }
  return lines.join('\n')
}
