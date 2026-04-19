/**
 * Minimal RFC 4180-ish CSV parser.
 * - Recognizes comma as the field separator.
 * - Supports quoted fields containing commas, newlines, and escaped quotes ("").
 * - Treats both \r\n and \n as row separators.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuote = false
  let i = 0
  const n = text.length

  while (i < n) {
    const c = text[i]
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
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
    if (c === '"' && field === '') {
      inQuote = true
      i++
      continue
    }
    if (c === ',') {
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

export function csvToJson(text: string): Record<string, string>[] {
  const rows = parseCSV(text)
  if (rows.length === 0) return []
  const [header, ...data] = rows
  return data.map((row) =>
    Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])),
  )
}

function escapeField(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function jsonToCsv(data: unknown): string {
  if (!Array.isArray(data)) {
    throw new Error('期望根节点是数组（array of objects）')
  }
  if (data.length === 0) return ''
  // Collect keys in insertion order, but include any keys later rows introduce.
  const keys: string[] = []
  for (const row of data) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new Error('数组每个元素必须是对象')
    }
    for (const k of Object.keys(row as object)) {
      if (!keys.includes(k)) keys.push(k)
    }
  }
  const lines = [keys.map(escapeField).join(',')]
  for (const row of data) {
    const obj = row as Record<string, unknown>
    lines.push(
      keys
        .map((k) => {
          const v = obj[k]
          if (v == null) return ''
          if (typeof v === 'object') return escapeField(JSON.stringify(v))
          return escapeField(String(v))
        })
        .join(','),
    )
  }
  return lines.join('\n')
}
