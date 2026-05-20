// Layer effects (PS "fx") render pipeline.
//
// Given a layer's content already rasterized onto an offscreen canvas the
// same dimensions as the destination, this module:
//   1. Builds each enabled effect's contribution as its own canvas.
//   2. Composites them onto a "stack" canvas in PS effect order.
//   3. Returns the stack so the caller can apply the layer's own
//      clip / blend / opacity once.
//
// All spatial fields on effects are in preview-canvas pixels; callers pass
// the `scale` (= annoScale) so we can convert to target pixels.

import type {
  BevelEmbossEffect,
  ColorOverlayEffect,
  DropShadowEffect,
  GradientOverlayEffect,
  InnerGlowEffect,
  InnerShadowEffect,
  Layer,
  LayerEffect,
  OuterGlowEffect,
  PatternOverlayEffect,
  SatinEffect,
  Shadow,
  StrokeEffect,
} from './types'

/**
 * Resolve a layer's effect stack, handling backward-compat with the legacy
 * `shadow` field. When a layer carries both the legacy shadow and a modern
 * `effects` array, the modern list wins (legacy is ignored) — callers that
 * migrate should clear `shadow` to avoid double-rendering.
 *
 * Returns only enabled effects, in render order (independent of stored order).
 */
export function effectsOf(layer: Layer): LayerEffect[] {
  const explicit = (layer.effects ?? []).filter((e) => e.enabled)
  if (explicit.length > 0) return sortByRenderOrder(explicit)
  if (layer.shadow && layer.shadow.enabled) {
    return [shadowToDropShadow(layer.shadow)]
  }
  return []
}

/** Does the layer have any rendering side-effect from its fx stack? */
export function hasEffects(layer: Layer): boolean {
  return effectsOf(layer).length > 0
}

/** Map the legacy `Shadow` field to an equivalent `DropShadowEffect`.
 *  Angle is recovered from offsets via atan2; PS uses 0° = right, 90° = up,
 *  so a positive Y offset (downward shadow) corresponds to a negative angle. */
function shadowToDropShadow(s: Shadow): DropShadowEffect {
  const distance = Math.hypot(s.offsetX, s.offsetY)
  const angle = (Math.atan2(-s.offsetY, s.offsetX) * 180) / Math.PI
  return {
    kind: 'dropShadow',
    enabled: true,
    color: s.color,
    opacity: 100,
    blend: 'normal', // legacy shadow used native canvas shadow (source-over)
    distance,
    angle,
    size: s.blur,
  }
}

// PS render order, lowest-numbered first (back→front).
const ORDER: { [K in LayerEffect['kind']]: number } = {
  dropShadow: 0,
  outerGlow: 1,
  // stroke handled separately by position (outside vs inside/center)
  stroke: 2,
  innerShadow: 3,
  innerGlow: 4,
  satin: 5,
  colorOverlay: 6,
  gradientOverlay: 7,
  patternOverlay: 8,
  bevelEmboss: 9,
}

function sortByRenderOrder(list: LayerEffect[]): LayerEffect[] {
  return [...list].sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}

/** Is this effect rendered BEHIND the layer content (drop shadow / glow /
 *  outside stroke), as opposed to IN FRONT of it (inner shadow / inner glow /
 *  color overlay / inside-or-center stroke)? */
export function effectIsBehindContent(fx: LayerEffect): boolean {
  if (fx.kind === 'dropShadow' || fx.kind === 'outerGlow') return true
  if (fx.kind === 'stroke' && fx.position === 'outside') return true
  return false
}

/**
 * Build a single effect's contribution canvas (target pixels, layer-content
 * silhouette transformed per the effect's params). Caller composites onto
 * the main destination ctx with the effect's own blend + opacity so the
 * effect interacts with what's actually below the layer — a multiply drop
 * shadow correctly darkens the destination, not just an empty stack.
 *
 * Returns null if a temp canvas / context allocation fails.
 */
