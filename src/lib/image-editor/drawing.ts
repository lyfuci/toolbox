import type {
  ArrowShape,
  BlurShape,
  BrushShape,
  EllipseShape,
  FrameShape,
  ImageShape,
  LineShape,
  MosaicShape,
  NoteShape,
  PathShape,
  RectShape,
  Shape,
  TextShape,
} from './types'
import type { ArcSample } from './bezier-arclength'
import { isWarpActive, warpTextPixels } from './text-warp'

// All shape coordinates are stored in PREVIEW canvas pixels. The render
// pipeline passes a `scale` factor that maps preview-px → target-px so the
// same shape data renders at any zoom level (preview vs. export).

export type ImageCache = Map<string, HTMLImageElement>

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  scale: number,
  // Used by mosaic (samples pixels from below).
  underlying: HTMLCanvasElement,
  // Used by image shapes — cache of loaded HTMLImageElements keyed by dataUrl.
  // If a referenced dataUrl isn't in the cache, the shape is skipped this frame.
  imageCache?: ImageCache,
  // Type-on-Path: if the text shape has `followPathLayerId`, the renderer
  // resolves the path and passes its uniform-arclength samples here so this
  // module stays decoupled from EditorState / layer lookup.
  pathSamples?: ArcSample[],
): void {
  switch (shape.kind) {
    case 'rect':
      drawRect(ctx, shape, scale)
      break
    case 'arrow':
      drawArrow(ctx, shape, scale)
      break
    case 'text':
      if (pathSamples && pathSamples.length >= 2) {
        drawTextOnPath(ctx, shape, scale, pathSamples)
      } else if (isWarpActive(shape.warp)) {
        drawWarpedText(ctx, shape, scale)
      } else {
        drawText(ctx, shape, scale)
      }
      break
    case 'mosaic':
      drawMosaic(ctx, shape, scale, underlying)
      break
    case 'brush':
      drawBrush(ctx, shape, scale, imageCache)
      break
    case 'image':
      drawImageShape(ctx, shape, scale, imageCache)
      break
    case 'ellipse':
      drawEllipse(ctx, shape, scale)
      break
    case 'line':
      drawLine(ctx, shape, scale)
      break
    case 'blur':
      drawBlurRegion(ctx, shape, scale, underlying)
      break
    case 'note':
      drawNote(ctx, shape, scale)
      break
    case 'frame':
      drawFrame(ctx, shape, scale)
      break
    case 'path':
      drawPath(ctx, shape, scale)
      break
  }
}

/**
 * Vector path. Walks anchors, emitting bezierCurveTo / quadraticCurveTo /
 * lineTo segments depending on which handles are present on each side. Closed
 * paths add a final segment from the last anchor back to the first (using
 * last.hout + first.hin).
 */
