/**
 * Unix file-permission helpers — octal <-> symbolic <-> per-bit, all pure.
 *
 * We model the 12 permission bits: special (setuid/setgid/sticky) in the high
 * octal digit, then owner/group/other rwx. Everything is client-side math.
 */

export type Klass = 'owner' | 'group' | 'other'
export const CLASSES: Klass[] = ['owner', 'group', 'other']
export type Perm = 'r' | 'w' | 'x'

export type PermSet = {
  owner: { r: boolean; w: boolean; x: boolean }
  group: { r: boolean; w: boolean; x: boolean }
  other: { r: boolean; w: boolean; x: boolean }
  setuid: boolean
  setgid: boolean
  sticky: boolean
}

export function emptyPerms(): PermSet {
  return {
    owner: { r: false, w: false, x: false },
    group: { r: false, w: false, x: false },
    other: { r: false, w: false, x: false },
    setuid: false,
    setgid: false,
    sticky: false,
  }
}

/** Parse a 3- or 4-digit octal string (e.g. "755", "4755") into a PermSet. */
export function fromOctal(octal: string): PermSet | null {
  const s = octal.trim()
  if (!/^[0-7]{3,4}$/.test(s)) return null
  const digits = s.length === 3 ? '0' + s : s
  const special = Number(digits[0])
  const triad = (n: number) => ({
    r: (n & 4) !== 0,
    w: (n & 2) !== 0,
    x: (n & 1) !== 0,
  })
  return {
    owner: triad(Number(digits[1])),
    group: triad(Number(digits[2])),
    other: triad(Number(digits[3])),
    setuid: (special & 4) !== 0,
    setgid: (special & 2) !== 0,
    sticky: (special & 1) !== 0,
  }
}

/** Render a PermSet as a 4-digit octal string (e.g. "0755"). */
export function toOctal(p: PermSet): string {
  const triad = (t: { r: boolean; w: boolean; x: boolean }) =>
    (t.r ? 4 : 0) + (t.w ? 2 : 0) + (t.x ? 1 : 0)
  const special = (p.setuid ? 4 : 0) + (p.setgid ? 2 : 0) + (p.sticky ? 1 : 0)
  return `${special}${triad(p.owner)}${triad(p.group)}${triad(p.other)}`
}

/**
 * Render a PermSet as a 9-char symbolic string with special bits folded into
 * the x positions (e.g. "rwxr-xr-x", "rwsr-sr-t"), matching `ls -l`.
 */
export function toSymbolic(p: PermSet): string {
  const part = (t: { r: boolean; w: boolean; x: boolean }, special: boolean, lower: string, upper: string) => {
    const r = t.r ? 'r' : '-'
    const w = t.w ? 'w' : '-'
    let x: string
    if (special) x = t.x ? lower : upper
    else x = t.x ? 'x' : '-'
    return r + w + x
  }
  return (
    part(p.owner, p.setuid, 's', 'S') +
    part(p.group, p.setgid, 's', 'S') +
    part(p.other, p.sticky, 't', 'T')
  )
}

/** Parse a 9-char symbolic permission string (no leading file-type char). */
export function fromSymbolic(sym: string): PermSet | null {
  const s = sym.trim()
  const body = s.length === 10 ? s.slice(1) : s // tolerate a leading type char
  if (body.length !== 9) return null
  if (!/^[rwxsStT-]{9}$/.test(body)) return null
  const p = emptyPerms()
  const triad = (chunk: string, klass: Klass, specialFlag: 'setuid' | 'setgid' | 'sticky', lower: string, upper: string) => {
    p[klass].r = chunk[0] === 'r'
    p[klass].w = chunk[1] === 'w'
    const xc = chunk[2]
    if (xc === 'x') p[klass].x = true
    else if (xc === lower) { p[klass].x = true; p[specialFlag] = true }
    else if (xc === upper) { p[klass].x = false; p[specialFlag] = true }
    else if (xc === '-') p[klass].x = false
    else return false
    return true
  }
  if (!triad(body.slice(0, 3), 'owner', 'setuid', 's', 'S')) return null
  if (!triad(body.slice(3, 6), 'group', 'setgid', 's', 'S')) return null
  if (!triad(body.slice(6, 9), 'other', 'sticky', 't', 'T')) return null
  return p
}

/** A plain-English summary line, e.g. "Owner: read, write, execute; …". */
export function describe(p: PermSet): string {
  const names: Record<Perm, string> = { r: 'read', w: 'write', x: 'execute' }
  const list = (t: { r: boolean; w: boolean; x: boolean }) => {
    const parts = (['r', 'w', 'x'] as Perm[]).filter((k) => t[k]).map((k) => names[k])
    return parts.length ? parts.join(', ') : 'none'
  }
  const extras: string[] = []
  if (p.setuid) extras.push('setuid')
  if (p.setgid) extras.push('setgid')
  if (p.sticky) extras.push('sticky')
  let out = `Owner: ${list(p.owner)}; Group: ${list(p.group)}; Other: ${list(p.other)}`
  if (extras.length) out += ` (${extras.join(', ')})`
  return out
}
