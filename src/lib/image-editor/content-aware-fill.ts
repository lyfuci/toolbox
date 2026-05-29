/**
 * Content-Aware Fill — fill a masked "hole" by synthesizing texture from the
 * rest of the image, the way Photoshop's Edit > Content-Aware Fill removes an
 * object. Pure (RGBA + mask in, RGBA out), no DOM, so it's node-testable; the
 * canvas/selection glue lives in ImageEditor.
 *
 * ALGORITHM — multi-scale PatchMatch completion (Barnes et al. 2009 PatchMatch
 * for the nearest-neighbour field; Wexler et al. for the EM/voting completion):
 *
 *  1. Build an image pyramid (downscale ×2 per level). At each level the hole
 *     is carried down too. Coarse levels capture large-scale structure cheaply;
 *     fine levels add detail.
 *  2. Seed the coarsest hole with the mean known colour.
 *  3. At each level, coarse→fine, run a few EM iterations:
 *       E-step (PatchMatch): for every patch that overlaps the hole, find a good
 *         matching SOURCE patch from the known region via a randomized
 *         nearest-neighbour search (random init → propagation → random search).
 *       M-step (voting): each hole pixel is recoloured as the average of what
 *         all overlapping matched patches predict for it.
 *     Then upsample the filled result into the next finer level's hole (known
 *     pixels always keep their ORIGINAL colour — only hole pixels are synthesized).
 *
 * This propagates real texture/structure into the hole rather than blurring it,
 * which is what separates Content-Aware Fill from a Spot-Heal patch blend.
 *
 * Cost scales with the HOLE size (the NN field + voting only touch the dilated
 * hole region), so a small selection on a large image stays fast even though the
 * source search ranges over the whole image.
 */

const DEFAULT_PATCH_RADIUS = 3 // 7×7 patches
const DEFAULT_PM_ITERS = 4 // PatchMatch propagate/search passes per E-step
const MIN_LEVEL_DIM = 32 // stop coarsening when a side reaches ~this
const MAX_LEVELS = 6

type Level = {
  rgb: Float32Array // w*h*3, known pixels = original colour, hole = synthesized
  hole: Uint8Array // w*h, 1 = pixel to fill
  w: number
  h: number
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)

export type ContentAwareFillOpts = {
  patchRadius?: number
  pmIters?: number
}

/**
 * Fill `hole` (1 = pixel to synthesize) in `src` (RGBA) from the known region.
 * Returns a NEW RGBA buffer: known pixels are copied through unchanged, hole
 * pixels are replaced with synthesized texture (alpha forced opaque).
 */
export function contentAwareFill(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  hole: Uint8Array,
  opts: ContentAwareFillOpts = {},
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src)
  if (w <= 0 || h <= 0) return out

  let holeCount = 0
  for (let i = 0; i < hole.length; i++) if (hole[i]) holeCount++
  // Nothing to fill, or nothing to sample FROM — bail (return the copy).
  if (holeCount === 0 || holeCount >= w * h) return out

  const R = Math.max(1, Math.round(opts.patchRadius ?? DEFAULT_PATCH_RADIUS))
  const pmIters = Math.max(1, Math.round(opts.pmIters ?? DEFAULT_PM_ITERS))

  // Base (finest) level from the source.
  const baseRgb = new Float32Array(w * h * 3)
  for (let p = 0, pi = 0; p < w * h; p++, pi += 4) {
    baseRgb[p * 3] = src[pi]
    baseRgb[p * 3 + 1] = src[pi + 1]
    baseRgb[p * 3 + 2] = src[pi + 2]
  }
  const base: Level = { rgb: baseRgb, hole: hole.slice(), w, h }

  // Pyramid, coarsest first.
  const pyramid: Level[] = [base]
  while (
    pyramid[0].w > MIN_LEVEL_DIM * 2 &&
    pyramid[0].h > MIN_LEVEL_DIM * 2 &&
    pyramid.length < MAX_LEVELS
  ) {
    pyramid.unshift(downsample(pyramid[0]))
  }

  // Seed the coarsest hole with the mean known colour so the first PatchMatch
  // has something better than black to match against.
  seedHoleWithMean(pyramid[0])

  for (let li = 0; li < pyramid.length; li++) {
    const lvl = pyramid[li]
    if (li > 0) upsampleHoleInto(pyramid[li - 1], lvl)
    const emIters = Math.max(2, 7 - li) // more refinement at coarse levels
    solveLevel(lvl, R, pmIters, emIters)
  }

  // Write the synthesized hole pixels back (known pixels stay as the copy).
  const fin = pyramid[pyramid.length - 1]
  for (let p = 0, pi = 0; p < w * h; p++, pi += 4) {
    if (hole[p]) {
      out[pi] = clamp255(fin.rgb[p * 3])
      out[pi + 1] = clamp255(fin.rgb[p * 3 + 1])
      out[pi + 2] = clamp255(fin.rgb[p * 3 + 2])
      out[pi + 3] = 255
    }
  }
  return out
}