function drawPath(ctx: CanvasRenderingContext2D, s: PathShape, scale: number) {
  if (s.anchors.length === 0) return
  const k = (n: number) => n * scale
  ctx.beginPath()
  const a0 = s.anchors[0]
  ctx.moveTo(k(a0.x), k(a0.y))
  for (let i = 1; i < s.anchors.length; i++) {
    drawSegment(ctx, s.anchors[i - 1], s.anchors[i], scale)
  }
  if (s.closed && s.anchors.length >= 2) {
    drawSegment(ctx, s.anchors[s.anchors.length - 1], a0, scale)
    ctx.closePath()
  }
  if (s.fill && s.closed) {
    ctx.fillStyle = s.fill
    ctx.fill()
  }
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.strokeWidth * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

function drawSegment(
  ctx: CanvasRenderingContext2D,
  prev: PathAnchorLike,
  curr: PathAnchorLike,
  scale: number,
) {
  const k = (n: number) => n * scale
  const out = prev.hout
  const inn = curr.hin
  if (out && inn) {
    ctx.bezierCurveTo(
      k(prev.x + out.x),
      k(prev.y + out.y),
      k(curr.x + inn.x),
      k(curr.y + inn.y),
      k(curr.x),
      k(curr.y),
    )
  } else if (out) {
    ctx.quadraticCurveTo(k(prev.x + out.x), k(prev.y + out.y), k(curr.x), k(curr.y))
  } else if (inn) {
    ctx.quadraticCurveTo(k(curr.x + inn.x), k(curr.y + inn.y), k(curr.x), k(curr.y))
  } else {
    ctx.lineTo(k(curr.x), k(curr.y))
  }
}

type PathAnchorLike = {
  x: number
  y: number
  hin?: { x: number; y: number }
  hout?: { x: number; y: number }
}

/**
 * Sticky-note marker. Rendered as a small folded-corner rectangle in the
 * given colour with a 1-line text label below it. The full text is in the
 * Properties panel on hover; the label is just a preview.
 */
function drawNote(ctx: CanvasRenderingContext2D, s: NoteShape, scale: number) {
  const x = s.x * scale
  const y = s.y * scale
  const size = 16 * scale
  const fold = size / 3
  ctx.save()
  // Note body (folded-corner pentagon)
  ctx.fillStyle = s.color
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = Math.max(1, scale)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + size - fold, y)
  ctx.lineTo(x + size, y + fold)
  ctx.lineTo(x + size, y + size)
  ctx.lineTo(x, y + size)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // Folded-corner triangle
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.moveTo(x + size - fold, y)
  ctx.lineTo(x + size - fold, y + fold)
  ctx.lineTo(x + size, y + fold)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // 1-line preview label below
  const label = s.text.split('\n')[0].slice(0, 24)
  if (label) {
    ctx.fillStyle = '#1a1a1a'
    ctx.font = `${Math.round(11 * scale)}px sans-serif`
    ctx.textBaseline = 'top'
    ctx.fillText(label, x, y + size + 2 * scale)
  }
  ctx.restore()
}

/**
 * Frame placeholder. Dashed grey rect with a diagonal X across — same visual
 * convention PS uses for an empty Frame Tool layer.
 */
function drawFrame(ctx: CanvasRenderingContext2D, s: FrameShape, scale: number) {
  const x = (s.w >= 0 ? s.x : s.x + s.w) * scale
  const y = (s.h >= 0 ? s.y : s.y + s.h) * scale
  const w = Math.abs(s.w) * scale
  const h = Math.abs(s.h) * scale
  if (w < 1 || h < 1) return
  ctx.save()
  ctx.strokeStyle = '#888'
  ctx.lineWidth = Math.max(1, scale)
  ctx.setLineDash([6 * scale, 4 * scale])
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y + h)
  ctx.moveTo(x + w, y)
  ctx.lineTo(x, y + h)
  ctx.stroke()
  if (s.name) {
    ctx.fillStyle = '#888'
    ctx.font = `${Math.round(12 * scale)}px sans-serif`
    ctx.textBaseline = 'top'
    ctx.fillText(s.name, x + 4 * scale, y + 4 * scale)
  }
  ctx.restore()
}

/**
 * Region blur — sample the underlying canvas under the rect, draw it back at
 * the same place with `ctx.filter = blur(Npx)` applied. Same pattern as
 * `drawMosaic` (snapshot the canvas before drawing, sample from it). Skipped
 * for degenerate rects.
 */
function drawBlurRegion(
  ctx: CanvasRenderingContext2D,
  s: BlurShape,
  scale: number,
  underlying: HTMLCanvasElement,
) {
  const x = s.x * scale
  const y = s.y * scale
  const w = s.w * scale
  const h = s.h * scale
  const nx = w >= 0 ? x : x + w
  const ny = h >= 0 ? y : y + h
  const nw = Math.abs(w)
  const nh = Math.abs(h)
  if (nw < 2 || nh < 2) return
  const r = Math.max(0.5, s.radius * scale)
  ctx.save()
  ctx.filter = `blur(${r}px)`
  // The blur filter samples *outside* the source rect to fill its own edge,
  // so artifacts at the rect's own border are minimal as long as we draw
  // back into the same rect we sampled.
  ctx.drawImage(underlying, nx, ny, nw, nh, nx, ny, nw, nh)
  ctx.restore()
}