export function buildEffectContribution(
  effect: LayerEffect,
  dims: { w: number; h: number },
  layerContent: HTMLCanvasElement,
  scale: number,
  /** Resolved Image cache — needed by Pattern Overlay. May be omitted by
   *  callers that don't expect pattern fx (then patternOverlay no-ops). */
  imageCache?: Map<string, HTMLImageElement>,
): HTMLCanvasElement | null {
  switch (effect.kind) {
    case 'dropShadow':
      return drawDropShadow(dims, layerContent, effect, scale)
    case 'outerGlow':
      return drawOuterGlow(dims, layerContent, effect, scale)
    case 'innerShadow':
      return drawInnerShadow(dims, layerContent, effect, scale)
    case 'innerGlow':
      return drawInnerGlow(dims, layerContent, effect, scale)
    case 'colorOverlay':
      return drawColorOverlay(dims, layerContent, effect)
    case 'stroke':
      return drawStroke(dims, layerContent, effect, scale)
    case 'gradientOverlay':
      return drawGradientOverlay(dims, layerContent, effect, scale)
    case 'patternOverlay':
      return drawPatternOverlay(dims, layerContent, effect, scale, imageCache)
    case 'satin':
      return drawSatin(dims, layerContent, effect, scale)
    case 'bevelEmboss':
      return drawBevelEmboss(dims, layerContent, effect, scale)
  }
}

// ── Per-effect contribution builders ─────────────────────────────────────

/**
 * Drop shadow: draw the layer alpha offset and blurred, in `fx.color`. We
 * render to a temp canvas using native ctx.shadow* on a 1px-alpha proxy of
 * the layer content, then erase the proxy with destination-out so only the
 * shadow remains.
 */
function drawDropShadow(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: DropShadowEffect,
  scale: number,
): HTMLCanvasElement | null {
  const out = makeCanvas(dims)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  const { dx, dy } = polarOffset(fx.distance, fx.angle, scale)
  // Native canvas shadow draws an alpha-coloured blurred copy alongside the
  // source. We want only the shadow → draw the alpha proxy with shadow, then
  // erase the proxy itself.
  ctx.shadowColor = fx.color
  ctx.shadowOffsetX = dx
  ctx.shadowOffsetY = dy
  ctx.shadowBlur = fx.size * scale
  ctx.drawImage(layer, 0, 0)
  // Erase the source pixels so only the offset+blurred shadow remains.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(layer, 0, 0)
  return out
}

/** Outer glow: same trick as drop shadow but no offset and source erased. */
function drawOuterGlow(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: OuterGlowEffect,
  scale: number,
): HTMLCanvasElement | null {
  const out = makeCanvas(dims)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.shadowColor = fx.color
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.shadowBlur = fx.size * scale
  ctx.drawImage(layer, 0, 0)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(layer, 0, 0)
  return out
}

/**
 * Inner shadow: shadow inside the layer's alpha. Trick — fill the layer's
 * alpha hole with the shadow colour (invert), then blur+offset it inward by
 * drawing into the inverted region. Implementation:
 *   1. Render a "shadow shape" = solid color * layer alpha, shifted by offset.
 *   2. Mask to inside layer alpha (source-in with layer).
 *   3. Subtract the un-shifted full alpha (destination-out with layer at
 *      shrunk amount) — actually simpler: use the standard PS trick of
 *      "draw the colored inverse, blur, then mask back in".
 *
 * We use the simpler "invert + blur with native shadow" technique:
 *   a. Stamp colour onto inverse of layer alpha (destination-out the layer
 *      from a colour fill), this gives a colored "outside the layer" shape.
 *   b. Draw that shape with native shadow (offset+blur) onto a temp canvas;
 *      erase the inverse shape itself (destination-out) so only the blurred
 *      shadow into the layer interior remains.
 *   c. Mask to layer alpha (source-in with layer).
 */
