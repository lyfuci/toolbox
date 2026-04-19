import { md5 } from 'js-md5'

export type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

export const HASH_ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

export function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0')
  return s
}

export async function hashText(algo: HashAlgo, text: string): Promise<string> {
  if (algo === 'MD5') return md5(text)
  const bytes = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest(algo, bytes)
  return bytesToHex(new Uint8Array(buf))
}

export type HmacAlgo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

export const HMAC_ALGOS: HmacAlgo[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

export async function hmacText(
  algo: HmacAlgo,
  key: string,
  text: string,
): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: algo },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(text))
  return new Uint8Array(sig)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
