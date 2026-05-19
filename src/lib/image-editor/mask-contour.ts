import type { Point } from './types'

/**
 * Extract a polygon contour around the selected region of a raster mask.
 *
 * Used by Quick Mask exit (and any future "mask → selection path" path) so
 * the resulting selection follows the mask shape — concave regions, holes
 * notwithstanding — instead of just falling back to the mask's bbox.
 *
 * Implementation: Moore-neighbour boundary tracing. Find the top-left
 * foreground pixel, then walk clockwise around its 8-neighbourhood, always
 * starting the scan from the cell we just came from (`backDir`). This
 * traces the outer contour of the largest connected region. Holes and
 * disjoint islands are NOT captured — selectionPath is a single Point[],
 * which can't represent multi-region paths without a path-of-paths
 * extension. For mask use-cases this is acceptable; users wanting precise
 * multi-region selection should use Lasso instead.
 *
 * `maxPoints` caps the returned polygon. We oversample then downsample
 * uniformly so tall/wide regions still trace cleanly without producing a
 * five-thousand-vertex polygon for a giant brush mask.
 */
export function extractMaskContour(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  options: { threshold?: number; maxPoints?: number } = {},
): Point[] {
  const threshold = options.threshold ?? 127
  const maxPoints = options.maxPoints ?? 400

  const isSet = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    const i = (y * w + x) * 4
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
    return lum > threshold
  }

  let sx = -1
  let sy = -1
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isSet(x, y)) {
        sx = x
        sy = y
        break outer
      }
    }
  }
  if (sx < 0) return []

  // 8 neighbour offsets, clockwise starting at "west" (index 0).
  const DIRS: ReadonlyArray<readonly [number, number]> = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ]

  const points: Point[] = [{ x: sx, y: sy }]
  let cx = sx
  let cy = sy
  // Backtrack direction starts at "west of start" — guaranteed background
  // because we picked sx as the first foreground in scan order.
  let backDir = 0
  // Worst-case bound: walking every pixel of the shape boundary. 8 × #pixels
  // is a comfortable upper bound; we'll usually break out at the start cell.
  let safety = w * h * 8
  while (safety-- > 0) {
    let found = false
    for (let i = 1; i <= 8; i++) {
      const nd = (backDir + i) % 8
      const [dx, dy] = DIRS[nd]
      const nx = cx + dx
      const ny = cy + dy
      if (isSet(nx, ny)) {
        // From the new pixel's perspective, the cell we just left lies in
        // the opposite direction we entered from.
        backDir = (nd + 4) % 8
        cx = nx
        cy = ny
        found = true
        break
      }
    }
    if (!found) break
    if (cx === sx && cy === sy) break
    points.push({ x: cx, y: cy })
    // Safety cap to avoid runaway in pathological masks.
    if (points.length > maxPoints * 8) break
  }

  if (points.length <= maxPoints) return points
  // Uniform downsample. Stride keeps the first point and steps by p/maxPoints
  // so we hit ~maxPoints evenly across the contour.
  const out: Point[] = []
  const stride = points.length / maxPoints
  for (let i = 0; i < points.length; i += stride) {
    out.push(points[Math.floor(i)])
  }
  return out
}