function drawInnerShadow(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: InnerShadowEffect,
  scale: number,
): HTMLCanvasElement | null {
  const inverse = makeCanvas(dims)
  const ictx = inverse.getContext('2d')
  if (!ictx) return null
  // Solid color fill, then erase the layer's alpha → colour where layer is
  // empty/transparent.
  ictx.fillStyle = fx.color
  ictx.fillRect(0, 0, dims.w, dims.h)
  ictx.globalCompositeOperation = 'destination-out'
  ictx.drawImage(layer, 0, 0)
  ictx.globalCompositeOperation = 'source-over'

  // Project that inverse blob into the layer interior with native shadow.
  const projected = makeCanvas(dims)
  const pctx = projected.getContext('2d')
  if (!pctx) return null
  const { dx, dy } = polarOffset(fx.distance, fx.angle, scale)
  pctx.shadowColor = fx.color
  pctx.shadowOffsetX = dx
  pctx.shadowOffsetY = dy
  pctx.shadowBlur = fx.size * scale
  pctx.drawImage(inverse, 0, 0)
  // Erase the inverse itself, leaving only the projected shadow.
  pctx.shadowColor = 'transparent'
  pctx.shadowBlur = 0
  pctx.shadowOffsetX = 0
  pctx.shadowOffsetY = 0
  pctx.globalCompositeOperation = 'destination-out'
  pctx.drawImage(inverse, 0, 0)

  // Mask to layer alpha (only inside the layer).
  pctx.globalCompositeOperation = 'destination-in'
  pctx.drawImage(layer, 0, 0)
  return projected
}

/**
 * Inner glow: edge-glow inward from layer alpha. Same trick as inner shadow
 * with no offset — the colored "outside" shape's blur penetrates inward from
 * every edge equally.
 */
function drawInnerGlow(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: InnerGlowEffect,
  scale: number,
): HTMLCanvasElement | null {
  const inverse = makeCanvas(dims)
  const ictx = inverse.getContext('2d')
  if (!ictx) return null
  ictx.fillStyle = fx.color
  ictx.fillRect(0, 0, dims.w, dims.h)
  ictx.globalCompositeOperation = 'destination-out'
  ictx.drawImage(layer, 0, 0)
  ictx.globalCompositeOperation = 'source-over'

  const projected = makeCanvas(dims)
  const pctx = projected.getContext('2d')
  if (!pctx) return null
  pctx.shadowColor = fx.color
  pctx.shadowOffsetX = 0
  pctx.shadowOffsetY = 0
  pctx.shadowBlur = fx.size * scale
  pctx.drawImage(inverse, 0, 0)
  pctx.shadowColor = 'transparent'
  pctx.shadowBlur = 0
  pctx.globalCompositeOperation = 'destination-out'
  pctx.drawImage(inverse, 0, 0)

  pctx.globalCompositeOperation = 'destination-in'
  pctx.drawImage(layer, 0, 0)
  return projected
}

/**
 * Color overlay: solid colour everywhere the layer has alpha. Implementation
 * is a single fill + source-in mask.
 */
function drawColorOverlay(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: ColorOverlayEffect,
): HTMLCanvasElement | null {
  const out = makeCanvas(dims)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = fx.color
  ctx.fillRect(0, 0, dims.w, dims.h)
  // Keep only where layer has alpha.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(layer, 0, 0)
  return out
}

/**
 * Stroke: outline along the layer's alpha edge at the requested position.
 *
 * We build a dilated alpha by stamping the layer's silhouette at radial
 * offsets, then subtract appropriately based on `position`:
 *   - outside: dilated − original  (sits beyond the edge)
 *   - inside:  original − eroded   (sits within the edge)
 *   - center:  dilated(w/2) − eroded(w/2)
 *
 * Stamps are at 16 radial steps which is a good trade-off between fidelity
 * and CPU cost at typical stroke widths.
 */
