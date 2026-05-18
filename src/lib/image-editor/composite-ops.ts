import type { ImageCache } from './drawing'
import { PREVIEW_MAX } from './defaults'
import { normalizeRect } from './hit'
import { dimsAfterRotation, renderTo } from './render'
import type {
  AnnotationLayer,
  EditorState,
  ImageShape,
  Layer,
  Point,
  Rect,
  SmartObjectLayer,
  SmartSource,
} from './types'

/**
 * Composite helpers shared by Edit (Cut / Copy / Paste / Fill / Stroke) and
 * Layer (Merge Down / Merge Visible / Flatten Image). All of these reduce
 * down to "render some subset of state.layers onto a canvas at source
 * resolution, then either extract a region as a dataUrl, or commit a new
 * image-shape layer with the result."
 *
 * Coordinate convention: every helper takes preview-pixel coordinates (the
 * same space shape coords live in). Internally we render at scale = 1 so the
 * output captures full source-resolution pixels regardless of how the live
 * canvas is zoomed.
 */

/** What `regionFromSelection` returns — a marquee rect, a lasso path, or null. */
export type SelectionRegion =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'path'; path: Point[]; bbox: Rect }

/** Broader region type — selection plus an explicit "the whole canvas" case. */
export type RegionShape =
  | SelectionRegion
  | { kind: 'full'; dims: { w: number; h: number } }

/**
 * The preview-pixel canvas dimensions (post-rotation, post-crop). Needed
 * both for "Select All / canvas-sized" operations and for full-image
 * composites like Flatten Image.
 */
export function previewDimsOf(
  image: HTMLImageElement,
  state: EditorState,
): { w: number; h: number; previewScale: number } {
  const { baseW, baseH } = dimsAfterRotation(image, state)
  const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
  if (state.cropRect) {
    return {
      w: Math.abs(state.cropRect.w),
      h: Math.abs(state.cropRect.h),
      previewScale,
    }
  }
  return { w: baseW * previewScale, h: baseH * previewScale, previewScale }
}

/**
 * Build the active region from EditorState's selection. The Edit menu uses
 * this to mean "where to operate"; a `null` return means "no selection →
 * operate on the entire canvas" (PS semantics for Copy / Fill / Stroke).
 */
export function regionFromSelection(state: EditorState): SelectionRegion | null {
  const path = state.selectionPath
  if (path && path.length >= 3) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of path) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    return {
      kind: 'path',
      path,
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    }
  }
  if (state.selection && state.selection.w !== 0 && state.selection.h !== 0) {
    return { kind: 'rect', rect: normalizeRect(state.selection) }
  }
  return null
}

/**
 * Render the editor state to a fresh canvas at source-pixel resolution
 * (scale = 1). `layerFilter`, when given, lets the caller narrow the set of
 * layers that participate — used by Merge Down (only the two layers being
 * merged), Merge Visible (all visible layers), Copy Merged (all layers).
 *
 * `includeImageBackground` controls whether the underlying image is drawn —
 * pass `false` for "render this layer alone, not the image behind it" so
 * Copy on an isolated layer doesn't bake the background into the clipboard.
 */
export function renderEditorToCanvas(
  image: HTMLImageElement,
  state: EditorState,
  imageCache: ImageCache | undefined,
  opts?: {
    layerFilter?: (layer: Layer) => boolean
    includeImageBackground?: boolean
  },
): HTMLCanvasElement {
  const { previewScale } = previewDimsOf(image, state)
  const subState: EditorState = {
    ...state,
    imageLayer: opts?.includeImageBackground === false
      ? { ...state.imageLayer, visible: false }
      : state.imageLayer,
    layers: opts?.layerFilter ? filterLayerTree(state.layers, opts.layerFilter) : state.layers,
    // Strip selection from sub-render so marching-ants chrome doesn't bake in.
    selection: undefined,
    selectionPath: undefined,
    selectionInverse: undefined,
  }
  const canvas = document.createElement('canvas')
  renderTo(canvas, { image, state: subState, scale: 1, previewScale, imageCache })
  return canvas
}

/** Recurse a layer tree, keeping only layers passing `pred` (groups recurse). */
function filterLayerTree(layers: Layer[], pred: (l: Layer) => boolean): Layer[] {
  const out: Layer[] = []
  for (const l of layers) {
    if (l.kind === 'group') {
      const kids = filterLayerTree(l.children, pred)
      if (pred(l) || kids.length > 0) {
        out.push({ ...l, children: kids })
      }
      continue
    }
    if (pred(l)) out.push(l)
  }
  return out
}

