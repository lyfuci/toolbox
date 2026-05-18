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
  | 'burn'

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
  /**
   * Stroke mode. When set, the renderer ignores `color`/`eraser` and uses
   * additive ('lighter') or multiplicative ('multiply') blending to brighten
   * or darken the underlying pixels — same effect as PS's Dodge / Burn tools.
   */
  mode?: 'dodge' | 'burn'
  /**
   * Edge softness, 0..1. 1 = crisp (legacy polyline path); < 1 = soft falloff
   * via stamped soft-edge tip. Undefined treated as 1 for backward-compat with
   * pre-options brush layers.
   */
  hardness?: number
  /**
   * Distance between successive stamps as a fraction of brush diameter, 0..1.
   * Only meaningful in the stamped path (i.e. when `hardness < 1` or `flow <
   * 1`). Undefined treated as 0.25 (a sensible default for stamped strokes).
   */
  spacing?: number
  /**
   * Per-stamp alpha multiplier, 0..1. Combined with the layer's `opacity`
   * field (which caps stroke total) to give PS-style flow/opacity control.
   * Undefined treated as 1. Forces the stamped path when < 1.
   */
  flow?: number
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
/**
 * Sticky-note marker — non-printing annotation with a small icon on the
 * canvas. Renderer skips notes when not on the live canvas, so they never
 * bake into export.
 */
export type NoteShape = {
  kind: 'note'
  x: number
  y: number
  text: string
  color: string
}
/**
 * Frame placeholder — a rectangular container. Renders as a dashed outline
 * with a diagonal X (PS Frame Tool's empty-frame visual). Visible in export.
 */
export type FrameShape = {
  kind: 'frame'
  x: number
  y: number
  w: number
  h: number
  name?: string
}

/**
 * One anchor on a vector path. `hin` / `hout` are control-handle offsets
 * RELATIVE to the anchor (i.e. the absolute control point is `anchor + hin`).
 * Missing handles imply a corner anchor on that side; both missing = the
 * segment to/from this anchor degrades to a straight line.
 */
export type PathAnchor = {
  x: number
  y: number
  hin?: { x: number; y: number }
  hout?: { x: number; y: number }
}
/**
 * Vector path made of cubic-bezier (or straight) segments between anchors.
 * Open paths render as an unfilled polyline-ish curve; closed paths can
 * optionally be filled.
 */
