import type {
  AddNoiseParams,
  BoxBlurParams,
  DespeckleParams,
  EmbossParams,
  FilterParams,
  FindEdgesParams,
  GaussianBlurParams,
  HighPassParams,
  LocalContrastParams,
  MosaicParams,
  SharpenParams,
  UnsharpMaskParams,
} from './types'

/**
 * Pixel transforms backing each FilterLayer kind. All operate on RGBA
 * `Uint8ClampedArray` data (the format `ImageData.data` returns) and leave
 * alpha untouched.
 *
 * Unlike adjustments (per-pixel-independent), filters here are
 * neighbourhood-dependent — they sample surrounding pixels, so they need
 * width + height. Convolution-based filters (gaussian, box, sharpen,
 * unsharp mask, high pass, sobel, emboss) decompose into separable 1D passes
 * where possible and use offscreen buffers when not.
 *
 * Cost guideline: separable blur is O(n*radius), convolution is O(n*radius²).
 * For radius > 20 we still use separable; if perf bites we'd swap to a SAT
 * (summed-area table) for box blur.
 */

export const DEFAULT_GAUSSIAN_BLUR: GaussianBlurParams = {
  kind: 'gaussianBlur',
  radius: 5,
}
export const DEFAULT_BOX_BLUR: BoxBlurParams = { kind: 'boxBlur', radius: 5 }
export const DEFAULT_SHARPEN: SharpenParams = { kind: 'sharpen', amount: 100 }
export const DEFAULT_UNSHARP_MASK: UnsharpMaskParams = {
  kind: 'unsharpMask',
  amount: 100,
  radius: 2,
  threshold: 0,
}
export const DEFAULT_HIGH_PASS: HighPassParams = {
  kind: 'highPass',
  radius: 10,
}
export const DEFAULT_ADD_NOISE: AddNoiseParams = {
  kind: 'addNoise',
  amount: 25,
  monochromatic: false,
  seed: 0, // overwritten by `freshNoiseSeed()` at apply time
}

/** Generate a fresh u32 seed for AddNoiseParams.seed. */
export function freshNoiseSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0
}
export const DEFAULT_DESPECKLE: DespeckleParams = { kind: 'despeckle' }
export const DEFAULT_MOSAIC: MosaicParams = { kind: 'mosaic', cellSize: 10 }
export const DEFAULT_FIND_EDGES: FindEdgesParams = { kind: 'findEdges' }
export const DEFAULT_EMBOSS: EmbossParams = {
  kind: 'emboss',
  angle: 135,
  height: 3,
  amount: 100,
}
export const DEFAULT_LOCAL_CONTRAST: LocalContrastParams = {
  kind: 'localContrast',
  clarity: 30,
  dehaze: 0,
  radius: 30,
}

export const DEFAULT_FOR_FILTER_KIND: Record<FilterParams['kind'], FilterParams> = {
  gaussianBlur: DEFAULT_GAUSSIAN_BLUR,
  boxBlur: DEFAULT_BOX_BLUR,
  sharpen: DEFAULT_SHARPEN,
  unsharpMask: DEFAULT_UNSHARP_MASK,
  highPass: DEFAULT_HIGH_PASS,
  addNoise: DEFAULT_ADD_NOISE,
  despeckle: DEFAULT_DESPECKLE,
  mosaic: DEFAULT_MOSAIC,
  findEdges: DEFAULT_FIND_EDGES,
  emboss: DEFAULT_EMBOSS,
  localContrast: DEFAULT_LOCAL_CONTRAST,
}

/**
 * Scale the spatial fields of FilterParams from preview-canvas pixels to the
 * target buffer's pixel space. Filter params are stored in preview-canvas
 * pixels (matching `BlurShape.radius`); the renderer multiplies by `scale`
 * (= annoScale = scale / previewScale) so a 10px preview blur looks the
 * same on a 1× export render. Non-spatial fields (amount, threshold, angle,
 * seed, etc.) are passed through unchanged.
 */