function drawEllipse(ctx: CanvasRenderingContext2D, s: EllipseShape, scale: number) {
  // Normalise so negative w/h drag (drag from BR to TL) still draws correctly.
  const x = (s.w >= 0 ? s.x : s.x + s.w) * scale
  const y = (s.h >= 0 ? s.y : s.y + s.h) * scale
  const w = Math.abs(s.w) * scale
  const h = Math.abs(s.h) * scale
  ctx.beginPath()
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  if (s.fill) {
    ctx.fillStyle = s.fill
    ctx.fill()
  }
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.strokeWidth * scale
  ctx.stroke()
}

function drawLine(ctx: CanvasRenderingContext2D, s: LineShape, scale: number) {
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.strokeWidth * scale
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(s.x1 * scale, s.y1 * scale)
  ctx.lineTo(s.x2 * scale, s.y2 * scale)
  ctx.stroke()
}

function drawRect(ctx: CanvasRenderingContext2D, s: RectShape, scale: number) {
  if (s.fill) {
    ctx.fillStyle = s.fill
    ctx.fillRect(s.x * scale, s.y * scale, s.w * scale, s.h * scale)
  }
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.strokeWidth * scale
  ctx.strokeRect(s.x * scale, s.y * scale, s.w * scale, s.h * scale)
}

function drawArrow(ctx: CanvasRenderingContext2D, s: ArrowShape, scale: number) {
  const x1 = s.x1 * scale
  const y1 = s.y1 * scale
  const x2 = s.x2 * scale
  const y2 = s.y2 * scale
  const w = s.strokeWidth * scale
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(8, w * 3)
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}

function drawText(ctx: CanvasRenderingContext2D, s: TextShape, scale: number) {
  paintTextBlock(ctx, s, scale, s.x * scale, s.y * scale)
}

/**
 * Paint a text block at an explicit (baseX, baseY) origin — the shared layout
 * core used by both `drawText` (origin = the shape's anchor) and
 * `drawWarpedText` (origin = an offscreen buffer). Keeping ONE implementation
 * means warp can't silently drift from plain text on multi-line / align /
 * letterSpacing / underline behaviour.
 */
function paintTextBlock(
  ctx: CanvasRenderingContext2D,
  s: TextShape,
  scale: number,
  baseX: number,
  baseY: number,
) {
  ctx.fillStyle = s.color
  const family = s.fontFamily ?? 'sans-serif'
  const weight = s.fontWeight ?? 'normal'
  const style = s.fontStyle ?? 'normal'
  const sizePx = Math.round(s.fontSize * scale)
  ctx.font = `${style} ${weight} ${sizePx}px ${family}`
  ctx.textBaseline = 'top'
  const align = s.align ?? 'left'
  ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
  // letterSpacing is supported on most modern browsers. TS doesn't carry
  // the lib type for it on older targets — cast via Record so older lib
  // configs don't error, and wrap in try/catch for very old browsers.
  try {
    ;(ctx as unknown as Record<string, unknown>).letterSpacing =
      `${(s.letterSpacing ?? 0) * scale}px`
  } catch {
    // Older browsers silently skip; layout regresses to default kerning.
  }
  const lineHeight = (s.lineHeight ?? 1.2) * sizePx
  // Multi-line: split on \n. Each line drawn at its own y.
  const lines = (s.text ?? '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const y = baseY + i * lineHeight
    ctx.fillText(line, baseX, y)
    if (s.underline) {
      const m = ctx.measureText(line)
      const w = m.width
      const ulY = y + sizePx + 1
      const ulX = align === 'center' ? baseX - w / 2 : align === 'right' ? baseX - w : baseX
      ctx.fillRect(ulX, ulY, w, Math.max(1, Math.round(sizePx / 16)))
    }
  }
  // Reset letterSpacing so it doesn't leak into the next ctx user.
  try {
    ;(ctx as unknown as Record<string, unknown>).letterSpacing = '0px'
  } catch {
    /* noop */
  }
}