/**
 * Extract `region` from `srcCanvas` (source-pixel space) and return both a
 * dataUrl of just that region and the region's preview-pixel bbox. Used by
 * Copy / Copy Merged to seed the clipboard.
 *
 * For path regions, the region's pixels outside the polygon are erased
 * (`destination-in` clip) so a rounded / lasso selection produces a tightly
 * cropped, transparent-outside image.
 */
export function extractRegion(
  srcCanvas: HTMLCanvasElement,
  region: RegionShape,
  previewScale: number,
): { dataUrl: string; bbox: Rect } | null {
  const bbox = region.kind === 'full' ? regionFullBBox(region) : region.kind === 'rect' ? region.rect : region.bbox
  if (bbox.w <= 0 || bbox.h <= 0) return null
  const sx = Math.floor(bbox.x / previewScale)
  const sy = Math.floor(bbox.y / previewScale)
  const sw = Math.max(1, Math.ceil(bbox.w / previewScale))
  const sh = Math.max(1, Math.ceil(bbox.h / previewScale))
  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  const ctx = out.getContext('2d')
  if (!ctx) return null
  if (region.kind === 'path') {
    // Trace the path into the local canvas space then destination-in clip so
    // pixels outside the polygon become transparent.
    ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fillStyle = '#000'
    ctx.beginPath()
    for (let i = 0; i < region.path.length; i++) {
      const p = region.path[i]
      const x = (p.x - bbox.x) / previewScale
      const y = (p.y - bbox.y) / previewScale
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
  }
  let dataUrl: string
  try {
    dataUrl = out.toDataURL('image/png')
  } catch {
    return null
  }
  return { dataUrl, bbox }
}

function regionFullBBox(r: { kind: 'full'; dims: { w: number; h: number } }): Rect {
  return { x: 0, y: 0, w: r.dims.w, h: r.dims.h }
}

/**
 * Build a Smart Object layer + its source entry for "Convert to Smart
 * Object" / "Place Embedded". The caller is responsible for inserting the
 * returned `{ layer, sourceId, source }` into state — appending to
 * `smartSources[sourceId]` and replacing or inserting the layer.
 *
 * `place` selects how the SO is positioned:
 *   - 'fit': fill the entire preview canvas (used by Place Embedded with a
 *     fresh image — common case for opening an image as SO inside a doc).
 *   - 'sourceBbox': position the source at the given (x, y) at its natural
 *     pixel resolution (used by Convert from existing layer; we use the
 *     layer's pre-conversion bbox).
 */
export function buildSmartObject(args: {
  source: SmartSource
  name: string
  place:
    | { kind: 'fit'; canvasW: number; canvasH: number }
    | { kind: 'sourceBbox'; bbox: Rect }
}): { layer: SmartObjectLayer; sourceId: string; source: SmartSource } {
  const sourceId = crypto.randomUUID()
  let bbox: Rect
  if (args.place.kind === 'fit') {
    bbox = { x: 0, y: 0, w: args.place.canvasW, h: args.place.canvasH }
  } else {
    bbox = normalizeRect(args.place.bbox)
  }
  const layer: SmartObjectLayer = {
    id: crypto.randomUUID(),
    name: args.name,
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'smartObject',
    sourceRef: sourceId,
    transform: {
      x: bbox.x,
      y: bbox.y,
      w: bbox.w,
      h: bbox.h,
      rotation: 0,
      anchorX: bbox.x + bbox.w / 2,
      anchorY: bbox.y + bbox.h / 2,
    },
  }
  return { layer, sourceId, source: args.source }
}

/**
 * Render a single layer (and any nested children) to a fresh source-pixel
 * canvas and return both the dataUrl + bbox. Used by Convert to Smart
 * Object: take the existing layer, rasterize what's currently visible
 * (effects, clip, transforms all included via renderEditorToCanvas), then
 * the caller swaps in a fresh SmartObjectLayer pointing at the new source.
 */
export function rasterizeLayer(args: {
  image: HTMLImageElement
  state: EditorState
  imageCache: ImageCache | undefined
  layerId: string
  /** Optional crop in preview-pixel space; the resulting raster covers only
   *  this region (translated to the raster's origin). Used by Convert to
   *  Smart Object so the source contains just the layer's bbox, not the
   *  full canvas. Omit to keep the full canvas. */
  crop?: Rect
}): { dataUrl: string; bbox: Rect; sourcePixelW: number; sourcePixelH: number } | null {
  const { image, state, imageCache, layerId, crop } = args
  const { previewScale, w: canvasW, h: canvasH } = previewDimsOf(image, state)
  if (canvasW <= 0 || canvasH <= 0) return null
  const target = findLayerInTree(state.layers, layerId)
  if (!target) return null
  const allowed = collectIdsIncludingDescendants(target)
  const fullCanvas = renderEditorToCanvas(image, state, imageCache, {
    layerFilter: (l) => allowed.has(l.id),
    includeImageBackground: false,
  })
  let outCanvas: HTMLCanvasElement = fullCanvas
  let outBbox: Rect = { x: 0, y: 0, w: canvasW, h: canvasH }
  if (crop) {
    const c = normalizeRect(crop)
    // Convert preview-pixel crop to source-pixel coords on fullCanvas (which
    // was rendered at scale=1 in source pixels via renderEditorToCanvas's
    // internal logic — see how that helper sets scale=1 then previewScale).
    const sx = Math.max(0, Math.floor(c.x / previewScale))
    const sy = Math.max(0, Math.floor(c.y / previewScale))
    const sw = Math.max(1, Math.ceil(c.w / previewScale))
    const sh = Math.max(1, Math.ceil(c.h / previewScale))
    const tmp = document.createElement('canvas')
    tmp.width = sw
    tmp.height = sh
    const tctx = tmp.getContext('2d')
    if (!tctx) return null
    tctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
    outCanvas = tmp
    outBbox = c
  }
  let dataUrl: string
  try {
    dataUrl = outCanvas.toDataURL('image/png')
  } catch {
    return null
  }
  return {
    dataUrl,
    bbox: outBbox,
    sourcePixelW: outCanvas.width,
    sourcePixelH: outCanvas.height,
  }
}

/** Find a layer in a tree by id (DFS). Local copy to avoid the layer-tree
 *  import cycle that pulls in more than this module needs. */
function findLayerInTree(layers: Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.kind === 'group') {
      const sub = findLayerInTree(l.children, id)
      if (sub) return sub
    }
  }
  return null
}

