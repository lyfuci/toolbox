import { useCallback, useState } from 'react'
import { EncodeDecode } from '@/components/EncodeDecode'

const SAMPLE = 'Hello, 工具箱! 🛠️'

function bytesToBase64(bytes: Uint8Array, urlSafe: boolean): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = btoa(bin)
  if (!urlSafe) return b64
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64ToBytes(input: string, urlSafe: boolean): Uint8Array {
  let s = input.trim()
  if (urlSafe) {
    s = s.replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4 !== 0) s += '='
  }
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function Base64Page() {
  const [urlSafe, setUrlSafe] = useState(false)

  const encode = useCallback(
    (s: string) => bytesToBase64(new TextEncoder().encode(s), urlSafe),
    [urlSafe],
  )
  const decode = useCallback(
    (s: string) => new TextDecoder('utf-8', { fatal: false }).decode(base64ToBytes(s, urlSafe)),
    [urlSafe],
  )

  return (
    <EncodeDecode
      title="Base64"
      description="Base64 编解码，支持 UTF-8 与 URL-safe（-_）变体。所有处理在浏览器本地完成。"
      encode={encode}
      decode={decode}
      sample={SAMPLE}
      options={
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={urlSafe}
            onChange={(e) => setUrlSafe(e.target.checked)}
            className="accent-primary"
          />
          URL-safe (-_)
        </label>
      }
    />
  )
}