export function scaleFilterParams(
  params: FilterParams,
  scale: number,
): FilterParams {
  if (scale === 1) return params
  switch (params.kind) {
    case 'gaussianBlur':
      return { ...params, radius: params.radius * scale }
    case 'boxBlur':
      return { ...params, radius: params.radius * scale }
    case 'unsharpMask':
      return { ...params, radius: params.radius * scale }
    case 'highPass':
      return { ...params, radius: params.radius * scale }
    case 'mosaic':
      return { ...params, cellSize: params.cellSize * scale }
    case 'emboss':
      return { ...params, height: params.height * scale }
    case 'localContrast':
      return { ...params, radius: params.radius * scale }
    default:
      return params
  }
}

export function applyFilter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: FilterParams,
): void {
  switch (params.kind) {
    case 'gaussianBlur':
      gaussianBlur(data, width, height, params.radius)
      return
    case 'boxBlur':
      boxBlur(data, width, height, Math.max(1, Math.round(params.radius)))
      return
    case 'sharpen':
      sharpen(data, width, height, params.amount)
      return
    case 'unsharpMask':
      unsharpMask(data, width, height, params)
      return
    case 'highPass':
      highPass(data, width, height, params.radius)
      return
    case 'addNoise':
      addNoise(data, params)
      return
    case 'despeckle':
      despeckle(data, width, height)
      return
    case 'mosaic':
      mosaic(data, width, height, Math.max(2, Math.round(params.cellSize)))
      return
    case 'findEdges':
      findEdges(data, width, height)
      return
    case 'emboss':
      emboss(data, width, height, params)
      return
    case 'localContrast':
      localContrast(data, width, height, params)
      return
  }
}

// ── Gaussian blur (separable) ────────────────────────────────────────────

function gaussianKernel(radius: number): Float32Array {
  const sigma = Math.max(0.0001, radius)
  const r = Math.max(1, Math.ceil(sigma * 3))
  const size = r * 2 + 1
  const k = new Float32Array(size)
  const inv2s2 = 1 / (2 * sigma * sigma)
  let sum = 0
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) * inv2s2)
    k[i + r] = v
    sum += v
  }
  for (let i = 0; i < size; i++) k[i] /= sum
  return k
}

function gaussianBlur(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): void {
  if (radius <= 0) return
  const k = gaussianKernel(radius)
  separableConvolve(data, w, h, k)
}

// ── Box blur (separable) ─────────────────────────────────────────────────

function boxBlur(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): void {
  const size = radius * 2 + 1
  const k = new Float32Array(size)
  const v = 1 / size
  for (let i = 0; i < size; i++) k[i] = v
  separableConvolve(data, w, h, k)
}

/**
 * Apply a 1D kernel as horizontal then vertical pass. Operates on RGB
 * (alpha left untouched). Symmetric border (clamp-to-edge) so blur near
 * edges doesn't darken from sampling out-of-bounds zeros.
 */
function separableConvolve(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  k: Float32Array,
): void {
  const size = k.length
  const r = (size - 1) >> 1
  const tmp = new Float32Array(w * h * 3) // RGB only
  // Horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0
      let gs = 0
      let bs = 0
      for (let i = 0; i < size; i++) {
        let xi = x + i - r
        if (xi < 0) xi = 0
        else if (xi >= w) xi = w - 1
        const idx = (y * w + xi) * 4
        const wv = k[i]
        rs += data[idx] * wv
        gs += data[idx + 1] * wv
        bs += data[idx + 2] * wv
      }
      const o = (y * w + x) * 3
      tmp[o] = rs
      tmp[o + 1] = gs
      tmp[o + 2] = bs
    }
  }
  // Vertical (read from tmp, write to data)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0
      let gs = 0
      let bs = 0
      for (let i = 0; i < size; i++) {
        let yi = y + i - r
        if (yi < 0) yi = 0
        else if (yi >= h) yi = h - 1
        const o = (yi * w + x) * 3
        const wv = k[i]
        rs += tmp[o] * wv
        gs += tmp[o + 1] * wv
        bs += tmp[o + 2] * wv
      }
      const idx = (y * w + x) * 4
      data[idx] = rs < 0 ? 0 : rs > 255 ? 255 : rs
      data[idx + 1] = gs < 0 ? 0 : gs > 255 ? 255 : gs
      data[idx + 2] = bs < 0 ? 0 : bs > 255 ? 255 : bs
    }
  }
}

// ── Sharpen (3×3 unsharp kernel) ─────────────────────────────────────────