/** Set of layer ids for `layer` and (if a group) every descendant — used
 *  when rasterizing a group so its children render too. */
function collectIdsIncludingDescendants(layer: Layer): Set<string> {
  const set = new Set<string>()
  const walk = (l: Layer) => {
    set.add(l.id)
    if (l.kind === 'group') for (const c of l.children) walk(c)
  }
  walk(layer)
  return set
}

/**
 * Build a new annotation layer carrying `dataUrl` at the given bbox. Used by
 * Copy (after extractRegion), Paste, Fill, Stroke, and the merge operations.
 * The name is included in the layer's display label.
 */
export function buildImageShapeLayer(args: {
  dataUrl: string
  bbox: Rect
  name: string
}): AnnotationLayer {
  const shape: ImageShape = {
    kind: 'image',
    x: args.bbox.x,
    y: args.bbox.y,
    w: args.bbox.w,
    h: args.bbox.h,
    dataUrl: args.dataUrl,
  }
  return {
    id: crypto.randomUUID(),
    name: args.name,
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'annotation',
    shape,
  }
}

/**
 * Composite all visible layers (matching `pred`) into a single image-shape
 * annotation layer. Used by Merge Down / Merge Visible / Stamp Visible. The
 * output covers the entire preview canvas (full-bleed) — callers can crop
 * later if needed, but this keeps the merged layer in the same coordinate
 * frame as the original layers.
 *
 * `includeImageBackground` is opt-in (defaults false) because Merge Down /
 * Merge Visible should not bake the underlying image into the new layer
 * (that would double-render the image once the merged layer is composited
 * on top). Stamp Visible (Cmd+Shift+Alt+E in PS) does the opposite: it
 * produces a snapshot of *everything currently visible*, image included.
 */
export function mergeLayersToImageLayer(args: {
  image: HTMLImageElement
  state: EditorState
  imageCache: ImageCache | undefined
  pred: (l: Layer) => boolean
  name: string
  includeImageBackground?: boolean
}): AnnotationLayer | null {
  const { image, state, imageCache, pred, name, includeImageBackground = false } = args
  const { w, h } = previewDimsOf(image, state)
  if (w <= 0 || h <= 0) return null
  const canvas = renderEditorToCanvas(image, state, imageCache, {
    layerFilter: pred,
    includeImageBackground,
  })
  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL('image/png')
  } catch {
    return null
  }
  return buildImageShapeLayer({
    dataUrl,
    bbox: { x: 0, y: 0, w, h },
    name,
  })
}

/**
 * Composite the entire editor (image background + all layers) into a single
 * source-resolution canvas, then return a dataUrl. Used by Flatten Image —
 * caller swaps the bound image to a freshly-loaded version of this dataUrl
 * and resets transforms / layers.
 */
export function flattenToDataUrl(
  image: HTMLImageElement,
  state: EditorState,
  imageCache: ImageCache | undefined,
): string | null {
  const canvas = renderEditorToCanvas(image, state, imageCache, {
    includeImageBackground: true,
  })
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
