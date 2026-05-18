import { applyAdjustment } from './adjustments'
import { drawShape, type ImageCache } from './drawing'
import { applyFilter, scaleFilterParams } from './filter-ops'
import { filterString } from './filters'
import { getHandles, getLayerBBox, normalizeRect } from './hit'
import {
  buildEffectContribution,
  effectIsBehindContent,
  effectsOf,
  hasEffects,
} from './layer-effects'
import { translateLayer } from './transform'
import type {
  AdjustmentLayer,
  AnnotationLayer,
  BlendMode,
  EditorState,
  FilterLayer,
  GroupLayer,
  Layer,
  MaskLayer,
  Point,
  Rect,
  SmartObjectLayer,
  SmartSource,
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
  /**
   * True when rendering the live canvas (vs. export). Gates UI-only chrome
   * like marching-ants marquee selection that shouldn't bake into exports.
   */
  liveCanvas?: boolean
  /**
   * In-progress overlay canvas drawn on top of all layers, gated on
   * `liveCanvas`. Used by drag-paint sample-pixel tools so the user sees
   * stamps appear under the cursor before mouseup commits them as a single
   * image-shape layer. Coords are in the same (cropped) source-pixel space
   * as the snapshot the stamps came from — drawn at `scale` to match the
   * target canvas. Skipped on export by virtue of liveCanvas being false.
   */
  overlayCanvas?: HTMLCanvasElement
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

  const renderCtx: PerLayerCtx = {
    annoScale,
    liveCanvas: !!input.liveCanvas,
    imageCache: input.imageCache,
    smartSources: state.smartSources ?? {},
  }
  renderLayerStack(canvas, ctx, state.layers.map(shiftForCrop), renderCtx)

  // In-progress preview (a layer not yet committed to state.layers).
  if (drawingPreview) {
    renderLayer(canvas, ctx, shiftForCrop(drawingPreview.layer), renderCtx)
  }

  // Drag-paint overlay — sits above committed layers + drawingPreview, below
  // selection chrome. Source canvas is in (cropped) source-pixel space; we
  // scale to target by `scale` (so it lands 1:1 over the rendered image).
  if (input.liveCanvas && input.overlayCanvas) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(input.overlayCanvas, 0, 0, w, h)
    ctx.restore()
  }

  // Selection chrome — drawn last so it sits above all content. Skipped for
  // export renders (caller doesn't pass `selection`).
  if (input.selection) {
    drawSelectionChrome(ctx, shiftForCrop(input.selection.layer), annoScale)
  }

  // Marquee selection (state.selection) — UI affordance only, gated on
  // `liveCanvas` so it never bakes into an export. If `selectionPath` is set,
  // draw a closed polygon outline (Lasso / Polygonal Lasso); otherwise the
  // rect bbox (Marquee / Wand).
  if (input.liveCanvas && state.selection) {
    if (state.selectionPath && state.selectionPath.length >= 3) {
      drawSelectionPathChrome(ctx, state.selectionPath, cropOriginX, cropOriginY, annoScale)
    } else {
      drawMarqueeChrome(ctx, state.selection, cropOriginX, cropOriginY, annoScale)
    }
    // Inverse selection: add an outer dashed rect along the canvas border, so
    // the user can see the marquee + outer pair (PS shows the same — ants on
    // both rings tell you the selection is inverted).
    if (state.selectionInverse) {
      drawCanvasMarqueeChrome(ctx, annoScale)
    }
  }
}

/**
 * Per-layer rendering parameters shared across recursive calls. Holds anything
 * that doesn't change between the top-level loop and any group's offscreen
 * pass — the scale, the live-canvas flag (gates UI-only chrome like notes),
 * and the image-cache for image shapes.
 */
type PerLayerCtx = {
  annoScale: number
  liveCanvas: boolean
  imageCache: ImageCache | undefined
  /** Smart Object source pool keyed by sourceRef. Threaded through so the
   *  group-recursive render path can resolve SO sources without re-passing
   *  EditorState everywhere. Empty object if state has none. */
  smartSources: { [id: string]: SmartSource }
}

