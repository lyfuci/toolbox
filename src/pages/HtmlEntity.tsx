import { useTranslation } from 'react-i18next'
import { EncodeDecode } from '@/components/EncodeDecode'

const SAMPLE = `<div class="hello">"工具箱" & friends — 5 < 10</div>`

function encodeHtml(s: string): string {
  // Minimal-but-safe set: matches what React / templating engines escape for
  // textContent → HTML insertion. Use plain replace so whitespace stays raw.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeHtml(s: string): string {
  // Use the browser's parser so we get every named + numeric (decimal/hex)
  // entity for free. <textarea> never executes content during innerHTML
  // assignment, so this is XSS-safe even for hostile input.
  const ta = document.createElement('textarea')
  ta.innerHTML = s
  return ta.value
}

export function HtmlEntityPage() {
  const { t } = useTranslation()
  return (
    <EncodeDecode
      title={t('tools.html-entity.name')}
      description={t('pages.html-entity.description')}
      encode={encodeHtml}
      decode={decodeHtml}
      sample={SAMPLE}
    />
  )
}
