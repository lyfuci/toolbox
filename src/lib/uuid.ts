import { md5 } from 'js-md5'

// Standard RFC 4122 namespace UUIDs.
export const UUID_NAMESPACES = {
  DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
} as const
export type UuidNamespace = keyof typeof UUID_NAMESPACES

function hex(n: number): string {
  return n.toString(16).padStart(2, '0')
}

function bytesToUuid(b: Uint8Array): string {
  // 4-2-2-2-6
  const h: string[] = []
  for (let i = 0; i < 16; i++) h.push(hex(b[i]))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
}

export function parseUuidBytes(uuid: string): Uint8Array | null {
  const s = uuid.replace(/[{}-]/g, '').trim().toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(s)) return null
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

// UUIDv7: 48-bit unix ms + 4-bit version + 12-bit rand + 2-bit variant + 62-bit rand.
export function uuidv7(): string {
  const ts = BigInt(Date.now())
  const b = new Uint8Array(16)
  // 48-bit timestamp (big-endian)
  b[0] = Number((ts >> 40n) & 0xffn)
  b[1] = Number((ts >> 32n) & 0xffn)
  b[2] = Number((ts >> 24n) & 0xffn)
  b[3] = Number((ts >> 16n) & 0xffn)
  b[4] = Number((ts >> 8n) & 0xffn)
  b[5] = Number(ts & 0xffn)
  // Fill bytes 6..15 with random.
  const rand = new Uint8Array(10)
  crypto.getRandomValues(rand)
  b.set(rand, 6)
  // Set version (7) in high nibble of byte 6.
  b[6] = (b[6] & 0x0f) | 0x70
  // Set variant (10xx) in byte 8.
  b[8] = (b[8] & 0x3f) | 0x80
  return bytesToUuid(b)
}

// UUIDv4 via native crypto.
export function uuidv4(): string {
  return crypto.randomUUID()
}

// UUIDv1: 60-bit timestamp (100ns intervals since 1582-10-15) + clock seq + node.
let _v1Clock = -1
let _v1Last = -1n
const _v1Node = (() => {
  const n = new Uint8Array(6)
  crypto.getRandomValues(n)
  n[0] |= 0x01 // multicast bit per RFC 4122 §4.5
  return n
})()
export function uuidv1(): string {
  // 100ns intervals since UUID epoch 1582-10-15.
  const offset = 12219292800000n // ms between 1582-10-15 and 1970-01-01
  let ts = (BigInt(Date.now()) + offset) * 10000n
  if (ts === _v1Last) ts += 1n
  if (_v1Clock < 0) {
    const seqBuf = new Uint8Array(2)
    crypto.getRandomValues(seqBuf)
    _v1Clock = ((seqBuf[0] << 8) | seqBuf[1]) & 0x3fff
  }
  _v1Last = ts
  const tl = Number(ts & 0xffffffffn)
  const tm = Number((ts >> 32n) & 0xffffn)
  const th = Number((ts >> 48n) & 0x0fffn) | 0x1000 // version 1
  const cs = _v1Clock | 0x8000 // variant 10xx
  const b = new Uint8Array(16)
  b[0] = (tl >>> 24) & 0xff
  b[1] = (tl >>> 16) & 0xff
  b[2] = (tl >>> 8) & 0xff
  b[3] = tl & 0xff
  b[4] = (tm >>> 8) & 0xff
  b[5] = tm & 0xff
  b[6] = (th >>> 8) & 0xff
  b[7] = th & 0xff
  b[8] = (cs >>> 8) & 0xff
  b[9] = cs & 0xff
  b.set(_v1Node, 10)
  return bytesToUuid(b)
}

function md5Bytes(input: Uint8Array): Uint8Array {
  const buf = md5.arrayBuffer(input)
  return new Uint8Array(buf)
}

async function sha1Bytes(input: Uint8Array): Promise<Uint8Array> {
  // Copy into a fresh ArrayBuffer so the SubtleCrypto type-checker (which
  // narrows BufferSource to ArrayBuffer-backed views) is happy.
  const copy = new Uint8Array(input.length)
  copy.set(input)
  const buf = await crypto.subtle.digest('SHA-1', copy.buffer)
  return new Uint8Array(buf)
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

function setVersionVariant(bytes: Uint8Array, version: number): Uint8Array {
  const out = bytes.slice(0, 16)
  out[6] = (out[6] & 0x0f) | (version << 4)
  out[8] = (out[8] & 0x3f) | 0x80
  return out
}

export function uuidv3(namespace: string, name: string): string {
  const nsBytes = parseUuidBytes(namespace)
  if (!nsBytes) throw new Error('Invalid namespace UUID')
  const nameBytes = new TextEncoder().encode(name)
  const hash = md5Bytes(concatBytes(nsBytes, nameBytes))
  return bytesToUuid(setVersionVariant(hash, 3))
}

export async function uuidv5(namespace: string, name: string): Promise<string> {
  const nsBytes = parseUuidBytes(namespace)
  if (!nsBytes) throw new Error('Invalid namespace UUID')
  const nameBytes = new TextEncoder().encode(name)
  const hash = await sha1Bytes(concatBytes(nsBytes, nameBytes))
  return bytesToUuid(setVersionVariant(hash, 5))
}

export type UuidInfo = {
  version: number | null
  variant: string
  timestampMs: number | null
}

export function decodeUuid(uuid: string): UuidInfo | null {
  const b = parseUuidBytes(uuid)
  if (!b) return null
  const version = (b[6] >> 4) & 0x0f
  // Variant is encoded in top bits of byte 8.
  const v = b[8] >> 5
  let variant = 'reserved'
  if ((b[8] & 0x80) === 0) variant = 'NCS (legacy)'
  else if ((b[8] & 0xc0) === 0x80) variant = 'RFC 4122'
  else if ((b[8] & 0xe0) === 0xc0) variant = 'Microsoft (legacy)'
  else if (v === 7) variant = 'reserved for future'

  let ts: number | null = null
  if (version === 1) {
    const tl = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
    const tm = (b[4] << 8) | b[5]
    const th = ((b[6] & 0x0f) << 8) | b[7]
    const hundredNs =
      (BigInt(th) << 48n) | (BigInt(tm) << 32n) | BigInt(tl >>> 0)
    const ms = hundredNs / 10000n - 12219292800000n
    ts = Number(ms)
  } else if (version === 7) {
    const ms =
      (BigInt(b[0]) << 40n) |
      (BigInt(b[1]) << 32n) |
      (BigInt(b[2]) << 24n) |
      (BigInt(b[3]) << 16n) |
      (BigInt(b[4]) << 8n) |
      BigInt(b[5])
    ts = Number(ms)
  }
  return { version, variant, timestampMs: ts }
}

export type UuidFormat = {
  uppercase: boolean
  noHyphens: boolean
  braces: boolean
}

export function formatUuid(uuid: string, fmt: UuidFormat): string {
  let s = uuid
  if (fmt.noHyphens) s = s.replace(/-/g, '')
  if (fmt.uppercase) s = s.toUpperCase()
  if (fmt.braces) s = `{${s}}`
  return s
}

export function uuidToBase64(uuid: string): string {
  const b = parseUuidBytes(uuid)
  if (!b) return ''
  let bin = ''
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i])
  return btoa(bin)
}