function drawStroke(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: StrokeEffect,
  scale: number,
): HTMLCanvasElement | null {
  const widthPx = Math.max(1, fx.width * scale)
  if (fx.position === 'outside') {
    const dilated = stampSilhouette(dims, layer, fx.color, widthPx)
    if (!dilated) return null
    const ctx = dilated.getContext('2d')
    if (!ctx) return null
    // Erase the original alpha → leaves only the dilation ring.
    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(layer, 0, 0)
    return dilated
  }
  if (fx.position === 'inside') {
    const eroded = makeErodedSilhouette(dims, layer, widthPx)
    if (!eroded) return null
    // Fill: solid colour masked to (original − eroded).
    const out = makeCanvas(dims)
    const ctx = out.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = fx.color
    ctx.fillRect(0, 0, dims.w, dims.h)
    // Mask to layer alpha first (only stroke inside the shape).
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(layer, 0, 0)
    // Then erase the eroded core (only the inside edge ring remains).
    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(eroded, 0, 0)
    return out
  }
  // center: half outside + half inside the edge.
  const half = Math.max(1, widthPx / 2)
  const dilated = stampSilhouette(dims, layer, fx.color, half)
  const eroded = makeErodedSilhouette(dims, layer, half)
  if (!dilated || !eroded) return null
  const ctx = dilated.getContext('2d')
  if (!ctx) return null
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(eroded, 0, 0)
  return dilated
}

/**
 * Stamp `layer`'s silhouette at radial offsets around the origin, filled in
 * `color`, giving a dilation by `radius` preview pixels. Uses native canvas
 * shadow trick: drawing with shadowColor=color and offset moves a coloured
 * copy of the alpha to that offset; we erase the original after to avoid
 * double-stacking.
 */
function stampSilhouette(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  color: string,
  radius: number,
): HTMLCanvasElement | null {
  const out = makeCanvas(dims)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = color
  const steps = 24
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const dx = Math.cos(t) * radius
    const dy = Math.sin(t) * radius
    ctx.save()
    ctx.translate(dx, dy)
    ctx.drawImage(layer, 0, 0)
    ctx.restore()
  }
  // Replace the layer-alpha contents with the requested color (the draws
  // above paint the layer's actual pixels; we want a solid colored
  // silhouette). Recolor by source-in.
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillRect(0, 0, dims.w, dims.h)
  ctx.globalCompositeOperation = 'source-over'
  return out
}

/**
 * Build an eroded silhouette of `layer` (alpha shrunk inward by `radius` px).
 * Trick: dilate the *inverse* and subtract from the original alpha.
 */
function makeErodedSilhouette(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  radius: number,
): HTMLCanvasElement | null {
  // Inverse silhouette in any color.
  const inverse = makeCanvas(dims)
  const ictx = inverse.getContext('2d')
  if (!ictx) return null
  ictx.fillStyle = '#000'
  ictx.fillRect(0, 0, dims.w, dims.h)
  ictx.globalCompositeOperation = 'destination-out'
  ictx.drawImage(layer, 0, 0)
  // Dilate the inverse.
  const dilatedInverse = stampSilhouette(dims, inverse, '#000', radius)
  if (!dilatedInverse) return null
  // Eroded = layer − dilatedInverse.
  const eroded = makeCanvas(dims)
  const ectx = eroded.getContext('2d')
  if (!ectx) return null
  ectx.drawImage(layer, 0, 0)
  ectx.globalCompositeOperation = 'destination-out'
  ectx.drawImage(dilatedInverse, 0, 0)
  return eroded
}

/**
 * Gradient overlay — linear N-stop gradient swept across the layer's
 * bbox at `effect.angle`, scaled by `effect.scale`. Then masked to the
 * layer's alpha via destination-in. Computed in target pixels.
 *
 * Two storage forms are supported:
 *  - `fx.stops` set with >= 2 entries → multi-stop (each `pos` is clamped
 *    to 0..1 and the list is sorted before being applied).
 *  - otherwise → legacy 2-stop using `fx.color` → `fx.endColor`.
 */