/**
 * Render a single layer onto `ctx` (which is the context for `canvas`). Used
 * for both committed layers and the in-progress drawing preview, and re-
 * invoked recursively for group children. Coordinates on `layer` are assumed
 * to already be crop-shifted by the caller.
 *
 * Group layers render in two steps: first all children composite onto an
 * offscreen canvas the same size as `canvas`, then that offscreen blits onto
 * `canvas` honoring the group's own opacity, blend, and clip. This gives PS-
 * "normal mode" semantics — adjustment / filter layers inside a group only
 * affect the group's contents, not the world below it.
 */
function renderLayer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  rc: PerLayerCtx,
): void {
  if (!layer.visible) return
  // Notes are UI-only annotations — never bake into export.
  if (
    !rc.liveCanvas &&
    layer.kind === 'annotation' &&
    layer.shape.kind === 'note'
  ) {
    return
  }
  if (layer.kind === 'annotation') {
    // Slow path: any fx (modern effects or legacy shadow) → render through
    // the layer-effects pipeline so we get inner shadow / glow / stroke /
    // color overlay etc. Layer-clip + opacity + blend apply once at the
    // composite stage, identical to the fast path's semantics.
    if (hasEffects(layer)) {
      renderAnnotationWithEffects(canvas, ctx, layer, rc)
      return
    }
    ctx.save()
    ctx.globalAlpha = layer.opacity / 100
    ctx.globalCompositeOperation = blendModeToOp(layer.blend)
    applyLayerClip(ctx, layer, rc.annoScale)
    // Mosaic + Blur both sample the underlying composite — snapshot first
    // so they read pre-shape pixels rather than their own output.
    const needsUnderlying = layer.shape.kind === 'mosaic' || layer.shape.kind === 'blur'
    const underlying = needsUnderlying ? snapshotCanvas(canvas) : canvas
    drawShape(ctx, layer.shape, rc.annoScale, underlying, rc.imageCache)
    ctx.restore()
    return
  }
  if (layer.kind === 'mask') {
    applyMask(ctx, layer, rc.annoScale, canvas.width, canvas.height, rc.imageCache)
    return
  }
  if (layer.kind === 'adjustment') {
    applyAdjustmentLayer(canvas, ctx, layer, rc.annoScale)
    return
  }
  if (layer.kind === 'filter') {
    applyFilterLayer(canvas, ctx, layer, rc.annoScale)
    return
  }
  if (layer.kind === 'smartObject') {
    renderSmartObjectLayer(canvas, ctx, layer, rc)
    return
  }
  if (layer.kind === 'group') {
    renderGroupLayer(canvas, ctx, layer, rc)
    return
  }
}

/**
 * Render a group: composite children to an offscreen canvas, then drawImage
 * that offscreen onto the destination with the group's own opacity / blend /
 * clip. Children read pixel data via `snapshotCanvas(offscreen)` (mosaic /
 * blur) and `getImageData(offscreen)` (adjustment / filter), so they only
 * see other layers within the same group — "normal mode" group semantics.
 */
/**
 * Render a Smart Object layer. The source dataUrl is resolved through the
 * `imageCache` so it's loaded asynchronously (same pattern as image-shape
 * annotations); first paint after a Smart Object is added may briefly show
 * nothing until the cache populates and a re-render fires.
 *
 * Pipeline mirrors annotation-with-effects: rasterize transformed source
 * onto an offscreen of destination dims (so layer-clip, layer-blend, and
 * the layer-effects stack all work uniformly), then composite. Rotation
 * pivots around `transform.anchorX/Y` in absolute preview-pixel space.
 */
