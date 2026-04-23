import type {
  ArrowShape,
  BrushShape,
  ImageShape,
  MosaicShape,
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
  }
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
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.strokeWidth * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.eraser) ctx.globalCompositeOperation = 'destination-out'
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
  if (s.eraser) ctx.globalCompositeOperation = 'source-over'
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