export type PathShape = {
  kind: 'path'
  anchors: PathAnchor[]
  closed: boolean
  color: string
  strokeWidth: number
  fill?: string
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
  | NoteShape
  | FrameShape
  | PathShape

/** Legacy single drop-shadow field. Kept for backward-compat with projects
 *  saved before the LayerEffects system; on render it is transparently
 *  upgraded to a single `dropShadow` effect. New code should use `effects`. */
export type Shadow = {
  enabled: boolean
  offsetX: number // preview-canvas pixels
  offsetY: number
  blur: number
  color: string // any valid CSS color (we use rgba for opacity control)
}

// ── Layer effects (PS-aligned "fx") ──────────────────────────────────────
//
// All spatial fields (offset / blur / size) are in **preview-canvas pixels**
// — same convention as filter radius / brush width — so the renderer
// multiplies by `scale` (annoScale) at draw time and a "10px shadow" looks
// identical on the live canvas and on a 1:1 export.

/** Drop shadow — coloured silhouette behind the layer, offset and blurred. */
export type DropShadowEffect = {
  kind: 'dropShadow'
  enabled: boolean
  color: string
  opacity: number // 0..100
  blend: BlendMode
  /** Distance from layer in preview-canvas pixels. */
  distance: number // 0..200
  /** Direction from layer, degrees. 90° = light from above (shadow below-right). */
  angle: number // -180..180
  /** Gaussian blur radius in preview-canvas pixels. */
  size: number // 0..100
}

/** Inner shadow — same parameters as drop shadow, but the shadow lands
 *  *inside* the layer's alpha (as if the layer were a hole in a wall). */
export type InnerShadowEffect = {
  kind: 'innerShadow'
  enabled: boolean
  color: string
  opacity: number // 0..100
  blend: BlendMode
  distance: number
  angle: number
  size: number
}

/** Outer glow — coloured halo radiating outward from the layer's alpha edge. */
export type OuterGlowEffect = {
  kind: 'outerGlow'
  enabled: boolean
  color: string
  opacity: number // 0..100
  blend: BlendMode
  /** Spread distance + falloff blur, in preview-canvas pixels. */
  size: number // 0..100
}

/** Inner glow — coloured halo radiating inward from the layer's alpha edge. */
export type InnerGlowEffect = {
  kind: 'innerGlow'
  enabled: boolean
  color: string
  opacity: number // 0..100
  blend: BlendMode
  size: number
}

/** Stroke — outline traced along the layer's alpha edge.
 *  `position` controls whether the stroke sits inside the edge, centred on
 *  the edge, or outside the edge (PS terminology). */
export type StrokeEffect = {
  kind: 'stroke'
  enabled: boolean
  color: string
  opacity: number // 0..100
  blend: BlendMode
  width: number // preview-canvas px, 1..50
  position: 'inside' | 'center' | 'outside'
}

/** Color overlay — solid colour filling the entire layer alpha. */
export type ColorOverlayEffect = {
  kind: 'colorOverlay'
  enabled: boolean
  color: string
  opacity: number // 0..100
  blend: BlendMode
}

export type LayerEffect =
  | DropShadowEffect
  | InnerShadowEffect
  | OuterGlowEffect
  | InnerGlowEffect
  | StrokeEffect
  | ColorOverlayEffect

export type LayerEffectKind = LayerEffect['kind']

/** Canonical PS defaults for each effect kind — used when adding via the
 *  Layer Style dialog or Layer > Layer Style menu. */
export const DEFAULT_EFFECTS: { [K in LayerEffectKind]: Extract<LayerEffect, { kind: K }> } = {
  dropShadow: {
    kind: 'dropShadow',
    enabled: true,
    color: '#000000',
    opacity: 75,
    blend: 'multiply',
    distance: 5,
    angle: 135,
    size: 5,
  },
  innerShadow: {
    kind: 'innerShadow',
    enabled: true,
    color: '#000000',
    opacity: 75,
    blend: 'multiply',
    distance: 5,
    angle: 135,
    size: 5,
  },
  outerGlow: {
    kind: 'outerGlow',
    enabled: true,
    color: '#ffff66',
    opacity: 75,
    blend: 'screen',
    size: 10,
  },
  innerGlow: {
    kind: 'innerGlow',
    enabled: true,
    color: '#ffff66',
    opacity: 75,
    blend: 'screen',
    size: 10,
  },
  stroke: {
    kind: 'stroke',
    enabled: true,
    color: '#000000',
    opacity: 100,
    blend: 'normal',
    width: 3,
    position: 'outside',
  },
  colorOverlay: {
    kind: 'colorOverlay',
    enabled: true,
    color: '#ff0000',
    opacity: 100,
    blend: 'normal',
  },
}

type LayerCommon = {
  id: string
  name: string
  visible: boolean
  opacity: number // 0-100
  blend: BlendMode
  /** Legacy single drop shadow. Transparently upgraded to `effects` at render time. */
  shadow?: Shadow
  /** Modern fx stack. Render order is fixed (PS-aligned); see `effectsOf()`. */
  effects?: LayerEffect[]
  /**
   * Optional clip baked in at commit time when a marquee/lasso selection was
   * active. Confines the layer's drawn pixels to this region — matches PS
   * "drawing inside a selection" semantics. Coords are in the same space as
   * shape coords (preview-pixel post-rotation, relative to the original
   * image), so the renderer applies the same crop translation as it does to
   * shapes. `clipPath` (>= 3 points) takes precedence over `clipRect`.
   */
  clipRect?: Rect
  clipPath?: Point[]
  /**
   * When true, the clip region above is INVERTED — the renderer draws the
   * outer canvas rect together with the clip ring under the evenodd fill
   * rule, so paint lands everywhere *except* the original selection. Baked
   * from `EditorState.selectionInverse` at commit time.
   */
  clipInverse?: boolean
}

export type ImageLayerProps = LayerCommon & { kind: 'image' }
export type AnnotationLayer = LayerCommon & { kind: 'annotation'; shape: Shape }
export type MaskLayer = LayerCommon & {
  kind: 'mask'
  rects: Rect[] // union of these is the visible region for layers BELOW this mask
}

/** Levels — input/output black & white points + gamma. Per-channel applied identically. */
export type LevelsParams = {
  kind: 'levels'
  inputBlack: number // 0..255
  inputWhite: number // 0..255
  gamma: number // 0.01..10, 1 = identity
  outputBlack: number // 0..255
  outputWhite: number // 0..255
}
/**
 * Curves — RGB tone curve defined by control points the renderer interpolates
 * (Catmull-Rom-ish spline) into a 256-entry LUT. Points are stored sorted by
 * x; both x and y are in [0, 255]. Default identity curve has two endpoints
 * (0,0) and (255,255).
 */
export type CurvesParams = {
  kind: 'curves'
  points: Array<{ x: number; y: number }>
}
/** Posterize — quantize each channel to N evenly-spaced levels. */
export type PosterizeParams = {
  kind: 'posterize'
  levels: number // 2..32
}
/**
 * Threshold — binary B&W. Pixels with luminance >= threshold map to white,
 * rest to black; alpha preserved.
 */
export type ThresholdParams = {
  kind: 'threshold'
  threshold: number // 0..255
}
/** Brightness + Contrast (PS-style centred at 128). */
export type BrightnessContrastParams = {
  kind: 'brightnessContrast'
  brightness: number // -100..100
  contrast: number // -100..100
}
/** Hue / Saturation / Lightness shift in HSL space. */
export type HueSaturationParams = {
  kind: 'hueSaturation'
  hue: number // -180..180 (degrees)
  saturation: number // -100..100
  lightness: number // -100..100
}
/** Color Balance — additive shift along the three opposite-color axes. */
export type ColorBalanceParams = {
  kind: 'colorBalance'
  cyanRed: number // -100..100
  magentaGreen: number // -100..100
  yellowBlue: number // -100..100
}
/** Photographic invert — `255 - x` per channel. No params. */
export type InvertParams = { kind: 'invert' }
/**
 * Vibrance — saturation that protects already-saturated pixels. `vibrance`
 * boosts unsaturated areas, `saturation` is a flat multiplier (negative
 * values desaturate).
 */
export type VibranceParams = {
  kind: 'vibrance'
  vibrance: number // -100..100
  saturation: number // -100..100
}
/** Photographic Exposure — log brightness + offset + gamma. */
export type ExposureParams = {
  kind: 'exposure'
  exposure: number // -3..3 stops
  offset: number // -0.5..0.5
  gamma: number // 0.1..10, 1 = identity
}
export type AdjustmentParams =
  | LevelsParams
  | CurvesParams
  | PosterizeParams
  | ThresholdParams
  | BrightnessContrastParams
  | HueSaturationParams
  | ColorBalanceParams
  | InvertParams
  | VibranceParams
  | ExposureParams

export type AdjustmentKind = AdjustmentParams['kind']

/**
 * Adjustment layer — non-destructive pixel transform applied to the
 * accumulated canvas at the layer's position in the stack (PS-style: affects
 * everything below it). Rendered via getImageData → JS transform →
 * putImageData → composite back through the layer's clip + opacity. Selection
 * clip is honored via the same `clipRect` / `clipPath` mechanism as
 * annotation layers.
 */
export type AdjustmentLayer = LayerCommon & {
  kind: 'adjustment'
  params: AdjustmentParams
}

// ── Filter layer ─────────────────────────────────────────────────────────

/**
 * Spatial radius/size fields on filter params are stored in **preview-canvas
 * pixels** (same convention as `BlurShape.radius`). The renderer multiplies
 * by `annoScale` before applying, so a filter looks identical across the
 * live preview and a 1:1 export.
 */

/** Gaussian blur — separable kernel of size derived from radius (≈σ). */
export type GaussianBlurParams = {
  kind: 'gaussianBlur'
  radius: number // preview-canvas px, 0..100
}
/** Box blur — uniform-weight separable averaging kernel. */
export type BoxBlurParams = {
  kind: 'boxBlur'
  radius: number // preview-canvas px, 1..50
}
/** Sharpen — 3×3 unsharp kernel scaled by `amount`. */
export type SharpenParams = {
  kind: 'sharpen'
  amount: number // %, 0..200 (100 = standard kernel)
}
/**
 * Unsharp mask — `result = orig + (orig - blur) * amount`, applied only where
 * |orig - blur| exceeds threshold. blur is gaussian of `radius`.
 */
export type UnsharpMaskParams = {
  kind: 'unsharpMask'
  amount: number // %, 0..500
  radius: number // preview-canvas px, 0.1..50
  threshold: number // 0..255
}
/** High pass — subtract a gaussian blur from the original, midpoint at 128. */
export type HighPassParams = {
  kind: 'highPass'
  radius: number // preview-canvas px, 0.1..50
}
/**
 * Add noise — random per-pixel delta. `monochromatic`: same delta across RGB
 * (luminance noise) vs. independent per-channel (chroma noise). `seed` is
 * generated at apply time so the noise stays visually stable across canvas
 * re-renders (pan / zoom / unrelated layer edits) — a deterministic PRNG
 * keyed by `(seed, pixelIndex)` produces the deltas.
 */
export type AddNoiseParams = {
  kind: 'addNoise'
  amount: number // 0..255 (max +/- delta)
  monochromatic: boolean
  seed: number // u32; set once at apply time, persists through undo/save
}
/** Despeckle — 3×3 median per channel; reduces speckle noise. No params. */
export type DespeckleParams = { kind: 'despeckle' }
/** Mosaic — average each cellSize×cellSize block, fill with that average. */
export type MosaicParams = {
  kind: 'mosaic'
  cellSize: number // preview-canvas px, 2..200
}
/** Find edges — Sobel magnitude, inverted (white background, dark edges). */
export type FindEdgesParams = { kind: 'findEdges' }
/** Emboss — directional gradient, midpoint 128, scaled by amount. */
export type EmbossParams = {
  kind: 'emboss'
  angle: number // degrees, -180..180
  height: number // preview-canvas px, 1..10
  amount: number // %, 1..500
}

export type FilterParams =
  | GaussianBlurParams
  | BoxBlurParams
  | SharpenParams
  | UnsharpMaskParams
  | HighPassParams
  | AddNoiseParams
  | DespeckleParams
  | MosaicParams
  | FindEdgesParams
  | EmbossParams

export type FilterKind = FilterParams['kind']

/**
 * Filter layer — non-destructive *neighbourhood-dependent* pixel transform
 * (blur, sharpen, edge detect, etc.) applied to the accumulated canvas at the
 * layer's position in the stack. Architecturally identical to AdjustmentLayer
 * — the only difference is that filter ops need width+height (they read
 * neighbouring pixels), where adjustments are per-pixel-independent.
 */
export type FilterLayer = LayerCommon & {
  kind: 'filter'
  params: FilterParams
}

/**
 * Group layer — a folder that holds a nested stack of child layers. The
 * renderer composites children onto an offscreen canvas (in their own bottom→
 * top order) and then composites that offscreen back onto the parent canvas
 * with the group's own `opacity` / `blend` / `clipRect` / `clipPath`. This
 * "normal mode" semantics keeps adjustment/filter layers contained inside the
 * group — they only see layers within the same group, not the world below.
 *
 * `expanded` controls only the LayersPanel disclosure state; the renderer
 * always walks all children regardless. Groups can be nested arbitrarily.
 */
export type GroupLayer = LayerCommon & {
  kind: 'group'
  children: Layer[]
  expanded: boolean
}

// User-addable overlay layer types (the image is special, see EditorState).
export type Layer =
  | AnnotationLayer
  | MaskLayer
  | AdjustmentLayer
  | FilterLayer
  | GroupLayer

// The full editing state. The HTMLImageElement (pixels) is held outside this
// state so it doesn't enter the history stack; here we only track the image
// layer's display props (visibility / opacity / blend).
export type EditorState = {
  imageLayer: ImageLayerProps
  layers: Layer[] // ordered bottom→top
  transforms: Transforms
  adjust: Adjustments
  /**
   * Active selection. `selection` is the bounding rect (always set when a
   * selection exists); `selectionPath`, when present, refines the visible
   * outline to a polygon — used by the Lasso / Polygonal Lasso tools.
   * Coords are in post-rotation preview-pixel space, relative to the original
   * image. Persisted through undo/redo + .json save. Other tools can read
   * `selection` (and optionally `selectionPath`) to restrict their effect.
   */
  selection?: Rect
  selectionPath?: Point[]
  /**
   * Selection inversion flag (PS Select > Inverse). When true, the active
   * selection is the *complement* of `selection`/`selectionPath` within the
   * canvas. Renderer's marching-ants chrome adds an outer canvas-rect outline
   * when set; `withSelectionClip` bakes this onto committed layers so a
   * subsequent paint stroke lands outside the original region.
   */
  selectionInverse?: boolean
  /**
   * Snapshot of the previous selection state, captured each time `selection`
   * transitions from set→cleared (PS Select > Deselect). The Reselect action
   * restores all three fields atomically.
   */
  lastSelection?: Rect
  lastSelectionPath?: Point[]
  lastSelectionInverse?: boolean
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

/**
 * Tunable defaults for brush-family tools (brush / eraser / dodge / burn).
 * Stored on the editor instance (not in EditorState) — UI-only state, doesn't
 * need to round-trip through undo or project save.
 *
 * `opacity` is applied to brush + eraser layers at commit time (baked into
 * `layer.opacity`). Dodge/burn ignore opacity and use their own hardcoded
 * exposure to preserve the existing "subtle build-up" feel.
 *
 * `hardness`, `spacing`, `flow` are baked into the BrushShape; the renderer
 * uses a stamped-tip path whenever hardness < 1 or flow < 1, otherwise the
 * legacy polyline path stays in effect.
 */
export type BrushOptions = {
  hardness: number // 0..1
  spacing: number // 0..1
  flow: number // 0..1
  opacity: number // 0..1, brush + eraser only
}