function drawGradientOverlay(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: GradientOverlayEffect,
  // `scale` is accepted for signature uniformity with other effects; this one
  // doesn't currently use it (the gradient stretches to the bbox in target
  // pixels regardless).
  _scale: number,
): HTMLCanvasElement | null {
  void _scale
  const out = makeCanvas(dims)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  // Gradient line endpoints — angled across the bbox diagonal. Apply
  // `scale` as a length multiplier around the bbox centre.
  const cx = dims.w / 2
  const cy = dims.h / 2
  const diag = Math.hypot(dims.w, dims.h)
  const halfLen = (diag * (fx.scale / 100)) / 2
  const r = (fx.angle * Math.PI) / 180
  const dx = Math.cos(r) * halfLen
  const dy = Math.sin(r) * halfLen
  const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  if (fx.stops && fx.stops.length >= 2) {
    // Sort + clamp defensively: the dialog already guarantees these
    // invariants, but persisted projects can carry anything.
    const sorted = [...fx.stops]
      .map((s) => ({ pos: Math.min(1, Math.max(0, s.pos)), color: s.color }))
      .sort((a, b) => a.pos - b.pos)
    for (const s of sorted) grad.addColorStop(s.pos, s.color)
  } else {
    grad.addColorStop(0, fx.color)
    grad.addColorStop(1, fx.endColor)
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, dims.w, dims.h)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(layer, 0, 0)
  return out
}

/**
 * Pattern overlay — tile a cached pattern image (or built-in checker
 * fallback) across the layer's alpha. Pattern tiles at `effect.scale`
 * percent of the source pattern's natural pixel size.
 *
 * Async pattern loading: if `patternDataUrl` is set but the cache misses,
 * caller is responsible for ensuring it loads; we draw nothing this frame
 * and the next render after cache populate will succeed.
 */
function drawPatternOverlay(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: PatternOverlayEffect,
  scale: number,
  imageCache?: Map<string, HTMLImageElement>,
): HTMLCanvasElement | null {
  let patternImg: HTMLImageElement | HTMLCanvasElement | null = null
  if (fx.patternDataUrl) {
    patternImg = imageCache?.get(fx.patternDataUrl) ?? null
    if (!patternImg) return null
  } else {
    patternImg = makeCheckerTile()
  }
  const out = makeCanvas(dims)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  const tileScale = (fx.scale / 100) * scale
  if (tileScale !== 1 && patternImg instanceof HTMLImageElement) {
    // For non-unit scale we'd need to pre-resize the tile because
    // createPattern doesn't honor a transform on the source. Render the
    // tile at the target scale onto a small canvas first.
    const w = Math.max(1, Math.round(patternImg.naturalWidth * tileScale))
    const h = Math.max(1, Math.round(patternImg.naturalHeight * tileScale))
    const tmp = makeCanvas({ w, h })
    const tctx = tmp.getContext('2d')
    if (!tctx) return null
    tctx.imageSmoothingEnabled = true
    tctx.drawImage(patternImg, 0, 0, w, h)
    patternImg = tmp
  }
  const pat = ctx.createPattern(patternImg, 'repeat')
  if (!pat) return null
  ctx.fillStyle = pat
  ctx.fillRect(0, 0, dims.w, dims.h)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(layer, 0, 0)
  return out
}

/** 16×16 checker tile used as Pattern Overlay's default fallback. */
let cachedCheckerTile: HTMLCanvasElement | null = null
function makeCheckerTile(): HTMLCanvasElement {
  if (cachedCheckerTile) return cachedCheckerTile
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 16
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#cccccc'
  ctx.fillRect(0, 0, 16, 16)
  ctx.fillStyle = '#999999'
  ctx.fillRect(0, 0, 8, 8)
  ctx.fillRect(8, 8, 8, 8)
  cachedCheckerTile = c
  return c
}

/**
 * Satin — silhouette XOR'd with its self-shifted copy, blurred. Result
 * lives inside the layer alpha; visible as a wavy interior contour. PS's
 * Satin uses a specific blur kernel; we approximate by combining two
 * opposing inner-shadow contributions.
 */
