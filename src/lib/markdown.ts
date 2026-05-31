import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Markdown -> sanitized HTML. Rendering is synchronous (marked is configured
 * without async extensions) and the output is run through DOMPurify so the
 * preview can't execute injected scripts. Browser-only because DOMPurify needs
 * a DOM; the markdown tool is the sole consumer.
 */

marked.setOptions({
  gfm: true,
  breaks: false,
})

export function renderMarkdown(src: string): string {
  const raw = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}