/** Box-downsample an image+hole by 2. A coarse pixel is hole iff ≥2 of its 4
 *  children are hole; its colour averages only the KNOWN children. */
function downsample(l: Level): Level {
  const w2 = Math.max(1, l.w >> 1)
  const h2 = Math.max(1, l.h >> 1)
  const rgb = new Float32Array(w2 * h2 * 3)
  const hole = new Uint8Array(w2 * h2)
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      let r = 0
      let g = 0
      let b = 0
      let known = 0
      let holeChildren = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(l.w - 1, x * 2 + dx)
          const sy = Math.min(l.h - 1, y * 2 + dy)
          const sp = sy * l.w + sx
          if (l.hole[sp]) holeChildren++
          else {
            r += l.rgb[sp * 3]
            g += l.rgb[sp * 3 + 1]
            b += l.rgb[sp * 3 + 2]
            known++
          }
        }
      }
      const dp = y * w2 + x
      hole[dp] = holeChildren >= 2 ? 1 : 0
      if (known > 0) {
        rgb[dp * 3] = r / known
        rgb[dp * 3 + 1] = g / known
        rgb[dp * 3 + 2] = b / known
      }
    }
  }
  return { rgb, hole, w: w2, h: h2 }
}

/** Set every hole pixel to the mean colour of the known region. */
function seedHoleWithMean(l: Level): void {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let p = 0; p < l.w * l.h; p++) {
    if (!l.hole[p]) {
      r += l.rgb[p * 3]
      g += l.rgb[p * 3 + 1]
      b += l.rgb[p * 3 + 2]
      n++
    }
  }
  if (n === 0) return
  r /= n
  g /= n
  b /= n
  for (let p = 0; p < l.w * l.h; p++) {
    if (l.hole[p]) {
      l.rgb[p * 3] = r
      l.rgb[p * 3 + 1] = g
      l.rgb[p * 3 + 2] = b
    }
  }
}

/** Bilinearly upsample the coarse level's colours into the fine level's HOLE
 *  pixels (fine known pixels keep their original colour). */
function upsampleHoleInto(coarse: Level, fine: Level): void {
  const sx = coarse.w / fine.w
  const sy = coarse.h / fine.h
  for (let y = 0; y < fine.h; y++) {
    for (let x = 0; x < fine.w; x++) {
      const fp = y * fine.w + x
      if (!fine.hole[fp]) continue
      const cx = Math.min(coarse.w - 1, x * sx)
      const cy = Math.min(coarse.h - 1, y * sy)
      const x0 = Math.floor(cx)
      const y0 = Math.floor(cy)
      const x1 = Math.min(coarse.w - 1, x0 + 1)
      const y1 = Math.min(coarse.h - 1, y0 + 1)
      const wx = cx - x0
      const wy = cy - y0
      for (let c = 0; c < 3; c++) {
        const a = coarse.rgb[(y0 * coarse.w + x0) * 3 + c]
        const b = coarse.rgb[(y0 * coarse.w + x1) * 3 + c]
        const d = coarse.rgb[(y1 * coarse.w + x0) * 3 + c]
        const e = coarse.rgb[(y1 * coarse.w + x1) * 3 + c]
        const top = a + (b - a) * wx
        const bot = d + (e - d) * wx
        fine.rgb[fp * 3 + c] = top + (bot - top) * wy
      }
    }
  }
}