function renderSmartObjectLayer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: SmartObjectLayer,
  rc: PerLayerCtx,
): void {
  if (canvas.width < 1 || canvas.height < 1) return
  const src = rc.smartSources[layer.sourceRef]
  if (!src || !rc.imageCache) return
  const cached = rc.imageCache.get(src.dataUrl)
  if (!cached) return // source not loaded yet; caller's ensureImage call
                     // populates the cache then triggers a re-render
  // Build the (optionally filtered) source canvas. If no smart filters,
  // we draw directly from the cached HTMLImageElement to avoid an extra
  // copy; otherwise stage onto a source-sized canvas and apply filters
  // before transform-drawing.
  let sourceDraw: CanvasImageSource = cached
  const sf = layer.bakedFilters
  if (sf && sf.length > 0) {
    const fc = document.createElement('canvas')
    fc.width = cached.naturalWidth
    fc.height = cached.naturalHeight
    const fctx = fc.getContext('2d')
    if (fctx) {
      fctx.drawImage(cached, 0, 0)
      try {
        const data = fctx.getImageData(0, 0, fc.width, fc.height)
        for (const params of sf) {
          // Filters store spatial radii in preview-px; scale to source-px
          // here so a "10px blur" looks identical regardless of the SO's
          // transform.w/h.
          const scaled = scaleFilterParams(params, 1)
          applyFilter(data.data, data.width, data.height, scaled)
        }
        fctx.putImageData(data, 0, 0)
        sourceDraw = fc
      } catch {
        // CORS-tainted source — leave sourceDraw as the raw cached image.
      }
    }
  }
  const offscreen = document.createElement('canvas')
  offscreen.width = canvas.width
  offscreen.height = canvas.height
  const octx = offscreen.getContext('2d')
  if (!octx) return
  applyLayerClip(octx, layer, rc.annoScale)
  const t = layer.transform
  const ax = t.anchorX * rc.annoScale
  const ay = t.anchorY * rc.annoScale
  octx.save()
  octx.translate(ax, ay)
  if (t.rotation !== 0) octx.rotate((t.rotation * Math.PI) / 180)
  octx.translate(-ax, -ay)
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(
    sourceDraw,
    t.x * rc.annoScale,
    t.y * rc.annoScale,
    t.w * rc.annoScale,
    t.h * rc.annoScale,
  )
  octx.restore()
  compositeLayerWithEffects(canvas, ctx, layer, offscreen, rc)
}

function renderGroupLayer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: GroupLayer,
  rc: PerLayerCtx,
): void {
  if (canvas.width < 1 || canvas.height < 1) return
  const offscreen = document.createElement('canvas')
  offscreen.width = canvas.width
  offscreen.height = canvas.height
  const octx = offscreen.getContext('2d')
  if (!octx) return
  // Group's own clip applies BEFORE children render — children inherit it
  // via the canvas clip stack across their own save/restore pairs. fx like
  // stroke / inner glow then trace the *clipped* silhouette, matching PS.
  applyLayerClip(octx, layer, rc.annoScale)
  renderLayerStack(offscreen, octx, layer.children, rc)
  compositeLayerWithEffects(canvas, ctx, layer, offscreen, rc)
}

/**
 * Render a sequence of sibling layers in PS clipping-mask-aware order:
 *
 *   - A layer with `clipping: true` is masked by the alpha of the nearest
 *     non-clipping sibling below it. Multiple stacked clipping layers
 *     chain against the same base.
 *   - Adjustment / filter / mask layers can be clippers but never serve as
 *     bases (no isolated alpha to mask against).
 *
 * Implementation: maintain a `baseAlpha` snapshot of the most recent
 * eligible base layer (re-rendered in isolation onto a sibling offscreen).
 * Clipping layers render into their own offscreen, mask via
 * destination-in, then composite onto the destination.
 */