// Warped-text bitmaps are expensive to recompute (rasterize + per-pixel
// envelope remap), and drawShape runs on EVERY render — so cache the warped
// canvas keyed on everything that affects it (text, font, align, warp params,
// scale). Small LRU-ish cap; the oldest entry is dropped when full.
const warpCache = new Map<string, HTMLCanvasElement>()
const WARP_CACHE_MAX = 24
let measureCanvas: HTMLCanvasElement | null = null

/** Measure the text block (max line width + total height) at `scale`. */
function measureTextBlock(
  s: TextShape,
  scale: number,
): { textW: number; textH: number; sizePx: number } {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')!
  const family = s.fontFamily ?? 'sans-serif'
  const weight = s.fontWeight ?? 'normal'
  const style = s.fontStyle ?? 'normal'
  const sizePx = Math.round(s.fontSize * scale)
  ctx.font = `${style} ${weight} ${sizePx}px ${family}`
  try {
    ;(ctx as unknown as Record<string, unknown>).letterSpacing =
      `${(s.letterSpacing ?? 0) * scale}px`
  } catch {
    /* noop */
  }
  const lines = (s.text ?? '').split('\n')
  let maxW = 0
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width)
  try {
    ;(ctx as unknown as Record<string, unknown>).letterSpacing = '0px'
  } catch {
    /* noop */
  }
  const lineHeight = (s.lineHeight ?? 1.2) * sizePx
  // top-baseline lines span [y, y+sizePx]; add a line's worth of descender +
  // underline room below the last line so glyph tails aren't clipped.
  const textH = (lines.length - 1) * lineHeight + Math.ceil(sizePx * 1.3)
  return {
    textW: Math.max(1, Math.ceil(maxW)),
    textH: Math.max(1, Math.ceil(textH)),
    sizePx,
  }
}

/**
 * Warp Text — rasterize the text block into a padded offscreen, remap it
 * through the vertical-envelope warp, and blit it so the text's logical anchor
 * stays put (the unwarped hit-bbox still lines up). Result is cached.
 */
function drawWarpedText(
  ctx: CanvasRenderingContext2D,
  s: TextShape,
  scale: number,
) {
  const warp = s.warp
  if (!warp) return
  const { textW, textH, sizePx } = measureTextBlock(s, scale)
  const align = s.align ?? 'left'
  // Horizontal pad covers italic/letterSpacing overhang; vertical pad gives the
  // envelope room to overflow (styles displace up to ~0.6·textH each way).
  const padX = Math.ceil(sizePx * 0.5) + 2
  const padY = Math.ceil(textH * 0.9) + sizePx
  const W = textW + 2 * padX
  const H = textH + 2 * padY

  const key = [
    Math.round(scale * 1000),
    s.fontFamily ?? '',
    s.fontWeight ?? '',
    s.fontStyle ?? '',
    sizePx,
    align,
    s.letterSpacing ?? 0,
    s.lineHeight ?? 1.2,
    s.underline ? 1 : 0,
    s.color,
    warp.style,
    warp.bend,
    warp.horizontal,
    warp.vertical,
    s.text ?? '',
  ].join('|')

  let warped = warpCache.get(key)
  if (!warped) {
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const octx = off.getContext('2d')!
    // Render so the block occupies [padX, padX+textW]; fillText anchors per
    // align, so shift the origin accordingly.
    const originX =
      align === 'center'
        ? padX + textW / 2
        : align === 'right'
          ? padX + textW
          : padX
    paintTextBlock(octx, s, scale, originX, padY)
    const srcData = octx.getImageData(0, 0, W, H).data
    const outData = warpTextPixels(srcData, W, H, warp, padX, padY, textW, textH)
    const outImg = octx.createImageData(W, H)
    outImg.data.set(outData)
    octx.putImageData(outImg, 0, 0)
    warped = off
    if (warpCache.size >= WARP_CACHE_MAX) {
      const oldest = warpCache.keys().next().value
      if (oldest !== undefined) warpCache.delete(oldest)
    }
    warpCache.set(key, warped)
  }

  // Match plain drawText's block-left so the warp sits exactly where unwarped
  // text would (keeps move/select aligned with the logical bbox).
  const blockLeft =
    align === 'center'
      ? s.x * scale - textW / 2
      : align === 'right'
        ? s.x * scale - textW
        : s.x * scale
  ctx.drawImage(warped, blockLeft - padX, s.y * scale - padY)
}

