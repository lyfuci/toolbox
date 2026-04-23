import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { PREVIEW_MAX } from '@/lib/image-editor/defaults'
import {
  getHandles,
  pickHandle,
  pickLayer,
  type Handle,
  type HandleId,
} from '@/lib/image-editor/hit'
import { dimsAfterRotation, renderTo } from '@/lib/image-editor/render'
import { layerEquals, resizeLayer, translateLayer } from '@/lib/image-editor/transform'
import type {
  AnnotationLayer,
  EditorState,
  Layer,
  MaskLayer,
  Point,
  Tool,
} from '@/lib/image-editor/types'

export type CanvasHandle = {
  exportTo: (canvas: HTMLCanvasElement) => void
}

type Props = {
  image: HTMLImageElement
  state: EditorState
  tool: Tool
  toolColor: string
  toolStrokeWidth: number
  /** Currently selected layer id (or 'image' for the background). */
  selectedId: string
  onSelect: (id: string) => void
  /** Commit a brand-new layer (drawing tool result). */
  onCommitLayer: (layer: Layer) => void
  /** Replace an existing layer in-place (move/resize commit). */
  onCommitLayerUpdate: (id: string, layer: Layer) => void
}

type Interaction =
  | { kind: 'idle' }
  | { kind: 'drawing'; layer: Layer }
  | {
      kind: 'moving'
      layerId: string
      startMouse: Point
      original: Layer
      preview: Layer
    }
  | {
      kind: 'resizing'
      layerId: string
      handleId: HandleId
      original: Layer
      preview: Layer
    }

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  {
    image,
    state,
    tool,
    toolColor,
    toolStrokeWidth,
    selectedId,
    onSelect,
    onCommitLayer,
    onCommitLayerUpdate,
  },
  ref,
) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [interaction, setInteraction] = useState<Interaction>({ kind: 'idle' })
  const [hoverCursor, setHoverCursor] = useState<string>('default')

  const { baseW, baseH } = dimsAfterRotation(image, state)
  const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
  const previewW = Math.round(baseW * previewScale)
  const previewH = Math.round(baseH * previewScale)

  // While moving/resizing, swap the affected layer's stored version with the
  // in-progress preview before passing to render — so the user sees live
  // movement without polluting history.
  const effectiveState: EditorState = useMemo(() => {
    if (interaction.kind === 'moving' || interaction.kind === 'resizing') {
      return {
        ...state,
        layers: state.layers.map((l) =>
          l.id === interaction.layerId ? interaction.preview : l,
        ),
      }
    }
    return state
  }, [state, interaction])

  // Selection chrome target: skipped while drawing a brand-new layer or when
  // 'image' is selected (image is special — handles aren't shown for it).
  const selectionLayer: Layer | null = useMemo(() => {
    if (interaction.kind === 'drawing') return null
    if (selectedId === 'image') return null
    if (interaction.kind === 'moving' || interaction.kind === 'resizing') {
      return interaction.preview
    }
    return effectiveState.layers.find((l) => l.id === selectedId) ?? null
  }, [interaction, selectedId, effectiveState])

  // Live preview render whenever any pixel-affecting input changes.
  useEffect(() => {
    if (!canvasRef.current) return
    renderTo(canvasRef.current, {
      image,
      state: effectiveState,
      scale: previewScale,
      previewScale,
      drawingPreview:
        interaction.kind === 'drawing' ? { layer: interaction.layer } : undefined,
      selection: selectionLayer ? { layer: selectionLayer } : undefined,
    })
  }, [image, effectiveState, interaction, selectionLayer, previewScale])

  useImperativeHandle(
    ref,
    () => ({
      // Export uses the *committed* state — exported PNG matches the user's
      // saved version, not the in-progress drag.
      exportTo: (canvas: HTMLCanvasElement) => {
        renderTo(canvas, {
          image,
          state,
          scale: 1,
          previewScale,
        })
      },
    }),
    [image, state, previewScale],
  )

  // ── Mouse handling ──────────────────────────────────────────────────────

  const eventToCanvasXY = (e: ReactMouseEvent<HTMLCanvasElement>): Point => {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const rect = c.getBoundingClientRect()
    const sx = c.width / rect.width
    const sy = c.height / rect.height
    // Shape coords are stored in PREVIEW pixels — convert from CSS px.
    return {
      x: ((e.clientX - rect.left) * sx) / previewScale,
      y: ((e.clientY - rect.top) * sy) / previewScale,
    }
  }

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const p = eventToCanvasXY(e)

    // Drawing tools take priority over selection.
    if (tool !== 'none') {
      startDrawing(p)
      return
    }

    // Resize: if a layer is selected, see if the click hit one of its handles.
    if (selectedId && selectedId !== 'image') {
      const sel = state.layers.find((l) => l.id === selectedId)
      if (sel) {
        const handle = pickHandle(getHandles(sel), p)
        if (handle) {
          setInteraction({
            kind: 'resizing',
            layerId: sel.id,
            handleId: handle.id,
            original: sel,
            preview: sel,
          })
          return
        }
      }
    }

    // Otherwise pick whichever layer is at the click; start moving.
    const pickedId = pickLayer(state.layers, p)
    if (pickedId) {
      onSelect(pickedId)
      const layer = state.layers.find((l) => l.id === pickedId)!
      setInteraction({
        kind: 'moving',
        layerId: pickedId,
        startMouse: p,
        original: layer,
        preview: layer,
      })
    } else {
      // Click on empty space → deselect (back to image background).
      onSelect('image')
    }
  }

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (interaction.kind === 'idle') return
    const p = eventToCanvasXY(e)

    if (interaction.kind === 'drawing') {
      updateDrawing(p)
      return
    }
    if (interaction.kind === 'moving') {
      const dx = p.x - interaction.startMouse.x
      const dy = p.y - interaction.startMouse.y
      setInteraction({
        ...interaction,
        preview: translateLayer(interaction.original, dx, dy),
      })
      return
    }
    if (interaction.kind === 'resizing') {
      setInteraction({
        ...interaction,
        preview: resizeLayer(interaction.original, interaction.handleId, p),
      })
      return
    }
  }

  const handleMouseUp = () => {
    if (interaction.kind === 'idle') return
    if (interaction.kind === 'drawing') {
      if (!shouldDiscardDrawing(interaction.layer)) {
        onCommitLayer(interaction.layer)
      }
    } else if (
      interaction.kind === 'moving' ||
      interaction.kind === 'resizing'
    ) {
      // No-op clicks (mousedown + mouseup with no real drag) shouldn't
      // pollute history.
      if (!layerEquals(interaction.preview, interaction.original)) {
        onCommitLayerUpdate(interaction.layerId, interaction.preview)
      }
    }
    setInteraction({ kind: 'idle' })
  }

  // ── Drawing-tool helpers ────────────────────────────────────────────────

  function startDrawing(p: Point) {
    const id = crypto.randomUUID()
    const baseLayer = (name: string) => ({
      id,
      name,
      visible: true,
      opacity: 100 as const,
      blend: 'normal' as const,
    })
    if (tool === 'rect') {
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer('Rectangle'),
          kind: 'annotation',
          shape: { kind: 'rect', x: p.x, y: p.y, w: 0, h: 0, color: toolColor, strokeWidth: toolStrokeWidth },
        } as AnnotationLayer,
      })
    } else if (tool === 'arrow') {
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer('Arrow'),
          kind: 'annotation',
          shape: { kind: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: toolColor, strokeWidth: toolStrokeWidth },
        } as AnnotationLayer,
      })
    } else if (tool === 'mosaic') {
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer('Mosaic'),
          kind: 'annotation',
          shape: { kind: 'mosaic', x: p.x, y: p.y, w: 0, h: 0, cell: 12 },
        } as AnnotationLayer,
      })
    } else if (tool === 'brush' || tool === 'eraser') {
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer(tool === 'eraser' ? 'Eraser' : 'Brush'),
          kind: 'annotation',
          shape: {
            kind: 'brush',
            points: [p],
            color: toolColor,
            strokeWidth: toolStrokeWidth,
            eraser: tool === 'eraser',
          },
        } as AnnotationLayer,
      })
    } else if (tool === 'mask') {
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer('Mask'),
          kind: 'mask',
          rects: [{ x: p.x, y: p.y, w: 0, h: 0 }],
        } as MaskLayer,
      })
    } else if (tool === 'text') {
      const text = window.prompt(t('pages.imageEditor.textPrompt'), '') ?? ''
      if (text.trim()) {
        onCommitLayer({
          id,
          name: 'Text',
          visible: true,
          opacity: 100,
          blend: 'normal',
          kind: 'annotation',
          shape: { kind: 'text', x: p.x, y: p.y, text, color: toolColor, fontSize: 24 },
        } as AnnotationLayer)
      }
    }
  }

  function updateDrawing(p: Point) {
    if (interaction.kind !== 'drawing') return
    const drawing = interaction.layer
    if (drawing.kind === 'annotation') {
      const s = drawing.shape
      if (s.kind === 'rect' || s.kind === 'mosaic') {
        setInteraction({
          kind: 'drawing',
          layer: { ...drawing, shape: { ...s, w: p.x - s.x, h: p.y - s.y } } as AnnotationLayer,
        })
      } else if (s.kind === 'arrow') {
        setInteraction({
          kind: 'drawing',
          layer: { ...drawing, shape: { ...s, x2: p.x, y2: p.y } } as AnnotationLayer,
        })
      } else if (s.kind === 'brush') {
        setInteraction({
          kind: 'drawing',
          layer: { ...drawing, shape: { ...s, points: [...s.points, p] } } as AnnotationLayer,
        })
      }
    } else if (drawing.kind === 'mask') {
      const r = drawing.rects[0]
      setInteraction({
        kind: 'drawing',
        layer: {
          ...drawing,
          rects: [{ x: r.x, y: r.y, w: p.x - r.x, h: p.y - r.y }],
        } as MaskLayer,
      })
    }
  }

  // Update cursor on idle hover so users can preview what a click will do.
  // Cheap (one state set per move while idle).
  const handleHover = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (interaction.kind !== 'idle') return
    if (tool !== 'none') {
      setHoverCursor('crosshair')
      return
    }
    const p = eventToCanvasXY(e)
    if (selectedId && selectedId !== 'image') {
      const sel = state.layers.find((l) => l.id === selectedId)
      if (sel) {
        const handle = pickHandle(getHandles(sel), p)
        if (handle) {
          setHoverCursor(cursorForHandle(handle))
          return
        }
      }
    }
    const picked = pickLayer(state.layers, p)
    setHoverCursor(picked ? 'move' : 'default')
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={(e) => {
        handleMouseMove(e)
        handleHover(e)
      }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={
        {
          cursor:
            interaction.kind === 'moving'
              ? 'grabbing'
              : interaction.kind === 'resizing'
                ? cursorForHandleId(interaction.handleId)
                : hoverCursor,
          display: 'block',
          maxWidth: '100%',
          maxHeight: '100%',
          height: 'auto',
          aspectRatio: previewW > 0 ? `${previewW} / ${previewH}` : undefined,
        } as CSSProperties
      }
    />
  )
})

function cursorForHandle(h: Handle): string {
  return cursorForHandleId(h.id)
}

function cursorForHandleId(id: HandleId): string {
  switch (id) {
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'start':
    case 'end':
      return 'crosshair'
  }
}

function shouldDiscardDrawing(layer: Layer): boolean {
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
