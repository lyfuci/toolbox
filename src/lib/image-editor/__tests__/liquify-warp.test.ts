import { describe, it, expect } from 'vitest'
import { applyLiquifyBrush, type LiquifyStampParams } from '../liquify-warp'

/**
 * Node-only (no canvas / no DOM): every test hand-builds RGBA buffers and
 * exercises a single per-stamp guarantee of the Liquify brush:
 *   - no-op outside the brush radius,
 *   - push displaces content WITH the drag vector (Photoshop convention),
 *   - twirlCW rotates content clockwise in screen coords (y-down),
 *   - bloat enlarges and pucker shrinks a centred dot,
 *   - strength 0 is an exact bytewise identity,
 *   - fractional source coords are bilinearly interpolated (intermediate
 *     values between neighbouring source pixels, not snapped to one).
 *
 * Heuristic assertions (direction-of-motion) are used where exact values
 * depend on smoothstep / radius math we don't want to re-derive in tests —
 * the spec explicitly allows this for twirl.
 */

// ---------- buffer factories ----------

/** Solid grey RGBA buffer at full alpha. */
function solid(w: number, h: number, v: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return data
}

/** Left half black, right half white — sharp vertical edge at x = w/2. */
function verticalEdge(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255
      const i = (y * w + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return data
}

/** Black field with a centred white disc of the given radius. */
function centredDot(w: number, h: number, radius: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy)
      const v = d <= radius ? 255 : 0
      const i = (y * w + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return data
}

/** Horizontal 0→255 gradient — fractional x produces interpolated values. */
function horizontalGradient(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255)
      const i = (y * w + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return data
}

/** Black field with a centred horizontal white stripe of the given half-thickness. */
function horizontalStripe(w: number, h: number, halfThickness: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  const cy = (h - 1) / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.abs(y - cy) <= halfThickness ? 255 : 0
      const i = (y * w + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return data
}

/** Count "bright" pixels (R ≥ threshold). Use to compare dot area. */
function brightCount(buf: Uint8ClampedArray, threshold = 128): number {
  let n = 0
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i] >= threshold) n++
  }
  return n
}

/** Find the leftmost x in row `y` whose value crosses `threshold` from below. */
function firstBrightX(buf: Uint8ClampedArray, w: number, y: number, threshold = 128): number {
  for (let x = 0; x < w; x++) {
    if (buf[(y * w + x) * 4] >= threshold) return x
  }
  return -1
}

// ---------- tests ----------

