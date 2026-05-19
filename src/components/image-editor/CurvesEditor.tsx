import { useEffect, useRef } from 'react'

type Point = { x: number; y: number }

type Props = {
  points: Point[]
  onChange: (points: Point[]) => void
  /** Optional stroke colour for the curve line — used to tint per-channel
   *  curves (R / G / B) so the user can tell which channel they're editing. */
  tint?: string
}

const SIZE = 256
const HIT_RADIUS = 10

/**
 * Interactive curves editor — square 256×256 surface where the user drags
 * control points to shape an RGB tone curve. Click empty space adds a point;
 * Alt-click an existing point removes it (provided it's not an endpoint).
 *
 * Endpoints are constrained to x=0 / x=255 respectively so the curve always
 * spans the full input range. All other points are sorted by x on every
 * change so the parent (curve LUT builder) sees a monotonic-x list.
 */
export function CurvesEditor({ points, onChange, tint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<{ index: number } | null>(null)

  // Repaint whenever the points change.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, SIZE, SIZE)
    // Subtle grid (PS-like).
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      const v = (i * SIZE) / 4
      ctx.beginPath()
      ctx.moveTo(v, 0)
      ctx.lineTo(v, SIZE)
      ctx.moveTo(0, v)
      ctx.lineTo(SIZE, v)
      ctx.stroke()
    }
    // Diagonal reference.
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath()
    ctx.moveTo(0, SIZE)
    ctx.lineTo(SIZE, 0)
    ctx.stroke()
    // Draw the curve by sampling 256 LUT entries (Catmull-Rom).
    const lut = lutFromPoints(points)
    ctx.strokeStyle = tint ?? '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = 0; x < 256; x++) {
      const y = SIZE - lut[x] // canvas Y inverted
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // Control points.
    for (const p of points) {
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, SIZE - p.y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }, [points, tint])

  const toCurveCoords = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * SIZE
    const y = SIZE - ((e.clientY - rect.top) / rect.height) * SIZE
    return { x: clamp(x, 0, 255), y: clamp(y, 0, 255) }
  }

  const findHit = (p: Point): number => {
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - p.x
      const dy = points[i].y - p.y
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) return i
    }
    return -1
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = toCurveCoords(e)
    const hit = findHit(p)
    if (hit >= 0) {
      // Alt-click removes a point (but not endpoints — they're load-bearing).
      const isEndpoint = hit === 0 || hit === points.length - 1
      if (e.altKey && !isEndpoint) {
        const next = points.slice()
        next.splice(hit, 1)
        onChange(next)
        return
      }
      dragRef.current = { index: hit }
      return
    }
    // Click empty: add a point and immediately drag it.
    const next = [...points, p].sort((a, b) => a.x - b.x)
    onChange(next)
    dragRef.current = { index: next.findIndex((q) => q.x === p.x && q.y === p.y) }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return
    const p = toCurveCoords(e)
    const idx = dragRef.current.index
    const isFirst = idx === 0
    const isLast = idx === points.length - 1
    const next = points.slice()
    // Endpoints lock x; mid-points get x clamped between neighbors.
    let nx = p.x
    if (isFirst) nx = 0
    else if (isLast) nx = 255
    else {
      const left = points[idx - 1].x + 1
      const right = points[idx + 1].x - 1
      nx = clamp(p.x, left, right)
    }
    next[idx] = { x: nx, y: p.y }
    onChange(next)
  }

  const handleMouseUp = () => {
    dragRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      className="block w-full max-w-[256px] aspect-square border border-border rounded bg-zinc-900"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: 'crosshair' }}
    />
  )
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo
  if (n > hi) return hi
  return n
}

// Same Catmull-Rom interpolation as in adjustments.ts — duplicated here so the
// editor's preview line matches the rendered LUT exactly.
function lutFromPoints(input: Point[]): Uint8ClampedArray {
  const pts = [...input]
    .map((pt) => ({ x: clamp(pt.x, 0, 255), y: clamp(pt.y, 0, 255) }))
    .sort((a, b) => a.x - b.x)
  if (pts.length === 0 || pts[0].x > 0) pts.unshift({ x: 0, y: pts[0]?.y ?? 0 })
  if (pts[pts.length - 1].x < 255)
    pts.push({ x: 255, y: pts[pts.length - 1].y })
  const lut = new Uint8ClampedArray(256)
  for (let x = 0; x < 256; x++) {
    let i = 0
    while (i < pts.length - 1 && pts[i + 1].x < x) i++
    const p1 = pts[i]
    const p2 = pts[Math.min(i + 1, pts.length - 1)]
    if (p1.x === p2.x) {
      lut[x] = clamp(p1.y, 0, 255)
      continue
    }
    if (pts.length <= 2) {
      const t = (x - p1.x) / (p2.x - p1.x)
      lut[x] = clamp(p1.y + (p2.y - p1.y) * t, 0, 255)
      continue
    }
    const p0 = pts[Math.max(0, i - 1)]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const t = (x - p1.x) / (p2.x - p1.x)
    const t2 = t * t
    const t3 = t2 * t
    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    lut[x] = clamp(y, 0, 255)
  }
  return lut
}