/** EM completion at one level. Mutates `l.rgb` (hole pixels only). */
function solveLevel(
  l: Level,
  R: number,
  pmIters: number,
  emIters: number,
): void {
  const { w, h } = l
  // Valid source-patch CENTRES: known pixels in the interior (a full patch fits).
  const sources: number[] = []
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      if (!l.hole[y * w + x]) sources.push(y * w + x)
    }
  }
  if (sources.length === 0) return // can't synthesize — leave the seed

  // Target region: any pixel whose R-patch overlaps the hole (dilate(hole, R)).
  const target = dilate(l.hole, w, h, R)
  const targetList: number[] = []
  for (let p = 0; p < w * h; p++) if (target[p]) targetList.push(p)

  // NN field: for each pixel, the source-centre index it currently maps to.
  const nnf = new Int32Array(w * h)
  const dist = new Float32Array(w * h)
  for (const p of targetList) {
    const s = sources[(Math.random() * sources.length) | 0]
    nnf[p] = s
    dist[p] = patchDistance(l, R, p % w, (p / w) | 0, s % w, (s / w) | 0, Infinity)
  }

  for (let em = 0; em < emIters; em++) {
    // E-step: refine the NN field with PatchMatch.
    for (let it = 0; it < pmIters; it++) {
      const forward = it % 2 === 0
      patchMatchPass(l, R, target, nnf, dist, forward)
    }
    // M-step: re-colour each hole pixel from the votes of overlapping patches.
    voteFill(l, R, target, nnf)
  }
}

/** Morphological dilation of a binary mask by `r` (Chebyshev). */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // Separable two-pass (horizontal then vertical) max filter.
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let dx = -r; dx <= r && !v; dx++) {
        const xx = x + dx
        if (xx >= 0 && xx < w && mask[y * w + xx]) v = 1
      }
      tmp[y * w + x] = v
    }
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let dy = -r; dy <= r && !v; dy++) {
        const yy = y + dy
        if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1
      }
      out[y * w + x] = v
    }
  }
  return out
}

/** Sum of squared RGB differences between the target patch at (tx,ty) and the
 *  source patch at (sx,sy); aborts early once it exceeds `cutoff`. */
function patchDistance(
  l: Level,
  R: number,
  tx: number,
  ty: number,
  sx: number,
  sy: number,
  cutoff: number,
): number {
  const { w, h, rgb } = l
  let sum = 0
  for (let dy = -R; dy <= R; dy++) {
    const tyy = clampIdx(ty + dy, h)
    const syy = clampIdx(sy + dy, h)
    for (let dx = -R; dx <= R; dx++) {
      const txx = clampIdx(tx + dx, w)
      const sxx = clampIdx(sx + dx, w)
      const ti = (tyy * w + txx) * 3
      const si = (syy * w + sxx) * 3
      const dr = rgb[ti] - rgb[si]
      const dg = rgb[ti + 1] - rgb[si + 1]
      const db = rgb[ti + 2] - rgb[si + 2]
      sum += dr * dr + dg * dg + db * db
    }
    if (sum >= cutoff) return sum
  }
  return sum
}

const clampIdx = (v: number, n: number): number => (v < 0 ? 0 : v >= n ? n - 1 : v)

