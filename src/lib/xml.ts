/**
 * Pretty-print XML by parsing with the browser's DOMParser, then walking the
 * tree and re-serializing with consistent indentation.
 *
 * Throws on malformed XML (DOMParser surfaces parse errors as a
 * <parsererror> element in the output document).
 */
export function formatXml(xml: string, indent = 2): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const errEl = doc.querySelector('parsererror')
  if (errEl) {
    throw new Error(errEl.textContent?.trim() || 'XML 解析失败')
  }
  return serialize(doc.documentElement, 0, indent).trimEnd()
}

export function minifyXml(xml: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const errEl = doc.querySelector('parsererror')
  if (errEl) {
    throw new Error(errEl.textContent?.trim() || 'XML 解析失败')
  }
  return new XMLSerializer().serializeToString(doc).replace(/>\s+</g, '><').trim()
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;')
}

function serialize(node: Node, depth: number, indent: number): string {
  const pad = ' '.repeat(depth * indent)

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim()
    return text ? pad + escapeText(text) + '\n' : ''
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return `${pad}<!--${node.textContent ?? ''}-->\n`
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as Element
  const attrs = Array.from(el.attributes)
    .map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
    .join('')

  const children = Array.from(el.childNodes).filter((c) => {
    if (c.nodeType === Node.TEXT_NODE) return (c.textContent?.trim() ?? '') !== ''
    return true
  })

  if (children.length === 0) {
    return `${pad}<${el.tagName}${attrs} />\n`
  }
  // Single text child → one-liner.
  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
    const text = children[0].textContent?.trim() ?? ''
    return `${pad}<${el.tagName}${attrs}>${escapeText(text)}</${el.tagName}>\n`
  }
  let out = `${pad}<${el.tagName}${attrs}>\n`
  for (const child of children) out += serialize(child, depth + 1, indent)
  out += `${pad}</${el.tagName}>\n`
  return out
}
