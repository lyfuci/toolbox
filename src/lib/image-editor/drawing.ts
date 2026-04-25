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
  RectShape,
  Shape,
  TextShape,
} from './types'

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
): void {
  switch (shape.kind) {
    case 'rect':
      drawRect(ctx, shape, scale)
      break
    case 'arrow':
      drawArrow(ctx, shape, scale)
      break
    case 'text':
      drawText(ctx, shape, scale)
      break
    case 'mosaic':
      drawMosaic(ctx, shape, scale, underlying)
      break
    case 'brush':
      drawBrush(ctx, shape, scale)
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
  }
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
  ctx.fillStyle = s.color
  ctx.font = `${Math.round(s.fontSize * scale)}px sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillText(s.text, s.x * scale, s.y * scale)
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

function drawBrush(ctx: CanvasRenderingContext2D, s: BrushShape, scale: number) {
  if (s.points.length === 0) return
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
