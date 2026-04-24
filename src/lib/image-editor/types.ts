// Editor data model. Every layer (incl. the image background) is uniformly
// described by a Layer with visible/opacity/blend; the variant fields under
// `kind` carry layer-specific data. The render pipeline walks the layer list
// bottom→top and composites accordingly.

export type Rotation = 0 | 90 | 180 | 270

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'

export const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
]

/**
 * Editor tool. Tools split into two camps:
 *
 * **Functional**: implemented and produce a real result on the canvas —
 *   none, rect, ellipse, line, arrow, text, mosaic, brush, eraser, mask,
 *   eyedropper, crop, zoom.
 *
 * **Stub** (palette button only, marked as not-yet-implemented in UI; chosen
 * to round out the PS-aligned tool list): marquee, lasso, polyLasso, wand,
 * spotHeal, stamp, historyBrush, gradient, bucket, blur, dodge, pen,
 * arrowPath, hand, rotateView, frame, note.
 */
export type Tool =
  // Functional
  | 'none'
  | 'rect'
  | 'arrow'
  | 'text'
  | 'mosaic'
  | 'brush'
  | 'eraser'
  | 'mask'
  | 'zoom'
  | 'eyedropper'
  | 'crop'
  | 'ellipse'
  | 'line'
  // Stub (PS palette completeness)
  | 'marquee'
  | 'lasso'
  | 'polyLasso'
  | 'wand'
  | 'spotHeal'
  | 'stamp'
  | 'historyBrush'
  | 'gradient'
  | 'bucket'
  | 'blur'
  | 'dodge'
  | 'pen'
  | 'arrowPath'
  | 'hand'
  | 'rotateView'
  | 'frame'
  | 'note'

export type Transforms = {
  rotation: Rotation
  flipH: boolean
  flipV: boolean
}

export type Adjustments = {
  brightness: number // %, 100 = identity
  contrast: number
  saturation: number
  grayscale: number // %
  blur: number // px
  hue: number // degrees, 0 = identity, range -180..180
  sepia: number // %, 0 = identity
  invert: number // %, 0 = identity
}

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

// Shapes are the geometry/payload of an annotation layer.
export type RectShape = {
  kind: 'rect'
  x: number
  y: number
  w: number
  h: number
  color: string
  strokeWidth: number
  fill?: string
}
export type ArrowShape = {
  kind: 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  strokeWidth: number
}
export type TextShape = {
  kind: 'text'
  x: number
  y: number
  text: string
  color: string
  fontSize: number
}
export type MosaicShape = {
  kind: 'mosaic'
  x: number
  y: number
  w: number
  h: number
  cell: number
}
export type BrushShape = {
  kind: 'brush'
  points: Point[]
  color: string
  strokeWidth: number
  eraser?: boolean
}
export type ImageShape = {
  kind: 'image'
  x: number
  y: number
  w: number
  h: number
  /**
   * Source image as a data URL — keeps the layer self-contained and
   * serializable (project files embed the dataUrl directly). The render
   * pipeline holds an HTMLImageElement cache keyed by dataUrl.
   */
  dataUrl: string
}
export type EllipseShape = {
  kind: 'ellipse'
  x: number
  y: number
  w: number
  h: number
  color: string
  strokeWidth: number
  fill?: string
}
export type LineShape = {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  strokeWidth: number
}
/** Region-blur — drag a rect, area inside is blurred at render time. */
export type BlurShape = {
  kind: 'blur'
  x: number
  y: number
  w: number
  h: number
  /** Blur radius in preview-canvas pixels. */
  radius: number
}

export type Shape =
  | RectShape
  | ArrowShape
  | TextShape
  | MosaicShape
  | BrushShape
  | ImageShape
  | EllipseShape
  | LineShape
  | BlurShape

/** Drop shadow applied to a layer at render time via canvas shadow* properties. */
export type Shadow = {
  enabled: boolean
  offsetX: number // preview-canvas pixels
  offsetY: number
  blur: number
  color: string // any valid CSS color (we use rgba for opacity control)
}

type LayerCommon = {
  id: string
  name: string
  visible: boolean
  opacity: number // 0-100
  blend: BlendMode
  shadow?: Shadow
}

export type ImageLayerProps = LayerCommon & { kind: 'image' }
export type AnnotationLayer = LayerCommon & { kind: 'annotation'; shape: Shape }
export type MaskLayer = LayerCommon & {
  kind: 'mask'
  rects: Rect[] // union of these is the visible region for layers BELOW this mask
}

// User-addable overlay layer types (the image is special, see EditorState).
export type Layer = AnnotationLayer | MaskLayer

// The full editing state. The HTMLImageElement (pixels) is held outside this
// state so it doesn't enter the history stack; here we only track the image
// layer's display props (visibility / opacity / blend).
export type EditorState = {
  imageLayer: ImageLayerProps
  layers: Layer[] // ordered bottom→top
  transforms: Transforms
  adjust: Adjustments
  /**
   * Optional crop region. Stored in the same coordinate space shape coords use
   * (post-rotation preview-canvas pixels), so it's applied after transforms.
   * When set, the renderer crops the image to this rect AND translates layer
   * shapes by -(cropRect.x, cropRect.y) so they stay anchored to image pixels.
   * Set/cleared via the Crop tool; history-tracked → undo restores.
   */
  cropRect?: Rect
}

// Persisted project format (JSON sidecar).
export type Project = {
  version: number
  tool: 'toolbox-image-editor'
  source: { name: string; dataUrl: string }
  state: EditorState
}

// Output settings (not saved to project; per-export).
export type OutputFormat = 'png' | 'jpeg' | 'webp'
