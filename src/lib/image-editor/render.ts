import { drawShape, type ImageCache } from './drawing'
import { filterString } from './filters'
import { getHandles, getLayerBBox, normalizeRect } from './hit'
import { translateLayer } from './transform'
import type {
  BlendMode,
  EditorState,
  Layer,
  MaskLayer,
  Rect,
  Shadow,
} from './types'

export type RenderInput = {
  image: HTMLImageElement
  state: EditorState
  /**
   * Pixel scale applied when drawing. Use the preview scale for the live
   * canvas, and 1 (or > 1) for the export canvas.
   */
  scale: number
  /**
   * Preview-pixel-space dimensions (the scale at which shape coordinates were
   * recorded). Used to convert shape coords → target pixels: targetScale = scale / previewScale.
   */
  previewScale: number
  /** Optional in-progress shape drawn on top of all committed layers. */
  drawingPreview?: { layer: Layer }
  /**
   * If set, draw selection chrome (dashed bbox + handles) for this layer
   * after all rendering is done. Live preview only — never set during export.
   */
  selection?: { layer: Layer }
  /** Cache of HTMLImageElements keyed by dataUrl, for image-shape layers. */
  imageCache?: ImageCache
}

export function dimsAfterRotation(
  image: HTMLImageElement,
  state: EditorState,
): { baseW: number; baseH: number; rotated90: boolean } {
  const rotated90 = state.transforms.rotation === 90 || state.transforms.rotation === 270
  return {
    baseW: rotated90 ? image.naturalHeight : image.naturalWidth,
    baseH: rotated90 ? image.naturalWidth : image.naturalHeight,
    rotated90,
  }
}

/**
 * Effective rendered dimensions in source-pixel space, after rotation AND any
 * active crop. previewScale is the *original* fit (PREVIEW_MAX / max(baseW,
 * baseH)) so coords stay stable across crop changes; the cropped canvas is just
 * smaller.
 */
export function effectiveDims(
  image: HTMLImageElement,
  state: EditorState,
  previewScale: number,
): { effW: number; effH: number; cropX: number; cropY: number } {
  const { baseW, baseH } = dimsAfterRotation(image, state)
  if (!state.cropRect) {
    return { effW: baseW, effH: baseH, cropX: 0, cropY: 0 }
  }
  // cropRect is in preview-pixel post-rotation space; convert to source pixels.
  const c = state.cropRect
  return {
    effW: Math.abs(c.w) / previewScale,
    effH: Math.abs(c.h) / previewScale,
    cropX: (c.w >= 0 ? c.x : c.x + c.w) / previewScale,
    cropY: (c.h >= 0 ? c.y : c.y + c.h) / previewScale,
  }
}

/**
 * Render the full editor state (image background + layers + in-progress
 * preview) onto the given canvas at the given pixel scale.
 *
 * Render order is bottom→top through state.layers. The image-as-background
 * is rendered first, with transforms+filters applied. Then each user layer:
 * - `annotation`: draw the shape with its blend mode + opacity
 * - `mask`: clip everything that's been drawn so far to the union of its rects
 *   (effectively "delete pixels outside the mask region")
 *
 * Eraser strokes (brush shapes with eraser=true) use destination-out so they
 * remove pixels of any layer drawn before them.
 */
