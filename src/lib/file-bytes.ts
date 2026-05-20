/**
 * Shared binary helpers used by the encode/decode + hash tools.
 *
 * - byte ↔ base64 (with optional URL-safe variant) and base64-url-only convenience
 * - byte ↔ hex
 * - best-effort MIME sniff from leading magic bytes
 * - browser blob download
 *
 * Everything stays client-side — no Node-only APIs.
 */

export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = btoa(bin)
  if (!urlSafe) return b64
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes, true)
}

export function base64ToBytes(input: string, urlSafe = false): Uint8Array {
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

export function bytesToHex(bytes: Uint8Array, sep = ''): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(sep)
}

export function hexToBytes(input: string): Uint8Array {
  // Tolerate the common visual separators users paste in.
  const clean = input.replace(/[\s:,\-_]+/g, '').toLowerCase()
  if (clean.length === 0) return new Uint8Array(0)
  if (clean.length % 2 !== 0) throw new Error('hex string must have an even number of characters')
  if (!/^[0-9a-f]*$/.test(clean)) throw new Error('contains non-hex characters')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Best-effort file-type sniff. Falls back to `application/octet-stream`. */
export function sniffMime(bytes: Uint8Array): string {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  // GIF: "GIF8"
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'image/gif'
  }
  // PDF: "%PDF-"
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf'
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  // ZIP / docx / xlsx / etc: PK\x03\x04
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return 'application/zip'
  }
  return 'application/octet-stream'
}

/** Trigger a browser download for the given bytes. Returns the object URL it created (already revoked). */
export function downloadBlob(bytes: Uint8Array, filename: string, mime?: string): void {
  // Use a fresh ArrayBuffer copy so Blob never holds a reference to a SharedArrayBuffer view.
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const blob = new Blob([ab], { type: mime || sniffMime(bytes) })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Defer revoke so Safari/iOS finishes the download click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Format a byte count as a human-readable string (e.g. "1.2 MiB"). */
export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MiB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`
}
