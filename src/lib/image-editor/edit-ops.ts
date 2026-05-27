import { buildImageShapeLayer, previewDimsOf, regionFromSelection } from './composite-ops'
import { buildSelectionMaskCanvas } from './selection-mask'
import type { AnnotationLayer, BlendMode, EditorState } from './types'

/**
 * Edit-menu primitives that produce a new annotation image-shape layer.
 * Fill / Stroke share the pattern: render the operation onto a fresh
 * source-resolution canvas (within the selection, when one is set), then
 * commit as an image-shape layer. The selection's geometry is rasterized at
 * apply time — the layer that lands in state.layers does NOT carry a
 * clipRect / clipPath, since the pixels themselves are already shaped.
 *
 * This trades flexibility (the layer can't be re-clipped to a different
 * selection later) for predictability — what-you-see is exactly the layer
 * data, no hidden state.
 */

export type FillKind = 'fg' | 'bg' | 'black' | 'white' | 'gray50' | 'custom'

/** Fill the active selection (or full canvas) with `color` × `opacity`. */
export function fillSelection(args: {
  image: HTMLImageElement
  state: EditorState
  color: string
  opacity: number // 0..1
  blend?: BlendMode
  name: string
}): AnnotationLayer | null {
  const { image, state, color, opacity, blend, name } = args
  const dims = previewDimsOf(image, state)
  const region = regionFromSelection(state)

  const w = Math.max(1, Math.round(dims.w / dims.previewScale))
  const h = Math.max(1, Math.round(dims.h / dims.previewScale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = color
  const feather = state.selectionFeather ?? 0
  if (region !== null && feather > 0) {
    // Feathered fill: paint the whole canvas, then knock it back to the
    // selection via a blurred mask (destination-in). The soft edge is baked
    // into the layer's pixels, so the layer carries no geometric clip — see
    // `withSelectionClip`. Inverse is baked into the mask here too.
    const s = dims.previewScale
    ctx.fillRect(0, 0, w, h)
    const mask = buildSelectionMaskCanvas({
      w,
      h,
      path: region.kind === 'path'
        ? region.path.map((p) => ({ x: p.x / s, y: p.y / s }))
        : undefined,
      rect: region.kind === 'rect'
        ? {
            x: region.rect.x / s,
            y: region.rect.y / s,
            w: region.rect.w / s,
            h: region.rect.h / s,
          }
        : undefined,
      feather: feather / s,
      inverse: state.selectionInverse,
    })
    if (mask) {
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(mask, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    }
  } else if (region === null) {
    // No selection → fill entire canvas.
    ctx.fillRect(0, 0, w, h)
  } else if (region.kind === 'rect') {
    const r = region.rect
    ctx.fillRect(
      r.x / dims.previewScale,
      r.y / dims.previewScale,
      r.w / dims.previewScale,
      r.h / dims.previewScale,
    )
  } else {
    ctx.beginPath()
    for (let i = 0; i < region.path.length; i++) {
      const p = region.path[i]
      const x = p.x / dims.previewScale
      const y = p.y / dims.previewScale
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  }

  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL('image/png')
  } catch {
    return null
  }

  const layer = buildImageShapeLayer({
    dataUrl,
    bbox: { x: 0, y: 0, w: dims.w, h: dims.h },
    name,
  })
  return { ...layer, opacity: Math.round(opacity * 100), blend: blend ?? 'normal' }
}

export type StrokePosition = 'inside' | 'center' | 'outside'

/**
 * Stroke the selection outline with `color` × `width`. Position determines
 * which side of the geometric outline carries the stroke (PS Edit > Stroke).
 * The stroke is rasterized at source resolution and committed as an image-
 * shape layer covering the full preview canvas.
 *
 * Implementation: build the selection path → stroke it at 2*width (so it
 * lays half on each side) → clip with destination-in (inside) or
 * destination-out (outside) against the selection fill, or do nothing
 * (center). Browser canvas already centers strokes by default, so:
 *   - center:  stroke the path at `width`, no clip
 *   - inside:  stroke at `width * 2`, destination-in clip to the fill
 *   - outside: stroke at `width * 2`, destination-out clip to the fill
 */
export function strokeSelection(args: {
  image: HTMLImageElement
  state: EditorState
  color: string
  width: number // preview-pixel pixels
  position: StrokePosition
  name: string
}): AnnotationLayer | null {
  const { image, state, color, width, position, name } = args
  const dims = previewDimsOf(image, state)
  const region = regionFromSelection(state)
  if (region === null) {
    // Without a selection, fall back to stroking the entire canvas border —
    // matches PS's "no selection → stroke the layer bounds" behaviour.
  }

  const w = Math.max(1, Math.round(dims.w / dims.previewScale))
  const h = Math.max(1, Math.round(dims.h / dims.previewScale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const widthSrc = (width / dims.previewScale) * (position === 'center' ? 1 : 2)
  const tracePath = () => {
    ctx.beginPath()
    if (region === null) {
      ctx.rect(0, 0, w, h)
    } else if (region.kind === 'rect') {
      const r = region.rect
      ctx.rect(
        r.x / dims.previewScale,
        r.y / dims.previewScale,
        r.w / dims.previewScale,
        r.h / dims.previewScale,
      )
    } else {
      for (let i = 0; i < region.path.length; i++) {
        const p = region.path[i]
        const x = p.x / dims.previewScale
        const y = p.y / dims.previewScale
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }
  }

  ctx.strokeStyle = color
  ctx.lineWidth = widthSrc
  ctx.lineJoin = 'miter'
  ctx.miterLimit = 10
  tracePath()
  ctx.stroke()

  if (position === 'inside' || position === 'outside') {
    // Clip the stroke against the selection fill.
    ctx.globalCompositeOperation = position === 'inside' ? 'destination-in' : 'destination-out'
    ctx.fillStyle = '#000'
    tracePath()
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL('image/png')
  } catch {
    return null
  }
  return buildImageShapeLayer({
    dataUrl,
    bbox: { x: 0, y: 0, w: dims.w, h: dims.h },
    name,
  })
}
