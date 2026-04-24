/**
 * Flood-fill helpers for the Paint Bucket tool.
 *
 * Operates on raw ImageData. The `tolerance` is a 0–255 max channel-wise
 * deviation from the seed pixel — anything within that distance on R, G, B,
 * AND A is considered "matching" and gets included in the filled region.
 * Returns a Uint8Array mask of size width*height (1 = filled, 0 = not).
 *
 * Implementation is a 4-connected scanline fill via an explicit stack — no
 * recursion (canvases are big and JS stacks are small), and we avoid the
 * naive 4×stack push by greedily extending each row before pushing
 * neighbours. Fast enough for ~12 megapixels (which is the practical cap
 * for browser canvas anyway).
 */
export function floodFillMask(
  data: ImageData,
  startX: number,
  startY: number,
  tolerance: number,
): Uint8Array {
  const { data: px, width, height } = data
  const mask = new Uint8Array(width * height)
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return mask

  const seedIdx = (startY * width + startX) * 4
  const sr = px[seedIdx]
  const sg = px[seedIdx + 1]
  const sb = px[seedIdx + 2]
  const sa = px[seedIdx + 3]

  const matches = (i: number) =>
    Math.abs(px[i] - sr) <= tolerance &&
    Math.abs(px[i + 1] - sg) <= tolerance &&
    Math.abs(px[i + 2] - sb) <= tolerance &&
    Math.abs(px[i + 3] - sa) <= tolerance

  // Scanline stack — each entry is a row to scan starting at (x, y).
  const stack: [number, number][] = [[startX, startY]]
  while (stack.length) {
    const [sx, sy] = stack.pop()!
    // Walk left until we leave the matching span.
    let lx = sx
    while (lx >= 0 && !mask[sy * width + lx] && matches((sy * width + lx) * 4)) lx--
    lx++
    // Walk right, marking + checking neighbours along the way.
    let spanAbove = false
    let spanBelow = false
    while (lx < width && !mask[sy * width + lx] && matches((sy * width + lx) * 4)) {
      mask[sy * width + lx] = 1
      // Push start-of-run for the row above when we enter a matching span there.
      if (sy > 0) {
        const matchAbove = !mask[(sy - 1) * width + lx] && matches(((sy - 1) * width + lx) * 4)
        if (!spanAbove && matchAbove) {
          stack.push([lx, sy - 1])
          spanAbove = true
        } else if (spanAbove && !matchAbove) {
          spanAbove = false
        }
      }
      if (sy < height - 1) {
        const matchBelow = !mask[(sy + 1) * width + lx] && matches(((sy + 1) * width + lx) * 4)
        if (!spanBelow && matchBelow) {
          stack.push([lx, sy + 1])
          spanBelow = true
        } else if (spanBelow && !matchBelow) {
          spanBelow = false
        }
      }
      lx++
    }
  }
  return mask
}

/**
 * Build a transparent bitmap of (width × height) where every pixel set in
 * `mask` is painted with `color` (#rrggbb). Returns a data URL suitable for
 * an image-shape layer.
 */
export function maskToDataUrl(
  mask: Uint8Array,
  width: number,
  height: number,
  color: string,
): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(width, height)
  const [r, g, b] = hexToRgb(color)
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const j = i * 4
      img.data[j] = r
      img.data[j + 1] = g
      img.data[j + 2] = b
      img.data[j + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  if (m.length !== 6) return [0, 0, 0]
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ]
}