/** One PatchMatch pass over the target region: propagation + random search. */
function patchMatchPass(
  l: Level,
  R: number,
  target: Uint8Array,
  nnf: Int32Array,
  dist: Float32Array,
  forward: boolean,
): void {
  const { w, h } = l
  const xs = forward ? 0 : w - 1
  const xe = forward ? w : -1
  const ys = forward ? 0 : h - 1
  const ye = forward ? h : -1
  const step = forward ? 1 : -1
  const maxSearchR = Math.max(w, h)

  for (let y = ys; y !== ye; y += step) {
    for (let x = xs; x !== xe; x += step) {
      const p = y * w + x
      if (!target[p]) continue
      let best = nnf[p]
      let bestD = dist[p]

      // Propagation: adopt a neighbour's mapping shifted by the same delta.
      const nx = x - step
      if (nx >= 0 && nx < w && target[y * w + nx]) {
        const cand = nnf[y * w + nx] + step // shift source by +step in x
        const cd = candidateDist(l, R, x, y, cand, bestD)
        if (cd < bestD) {
          bestD = cd
          best = cand
        }
      }
      const ny = y - step
      if (ny >= 0 && ny < h && target[ny * w + x]) {
        const cand = nnf[ny * w + x] + step * w // shift source by +step in y
        const cd = candidateDist(l, R, x, y, cand, bestD)
        if (cd < bestD) {
          bestD = cd
          best = cand
        }
      }

      // Random search: shrink the window around the current best each step.
      const bsx = best % w
      const bsy = (best / w) | 0
      for (let radius = maxSearchR; radius >= 1; radius = (radius / 2) | 0) {
        const rx = bsx + (((Math.random() * 2 - 1) * radius) | 0)
        const ry = bsy + (((Math.random() * 2 - 1) * radius) | 0)
        const cand = clampIdx(ry, h) * w + clampIdx(rx, w)
        const cd = candidateDist(l, R, x, y, cand, bestD)
        if (cd < bestD) {
          bestD = cd
          best = cand
        }
      }

      nnf[p] = best
      dist[p] = bestD
    }
  }
}

/** Distance for a candidate source index, rejecting hole-centred sources. */
function candidateDist(
  l: Level,
  R: number,
  tx: number,
  ty: number,
  cand: number,
  cutoff: number,
): number {
  const { w, h } = l
  const sx = cand % w
  const sy = (cand / w) | 0
  // Reject out-of-interior or hole-centred candidates (never copy the hole).
  if (sx < R || sx >= w - R || sy < R || sy >= h - R) return Infinity
  if (l.hole[cand]) return Infinity
  return patchDistance(l, R, tx, ty, sx, sy, cutoff)
}

/** Re-colour every hole pixel as the average of the colours predicted by all
 *  overlapping matched patches (the M-step). */
function voteFill(
  l: Level,
  R: number,
  target: Uint8Array,
  nnf: Int32Array,
): void {
  const { w, h, rgb } = l
  for (let qy = 0; qy < h; qy++) {
    for (let qx = 0; qx < w; qx++) {
      const q = qy * w + qx
      if (!l.hole[q]) continue
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      // Every target patch centred within R of q predicts a colour for q.
      for (let dy = -R; dy <= R; dy++) {
        const ty = qy + dy
        if (ty < 0 || ty >= h) continue
        for (let dx = -R; dx <= R; dx++) {
          const tx = qx + dx
          if (tx < 0 || tx >= w) continue
          const t = ty * w + tx
          if (!target[t]) continue
          const s = nnf[t]
          // Source pixel aligned to q within this patch: s + (q - t).
          const px = clampIdx((s % w) + (qx - tx), w)
          const py = clampIdx(((s / w) | 0) + (qy - ty), h)
          const si = (py * w + px) * 3
          r += rgb[si]
          g += rgb[si + 1]
          b += rgb[si + 2]
          n++
        }
      }
      if (n > 0) {
        rgb[q * 3] = r / n
        rgb[q * 3 + 1] = g / n
        rgb[q * 3 + 2] = b / n
      }
    }
  }
}