/**
 * Type on Path — lay each glyph at its cumulative-advance position along the
 * pre-sampled path, rotated to the local tangent. `samples` are uniform-
 * arclength samples from `bezier-arclength.ts`; we measure each glyph's width
 * and walk a moving "distance from path start" pointer, looking up the matching
 * sample at each step. Stops drawing when the text runs off the path end
 * (matches PS — glyphs that don't fit just disappear).
 *
 * Path samples are in preview-pixel space; `scale` maps them to target px,
 * same convention as the rest of drawShape.
 */
function drawTextOnPath(
  ctx: CanvasRenderingContext2D,
  s: TextShape,
  scale: number,
  samples: ArcSample[],
) {
  ctx.fillStyle = s.color
  const family = s.fontFamily ?? 'sans-serif'
  const weight = s.fontWeight ?? 'normal'
  const style = s.fontStyle ?? 'normal'
  const sizePx = Math.round(s.fontSize * scale)
  ctx.font = `${style} ${weight} ${sizePx}px ${family}`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'

  // Total arclength of the sampled path (samples are evenly spaced by chord
  // length, so straight chord sum is fine here for the lookup math).
  let totalLen = 0
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x
    const dy = samples[i].y - samples[i - 1].y
    totalLen += Math.hypot(dx, dy)
  }
  if (totalLen <= 0) return

  const text = s.text ?? ''
  const letterSpacingPx = (s.letterSpacing ?? 0) * scale
  // Walk a "distance" pointer; place each glyph centered on the corresponding
  // arclength sample. Look up the sample by binary-searching cumulative chord
  // lengths derived once here.
  const cum: number[] = [0]
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x
    const dy = samples[i].y - samples[i - 1].y
    cum.push(cum[i - 1] + Math.hypot(dx, dy))
  }
  const sampleAt = (d: number): ArcSample => {
    if (d <= 0) return samples[0]
    if (d >= totalLen) return samples[samples.length - 1]
    // Linear search is fine: samples are dense (count >= 64 in our caller).
    for (let i = 1; i < cum.length; i++) {
      if (cum[i] >= d) {
        const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])
        const a = samples[i - 1]
        const b = samples[i]
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          tangent: a.tangent + (b.tangent - a.tangent) * t,
          t: a.t + (b.t - a.t) * t,
        }
      }
    }
    return samples[samples.length - 1]
  }

  let cursor = 0
  for (const ch of text) {
    const w = ctx.measureText(ch).width
    const center = cursor + w / 2
    if (center * scale > totalLen) break
    const p = sampleAt(center * scale)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.tangent)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
    cursor += w + letterSpacingPx
  }
}

function drawImageShape(
  ctx: CanvasRenderingContext2D,
  s: ImageShape,
  scale: number,
  cache?: ImageCache,
) {
  const img = cache?.get(s.dataUrl)
  if (!img || !img.complete || img.naturalWidth === 0) return
  const x = s.w >= 0 ? s.x : s.x + s.w
  const y = s.h >= 0 ? s.y : s.y + s.h
  const w = Math.abs(s.w)
  const h = Math.abs(s.h)
  ctx.drawImage(img, x * scale, y * scale, w * scale, h * scale)
}

function drawBrush(
  ctx: CanvasRenderingContext2D,
  s: BrushShape,
  scale: number,
  imageCache?: ImageCache,
) {
  if (s.points.length === 0) return
  // Custom tip stamp (imported brush) — always goes through the stamped path
  // so each step is a tinted blit of the user-provided tip image. Falls back
  // to the soft-tip stamped path if the tip image isn't loaded yet.
  if (s.tipDataUrl && imageCache) {
    const tipImg = imageCache.get(s.tipDataUrl)
    if (tipImg) {
      drawBrushWithTipImage(ctx, s, scale, tipImg)
      return
    }
  }
  // Dispatch — stamped path is required when the brush has a soft edge or
  // partial-flow stamps; otherwise the legacy polyline path renders identically
  // to the pre-options behavior (and is materially faster).
  const hardness = s.hardness ?? 1
  const flow = s.flow ?? 1
  const useStamped = hardness < 1 || flow < 1
  if (useStamped) {
    drawBrushStamped(ctx, s, scale, hardness, flow)
    return
  }
  drawBrushPolyline(ctx, s, scale)
}