function renderLayerStack(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  rc: PerLayerCtx,
): void {
  let baseAlpha: HTMLCanvasElement | null = null
  for (const layer of layers) {
    if (!layer.visible) continue
    if (layer.clipping && baseAlpha) {
      // Render the clipping layer's contribution onto an isolated offscreen,
      // then keep only the pixels that overlap the base alpha (PS-style).
      const layerCanvas = document.createElement('canvas')
      layerCanvas.width = canvas.width
      layerCanvas.height = canvas.height
      const lctx = layerCanvas.getContext('2d')
      if (!lctx) continue
      renderLayer(layerCanvas, lctx, layer, rc)
      lctx.globalCompositeOperation = 'destination-in'
      lctx.drawImage(baseAlpha, 0, 0)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(layerCanvas, 0, 0)
      ctx.restore()
      continue
    }
    // Non-clipping (or first-in-chain) layer: render onto main canvas.
    renderLayer(canvas, ctx, layer, rc)
    // Pre-build a fresh alpha for the *next* clipping chain — only for
    // pixel-emitting layer kinds. Adjustment / filter / mask layers
    // operate on what's below; rendering them in isolation onto an empty
    // canvas yields nothing useful, so we leave baseAlpha as-is.
    if (
      layer.kind === 'annotation' ||
      layer.kind === 'smartObject' ||
      layer.kind === 'group'
    ) {
      const alpha = document.createElement('canvas')
      alpha.width = canvas.width
      alpha.height = canvas.height
      const actx = alpha.getContext('2d')
      if (actx) {
        renderLayer(alpha, actx, layer, rc)
        baseAlpha = alpha
      }
    }
  }
}

/**
 * Annotation render path used whenever the layer carries any fx (modern
 * effects array or legacy shadow). Identical math to the fast path: the
 * shape is drawn onto an offscreen the size of the destination canvas, so
 * `applyLayerClip` and "mosaic / blur snapshot the underlying composite"
 * both keep working — we just snapshot the destination *before* drawing the
 * fx layer (which is what the fast path effectively does too, since it
 * draws straight onto the destination).
 */
function renderAnnotationWithEffects(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: AnnotationLayer,
  rc: PerLayerCtx,
): void {
  if (canvas.width < 1 || canvas.height < 1) return
  const offscreen = document.createElement('canvas')
  offscreen.width = canvas.width
  offscreen.height = canvas.height
  const octx = offscreen.getContext('2d')
  if (!octx) return
  // Layer clip applies INSIDE the offscreen so the fx pipeline sees the
  // post-clip silhouette (stroke / inner glow trace the clipped edge).
  applyLayerClip(octx, layer, rc.annoScale)
  const needsUnderlying = layer.shape.kind === 'mosaic' || layer.shape.kind === 'blur'
  // Pixel-sampling shapes (mosaic / blur) read the *destination* canvas, not
  // their own offscreen — same as the fast path's "snapshot before draw".
  const underlying = needsUnderlying ? snapshotCanvas(canvas) : offscreen
  drawShape(octx, layer.shape, rc.annoScale, underlying, rc.imageCache)
  compositeLayerWithEffects(canvas, ctx, layer, offscreen, rc)
}

/**
 * Shared composite step for both annotation + group: take the layer's
 * already-rendered offscreen `content`, then composite onto the destination
 * in PS order: BEHIND effects → content → IN-FRONT effects. Each effect
 * draws DIRECTLY onto the destination with its own blend mode so it
 * correctly interacts with what's below the layer (a multiply drop shadow
 * darkens the destination, not just an empty stack). Layer opacity dims
 * the whole stack uniformly; layer blend applies to the content only.
 */