function drawSatin(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: SatinEffect,
  scale: number,
): HTMLCanvasElement | null {
  const out = makeCanvas(dims)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  const r = (fx.angle * Math.PI) / 180
  const dx = Math.cos(r) * fx.distance * scale
  const dy = -Math.sin(r) * fx.distance * scale

  // Two shifted silhouettes drawn with shadowBlur, then their intersection
  // produces the satin-like contour.
  const drawShifted = (sx: number, sy: number): HTMLCanvasElement | null => {
    const c = makeCanvas(dims)
    const cctx = c.getContext('2d')
    if (!cctx) return null
    cctx.shadowColor = fx.color
    cctx.shadowOffsetX = sx
    cctx.shadowOffsetY = sy
    cctx.shadowBlur = fx.size * scale
    cctx.drawImage(layer, 0, 0)
    cctx.shadowColor = 'transparent'
    cctx.shadowBlur = 0
    cctx.shadowOffsetX = 0
    cctx.shadowOffsetY = 0
    cctx.globalCompositeOperation = 'destination-out'
    cctx.drawImage(layer, 0, 0)
    return c
  }
  const a = drawShifted(dx, dy)
  const b = drawShifted(-dx, -dy)
  if (!a || !b) return null
  // Combine: take the difference (xor-ish) — use destination-out then add.
  ctx.drawImage(a, 0, 0)
  if (fx.invert) {
    ctx.globalCompositeOperation = 'source-over'
  } else {
    ctx.globalCompositeOperation = 'destination-out'
  }
  ctx.drawImage(b, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(layer, 0, 0)
  return out
}

/**
 * Bevel & Emboss — paired highlight + shadow shifted along the light
 * angle, each masked to either the inside or the outside of the layer's
 * alpha (or both) per the chosen style.
 *
 * Implementation note: the previous version tried to use `drawImage(layer)
 * + shadow` and then `destination-out` to leave only the shadow. That
 * works for OUTER projection (outerBevel) but the same operations zero
 * out the INTERIOR — so innerBevel rendered empty. v2 fixed it: inner
 * styles use the "colour the inverse, project shadow inward, mask to
 * layer alpha" pattern (same as innerShadow); outer styles use the
 * existing stamp-then-erase pattern.
 *
 *   - innerBevel: both highlight + shadow INSIDE alpha
 *   - outerBevel: both highlight + shadow OUTSIDE alpha
 *   - emboss: highlight inside, shadow outside (straddles the edge)
 *   - pillowEmboss: highlight outside, shadow inside (reversed emboss)
 */
function drawBevelEmboss(
  dims: { w: number; h: number },
  layer: HTMLCanvasElement,
  fx: BevelEmbossEffect,
  scale: number,
): HTMLCanvasElement | null {
  const out = makeCanvas(dims)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  const angleRad = (fx.angle * Math.PI) / 180
  const altRad = (fx.altitude * Math.PI) / 180
  const horiz = Math.cos(altRad)
  const offset = (fx.depth / 10) * scale * horiz
  const lx = Math.cos(angleRad) * offset
  const ly = -Math.sin(angleRad) * offset
  const blurPx = fx.size * scale

  // Side picks where the highlight or shadow lands:
  //   - 'inside': projected from the *inverse* of layer, masked to layer
  //   - 'outside': stamped from layer silhouette, layer erased to keep ring
  // The four PS styles map to (highlightSide, shadowSide) pairs.
  const sides: { hl: 'inside' | 'outside'; sh: 'inside' | 'outside' } = (() => {
    switch (fx.style) {
      case 'innerBevel':
        return { hl: 'inside', sh: 'inside' }
      case 'outerBevel':
        return { hl: 'outside', sh: 'outside' }
      case 'emboss':
        return { hl: 'inside', sh: 'outside' }
      case 'pillowEmboss':
        return { hl: 'outside', sh: 'inside' }
    }
  })()

  /** Inside projection: color the inverse silhouette, run native shadow
   *  to push it across the alpha edge, erase the inverse, then mask to
   *  the original alpha so only the bits *inside* the layer survive. */
  const insideContribution = (color: string, ox: number, oy: number): HTMLCanvasElement | null => {
    const inv = makeCanvas(dims)
    const ictx = inv.getContext('2d')
    if (!ictx) return null
    ictx.fillStyle = color
    ictx.fillRect(0, 0, dims.w, dims.h)
    ictx.globalCompositeOperation = 'destination-out'
    ictx.drawImage(layer, 0, 0)
    ictx.globalCompositeOperation = 'source-over'

    const proj = makeCanvas(dims)
    const pctx = proj.getContext('2d')
    if (!pctx) return null
    pctx.shadowColor = color
    pctx.shadowOffsetX = ox
    pctx.shadowOffsetY = oy
    pctx.shadowBlur = blurPx
    pctx.drawImage(inv, 0, 0)
    pctx.shadowColor = 'transparent'
    pctx.shadowBlur = 0
    pctx.shadowOffsetX = 0
    pctx.shadowOffsetY = 0
    pctx.globalCompositeOperation = 'destination-out'
    pctx.drawImage(inv, 0, 0)
    pctx.globalCompositeOperation = 'destination-in'
    pctx.drawImage(layer, 0, 0)
    return proj
  }

  /** Outside projection: stamp the layer silhouette with a coloured shadow
   *  at offset, then erase the layer silhouette so only the OUTER ring
   *  of the shadow remains. */
  const outsideContribution = (color: string, ox: number, oy: number): HTMLCanvasElement | null => {
    const c = makeCanvas(dims)
    const cctx = c.getContext('2d')
    if (!cctx) return null
    cctx.shadowColor = color
    cctx.shadowOffsetX = ox
    cctx.shadowOffsetY = oy
    cctx.shadowBlur = blurPx
    cctx.drawImage(layer, 0, 0)
    cctx.shadowColor = 'transparent'
    cctx.shadowBlur = 0
    cctx.shadowOffsetX = 0
    cctx.shadowOffsetY = 0
    cctx.globalCompositeOperation = 'destination-out'
    cctx.drawImage(layer, 0, 0)
    return c
  }

  const make = (
    color: string,
    side: 'inside' | 'outside',
    ox: number,
    oy: number,
  ): HTMLCanvasElement | null =>
    side === 'inside'
      ? insideContribution(color, ox, oy)
      : outsideContribution(color, ox, oy)

  // Highlight points TOWARD the light; shadow points AWAY.
  const highlight = make(fx.highlightColor, sides.hl, lx, ly)
  const shadow = make(fx.shadowColor, sides.sh, -lx, -ly)
  if (!highlight || !shadow) return null

  ctx.globalAlpha = fx.shadowOpacity / 100
  ctx.globalCompositeOperation = blendModeToOp(fx.shadowBlend)
  ctx.drawImage(shadow, 0, 0)

  ctx.globalAlpha = fx.highlightOpacity / 100
  ctx.globalCompositeOperation = blendModeToOp(fx.highlightBlend)
  ctx.drawImage(highlight, 0, 0)
  return out
}

function blendModeToOp(b: LayerEffect['blend']): GlobalCompositeOperation {
  if (b === 'normal') return 'source-over'
  return b
}

function makeCanvas(dims: { w: number; h: number }): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = dims.w
  c.height = dims.h
  return c
}

/**
 * Convert (distance, angle°) to (dx, dy) in **target** pixels. PS uses 0° =
 * right, 90° = up; the canvas Y axis points down, so we flip sin.
 */
function polarOffset(
  distance: number,
  angleDeg: number,
  scale: number,
): { dx: number; dy: number } {
  const r = (angleDeg * Math.PI) / 180
  return {
    dx: distance * Math.cos(r) * scale,
    dy: -distance * Math.sin(r) * scale,
  }
}
