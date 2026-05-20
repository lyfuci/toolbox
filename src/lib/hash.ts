import { md5 } from 'js-md5'
import {
  bytesToBase64 as _bytesToBase64,
  bytesToBase64Url,
  bytesToHex as _bytesToHex,
  base64ToBytes,
  hexToBytes,
} from './file-bytes'

export type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

export const HASH_ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

/** Re-export for backwards compatibility with the original module surface. */
export const bytesToHex = _bytesToHex
export const bytesToBase64 = (b: Uint8Array) => _bytesToBase64(b, false)

/** Encoding the digest / signature gets serialized in. */
export type DigestEncoding = 'hex' | 'base64' | 'base64url'

export function encodeBytes(bytes: Uint8Array, encoding: DigestEncoding): string {
  if (encoding === 'hex') return _bytesToHex(bytes)
  if (encoding === 'base64') return _bytesToBase64(bytes, false)
  return bytesToBase64Url(bytes)
}

/** Hash arbitrary bytes; returns the raw digest. */
export async function hashBytes(algo: HashAlgo, bytes: Uint8Array): Promise<Uint8Array> {
  if (algo === 'MD5') {
    const buf = md5.arrayBuffer(bytes)
    return new Uint8Array(buf)
  }
  // crypto.subtle.digest accepts BufferSource; copy into a fresh ArrayBuffer to
  // sidestep any TypedArray-subtype quirks in older TS DOM lib targets.
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const buf = await crypto.subtle.digest(algo, ab)
  return new Uint8Array(buf)
}

/** Convenience: hash text, return hex (matches the pre-refactor signature). */
export async function hashText(algo: HashAlgo, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  return _bytesToHex(await hashBytes(algo, bytes))
}

export type HmacAlgo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

export const HMAC_ALGOS: HmacAlgo[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

export type KeyEncoding = 'utf-8' | 'hex' | 'base64'

/** Convert key text (whose interpretation depends on `enc`) into raw bytes. */
export function decodeKey(key: string, enc: KeyEncoding): Uint8Array {
  if (enc === 'utf-8') return new TextEncoder().encode(key)
  if (enc === 'hex') return hexToBytes(key)
  // base64 — accept padded or url-safe variants.
  const looksUrlSafe = /[-_]/.test(key)
  return base64ToBytes(key, looksUrlSafe)
}

/** HMAC arbitrary key + data bytes. */
export async function hmacBytes(
  algo: HmacAlgo,
  keyBytes: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  // Same defensive copy as in hashBytes — importKey is happiest with a plain ArrayBuffer.
  const keyAb = new ArrayBuffer(keyBytes.byteLength)
  new Uint8Array(keyAb).set(keyBytes)
  const dataAb = new ArrayBuffer(data.byteLength)
  new Uint8Array(dataAb).set(data)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyAb,
    { name: 'HMAC', hash: algo },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, dataAb)
  return new Uint8Array(sig)
}

/** Backwards-compatible text wrapper (utf-8 key + utf-8 text). */
export async function hmacText(
  algo: HmacAlgo,
  key: string,
  text: string,
): Promise<Uint8Array> {
  const enc = new TextEncoder()
  return hmacBytes(algo, enc.encode(key), enc.encode(text))
}