function compositeLayerWithEffects(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  content: HTMLCanvasElement,
  rc: PerLayerCtx,
): void {
  const fx = effectsOf(layer)
  const layerAlpha = layer.opacity / 100
  const dims = { w: canvas.width, h: canvas.height }

  const drawContribution = (e: typeof fx[number]) => {
    const contrib = buildEffectContribution(e, dims, content, rc.annoScale, rc.imageCache)
    if (!contrib) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = layerAlpha * (e.opacity / 100)
    ctx.globalCompositeOperation = blendModeToOp(e.blend)
    ctx.drawImage(contrib, 0, 0)
    ctx.restore()
  }

  for (const e of fx) {
    if (effectIsBehindContent(e)) drawContribution(e)
  }

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = layerAlpha
  ctx.globalCompositeOperation = blendModeToOp(layer.blend)
  ctx.drawImage(content, 0, 0)
  ctx.restore()

  for (const e of fx) {
    if (!effectIsBehindContent(e)) drawContribution(e)
  }
}

/**
 * Polygon variant of the marching-ants selection chrome. Same white-on-black
 * dashed look as `drawMarqueeChrome`, but along an arbitrary closed path —
 * used for Lasso and Polygonal Lasso selections.
 */
function drawSelectionPathChrome(
  ctx: CanvasRenderingContext2D,
  path: Point[],
  cropOriginX: number,
  cropOriginY: number,
  scale: number,
) {
  const tx = (p: Point) => ({
    x: (p.x - cropOriginX) * scale,
    y: (p.y - cropOriginY) * scale,
  })
  ctx.save()
  const trace = () => {
    ctx.beginPath()
    const first = tx(path[0])
    ctx.moveTo(first.x + 0.5, first.y + 0.5)
    for (let i = 1; i < path.length; i++) {
      const p = tx(path[i])
      ctx.lineTo(p.x + 0.5, p.y + 0.5)
    }
    ctx.closePath()
  }
  // Black halo
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = Math.max(1, scale)
  ctx.setLineDash([])
  trace()
  ctx.stroke()
  // White dashes
  ctx.strokeStyle = '#ffffff'
  ctx.setLineDash([4 * scale, 3 * scale])
  trace()
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/**
 * Outer-ring marching ants traced along the canvas edge — drawn on top of
 * the inner selection chrome when `selectionInverse` is set, so the user
 * sees both rings (matching PS's visual cue for an inverted selection).
 */
function drawCanvasMarqueeChrome(ctx: CanvasRenderingContext2D, scale: number) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  ctx.save()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = Math.max(1, scale)
  ctx.setLineDash([])
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
  ctx.strokeStyle = '#ffffff'
  ctx.setLineDash([4 * scale, 3 * scale])
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
  ctx.setLineDash([])
  ctx.restore()
}

/**
 * Draw the active marquee selection — a dashed white outline (with a thin
 * black halo for legibility on any background). Coords are in original-image
 * preview-pixel space; we shift by -cropOrigin to land in cropped-canvas
 * coords, then scale.
 */
function drawMarqueeChrome(
  ctx: CanvasRenderingContext2D,
  sel: Rect,
  cropOriginX: number,
  cropOriginY: number,
  scale: number,
) {
  const r = normalizeRect(sel)
  const x = (r.x - cropOriginX) * scale
  const y = (r.y - cropOriginY) * scale
  const w = r.w * scale
  const h = r.h * scale
  ctx.save()
  // Black halo
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = Math.max(1, scale)
  ctx.setLineDash([])
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  // White dashes on top
  ctx.strokeStyle = '#ffffff'
  ctx.setLineDash([4 * scale, 3 * scale])
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.setLineDash([])
  ctx.restore()
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
  imageCache: ImageCache | undefined,
) {
  // Raster path: when a dataUrl is set and resolved, use its alpha as the
  // mask via destination-in. The dataUrl is stored at preview-pixel
  // resolution; drawImage handles the scale to target pixels.
  if (layer.dataUrl && imageCache) {
    const cached = imageCache.get(layer.dataUrl)
    if (cached) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.globalAlpha = layer.opacity / 100
      ctx.drawImage(cached, 0, 0, w, h)
      ctx.restore()
      return
    }
    // Raster present but not yet loaded — fall through to rect-based so
    // we don't render an unmasked canvas while waiting.
  }
  if (layer.rects.length === 0) return
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = '#000'
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