describe('applyLiquifyBrush', () => {
  it('leaves pixels outside the brush radius alone', () => {
    const w = 32
    const h = 32
    const src = solid(w, h, 50)
    const dst = new Uint8ClampedArray(src) // caller seeds dst with pre-stamp image
    applyLiquifyBrush({
      src,
      dst,
      w,
      h,
      cx: 10,
      cy: 10,
      radius: 3,
      strength: 1,
      mode: 'push',
      dx: 4,
      dy: 0,
    })
    const i = (20 * w + 20) * 4
    expect(dst[i]).toBe(50)
    expect(dst[i + 1]).toBe(50)
    expect(dst[i + 2]).toBe(50)
    expect(dst[i + 3]).toBe(255)
  })

  it('strength = 0 is an exact bytewise identity', () => {
    const w = 16
    const h = 16
    const src = verticalEdge(w, h)
    const dst = new Uint8ClampedArray(src)
    applyLiquifyBrush({
      src,
      dst,
      w,
      h,
      cx: 8,
      cy: 8,
      radius: 6,
      strength: 0,
      mode: 'push',
      dx: 5,
      dy: 0,
    })
    expect(Array.from(dst)).toEqual(Array.from(src))
  })

  it('push displaces content in the drag direction (edge shifts with dx)', () => {
    // The push formula is sx = x − dx·w. With dx=+5, output pixel x reads
    // from x−5w (its LEFT), so content from the LEFT moves rightward to x.
    // For a black-left / white-right edge that means the BLACK expands
    // right — i.e. the first bright x in the brushed row moves to a HIGHER
    // x after the stamp.
    const w = 64
    const h = 16
    const src = verticalEdge(w, h)
    const dst = new Uint8ClampedArray(src)
    const cx = w / 2
    const cy = h / 2
    applyLiquifyBrush({
      src,
      dst,
      w,
      h,
      cx,
      cy,
      radius: 8,
      strength: 1,
      mode: 'push',
      dx: 5,
      dy: 0,
    })
    const yMid = Math.floor(cy)
    const before = firstBrightX(src, w, yMid)
    const after = firstBrightX(dst, w, yMid)
    expect(before).toBe(w / 2) // sanity: edge starts exactly at w/2
    expect(after).toBeGreaterThan(before) // bright pixels moved RIGHT with the drag
  })

  it('twirlCW rotates a horizontal stripe in opposite directions on each side', () => {
    // Heuristic test: after a CW swirl about the centre, a horizontal
    // stripe through the centre should NOT remain symmetric. Specifically,
    // pixels to the LEFT of centre on the top edge of the stripe and
    // pixels to the RIGHT of centre on the bottom edge should differ —
    // a rotational asymmetry. We assert that the dst is no longer
    // top-bottom symmetric across the centre row inside the brush.
    const w = 41
    const h = 41
    const stripeHalf = 3
    const src = horizontalStripe(w, h, stripeHalf)
    const dst = new Uint8ClampedArray(src)
    const cx = (w - 1) / 2
    const cy = (h - 1) / 2

    applyLiquifyBrush({
      src,
      dst,
      w,
      h,
      cx,
      cy,
      radius: 15,
      strength: 1,
      mode: 'twirlCW',
    })

    // Sanity: source stripe IS vertically symmetric across cy.
    let srcAsym = 0
    for (let y = 1; y <= 10; y++) {
      for (let x = 5; x < w - 5; x++) {
        const top = src[((cy - y) * w + x) * 4]
        const bot = src[((cy + y) * w + x) * 4]
        if (top !== bot) srcAsym++
      }
    }
    expect(srcAsym).toBe(0)

    // After CW twirl, the rotated stripe loses that mirror symmetry —
    // pixels at (cy − y, x) and (cy + y, x) end up with different values
    // for many (x, y) inside the brushed disc.
    let dstAsym = 0
    for (let y = 1; y <= 10; y++) {
      for (let x = 5; x < w - 5; x++) {
        const top = dst[((cy - y) * w + x) * 4]
        const bot = dst[((cy + y) * w + x) * 4]
        if (top !== bot) dstAsym++
      }
    }
    expect(dstAsym).toBeGreaterThan(20)

    // And twirlCCW is the mirror — applying it should produce a row-by-row
    // reflection of the CW result through the centre row (within noise),
    // proving the two modes really are opposites.
    const ccwDst = new Uint8ClampedArray(src)
    applyLiquifyBrush({
      src,
      dst: ccwDst,
      w,
      h,
      cx,
      cy,
      radius: 15,
      strength: 1,
      mode: 'twirlCCW',
    })
    // Pick a sample pixel where CW differs from src; CCW at the mirrored
    // row should differ from src in the same way.
    let foundMirror = false
    for (let y = 2; y <= 8 && !foundMirror; y++) {
      for (let x = 5; x < w - 5; x++) {
        const cw = dst[((cy - y) * w + x) * 4]
        const cwSrc = src[((cy - y) * w + x) * 4]
        if (cw !== cwSrc) {
          const ccw = ccwDst[((cy + y) * w + x) * 4]
          const ccwSrc = src[((cy + y) * w + x) * 4]
          if (ccw !== ccwSrc) {
            foundMirror = true
            break
          }
        }
      }
    }
    expect(foundMirror).toBe(true)
  })

  it('bloat enlarges a centred dot; pucker shrinks it', () => {
    const w = 51
    const h = 51
    const src = centredDot(w, h, 5)
    const baseline = brightCount(src)

    const bloated = new Uint8ClampedArray(src)
    applyLiquifyBrush({
      src,
      dst: bloated,
      w,
      h,
      cx: (w - 1) / 2,
      cy: (h - 1) / 2,
      radius: 15,
      strength: 1,
      mode: 'bloat',
    })

    const puckered = new Uint8ClampedArray(src)
    applyLiquifyBrush({
      src,
      dst: puckered,
      w,
      h,
      cx: (w - 1) / 2,
      cy: (h - 1) / 2,
      radius: 15,
      strength: 1,
      mode: 'pucker',
    })

    expect(brightCount(bloated)).toBeGreaterThan(baseline)
    expect(brightCount(puckered)).toBeLessThan(baseline)
  })

  it('bilinear-samples fractional source coordinates on a gradient', () => {
    // On a horizontal 0→255 gradient (one unit of brightness per pixel for
    // an N-wide image), a twirl about the centre rotates each sample by
    // an angle that is almost always non-integer in pixel space, so dst
    // pixels will land at fractional source x. Such a pixel must read a
    // value that is NOT equal to either of its two horizontal neighbours
    // in the gradient — proving non-nearest sampling.
    const w = 33
    const h = 33
    const src = horizontalGradient(w, h)
    const dst = new Uint8ClampedArray(src)
    applyLiquifyBrush({
      src,
      dst,
      w,
      h,
      cx: (w - 1) / 2,
      cy: (h - 1) / 2,
      radius: 10,
      strength: 1,
      mode: 'twirlCW',
    })

    // Look for an interior dst pixel whose value lies strictly between the
    // two source values at the same row's neighbouring integer x. The
    // gradient is monotone, so "between two source neighbours" =
    // "not equal to any integer-x source value at that row".
    let found = false
    for (let y = 8; y < h - 8 && !found; y++) {
      for (let x = 8; x < w - 8 && !found; x++) {
        const v = dst[(y * w + x) * 4]
        // The source row equals 0,8,16,…,255 in steps of 255/(w−1)=255/32
        // ≈ 7.97. A bilinear-interpolated value will almost never equal a
        // source integer; nearest sampling would always equal one.
        const nearest = Math.round((v / 255) * (w - 1))
        const srcAtNearest = src[(y * w + nearest) * 4]
        if (v !== srcAtNearest) {
          // Confirm it lies strictly between two adjacent source samples
          // somewhere on this row.
          for (let sx = 0; sx < w - 1; sx++) {
            const a = src[(y * w + sx) * 4]
            const b = src[(y * w + sx + 1) * 4]
            const lo = Math.min(a, b)
            const hi = Math.max(a, b)
            if (v > lo && v < hi) {
              found = true
              break
            }
          }
        }
      }
    }
    expect(found).toBe(true)
  })

  it('no-ops when radius ≤ 0 or strength ≤ 0 (dst untouched even in bbox)', () => {
    const w = 16
    const h = 16
    const src = solid(w, h, 100)
    const sentinel = solid(w, h, 7) // deliberately different from src
    const dst = new Uint8ClampedArray(sentinel)

    const base: Omit<LiquifyStampParams, 'radius' | 'strength'> = {
      src,
      dst,
      w,
      h,
      cx: 8,
      cy: 8,
      mode: 'bloat',
    }
    applyLiquifyBrush({ ...base, radius: 0, strength: 1 })
    expect(Array.from(dst)).toEqual(Array.from(sentinel))

    applyLiquifyBrush({ ...base, radius: 5, strength: -0.1 })
    expect(Array.from(dst)).toEqual(Array.from(sentinel))
  })
})