/**
 * Custom-tip stamped brush. Each step blits the imported tip image, sized to
 * the brush diameter, tinted to the stroke colour by alpha-multiplying a
 * solid colour rect through the tip's own alpha channel. Same offscreen
 * assembly as the soft-tip path so flow/opacity composition is identical.
 */
function drawBrushWithTipImage(
  ctx: CanvasRenderingContext2D,
  s: BrushShape,
  scale: number,
  tipImg: HTMLImageElement,
) {
  const diameter = Math.max(1, s.strokeWidth * scale)
  const radius = diameter / 2
  const spacing = clamp01(s.spacing ?? 0.25)
  const stepPx = Math.max(1, diameter * (spacing > 0 ? spacing : 0.05))
  const stamps = planStamps(s.points, scale, stepPx)
  if (stamps.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of stamps) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const offX = Math.floor(minX - radius - 1)
  const offY = Math.floor(minY - radius - 1)
  const offW = Math.ceil(maxX + radius + 1) - offX
  const offH = Math.ceil(maxY + radius + 1) - offY
  if (offW < 1 || offH < 1) return

  const tipColor = tipColorForBrush(s)
  const tinted = getTintedTip(tipImg, Math.round(diameter), tipColor)
  const off = document.createElement('canvas')
  off.width = offW
  off.height = offH
  const offCtx = off.getContext('2d')
  if (!offCtx) return
  const flow = clamp01(s.flow ?? 1)
  offCtx.globalAlpha = flow
  for (const p of stamps) {
    offCtx.drawImage(tinted, p.x - radius - offX, p.y - radius - offY)
  }

  if (s.eraser) {
    ctx.globalCompositeOperation = 'destination-out'
  } else if (s.mode === 'burn') {
    ctx.globalCompositeOperation = 'multiply'
  } else if (s.mode === 'dodge') {
    ctx.globalCompositeOperation = 'lighter'
  }
  ctx.drawImage(off, offX, offY)
}

/**
 * Build (and cache) a colour-tinted copy of the tip image at the given
 * diameter. The tint preserves the tip's alpha so the user's imported
 * texture still drives the silhouette of every stamp.
 */
const tintedTipCache = new Map<string, HTMLCanvasElement>()
const TINTED_TIP_CACHE_MAX = 64
function getTintedTip(
  img: HTMLImageElement,
  diameter: number,
  color: string,
): HTMLCanvasElement {
  const D = Math.max(1, diameter)
  const key = `${img.src.length}:${img.src.slice(-32)}|${D}|${color}`
  const cached = tintedTipCache.get(key)
  if (cached) {
    tintedTipCache.delete(key)
    tintedTipCache.set(key, cached)
    return cached
  }
  const c = document.createElement('canvas')
  c.width = D
  c.height = D
  const cx = c.getContext('2d')
  if (cx) {
    cx.drawImage(img, 0, 0, D, D)
    cx.globalCompositeOperation = 'source-in'
    cx.fillStyle = color
    cx.fillRect(0, 0, D, D)
  }
  tintedTipCache.set(key, c)
  if (tintedTipCache.size > TINTED_TIP_CACHE_MAX) {
    const first = tintedTipCache.keys().next().value
    if (first) tintedTipCache.delete(first)
  }
  return c
}