export function renderTo(canvas: HTMLCanvasElement, input: RenderInput): void {
  const { image, state, scale, previewScale, drawingPreview } = input
  const { baseW, baseH } = dimsAfterRotation(image, state)
  const { effW, effH, cropX, cropY } = effectiveDims(image, state, previewScale)
  const w = Math.max(1, Math.round(effW * scale))
  const h = Math.max(1, Math.round(effH * scale))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // ── 1. Image background (with transforms + filters) ─────────────────────
  if (state.imageLayer.visible) {
    if (state.cropRect) {
      // Cropped path: render the full rotated/flipped image to a temp canvas
      // sized to baseW×baseH, then blit the crop sub-rect into the destination.
      const fullW = Math.max(1, Math.round(baseW * scale))
      const fullH = Math.max(1, Math.round(baseH * scale))
      const tmp = document.createElement('canvas')
      tmp.width = fullW
      tmp.height = fullH
      const tctx = tmp.getContext('2d')
      if (tctx) {
        tctx.globalAlpha = state.imageLayer.opacity / 100
        tctx.globalCompositeOperation = blendModeToOp(state.imageLayer.blend)
        tctx.filter = filterString(state.adjust)
        tctx.translate(fullW / 2, fullH / 2)
        if (state.transforms.rotation !== 0) {
          tctx.rotate((state.transforms.rotation * Math.PI) / 180)
        }
        tctx.scale(state.transforms.flipH ? -1 : 1, state.transforms.flipV ? -1 : 1)
        const drawW = image.naturalWidth * scale
        const drawH = image.naturalHeight * scale
        tctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH)
      }
      ctx.drawImage(tmp, cropX * scale, cropY * scale, w, h, 0, 0, w, h)
    } else {
      ctx.save()
      ctx.globalAlpha = state.imageLayer.opacity / 100
      ctx.globalCompositeOperation = blendModeToOp(state.imageLayer.blend)
      ctx.filter = filterString(state.adjust)
      ctx.translate(w / 2, h / 2)
      if (state.transforms.rotation !== 0) {
        ctx.rotate((state.transforms.rotation * Math.PI) / 180)
      }
      ctx.scale(state.transforms.flipH ? -1 : 1, state.transforms.flipV ? -1 : 1)
      const drawW = image.naturalWidth * scale
      const drawH = image.naturalHeight * scale
      ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH)
      ctx.restore()
    }
  }

  // Reset to identity for overlay rendering.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'

  // For mosaic: it samples pixels from "everything rendered so far". Snapshot
  // the canvas before drawing each mosaic layer.
  const annoScale = scale / previewScale

  // Crop offset applied to layer SHAPES (not the ctx) — keeps draw + sample
  // coords in the same space, so mosaic samples the right pixels under crop.
  // Shape coords live in original-image preview-pixel space; shifting by
  // -cropOriginX/Y in preview pixels equals -cropX*scale in target pixels.
  const cropOriginX = state.cropRect
    ? Math.min(state.cropRect.x, state.cropRect.x + state.cropRect.w)
    : 0
  const cropOriginY = state.cropRect
    ? Math.min(state.cropRect.y, state.cropRect.y + state.cropRect.h)
    : 0
  const shiftForCrop = (layer: Layer): Layer =>
    state.cropRect ? translateLayer(layer, -cropOriginX, -cropOriginY) : layer

  for (const layer of state.layers) {
    if (!layer.visible) continue
    const l = shiftForCrop(layer)
    if (l.kind === 'annotation') {
      ctx.save()
      ctx.globalAlpha = l.opacity / 100
      ctx.globalCompositeOperation = blendModeToOp(l.blend)
      applyShadow(ctx, l.shadow, annoScale)
      // Mosaic is the only shape that needs to read the underlying composite.
      const underlying =
        l.shape.kind === 'mosaic' ? snapshotCanvas(canvas) : canvas
      drawShape(ctx, l.shape, annoScale, underlying, input.imageCache)
      ctx.restore()
    } else if (l.kind === 'mask') {
      applyMask(ctx, l, annoScale, w, h)
    }
  }

  // In-progress preview (a layer not yet committed to state.layers).
  if (drawingPreview) {
    const layer = shiftForCrop(drawingPreview.layer)
    if (layer.kind === 'annotation') {
      ctx.save()
      ctx.globalAlpha = layer.opacity / 100
      ctx.globalCompositeOperation = blendModeToOp(layer.blend)
      applyShadow(ctx, layer.shadow, annoScale)
      const underlying =
        layer.shape.kind === 'mosaic' ? snapshotCanvas(canvas) : canvas
      drawShape(ctx, layer.shape, annoScale, underlying, input.imageCache)
      ctx.restore()
    } else if (layer.kind === 'mask') {
      applyMask(ctx, layer, annoScale, w, h)
    }
  }

  // Selection chrome — drawn last so it sits above all content. Skipped for
  // export renders (caller doesn't pass `selection`).
  if (input.selection) {
    drawSelectionChrome(ctx, shiftForCrop(input.selection.layer), annoScale)
  }
}