function sharpen(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  amount: number,
): void {
  // Standard unsharp 3×3 kernel ([0,-1,0],[-1,5,-1],[0,-1,0]). Blend with
  // original by amount/100 so amount=0 is identity, amount=100 is full kernel.
  const a = amount / 100
  const src = new Uint8ClampedArray(data)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      // Edge: skip kernel at borders, leave pixel as original (already in data).
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue
      const top = ((y - 1) * w + x) * 4
      const bot = ((y + 1) * w + x) * 4
      const left = (y * w + x - 1) * 4
      const right = (y * w + x + 1) * 4
      for (let c = 0; c < 3; c++) {
        const orig = src[i + c]
        const k =
          5 * orig -
          src[top + c] -
          src[bot + c] -
          src[left + c] -
          src[right + c]
        const v = orig + (k - orig) * a
        data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
  }
}

// ── Unsharp mask ─────────────────────────────────────────────────────────

function unsharpMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  p: UnsharpMaskParams,
): void {
  const blurred = new Uint8ClampedArray(data)
  gaussianBlur(blurred, w, h, p.radius)
  const a = p.amount / 100
  const t = Math.max(0, Math.min(255, p.threshold))
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = data[i + c]
      const diff = orig - blurred[i + c]
      if (Math.abs(diff) <= t) continue
      const v = orig + diff * a
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  }
}

// ── High pass ────────────────────────────────────────────────────────────

function highPass(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): void {
  const blurred = new Uint8ClampedArray(data)
  gaussianBlur(blurred, w, h, radius)
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c] - blurred[i + c] + 128
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  }
}

// ── Add noise ────────────────────────────────────────────────────────────

