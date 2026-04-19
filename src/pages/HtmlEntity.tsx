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
  return (
    <EncodeDecode
      title="HTML Entity"
      description="HTML 实体编解码。编码使用最小安全集（& < > &quot; &#39;）；解码支持所有命名实体 + 数字实体（十进制 / 十六进制）。"
      encode={encodeHtml}
      decode={decodeHtml}
      sample={SAMPLE}
    />
  )
}