/**
 * Apply a layer's baked-in selection clip (if any) to the current ctx so the
 * subsequent `drawShape` is constrained to the selection region. Coords on the
 * clip live in the same (already crop-shifted) space as the layer's shape, so
 * we just multiply by `scale`. `clipPath` (>= 3 points) takes precedence over
 * `clipRect`.
 */
function applyLayerClip(
  ctx: CanvasRenderingContext2D,
  layer: { clipRect?: Rect; clipPath?: Point[]; clipInverse?: boolean },
  scale: number,
) {
  const inverse = !!layer.clipInverse
  const path = layer.clipPath
  if (path && path.length >= 3) {
    ctx.beginPath()
    if (inverse) {
      // Outer ring covers the entire canvas in target pixels; combined with
      // the inner path via even-odd fill, the inner ring punches a hole.
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
    ctx.moveTo(path[0].x * scale, path[0].y * scale)
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x * scale, path[i].y * scale)
    }
    ctx.closePath()
    ctx.clip(inverse ? 'evenodd' : 'nonzero')
    return
  }
  const r = layer.clipRect
  if (r && r.w !== 0 && r.h !== 0) {
    const nr = normalizeRect(r)
    ctx.beginPath()
    if (inverse) {
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
    ctx.rect(nr.x * scale, nr.y * scale, nr.w * scale, nr.h * scale)
    ctx.clip(inverse ? 'evenodd' : 'nonzero')
  }
}

/**
 * Apply an adjustment layer to the accumulated canvas. Per-pixel adjustments
 * (LUT / HSL) don't need spatial info, so the transform ignores width/height.
 */
function applyAdjustmentLayer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: AdjustmentLayer,
  scale: number,
) {
  applyPixelTransformLayer(canvas, ctx, layer, scale, (data) =>
    applyAdjustment(data, layer.params),
  )
}

/**
 * Apply a filter layer. Same pipeline as adjustment, but the transform
 * receives width/height (filters are neighbourhood-dependent: blur, sharpen,
 * Sobel, etc.). Spatial params (radius / cellSize / height) are stored in
 * preview-canvas pixels and scaled here to match the target buffer's
 * resolution — keeps a "10px blur" looking the same on preview vs export.
 */
function applyFilterLayer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: FilterLayer,
  scale: number,
) {
  const params = scaleFilterParams(layer.params, scale)
  applyPixelTransformLayer(canvas, ctx, layer, scale, (data, w, h) =>
    applyFilter(data, w, h, params),
  )
}

/**
 * Shared pipeline for non-destructive pixel-transform layers (adjustments +
 * filters). Snapshot current canvas → getImageData → apply pure-JS transform
 * → putImageData → composite back through the layer's clip + opacity. Layer
 * opacity blends transformed-vs-original via globalAlpha at the composite
 * step (the transform itself runs at full strength regardless of opacity).
 *
 * CORS-tainted sources cause `getImageData` to throw — caught and the layer
 * silently no-ops rather than exploding the entire render pass.
 */
function applyPixelTransformLayer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: { clipRect?: Rect; clipPath?: Point[]; opacity: number },
  scale: number,
  transform: (data: Uint8ClampedArray, width: number, height: number) => void,
) {
  if (canvas.width < 1 || canvas.height < 1) return
  const adjusted = document.createElement('canvas')
  adjusted.width = canvas.width
  adjusted.height = canvas.height
  const actx = adjusted.getContext('2d')
  if (!actx) return
  actx.drawImage(canvas, 0, 0)
  let imageData: ImageData
  try {
    imageData = actx.getImageData(0, 0, canvas.width, canvas.height)
  } catch {
    return
  }
  transform(imageData.data, imageData.width, imageData.height)
  actx.putImageData(imageData, 0, 0)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = layer.opacity / 100
  applyLayerClip(ctx, layer, scale)
  ctx.drawImage(adjusted, 0, 0)
  ctx.restore()
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