function drawBrushPolyline(
  ctx: CanvasRenderingContext2D,
  s: BrushShape,
  scale: number,
) {
  // Mode dispatch — dodge/burn override color + composite op; eraser cuts
  // alpha; default is straight FG-coloured stroke.
  if (s.mode === 'dodge') {
    ctx.strokeStyle = '#ffffff'
    ctx.globalCompositeOperation = 'lighter'
  } else if (s.mode === 'burn') {
    ctx.strokeStyle = '#000000'
    ctx.globalCompositeOperation = 'multiply'
  } else if (s.eraser) {
    ctx.strokeStyle = s.color
    ctx.globalCompositeOperation = 'destination-out'
  } else {
    ctx.strokeStyle = s.color
  }
  ctx.lineWidth = s.strokeWidth * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(s.points[0].x * scale, s.points[0].y * scale)
  if (s.points.length === 1) {
    // Single point — draw as a tiny dot
    ctx.lineTo(s.points[0].x * scale + 0.01, s.points[0].y * scale + 0.01)
  } else {
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x * scale, s.points[i].y * scale)
    }
  }
  ctx.stroke()
  // Render path uses ctx.save()/restore() per layer, so no need to reset
  // composite/strokeStyle here.
}

/**
 * Stamped brush path. Walks the stroke at `spacing * diameter` intervals,
 * blitting a soft-edged tip at each step into an offscreen canvas with
 * `globalAlpha = flow` for partial-coverage build-up. The offscreen is then
 * composited onto the main ctx in one drawImage call — this:
 *
 *   1. caps stroke alpha at the layer's `opacity` (overlap-within-stroke can't
 *      exceed opacity, matching PS),
 *   2. ensures any layer drop-shadow applies to the stroke as a whole rather
 *      than to each individual stamp (a 1000-stamp stroke would otherwise
 *      stack 1000 shadows).
 */
function drawBrushStamped(
  ctx: CanvasRenderingContext2D,
  s: BrushShape,
  scale: number,
  hardness: number,
  flow: number,
) {
  const diameter = Math.max(1, s.strokeWidth * scale)
  const radius = diameter / 2
  const spacing = clamp01(s.spacing ?? 0.25)
  // Spacing of 0 would loop forever; coerce to a minimum of 1px or 5% of diameter.
  const stepPx = Math.max(1, diameter * (spacing > 0 ? spacing : 0.05))

  // Build a stamping plan first so we can size the offscreen exactly to fit.
  const stamps = planStamps(s.points, scale, stepPx)
  if (stamps.length === 0) return

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of stamps) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  // Pad by radius on every side so the soft tip fits.
  const offX = Math.floor(minX - radius - 1)
  const offY = Math.floor(minY - radius - 1)
  const offW = Math.ceil(maxX + radius + 1) - offX
  const offH = Math.ceil(maxY + radius + 1) - offY
  if (offW < 1 || offH < 1) return

  const tipColor = tipColorForBrush(s)
  const tip = getBrushTip(diameter, hardness, tipColor)
  const off = document.createElement('canvas')
  off.width = offW
  off.height = offH
  const offCtx = off.getContext('2d')
  if (!offCtx) return
  offCtx.globalAlpha = clamp01(flow)
  for (const p of stamps) {
    offCtx.drawImage(tip, p.x - radius - offX, p.y - radius - offY)
  }

  // Composite the assembled stroke onto the main ctx. Mode dispatch matches
  // the polyline path: eraser → destination-out, dodge/burn → lighter/multiply.
  if (s.eraser) {
    ctx.globalCompositeOperation = 'destination-out'
  } else if (s.mode === 'burn') {
    ctx.globalCompositeOperation = 'multiply'
  } else if (s.mode === 'dodge') {
    ctx.globalCompositeOperation = 'lighter'
  }
  ctx.drawImage(off, offX, offY)
}

/**
 * Walk a polyline placing a stamp every `stepPx` along its length. Always
 * stamps the first point; the last segment may have a leftover < stepPx that
 * we ignore (matches PS — a brush stroke that ends mid-step doesn't get an
 * extra dab).
 */
