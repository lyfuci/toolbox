// Editor data model. Every layer (incl. the image background) is uniformly
// described by a Layer with visible/opacity/blend; the variant fields under
// `kind` carry layer-specific data. The render pipeline walks the layer list
// bottom→top and composites accordingly.

export type Rotation = 0 | 90 | 180 | 270

/**
 * Layer blend modes. Maps to Canvas 2D `globalCompositeOperation` values
 * one-to-one — every entry here has a native browser implementation, so
 * the render pipeline doesn't need per-pixel fallbacks. List order mirrors
 * Photoshop's blend-mode dropdown groupings (basic → darken → lighten →
 * contrast → comparative → component).
 */
export type BlendMode =
  | 'normal'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export const BLEND_MODES: BlendMode[] = [
  'normal',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
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
  | 'magneticLasso'
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
export type TextAlign = 'left' | 'center' | 'right'
export type FontWeight = 'normal' | 'bold'
export type FontStyle = 'normal' | 'italic'

export type TextShape = {
  kind: 'text'
  x: number
  y: number
  text: string
  color: string
  fontSize: number
  /** Font family — CSS font-family string. Defaults to 'sans-serif' for
   *  back-compat with pre-v2 text shapes that didn't carry this field. */
  fontFamily?: string
  fontWeight?: FontWeight
  fontStyle?: FontStyle
  /** Horizontal alignment relative to (x, y). 'left' = (x, y) is the
   *  top-left; 'center' = (x, y) is top-centre; 'right' = top-right. */
  align?: TextAlign
  /** Extra spacing between glyphs, in preview-canvas pixels. CSS-style
   *  letter-spacing applied via ctx.letterSpacing where supported, otherwise
   *  approximated by per-glyph kerning. */
  letterSpacing?: number
  /** Multiplier on the font's ascender height. 1 = single spacing. */
  lineHeight?: number
  /** Decoration: render an underline beneath the baseline. */
  underline?: boolean
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
  /**
   * Optional custom brush tip image as a dataUrl. When set the renderer
   * tints + stamps this image at every step instead of building a soft
   * circular tip — same composite pipeline (offscreen flow / opacity), just
   * a different stamp shape. Resolved via the same `imageCache` used by
   * image-shape layers; unloaded tip falls back to the soft tip for the
   * frame.
   */
  tipDataUrl?: string
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

/** A single gradient stop in the multi-stop form. `pos` is normalised
 *  to 0..1 (clamped at render time); `color` is any CSS colour string
 *  the canvas 2D context understands (hex, rgba(), etc). */
export type GradientStop = {
  pos: number
  color: string
}

/** Linear gradient overlay across the layer's alpha.
 *
 *  Two storage forms are supported, both ship in the same effect object:
 *  - **Legacy 2-stop:** `color` + `endColor` describe the start (pos=0)
 *    and end (pos=1) colours. This is the original wire format and the
 *    default for newly added effects, so old projects round-trip exactly.
 *  - **Multi-stop:** when `stops` is set with at least 2 entries, the
 *    renderer uses it verbatim and ignores `color`/`endColor`. Stops are
 *    sorted by `pos` before being applied to the canvas gradient.
 *
 *  `color` + `endColor` are kept populated even in multi-stop mode so
 *  toggling back to "simple" doesn't drop the user's previous values. */
export type GradientOverlayEffect = {
  kind: 'gradientOverlay'
  enabled: boolean
  /** Start colour at gradient position 0. Used when `stops` is unset. */
  color: string
  /** End colour at gradient position 1. Used when `stops` is unset. */
  endColor: string
  /** Optional multi-stop gradient definition. Take precedence over
   *  `color`/`endColor` when set with >= 2 entries. */
  stops?: GradientStop[]
  opacity: number
  blend: BlendMode
  /** Gradient sweep angle, degrees. 0 = left→right. */
  angle: number
  /** Visual scale of the gradient as a percentage of the layer's diagonal.
   *  100 = the gradient spans corner-to-corner; lower values squeeze it. */
  scale: number
}

/** Pattern fill across the layer's alpha. v1 uses a built-in checker
 *  pattern when `patternDataUrl` is empty; future revisions will add a
 *  pattern picker / file import. */
export type PatternOverlayEffect = {
  kind: 'patternOverlay'
  enabled: boolean
  /** Optional embedded pattern image as a dataUrl. Empty string = built-in
   *  checker tile. */
  patternDataUrl: string
  opacity: number
  blend: BlendMode
  /** Tile scale, percent. 100 = pattern at its natural pixel size. */
  scale: number
}

/** Satin — a shaped, interior soft-edged contour driven by the layer's
 *  alpha self-intersection at the given angle / distance. PS-style. */
export type SatinEffect = {
  kind: 'satin'
  enabled: boolean
  color: string
  opacity: number
  blend: BlendMode
  angle: number
  distance: number
  size: number
  /** Invert flips the satin contour (highlights become shadows). */
  invert: boolean
}

/** Bevel & Emboss — paired highlight + shadow shifted along a light angle,
 *  giving the layer a chiselled / embossed look. Highlight and shadow each
 *  carry their own blend + opacity for fine-grained control. */
export type BevelEmbossEffect = {
  kind: 'bevelEmboss'
  enabled: boolean
  /** Overall blend + opacity wrapping the combined highlight/shadow output.
   *  Each sub-element also has its own opacity/blend that compose first. */
  blend: BlendMode
  opacity: number
  /** Where the bevel sits relative to the layer's alpha edge. */
  style: 'innerBevel' | 'outerBevel' | 'emboss' | 'pillowEmboss'
  /** Light direction (where the light comes FROM), degrees. */
  angle: number
  /** Light altitude — vertical angle of the light. Larger = light from
   *  more directly above → softer highlights. Degrees (0..90). */
  altitude: number
  /** Apparent height / depth (1..100). Drives the offset magnitude. */
  depth: number
  /** Falloff blur radius for both highlight + shadow, in preview px. */
  size: number
  highlightColor: string
  highlightOpacity: number
  highlightBlend: BlendMode
  shadowColor: string
  shadowOpacity: number
  shadowBlend: BlendMode
}

export type LayerEffect =
  | DropShadowEffect
  | InnerShadowEffect
  | OuterGlowEffect
  | InnerGlowEffect
  | StrokeEffect
  | ColorOverlayEffect
  | GradientOverlayEffect
  | PatternOverlayEffect
  | SatinEffect
  | BevelEmbossEffect

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
  gradientOverlay: {
    kind: 'gradientOverlay',
    enabled: true,
    color: '#000000',
    endColor: '#ffffff',
    opacity: 100,
    blend: 'normal',
    angle: 90,
    scale: 100,
  },
  patternOverlay: {
    kind: 'patternOverlay',
    enabled: true,
    patternDataUrl: '',
    opacity: 100,
    blend: 'normal',
    scale: 100,
  },
  satin: {
    kind: 'satin',
    enabled: true,
    color: '#000000',
    opacity: 50,
    blend: 'multiply',
    angle: 19,
    distance: 11,
    size: 14,
    invert: false,
  },
  bevelEmboss: {
    kind: 'bevelEmboss',
    enabled: true,
    blend: 'normal',
    opacity: 100,
    style: 'innerBevel',
    angle: 120,
    altitude: 30,
    depth: 100,
    size: 5,
    highlightColor: '#ffffff',
    highlightOpacity: 75,
    highlightBlend: 'screen',
    shadowColor: '#000000',
    shadowOpacity: 75,
    shadowBlend: 'multiply',
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
  /**
   * PS "Create Clipping Mask" (⌥⌘G). When true, the layer's rendered
   * output is masked to the alpha of the *underlying* layer in the same
   * parent (group or top-level). Multiple stacked clipping layers chain to
   * the first non-clipping layer below them, matching PS semantics — the
   * group is sometimes called a "clipping group". Renderer: snapshots the
   * pre-this-layer canvas, draws the layer's content into an offscreen
   * masked against the base layer's contribution, then composites.
   */
  clipping?: boolean
  /**
   * Free-Transform rotation in degrees, clockwise, applied around the
   * layer's bbox centre at render time. Annotation + group layers honour
   * this; smart-object layers carry their own `transform.rotation` and
   * ignore this field. Defaults to 0 (no rotation) for back-compat.
   */
  rotation?: number
}

export type ImageLayerProps = LayerCommon & { kind: 'image' }
export type AnnotationLayer = LayerCommon & { kind: 'annotation'; shape: Shape }
export type MaskLayer = LayerCommon & {
  kind: 'mask'
  /**
   * Legacy rect-list mask. The union of these rects is the visible region
   * for the layers below this mask. Pre-raster projects use this exclusively;
   * post-raster projects may keep an empty list when `dataUrl` is set.
   */
  rects: Rect[]
  /**
   * Raster mask. When present, the renderer uses the alpha channel of this
   * dataUrl as the mask (white = visible, black = hidden, grey = partial).
   * Stored as a PNG dataUrl at preview-canvas resolution; the cached image
   * is resolved via the same `imageCache` used by image-shape layers.
   *
   * If both `rects` and `dataUrl` are set the raster takes priority — but
   * the conversion helper (`rasterizeMaskRects`) clears `rects` so the
   * representations don't drift.
   */
  dataUrl?: string
  /** Preview-pixel dimensions of the raster mask. Required when `dataUrl`
   *  is set so render can size the destination correctly. */
  w?: number
  h?: number
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
 *
 * `points` is the master ("RGB") curve applied to all three channels.
 * Optional `r` / `g` / `b` curves apply on top of the master curve to that
 * specific channel — PS-style "Channel: Red/Green/Blue" dropdown. Each
 * channel-specific curve defaults to identity (linear 0,0 → 255,255) when
 * absent, so old projects loaded from JSON keep working.
 */
export type CurvesParams = {
  kind: 'curves'
  points: Array<{ x: number; y: number }>
  r?: Array<{ x: number; y: number }>
  g?: Array<{ x: number; y: number }>
  b?: Array<{ x: number; y: number }>
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
/**
 * Channel Mixer — re-combine output channels as weighted sums of input
 * channels. The standard PS feature; lets you build custom B&W
 * conversions ("rOutR + rOutG + rOutB = grayscale recipe") or shift
 * colour balance per-channel. Weights in percent (typical sane range
 * -200..200, identity is 100 for the matching input and 0 for others).
 * `constant` is an additive offset per output channel (-100..100,
 * mapped to ±128 of 0..255 output range).
 */
export type ChannelMixerParams = {
  kind: 'channelMixer'
  rOutR: number
  rOutG: number
  rOutB: number
  rConstant: number
  gOutR: number
  gOutG: number
  gOutB: number
  gConstant: number
  bOutR: number
  bOutG: number
  bOutB: number
  bConstant: number
}
/**
 * Gradient Map — map each pixel's luminance to a 2-stop gradient. White
 * pixels get `endColor`, black pixels get `color`, mid-tones interpolate.
 * Classic PS "Image > Adjustments > Gradient Map" for stylized colour
 * grading or duotone-style effects.
 */
export type GradientMapParams = {
  kind: 'gradientMap'
  color: string // start (luminance = 0)
  endColor: string // end (luminance = 255)
}

/**
 * Photo Filter — tinted overlay simulating warming / cooling filters
 * placed over the camera lens. `density` controls how much of the tint
 * blends in (0..100%). `preserveLuminosity` keeps the original brightness
 * — without it, dark scenes lose contrast under heavy filters.
 */
export type PhotoFilterParams = {
  kind: 'photoFilter'
  color: string
  density: number // 0..100
  preserveLuminosity: boolean
}

/**
 * Camera Raw — one-stop ACR/Lightroom-style adjustment bundle. All ranges
 * mirror Lightroom's basic panel (white balance + tone + presence). Since
 * this lives on AdjustmentParams (per-pixel only), clarity / dehaze are
 * approximated via global midtone contrast + saturation rather than the
 * neighbourhood-based USM that ACR uses — looks plausible at moderate
 * settings; users wanting precise local-contrast clarity should reach for
 * the Unsharp Mask filter layer.
 */
export type CameraRawParams = {
  kind: 'cameraRaw'
  /** -100..100 — cool (blue-shift) ← 0 → warm (yellow-shift). */
  temperature: number
  /** -100..100 — green ← 0 → magenta. */
  tint: number
  /** -2..2 — additional exposure compensation in stops. */
  exposure: number
  /** -100..100 — positive recovers highlights (darker), negative brightens. */
  highlights: number
  /** -100..100 — positive opens shadows (brighter), negative darkens. */
  shadows: number
  /** -100..100 — shifts the white clipping point. */
  whites: number
  /** -100..100 — shifts the black clipping point. */
  blacks: number
  /** -100..100 — midtone contrast bump (per-pixel approximation). */
  clarity: number
  /** -100..100 — saturation that protects already-saturated pixels. */
  vibrance: number
  /** -100..100 — flat saturation multiplier. */
  saturation: number
  /** -100..100 — contrast + saturation boost approximating ACR dehaze. */
  dehaze: number
}

/**
 * Black & White (PS Image > Adjustments > Black & White). Six per-hue-family
 * lightness weights (% — 100 is neutral) drive the RGB→gray mix; optional tint
 * recolors the result. Implementation lives in `adj-black-white.ts`.
 */
export type BlackWhiteParams = {
  kind: 'blackWhite'
  reds: number
  yellows: number
  greens: number
  cyans: number
  blues: number
  magentas: number
  tint: boolean
  tintHue: number // degrees [0,360]
  tintSat: number // percent [0,100]
}

/** One color range's CMYK deltas for Selective Color (each %, [-100,100]). */
export type SelectiveColorRange = { c: number; m: number; y: number; k: number }

/**
 * Selective Color (PS Image > Adjustments > Selective Color). Per-color-range
 * CMYK shifts; `relative` scales existing ink, `absolute` adds. Implementation
 * in `adj-selective-color.ts`; the dialog edits one range at a time.
 */
export type SelectiveColorParams = {
  kind: 'selectiveColor'
  mode: 'relative' | 'absolute'
  ranges: {
    reds: SelectiveColorRange
    yellows: SelectiveColorRange
    greens: SelectiveColorRange
    cyans: SelectiveColorRange
    blues: SelectiveColorRange
    magentas: SelectiveColorRange
    whites: SelectiveColorRange
    neutrals: SelectiveColorRange
    blacks: SelectiveColorRange
  }
}

/** Equalize (PS) — hue-preserving histogram equalization. No parameters. */
export type EqualizeParams = { kind: 'equalize' }

/** Solarize (PS Filter > Stylize) — invert channels above `threshold` (0..255). */
export type SolarizeParams = { kind: 'solarize'; threshold: number }

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
  | ChannelMixerParams
  | GradientMapParams
  | PhotoFilterParams
  | CameraRawParams
  | BlackWhiteParams
  | SelectiveColorParams
  | EqualizeParams
  | SolarizeParams

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
  /**
   * Per-adjustment raster mask. When set, the adjustment's effect is
   * gated by this mask's alpha — white areas get the full adjustment,
   * black areas pass through unmodified, grey areas blend. Same dataUrl
   * format as a Layer Mask layer; resolved via the same imageCache.
   * `maskW / maskH` are preview-pixel dims for the raster.
   */
  maskDataUrl?: string
  maskW?: number
  maskH?: number
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
/**
 * Local Contrast (Clarity / Dehaze) — neighbourhood-based pass that lifts
 * midtone contrast similarly to ACR / Lightroom's clarity slider. The
 * implementation uses an unsharp-mask-style high-pass against a wide
 * gaussian, weighted by midtone proximity so highlights / shadows don't
 * over-saturate. `dehaze` adds an extra contrast + saturation stretch
 * targeting low-contrast (hazy) regions.
 */
export type LocalContrastParams = {
  kind: 'localContrast'
  /** -100..100. Positive lifts local contrast; negative softens. */
  clarity: number
  /** -100..100. Positive lifts global contrast + saturation (dehaze);
   *  negative adds a faded / hazy look. */
  dehaze: number
  /** Gaussian radius for the local-mean estimator, in preview-pixels.
   *  Smaller = finer detail boost; larger = broader micro-contrast. */
  radius: number // 1..100
}
/** Motion Blur — directional blur along (angle, distance). */
export type MotionBlurParams = {
  kind: 'motionBlur'
  angle: number // degrees, -180..180
  distance: number // preview-px, 1..200
}
/**
 * Radial Blur — `zoom` (radial streaks from centre) or `spin` (rotational
 * smear). `amount` controls strength.
 */
export type RadialBlurParams = {
  kind: 'radialBlur'
  mode: 'zoom' | 'spin'
  amount: number // 1..100
}
/** Pinch — pull pixels toward or push away from centre. Positive = pinch in. */
export type PinchParams = {
  kind: 'pinch'
  amount: number // -100..100
}
/** Twirl — rotate pixels around centre, strength falls with radius. */
export type TwirlParams = {
  kind: 'twirl'
  angle: number // degrees, -360..360
}
/** Spherize — fish-eye distortion; positive = bulge, negative = pinch. */
export type SpherizeParams = {
  kind: 'spherize'
  amount: number // -100..100
}
/**
 * Polar Coordinates — convert between rectangular ↔ polar. `mode: 'polar'`
 * wraps the image into a disc (rectangular → polar); `mode: 'rect'`
 * unwraps a disc into a strip (polar → rectangular).
 */
export type PolarCoordinatesParams = {
  kind: 'polarCoordinates'
  mode: 'polar' | 'rect'
}
/**
 * Lens Flare — a bright sun + halo + chromatic streaks centred at
 * (x, y) (preview-pixels). Brightness controls overall intensity.
 */
export type LensFlareParams = {
  kind: 'lensFlare'
  x: number // 0..1, fraction of canvas width
  y: number // 0..1, fraction of canvas height
  brightness: number // 0..200
}
/**
 * Smart Sharpen — sharper than Unsharp Mask via a deconvolution-style
 * pass: builds a gaussian blur, subtracts to get high-frequency, then
 * re-adds * amount with a noise-floor threshold so flat areas stay quiet.
 */
export type SmartSharpenParams = {
  kind: 'smartSharpen'
  amount: number // %, 0..500
  radius: number // preview-px, 0.5..50
  threshold: number // 0..255
}

/**
 * Shadows/Highlights (PS Image > Adjustments). Regional tonal recovery driven
 * by a blurred luminance mask (`radius`, bake-scaled). Implemented as a filter
 * (`flt-shadows-highlights.ts`) because the mask is spatial.
 */
export type ShadowsHighlightsParams = {
  kind: 'shadowsHighlights'
  shadowsAmount: number // 0..100
  highlightsAmount: number // 0..100
  radius: number // preview-canvas px, bake-scaled
}

/** Vignette (PS lens-correction style). Percent-based, resolution-independent. */
export type VignetteParams = {
  kind: 'vignette'
  amount: number // -100..100 (neg darken, pos lighten)
  midpoint: number // 0..100 % of half-diagonal where falloff starts
  roundness: number // -100..100 circular↔rectangular
  feather: number // 0..100 % transition width
}

/** Render > Clouds — deterministic seeded fractal noise blending fg↔bg. */
export type CloudsParams = {
  kind: 'clouds'
  seed: number
  scale: number // base lattice cells across the min side
  fg: string // hex
  bg: string // hex
}

/** Noise > Median — per-channel median over a (2·radius+1)² window. */
export type MedianParams = { kind: 'median'; radius: number } // px, bake-scaled

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
  | LocalContrastParams
  | MotionBlurParams
  | RadialBlurParams
  | PinchParams
  | TwirlParams
  | SpherizeParams
  | PolarCoordinatesParams
  | LensFlareParams
  | SmartSharpenParams
  | ShadowsHighlightsParams
  | VignetteParams
  | CloudsParams
  | MedianParams

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
  /** Per-filter raster mask — same semantics as AdjustmentLayer.maskDataUrl. */
  maskDataUrl?: string
  maskW?: number
  maskH?: number
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

// ── Smart Object ─────────────────────────────────────────────────────────
//
// A Smart Object embeds an external source (currently always a raster image
// stored as dataUrl) and renders it non-destructively under an affine
// transform. The source itself lives in `EditorState.smartSources` keyed by
// id; a SmartObjectLayer holds only a `sourceRef`. Multiple SO layers can
// share the same source — editing the source (Replace Contents) updates
// every instance at once, matching PS's "linked smart object" semantics.
//
// Transform fields are in **preview-canvas pixels** (same convention as
// shape coords), so the renderer multiplies spatial offsets by annoScale.
// The transform pivots around `(anchorX, anchorY)` so callers can scale /
// rotate around the source centre (default) without it walking off screen.
//
// On scale-down then scale-up, the source raster is preserved — the layer
// merely re-samples at the new effective dimension. That non-destructive
// quality preservation is the headline reason to use a Smart Object.

/** One embedded source. Multiple SO layers can reference the same id. */
export type SmartSource = {
  /** Original-resolution PNG data URL of the embedded source. */
  dataUrl: string
  /** Source pixel dimensions — kept so SO layers can scale to source-aware
   *  defaults (e.g. "place at original size") without sniffing the dataUrl. */
  w: number
  h: number
  /** Human-readable name (file basename, "From Layer", etc.) shown in UI. */
  name: string
}

/** Affine transform applied to the SO's source pixels at render time.
 *
 *  `(x, y, w, h)` is the layer's pre-rotation bbox in preview-pixel space —
 *  the source is sampled (with smoothing) onto this rect; non-uniform w/h
 *  produces stretch. We store the bbox directly rather than scaleX/scaleY
 *  multipliers so `getLayerBBox()` doesn't need access to the source pool
 *  (the dimension is denormalized on the transform).
 *
 *  Rotation is in degrees, clockwise, pivoting around (anchorX, anchorY)
 *  in absolute preview-pixel canvas space. Default anchor is (x + w/2,
 *  y + h/2) — set by the Convert / Place flows. */
export type SmartObjectTransform = {
  x: number
  y: number
  w: number
  h: number
  rotation: number
  anchorX: number
  anchorY: number
}

export type SmartObjectLayer = LayerCommon & {
  kind: 'smartObject'
  sourceRef: string
  transform: SmartObjectTransform
  /**
   * Smart Filters — non-destructive filter stack applied to the source
   * pixels BEFORE the transform. Each filter is the same FilterParams type
   * as a FilterLayer; the renderer walks the stack in order, re-using the
   * existing per-pixel transform pipeline. Empty / undefined = no filters.
   */
  bakedFilters?: FilterParams[]
}

// User-addable overlay layer types (the image is special, see EditorState).
export type Layer =
  | AnnotationLayer
  | MaskLayer
  | AdjustmentLayer
  | FilterLayer
  | GroupLayer
  | SmartObjectLayer

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
  /**
   * Smart Object source pool, keyed by id. SmartObjectLayer.sourceRef
   * indexes into this map. Sources persist across layer delete (matching
   * PS — orphaned sources stay until you Purge) and are reused on layer
   * duplicate. Cleared by Flatten Image (everything bakes to pixels).
   */
  smartSources?: { [id: string]: SmartSource }
  /**
   * Saved layer composites (PS "Layer Comps"). Each comp is a named
   * snapshot of the layer tree + image-layer display state. Applying a
   * comp replaces those fields without touching selection / crop /
   * transforms. Stored on EditorState so they round-trip through project
   * save / load and undo / redo.
   */
  layerComps?: LayerComp[]
  /**
   * Quick Mask mode (PS: Q). When non-null, the editor is in pixel-paint
   * selection mode: `dataUrl` holds the in-progress mask (white = selected,
   * black = unselected); the renderer overlays it on the canvas as a red
   * "rubylith" so the user sees what's selected. Brush strokes paint into
   * it (black = remove from selection, white = add). On exit (Q again),
   * we rasterize the dataUrl back to a selection — bbox of non-black
   * pixels for v1; pixel-perfect roundtrip via marching-squares is a v2
   * follow-up.
   *
   * `(w, h)` is the preview-pixel canvas size at entry. quickMask is UI
   * state — included in EditorState so undo / redo round-trip strokes,
   * but cleared by Flatten Image and not part of saved projects (it's a
   * transient editing mode).
   */
  quickMask?: { dataUrl: string; w: number; h: number }
  /**
   * Saved Actions (PS "Actions" panel — really closer to PS "Snapshots"
   * here because the editor doesn't store a command vocabulary it can
   * replay). Each action captures one or more EditorState snapshots; one-
   * shot snapshots restore instantly, multi-step recordings replay
   * sequentially with a small per-step delay so the user sees the
   * progression. Actions are stripped out of any captured snapshot to
   * keep the structure non-recursive.
   */
  actions?: Action[]
}

/**
 * One saved Action — name + chronologically ordered list of EditorState
 * snapshots. A 1-step action restores instantly (just `history.set(steps[0])`);
 * multi-step actions get replayed with a small delay between steps so the
 * user sees each intermediate result. Actions don't carry image pixels
 * (those live outside EditorState), so they're only meaningful when the
 * bound image / smartSources are still compatible — same document.
 */
export type Action = {
  id: string
  name: string
  /** ISO-8601 timestamp captured at save time. Display-only. */
  createdAt: string
  steps: EditorState[]
}

/** One saved layer composite — a named restore point for the layer stack. */
export type LayerComp = {
  id: string
  name: string
  /** ISO-8601 timestamp captured at save time. Display-only. */
  createdAt: string
  layers: Layer[]
  imageLayer: ImageLayerProps
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
  /** Optional imported brush tip image (dataUrl). When set, picks override
   *  the soft-circle tip with this stamp. Persisted in custom brush presets;
   *  not stored in EditorState (it lives on the editor instance like the
   *  rest of BrushOptions). */
  tipDataUrl?: string
}

/**
 * Tunable defaults for the Type tool. Persisted on the editor instance,
 * same UI-only treatment as BrushOptions — never enters EditorState /
 * undo / project save. New text layers seed their TextShape fields from
 * these values; existing layers keep whatever they were committed with.
 */
export type TextOptions = {
  fontSize: number
  fontFamily: string
  fontWeight: FontWeight
  fontStyle: FontStyle
  align: TextAlign
  letterSpacing: number
  lineHeight: number
  underline: boolean
}