/**
 * Draw a dashed bbox + handle markers for the selected layer.
 * Coordinates are in preview-canvas pixel space, scaled to target via `scale`.
 */
function drawSelectionChrome(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  scale: number,
) {
  const bbox = getLayerBBox(layer)
  if (!bbox) return
  const r = normalizeRect(bbox)

  // Dashed outline. Dashes scale with `scale` so they look the same in preview vs export.
  // Inherits the caller's transform (so an active crop translation applies).
  ctx.save()
  ctx.strokeStyle = 'oklch(0.7 0.18 250)'
  ctx.lineWidth = Math.max(1, scale)
  ctx.setLineDash([6 * scale, 4 * scale])
  ctx.strokeRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale)
  ctx.setLineDash([])

  // Handles
  const handles = getHandles(layer)
  const size = 8 * scale
  for (const h of handles) {
    const hx = h.x * scale - size / 2
    const hy = h.y * scale - size / 2
    ctx.fillStyle = '#fff'
    ctx.fillRect(hx, hy, size, size)
    ctx.strokeStyle = 'oklch(0.55 0.20 250)'
    ctx.lineWidth = Math.max(1, scale)
    ctx.strokeRect(hx, hy, size, size)
  }
  ctx.restore()
}

/**
 * Apply a layer's drop shadow to the canvas context. Shadow offsets are stored
 * in preview-pixel space; multiply by `scale` to convert to target pixels.
 * No-op when the shadow is undefined or disabled.
 */
function applyShadow(
  ctx: CanvasRenderingContext2D,
  shadow: Shadow | undefined,
  scale: number,
) {
  if (!shadow || !shadow.enabled) return
  ctx.shadowColor = shadow.color
  ctx.shadowOffsetX = shadow.offsetX * scale
  ctx.shadowOffsetY = shadow.offsetY * scale
  ctx.shadowBlur = shadow.blur * scale
}

function blendModeToOp(b: BlendMode): GlobalCompositeOperation {
  switch (b) {
    case 'normal':
      return 'source-over'
    case 'multiply':
      return 'multiply'
    case 'screen':
      return 'screen'
    case 'overlay':
      return 'overlay'
    case 'darken':
      return 'darken'
    case 'lighten':
      return 'lighten'
  }
}

/** Mosaic helper: copy current canvas pixels to a detached canvas to sample from. */
function snapshotCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const snap = document.createElement('canvas')
  snap.width = c.width
  snap.height = c.height
  const sctx = snap.getContext('2d')
  if (sctx) sctx.drawImage(c, 0, 0)
  return snap
}

/**
 * Mask layer: clip everything currently on the canvas to the union of
 * the layer's rects. Implementation: build a fill path from rects, then use
 * destination-in so only pixels inside the mask survive.
 */
function applyMask(
  ctx: CanvasRenderingContext2D,
  layer: MaskLayer,
  scale: number,
  w: number,
  h: number,
) {
  if (layer.rects.length === 0) return
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = '#000'
  // Apply mask layer opacity by alpha-fading the mask geometry so partial
  // opacity erodes the underlying alpha proportionally.
  ctx.globalAlpha = layer.opacity / 100
  ctx.beginPath()
  for (const r of normalizeRects(layer.rects, scale)) {
    ctx.rect(r.x, r.y, r.w, r.h)
  }
  ctx.fill('evenodd')
  ctx.restore()
  void w
  void h
}

function normalizeRects(rects: Rect[], scale: number): Rect[] {
  return rects.map((r) => {
    const x = r.x * scale
    const y = r.y * scale
    const w = r.w * scale
    const h = r.h * scale
    return {
      x: w >= 0 ? x : x + w,
      y: h >= 0 ? y : y + h,
      w: Math.abs(w),
      h: Math.abs(h),
    }
  })
}