function planStamps(
  points: Array<{ x: number; y: number }>,
  scale: number,
  stepPx: number,
): Array<{ x: number; y: number }> {
  if (points.length === 0) return []
  const out: Array<{ x: number; y: number }> = []
  out.push({ x: points[0].x * scale, y: points[0].y * scale })
  if (points.length === 1) return out
  let leftover = 0
  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1].x * scale
    const ay = points[i - 1].y * scale
    const bx = points[i].x * scale
    const by = points[i].y * scale
    const dx = bx - ax
    const dy = by - ay
    const segLen = Math.hypot(dx, dy)
    if (segLen === 0) continue
    let traveled = stepPx - leftover
    while (traveled <= segLen) {
      const t = traveled / segLen
      out.push({ x: ax + dx * t, y: ay + dy * t })
      traveled += stepPx
    }
    leftover = segLen - (traveled - stepPx)
  }
  return out
}

function tipColorForBrush(s: BrushShape): string {
  if (s.eraser) return '#ffffff'
  if (s.mode === 'burn') return '#000000'
  if (s.mode === 'dodge') return '#ffffff'
  return s.color
}

// Cap on the tip cache. Each entry is at most ~200×200 px ARGB ≈ 160 KB; 64
// entries ≈ 10 MB worst case. LRU eviction via Map insertion-order.
const TIP_CACHE_MAX = 64
const tipCache = new Map<string, HTMLCanvasElement>()

function getBrushTip(
  diameter: number,
  hardness: number,
  color: string,
): HTMLCanvasElement {
  // Round before keying so dragging a slider doesn't continuously rebuild.
  const D = Math.max(1, Math.round(diameter))
  const H = Math.round(hardness * 20) / 20
  const key = `${D}|${H}|${color}`
  const cached = tipCache.get(key)
  if (cached) {
    // Refresh LRU position.
    tipCache.delete(key)
    tipCache.set(key, cached)
    return cached
  }
  const c = document.createElement('canvas')
  c.width = D
  c.height = D
  const cctx = c.getContext('2d')
  if (cctx) {
    const r = D / 2
    // Solid disk in the brush color, then mask with a radial alpha fade —
    // same two-pass technique used by the sample-pixel tools, gives accurate
    // soft edges regardless of color components.
    cctx.fillStyle = color
    cctx.beginPath()
    cctx.arc(r, r, r, 0, Math.PI * 2)
    cctx.fill()
    cctx.globalCompositeOperation = 'destination-in'
    // hardness=1 → solid radius == r (no falloff); hardness=0 → solid center
    // is a single point, falloff fills the entire radius.
    const inner = r * H
    const grad = cctx.createRadialGradient(r, r, inner, r, r, r)
    grad.addColorStop(0, 'rgba(0,0,0,1)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    cctx.fillStyle = grad
    cctx.fillRect(0, 0, D, D)
  }
  tipCache.set(key, c)
  if (tipCache.size > TIP_CACHE_MAX) {
    // Evict oldest entry.
    const oldestKey = tipCache.keys().next().value
    if (oldestKey !== undefined) tipCache.delete(oldestKey)
  }
  return c
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function drawMosaic(
  ctx: CanvasRenderingContext2D,
  s: MosaicShape,
  scale: number,
  underlying: HTMLCanvasElement,
) {
  const x = s.x * scale
  const y = s.y * scale
  const w = s.w * scale
  const h = s.h * scale
  const nx = w >= 0 ? x : x + w
  const ny = h >= 0 ? y : y + h
  const nw = Math.abs(w)
  const nh = Math.abs(h)
  if (nw < 2 || nh < 2) return

  // Pixelate by downscaling-then-upscaling the source region with smoothing off.
  const cell = Math.max(2, Math.round(s.cell * scale))
  const tinyW = Math.max(1, Math.round(nw / cell))
  const tinyH = Math.max(1, Math.round(nh / cell))
  const tiny = document.createElement('canvas')
  tiny.width = tinyW
  tiny.height = tinyH
  const tctx = tiny.getContext('2d')
  if (!tctx) return
  tctx.imageSmoothingEnabled = false
  tctx.drawImage(underlying, nx, ny, nw, nh, 0, 0, tinyW, tinyH)
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tiny, 0, 0, tinyW, tinyH, nx, ny, nw, nh)
  ctx.restore()
}
