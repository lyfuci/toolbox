import { useCallback, useState } from 'react'
import { EncodeDecode } from '@/components/EncodeDecode'

const SAMPLE = 'Hello 工具箱'

function bytesToHex(bytes: Uint8Array, sep: string): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(sep)
}

function hexToBytes(input: string): Uint8Array {
  // Tolerate the common visual separators users paste in.
  const clean = input.replace(/[\s:,\-_]+/g, '').toLowerCase()
  if (clean.length === 0) return new Uint8Array(0)
  if (clean.length % 2 !== 0) throw new Error('hex 字符数不是偶数')
  if (!/^[0-9a-f]*$/.test(clean)) throw new Error('包含非 hex 字符')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function HexPage() {
  const [withSpace, setWithSpace] = useState(false)

  const encode = useCallback(
    (s: string) => bytesToHex(new TextEncoder().encode(s), withSpace ? ' ' : ''),
    [withSpace],
  )
  const decode = useCallback(
    (s: string) => new TextDecoder('utf-8', { fatal: false }).decode(hexToBytes(s)),
    [],
  )

  return (
    <EncodeDecode
      title="Hex"
      description="文本 ↔ 十六进制字节（UTF-8）。解码时自动忽略空格 / 冒号 / 逗号 / 短横 / 下划线分隔。"
      encode={encode}
      decode={decode}
      sample={SAMPLE}
      options={
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={withSpace}
            onChange={(e) => setWithSpace(e.target.checked)}
            className="accent-primary"
          />
          编码时按字节加空格
        </label>
      }
    />
  )
}
