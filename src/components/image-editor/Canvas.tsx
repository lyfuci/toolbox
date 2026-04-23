import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { dimsAfterRotation, renderTo } from '@/lib/image-editor/render'
import type {
  AnnotationLayer,
  EditorState,
  Layer,
  MaskLayer,
  Point,
  Tool,
} from '@/lib/image-editor/types'
import { PREVIEW_MAX } from '@/lib/image-editor/defaults'

export type CanvasHandle = {
  /** Render to an arbitrary canvas at scale=1 (used for export). */
  exportTo: (canvas: HTMLCanvasElement) => void
}

type Props = {
  image: HTMLImageElement
  state: EditorState
  tool: Tool
  toolColor: string
  toolStrokeWidth: number
  /** When the user finishes a drag, commit the new layer here. */
  onCommitLayer: (layer: Layer) => void
}

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { image, state, tool, toolColor, toolStrokeWidth, onCommitLayer },
  ref,
) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // In-progress drag layer; `null` when not drawing.
  const [drawing, setDrawing] = useState<Layer | null>(null)

  const { baseW, baseH } = dimsAfterRotation(image, state)
  const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
  const previewW = Math.round(baseW * previewScale)
  const previewH = Math.round(baseH * previewScale)

  // Live preview render. Re-runs whenever any input that affects pixels changes.
  useEffect(() => {
    if (!canvasRef.current) return
    renderTo(canvasRef.current, {
      image,
      state,
      scale: previewScale,
      previewScale,
      drawingPreview: drawing ? { layer: drawing } : undefined,
    })
  }, [image, state, drawing, previewScale])

  useImperativeHandle(ref, () => ({
    exportTo: (canvas: HTMLCanvasElement) => {
      renderTo(canvas, {
        image,
        state,
        scale: 1,
        previewScale,
      })
    },
  }), [image, state, previewScale])

  // ── Mouse → tool routing ─────────────────────────────────────────────────

  const eventToCanvasXY = (e: ReactMouseEvent<HTMLCanvasElement>): Point => {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const rect = c.getBoundingClientRect()
    const sx = c.width / rect.width
    const sy = c.height / rect.height
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (tool === 'none') return
    const p = eventToCanvasXY(e)
    const id = crypto.randomUUID()
    const baseLayer = (name: string) => ({
      id,
      name,
      visible: true,
      opacity: 100 as const,
      blend: 'normal' as const,
    })
    if (tool === 'rect') {
      setDrawing({
        ...baseLayer('Rectangle'),
        kind: 'annotation',
        shape: { kind: 'rect', x: p.x, y: p.y, w: 0, h: 0, color: toolColor, strokeWidth: toolStrokeWidth },
      } as AnnotationLayer)
    } else if (tool === 'arrow') {
      setDrawing({
        ...baseLayer('Arrow'),
        kind: 'annotation',
        shape: { kind: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: toolColor, strokeWidth: toolStrokeWidth },
      } as AnnotationLayer)
    } else if (tool === 'mosaic') {
      setDrawing({
        ...baseLayer('Mosaic'),
        kind: 'annotation',
        shape: { kind: 'mosaic', x: p.x, y: p.y, w: 0, h: 0, cell: 12 },
      } as AnnotationLayer)
    } else if (tool === 'brush' || tool === 'eraser') {
      setDrawing({
        ...baseLayer(tool === 'eraser' ? 'Eraser' : 'Brush'),
        kind: 'annotation',
        shape: {
          kind: 'brush',
          points: [p],
          color: toolColor,
          strokeWidth: toolStrokeWidth,
          eraser: tool === 'eraser',
        },
      } as AnnotationLayer)
    } else if (tool === 'mask') {
      setDrawing({
        ...baseLayer('Mask'),
        kind: 'mask',
        rects: [{ x: p.x, y: p.y, w: 0, h: 0 }],
      } as MaskLayer)
    } else if (tool === 'text') {
      const text = window.prompt(t('pages.imageEditor.textPrompt'), '') ?? ''
      if (text.trim()) {
        onCommitLayer({
          ...baseLayer('Text'),
          kind: 'annotation',
          shape: { kind: 'text', x: p.x, y: p.y, text, color: toolColor, fontSize: 24 },
        } as AnnotationLayer)
      }
    }
  }

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return
    const p = eventToCanvasXY(e)
    if (drawing.kind === 'annotation') {
      const s = drawing.shape
      if (s.kind === 'rect' || s.kind === 'mosaic') {
        setDrawing({ ...drawing, shape: { ...s, w: p.x - s.x, h: p.y - s.y } } as AnnotationLayer)
      } else if (s.kind === 'arrow') {
        setDrawing({ ...drawing, shape: { ...s, x2: p.x, y2: p.y } } as AnnotationLayer)
      } else if (s.kind === 'brush') {
        setDrawing({
          ...drawing,
          shape: { ...s, points: [...s.points, p] },
        } as AnnotationLayer)
      }
    } else if (drawing.kind === 'mask') {
      const r = drawing.rects[0]
      setDrawing({ ...drawing, rects: [{ x: r.x, y: r.y, w: p.x - r.x, h: p.y - r.y }] } as MaskLayer)
    }
  }

  const handleMouseUp = () => {
    if (!drawing) return
    if (!shouldDiscard(drawing)) {
      onCommitLayer(drawing)
    }
    setDrawing(null)
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        cursor: tool === 'none' ? 'default' : 'crosshair',
        display: 'block',
        maxWidth: '100%',
        maxHeight: '100%',
        height: 'auto',
        aspectRatio: previewW > 0 ? `${previewW} / ${previewH}` : undefined,
      } as CSSProperties}
    />
  )
})

function shouldDiscard(layer: Layer): boolean {
  if (layer.kind === 'mask') {
    const r = layer.rects[0]
    return Math.abs(r.w) < 4 && Math.abs(r.h) < 4
  }
  if (layer.kind === 'annotation') {
    const s = layer.shape
    if (s.kind === 'rect' || s.kind === 'mosaic') {
      return Math.abs(s.w) < 4 && Math.abs(s.h) < 4
    }
    if (s.kind === 'arrow') {
      return Math.abs(s.x2 - s.x1) < 4 && Math.abs(s.y2 - s.y1) < 4
    }
    if (s.kind === 'brush') {
      return s.points.length < 2
    }
  }
  return false
}