/**
 * Mulberry32 — a tiny seeded PRNG. ~5 lines, good-enough distribution for
 * pixel noise (not crypto). Returns floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function addNoise(data: Uint8ClampedArray, p: AddNoiseParams): void {
  const amp = Math.max(0, p.amount)
  if (amp === 0) return
  // Seeded PRNG so the noise is identical across renders (preview, export,
  // any unrelated re-render). Without this, every canvas redraw reshuffles
  // every noise pixel — the user sees the noise visibly crawl whenever
  // anything in the editor changes.
  const rand = mulberry32(p.seed)
  for (let i = 0; i < data.length; i += 4) {
    if (p.monochromatic) {
      const d = (rand() * 2 - 1) * amp
      const r = data[i] + d
      const g = data[i + 1] + d
      const b = data[i + 2] + d
      data[i] = r < 0 ? 0 : r > 255 ? 255 : r
      data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g
      data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
    } else {
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] + (rand() * 2 - 1) * amp
        data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
  }
}

// ── Despeckle (3×3 median per channel) ───────────────────────────────────

function despeckle(data: Uint8ClampedArray, w: number, h: number): void {
  const src = new Uint8ClampedArray(data)
  const buf = new Uint8ClampedArray(9)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            buf[n++] = src[((y + dy) * w + (x + dx)) * 4 + c]
          }
        }
        // Insertion sort 9 elements — fast for tiny arrays.
        for (let j = 1; j < 9; j++) {
          const v = buf[j]
          let k = j - 1
          while (k >= 0 && buf[k] > v) {
            buf[k + 1] = buf[k]
            k--
          }
          buf[k + 1] = v
        }
        data[i + c] = buf[4]
      }
    }
  }
}

// ── Mosaic ───────────────────────────────────────────────────────────────

function mosaic(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cell: number,
): void {
  for (let cy = 0; cy < h; cy += cell) {
    for (let cx = 0; cx < w; cx += cell) {
      const x1 = Math.min(cx + cell, w)
      const y1 = Math.min(cy + cell, h)
      let rs = 0
      let gs = 0
      let bs = 0
      let n = 0
      for (let y = cy; y < y1; y++) {
        for (let x = cx; x < x1; x++) {
          const i = (y * w + x) * 4
          rs += data[i]
          gs += data[i + 1]
          bs += data[i + 2]
          n++
        }
      }
      if (n === 0) continue
      const r = rs / n
      const g = gs / n
      const b = bs / n
      for (let y = cy; y < y1; y++) {
        for (let x = cx; x < x1; x++) {
          const i = (y * w + x) * 4
          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
        }
      }
    }
  }
}

// ── Find edges (Sobel) ───────────────────────────────────────────────────

function findEdges(data: Uint8ClampedArray, w: number, h: number): void {
  // Operate on luminance, then write the inverted Sobel magnitude as a
  // greyscale result. Matches PS Find Edges look (white background, dark edges).
  const lum = new Float32Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
        continue
      }
      const tl = lum[(y - 1) * w + (x - 1)]
      const tc = lum[(y - 1) * w + x]
      const tr = lum[(y - 1) * w + (x + 1)]
      const cl = lum[y * w + (x - 1)]
      const cr = lum[y * w + (x + 1)]
      const bl = lum[(y + 1) * w + (x - 1)]
      const bc = lum[(y + 1) * w + x]
      const br = lum[(y + 1) * w + (x + 1)]
      const gx = -tl + tr - 2 * cl + 2 * cr - bl + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br
      const mag = Math.sqrt(gx * gx + gy * gy)
      const v = 255 - (mag > 255 ? 255 : mag)
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
    }
  }
}

// ── Emboss ───────────────────────────────────────────────────────────────

function emboss(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  p: EmbossParams,
): void {
  // Project the gradient along (cos θ, sin θ); height scales the sample
  // offset; amount scales the response. Result is centred at 128 (mid-grey).
  const rad = (p.angle * Math.PI) / 180
  const dx = Math.cos(rad) * p.height
  const dy = Math.sin(rad) * p.height
  const a = p.amount / 100
  const src = new Uint8ClampedArray(data)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      // Sample a pixel "behind" by (dx, dy) and one "ahead" — gradient.
      const sx1 = Math.max(0, Math.min(w - 1, Math.round(x - dx)))
      const sy1 = Math.max(0, Math.min(h - 1, Math.round(y - dy)))
      const sx2 = Math.max(0, Math.min(w - 1, Math.round(x + dx)))
      const sy2 = Math.max(0, Math.min(h - 1, Math.round(y + dy)))
      const j = (sy1 * w + sx1) * 4
      const k = (sy2 * w + sx2) * 4
      for (let c = 0; c < 3; c++) {
        const grad = src[j + c] - src[k + c]
        const v = 128 + grad * a
        data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
  }
}

/**
 * Local Contrast — neighbourhood-based clarity + dehaze. Lifts midtone
 * micro-contrast via unsharp-mask-style high-pass against a wide gaussian,
 * weighted by midtone proximity so highlights and shadows don't blow out.
 *
 * Clarity (signed): boost = (orig - blur) * clarity * midWeight
 *   - midWeight is 1 at L=128 and 0 at L=0/255, so the effect is strongest
 *     in the middle band where local contrast actually carries detail.
 * Dehaze (signed): adds a global contrast stretch + saturation lift on top.
 *   - Hazy regions = low contrast + low saturation; stretching both is the
 *     classic way to recover them. Per-pixel because we don't have a haze
 *     mask, but the result still looks plausible.
 */
function localContrast(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  p: import('./types').LocalContrastParams,
): void {
  // 1) Local mean via gaussian blur on a copy.
  const blurBuf = new Uint8ClampedArray(data)
  gaussianBlur(blurBuf, w, h, Math.max(1, p.radius))

  const clarity = p.clarity / 100
  const dehaze = p.dehaze / 100
  const contrast = 1 + dehaze * 0.6
  // 2) Per-pixel blend.
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]
    // Local-contrast lift, weighted by midtone proximity (parabolic).
    const lum = (r * 299 + g * 587 + b * 114) / 1000
    const midWeight = 1 - Math.abs(lum - 128) / 128
    const c = clarity * midWeight * 1.5
    r = r + (r - blurBuf[i]) * c
    g = g + (g - blurBuf[i + 1]) * c
    b = b + (b - blurBuf[i + 2]) * c
    // Global contrast stretch (dehaze contrast component).
    r = (r - 128) * contrast + 128
    g = (g - 128) * contrast + 128
    b = (b - 128) * contrast + 128
    // Dehaze saturation: pull/push toward / away from the per-pixel mean.
    const mean = (r + g + b) / 3
    const satGain = 1 + dehaze * 0.4
    r = mean + (r - mean) * satGain
    g = mean + (g - mean) * satGain
    b = mean + (b - mean) * satGain
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }
}
