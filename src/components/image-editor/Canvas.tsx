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
import type { ImageCache } from '@/lib/image-editor/drawing'
import { dimsAfterRotation, renderTo } from '@/lib/image-editor/render'
import { layerEquals, resizeLayer, translateLayer } from '@/lib/image-editor/transform'
import type {
  AnnotationLayer,
  EditorState,
  Layer,
  MaskLayer,
  PathAnchor,
  Point,
  Tool,
} from '@/lib/image-editor/types'

export type CanvasHandle = {
  exportTo: (canvas: HTMLCanvasElement) => void
  /** Apply the user's pending crop drag (if any). No-op if nothing is pending. */
  commitPendingCrop: () => void
  /** Discard any pending crop drag without modifying state. */
  cancelPendingCrop: () => void
  /** True iff there's a pending (un-committed) crop drag waiting on user. */
  hasPendingCrop: () => boolean
  /** True iff a Polygonal Lasso vertex chain is in progress. */
  hasPendingPolyLasso: () => boolean
  /** Cancel an in-progress Polygonal Lasso chain (Esc binding). */
  cancelPendingPolyLasso: () => void
  /** True iff a Pen tool path is being built. */
  hasPendingPen: () => boolean
  /** Commit the current open Pen path as a layer (Enter binding). */
  commitPendingPen: () => void
  /** Discard an in-progress Pen path (Esc binding). */
  cancelPendingPen: () => void
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
  /** When true (Space held), Canvas suppresses its mouse logic so Workspace can pan. */
  panMode: boolean
  /** HTMLImageElement cache for image-shape layers, threaded through to the renderer. */
  imageCache?: ImageCache
  /** Called by the Z (zoom) tool — zooms by `factor` centred on the click point. */
  onZoomAt?: (clientX: number, clientY: number, factor: number) => void
  /** Called by the Eyedropper tool with a hex color picked from the canvas. */
  onPickColor?: (hex: string) => void
  /**
   * Called when the user commits a crop. `rect` is in the same coordinate
   * space as state.cropRect (post-rotation preview-pixel space, relative to
   * the *original* image — Canvas already translates from the cropped-canvas
   * coords if a crop is currently active).
   */
  onCommitCrop?: (rect: { x: number; y: number; w: number; h: number }) => void
  /**
   * Called by the Paint Bucket tool with a click point in *preview-pixel
   * space*. Paint bucket needs to render the canvas to read pixels, so the
   * heavy lifting (re-rendering at source res, flood fill, layer commit)
   * happens in the parent — Canvas just hands off the click coords.
   */
  onBucketClick?: (point: Point) => void
  /** Tolerance for the Paint Bucket flood fill (0–128). */
  bucketTolerance?: number
  /**
   * Called by the Gradient tool when the user releases the mouse with a
   * non-trivial drag. Both points are in preview-pixel space (canvas
   * pixels at scale=previewScale). Layer commit happens in the parent.
   */
  onCommitGradient?: (start: Point, end: Point) => void
  /**
   * Called by the Marquee tool when a non-trivial drag commits. Rect is in
   * cropped-canvas preview-pixel space; the parent shifts by the active
   * crop origin to land in original-image preview-pixel space (matching how
   * shape coords are stored).
   */
  onCommitSelection?: (rect: { x: number; y: number; w: number; h: number }) => void
  /**
   * Called by Lasso / Polygonal Lasso when the user closes a non-trivial
   * polygon. Points are in canvas-pixel space; the parent shifts by the
   * crop origin and stores both the bbox and the polygon.
   */
  onCommitPolygonSelection?: (points: Point[]) => void
  /**
   * Called by the Magic Wand on click. Point is in canvas-pixel space; the
   * parent runs the flood fill and stores the bbox of the matching region
   * as the rect selection.
   */
  onWandClick?: (point: Point) => void
  /** Tolerance for the Magic Wand flood fill (0–128). */
  wandTolerance?: number
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
  /** Crop drag in progress (mouse held). Rect is in canvas-pixel space. */
  | { kind: 'crop-drawing'; rect: { x: number; y: number; w: number; h: number } }
  /** Crop drag finished, awaiting commit/cancel from caller. */
  | { kind: 'crop-pending'; rect: { x: number; y: number; w: number; h: number } }
  /** Gradient drag in progress — start + current end point in canvas pixels. */
  | { kind: 'gradient-drawing'; start: Point; end: Point }
  /** Marquee selection drag — rect in canvas-pixel space. */
  | { kind: 'marquee-drawing'; rect: { x: number; y: number; w: number; h: number } }
  /** Lasso freeform drag — accumulating points in canvas-pixel space. */
  | { kind: 'lasso-drawing'; points: Point[] }
  /**
   * Polygonal Lasso click-by-click. `points` are committed; `cursor` is the
   * current mouse position so the live preview can show the next pending
   * segment from the last committed point to the cursor.
   */
  | { kind: 'polylasso-drawing'; points: Point[]; cursor: Point }
  /**
   * Pen tool — click adds a corner anchor; click-and-drag turns it into a
   * smooth anchor with symmetric handles. `pressed` is true between mousedown
   * and mouseup on the current anchor (the window during which the drag sets
   * the handles). Closing happens by clicking near the first anchor (handled
   * in mousedown). Esc cancels; Enter commits the current path open.
   */
  | { kind: 'pen-drawing'; anchors: PathAnchor[]; pressed: boolean; cursor: Point }

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
    panMode,
    imageCache,
    onZoomAt,
    onPickColor,
    onCommitCrop,
    onBucketClick,
    onCommitGradient,
    onCommitSelection,
    onCommitPolygonSelection,
    onWandClick,
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

  // Switching off the crop tool clears any uncommitted crop preview — keeps
  // the dim overlay from leaking into other tools' workflows.
  useEffect(() => {
    if (tool !== 'crop') {
      setInteraction((i) =>
        i.kind === 'crop-drawing' || i.kind === 'crop-pending' ? { kind: 'idle' } : i,
      )
    }
  }, [tool])

  // Live preview render whenever any pixel-affecting input changes.
  useEffect(() => {
    if (!canvasRef.current) return
    renderTo(canvasRef.current, {
      image,
      state: effectiveState,
      scale: previewScale,
      previewScale,
      drawingPreview:
        interaction.kind === 'drawing'
          ? { layer: interaction.layer }
          : interaction.kind === 'pen-drawing' && interaction.anchors.length >= 1
            ? { layer: penPreviewLayer(interaction.anchors, toolColor, toolStrokeWidth) }
            : undefined,
      selection: selectionLayer ? { layer: selectionLayer } : undefined,
      imageCache,
      liveCanvas: true,
    })
    // Crop preview overlay — drawn AFTER the image render so it sits on top.
    // Lives only on the live canvas; the export canvas (separate renderTo
    // call) never sees it.
    if (interaction.kind === 'crop-drawing' || interaction.kind === 'crop-pending') {
      drawCropOverlay(canvasRef.current, interaction.rect)
    }
    // Gradient preview line — start dot, end dot, dashed line between.
    if (interaction.kind === 'gradient-drawing') {
      drawGradientOverlay(canvasRef.current, interaction.start, interaction.end)
    }
    // Marquee preview rect — same look as the committed selection so the user
    // sees the live shape they're drawing.
    if (interaction.kind === 'marquee-drawing') {
      drawMarqueePreview(canvasRef.current, interaction.rect)
    }
    if (interaction.kind === 'lasso-drawing') {
      drawPolygonPreview(canvasRef.current, interaction.points, false)
    }
    if (interaction.kind === 'polylasso-drawing') {
      // Show committed segments + a "rubber band" line from last vertex to cursor.
      drawPolygonPreview(canvasRef.current, [...interaction.points, interaction.cursor], true)
    }
    if (interaction.kind === 'pen-drawing') {
      drawPenPreview(
        canvasRef.current,
        interaction.anchors,
        interaction.cursor,
        interaction.pressed,
      )
    }
  }, [
    image,
    effectiveState,
    interaction,
    selectionLayer,
    previewScale,
    imageCache,
    toolColor,
    toolStrokeWidth,
  ])

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
          imageCache,
        })
      },
      commitPendingCrop: () => {
        if (interaction.kind !== 'crop-pending' && interaction.kind !== 'crop-drawing') {
          return
        }
        const r = interaction.rect
        // Drag was drawn in canvas-pixel space. Canvas pixels equal preview
        // pixels at scale=previewScale (since canvas.width = effW * scale).
        // Translate from "cropped-canvas" space back to "original-image
        // preview-pixel" space by adding the active crop's origin.
        const baseX = state.cropRect ? Math.min(state.cropRect.x, state.cropRect.x + state.cropRect.w) : 0
        const baseY = state.cropRect ? Math.min(state.cropRect.y, state.cropRect.y + state.cropRect.h) : 0
        const finalRect = {
          x: baseX + Math.min(r.x, r.x + r.w),
          y: baseY + Math.min(r.y, r.y + r.h),
          w: Math.abs(r.w),
          h: Math.abs(r.h),
        }
        if (finalRect.w < 4 || finalRect.h < 4) {
          setInteraction({ kind: 'idle' })
          return
        }
        onCommitCrop?.(finalRect)
        setInteraction({ kind: 'idle' })
      },
      cancelPendingCrop: () => {
        if (interaction.kind === 'crop-pending' || interaction.kind === 'crop-drawing') {
          setInteraction({ kind: 'idle' })
        }
      },
      hasPendingCrop: () =>
        interaction.kind === 'crop-pending' || interaction.kind === 'crop-drawing',
      hasPendingPolyLasso: () => interaction.kind === 'polylasso-drawing',
      cancelPendingPolyLasso: () => {
        if (interaction.kind === 'polylasso-drawing') {
          setInteraction({ kind: 'idle' })
        }
      },
      hasPendingPen: () => interaction.kind === 'pen-drawing',
      commitPendingPen: () => {
        if (interaction.kind !== 'pen-drawing') return
        // Inlined to keep this function self-contained (no closed-over
        // helper that the deps array would have to track).
        if (interaction.anchors.length >= 2) {
          onCommitLayer({
            id: crypto.randomUUID(),
            name: 'Path',
            visible: true,
            opacity: 100,
            blend: 'normal',
            kind: 'annotation',
            shape: {
              kind: 'path',
              anchors: interaction.anchors,
              closed: false,
              color: toolColor,
              strokeWidth: toolStrokeWidth,
            },
          } as AnnotationLayer)
        }
        setInteraction({ kind: 'idle' })
      },
      cancelPendingPen: () => {
        if (interaction.kind === 'pen-drawing') {
          setInteraction({ kind: 'idle' })
        }
      },
    }),
    [
      image,
      state,
      previewScale,
      imageCache,
      interaction,
      onCommitCrop,
      onCommitLayer,
      toolColor,
      toolStrokeWidth,
    ],
  )

  // ── Mouse handling ──────────────────────────────────────────────────────

  const eventToCanvasXY = (e: ReactMouseEvent<HTMLCanvasElement>): Point => {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const rect = c.getBoundingClientRect()
    // canvas.width is the bitmap pixel count; rect.width is the visual size
    // (post-CSS-transform). The ratio gives bitmap-px-per-CSS-px. Result is in
    // the canvas's bitmap-pixel coordinate space, which is also the
    // "preview-canvas pixel" space that shape coords are stored in. Do NOT
    // divide by previewScale — that was a regression; previewScale converts
    // SOURCE-image px → preview-canvas px, which is the wrong direction here.
    const sx = c.width / rect.width
    const sy = c.height / rect.height
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    }
  }

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    // Pan mode: yield to Workspace's drag handler.
    if (panMode) return

    // Zoom tool: click zoom-in 2x at point, Alt+click zoom-out 0.5x at point.
    if (tool === 'zoom') {
      const factor = e.altKey ? 0.5 : 2
      onZoomAt?.(e.clientX, e.clientY, factor)
      return
    }

    const p = eventToCanvasXY(e)

    // Eyedropper: read pixel at click and emit color. The canvas bitmap is in
    // preview-pixel space; (p.x, p.y) is already in that space.
    if (tool === 'eyedropper') {
      const hex = readPixelHex(canvasRef.current, p.x, p.y)
      if (hex && onPickColor) onPickColor(hex)
      return
    }

    // Crop: drag to define a region within the current view. Replace any
    // pending crop on a fresh drag.
    if (tool === 'crop') {
      setInteraction({ kind: 'crop-drawing', rect: { x: p.x, y: p.y, w: 0, h: 0 } })
      return
    }

    // Paint Bucket: hand the click off to the parent — flood fill needs to
    // re-render the canvas at source resolution, which only the parent has
    // the inputs for. (p.x, p.y) is in preview-pixel space.
    if (tool === 'bucket') {
      onBucketClick?.(p)
      return
    }

    // Gradient: drag from start to end; commit on mouseup. Both endpoints
    // are tracked in canvas-pixel space (= preview-pixel space).
    if (tool === 'gradient') {
      setInteraction({ kind: 'gradient-drawing', start: p, end: p })
      return
    }

    // Marquee: drag a rectangular selection. Commit on mouseup if non-trivial.
    if (tool === 'marquee') {
      setInteraction({ kind: 'marquee-drawing', rect: { x: p.x, y: p.y, w: 0, h: 0 } })
      return
    }

    // Lasso: drag-to-trace a freeform polygon. mousedown starts; mousemove
    // appends points; mouseup closes + commits.
    if (tool === 'lasso') {
      setInteraction({ kind: 'lasso-drawing', points: [p] })
      return
    }

    // Polygonal Lasso: each click adds a vertex; double-click closes. Esc
    // cancels (handled below in the keydown path).
    if (tool === 'polyLasso') {
      if (interaction.kind === 'polylasso-drawing') {
        // Double-click detection: if click is within ~6 px of the first point
        // AND there are ≥3 vertices, close the polygon.
        const first = interaction.points[0]
        const closeToFirst =
          interaction.points.length >= 3 &&
          Math.abs(p.x - first.x) < 8 &&
          Math.abs(p.y - first.y) < 8
        if (closeToFirst) {
          onCommitPolygonSelection?.(interaction.points)
          setInteraction({ kind: 'idle' })
        } else {
          setInteraction({
            kind: 'polylasso-drawing',
            points: [...interaction.points, p],
            cursor: p,
          })
        }
      } else {
        setInteraction({ kind: 'polylasso-drawing', points: [p], cursor: p })
      }
      return
    }

    // Pen tool — click adds an anchor; click+drag turns it into a smooth
    // anchor (handles set on mousemove). Clicking near the first anchor with
    // ≥2 anchors closes the path. Enter / Esc handled in the parent.
    if (tool === 'pen') {
      if (interaction.kind === 'pen-drawing') {
        const first = interaction.anchors[0]
        const closeToFirst =
          interaction.anchors.length >= 2 &&
          Math.abs(p.x - first.x) < 8 &&
          Math.abs(p.y - first.y) < 8
        if (closeToFirst) {
          commitPenPath(interaction.anchors, true)
          setInteraction({ kind: 'idle' })
          return
        }
        setInteraction({
          kind: 'pen-drawing',
          anchors: [...interaction.anchors, { x: p.x, y: p.y }],
          pressed: true,
          cursor: p,
        })
      } else {
        setInteraction({
          kind: 'pen-drawing',
          anchors: [{ x: p.x, y: p.y }],
          pressed: true,
          cursor: p,
        })
      }
      return
    }

    // Magic Wand: click → flood fill bbox handled by parent.
    if (tool === 'wand') {
      onWandClick?.(p)
      return
    }

    // Note: click → prompt → commit a sticky-note marker. Empty text = no-op.
    if (tool === 'note') {
      const text = window.prompt(t('pages.imageEditor.notePrompt'), '') ?? ''
      if (text.trim()) {
        onCommitLayer({
          id: crypto.randomUUID(),
          name: 'Note',
          visible: true,
          opacity: 100,
          blend: 'normal',
          kind: 'annotation',
          shape: { kind: 'note', x: p.x, y: p.y, text, color: '#fde047' },
        } as AnnotationLayer)
      }
      return
    }

    // Path Selection (arrowPath) is the vector counterpart of Move — until Pen
    // exists end-to-end, treat it identically to the no-tool selection arrow.
    // Drawing tools take priority over selection.
    if (tool !== 'none' && tool !== 'arrowPath') {
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

    if (interaction.kind === 'crop-drawing') {
      const r = interaction.rect
      setInteraction({
        kind: 'crop-drawing',
        rect: { x: r.x, y: r.y, w: p.x - r.x, h: p.y - r.y },
      })
      return
    }

    if (interaction.kind === 'gradient-drawing') {
      setInteraction({ kind: 'gradient-drawing', start: interaction.start, end: p })
      return
    }

    if (interaction.kind === 'marquee-drawing') {
      const r = interaction.rect
      setInteraction({
        kind: 'marquee-drawing',
        rect: { x: r.x, y: r.y, w: p.x - r.x, h: p.y - r.y },
      })
      return
    }

    if (interaction.kind === 'lasso-drawing') {
      // Subsample: only append if at least 2 px from the last point, so the
      // path doesn't bloat at slow drags.
      const last = interaction.points[interaction.points.length - 1]
      if (Math.abs(p.x - last.x) >= 2 || Math.abs(p.y - last.y) >= 2) {
        setInteraction({ kind: 'lasso-drawing', points: [...interaction.points, p] })
      }
      return
    }

    if (interaction.kind === 'polylasso-drawing') {
      // Just update cursor — no point committed until next click.
      setInteraction({ ...interaction, cursor: p })
      return
    }

    if (interaction.kind === 'pen-drawing') {
      // While the mouse is held after a click, dragging sets the last
      // anchor's symmetric handles based on the drag delta from the anchor.
      // Without a press, just track cursor for rubber-band preview.
      if (interaction.pressed && interaction.anchors.length >= 1) {
        const idx = interaction.anchors.length - 1
        const a = interaction.anchors[idx]
        const dx = p.x - a.x
        const dy = p.y - a.y
        if (Math.abs(dx) >= 3 || Math.abs(dy) >= 3) {
          const next = [...interaction.anchors]
          next[idx] = { ...a, hout: { x: dx, y: dy }, hin: { x: -dx, y: -dy } }
          setInteraction({ ...interaction, anchors: next, cursor: p })
          return
        }
      }
      setInteraction({ ...interaction, cursor: p })
      return
    }

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
    if (interaction.kind === 'crop-drawing') {
      const r = interaction.rect
      if (Math.abs(r.w) < 4 || Math.abs(r.h) < 4) {
        setInteraction({ kind: 'idle' })
      } else {
        setInteraction({ kind: 'crop-pending', rect: r })
      }
      return
    }
    if (interaction.kind === 'gradient-drawing') {
      const dx = interaction.end.x - interaction.start.x
      const dy = interaction.end.y - interaction.start.y
      // Discard near-zero drags (treat as no-op click).
      if (Math.abs(dx) >= 4 || Math.abs(dy) >= 4) {
        onCommitGradient?.(interaction.start, interaction.end)
      }
      setInteraction({ kind: 'idle' })
      return
    }
    if (interaction.kind === 'marquee-drawing') {
      const r = interaction.rect
      if (Math.abs(r.w) >= 4 && Math.abs(r.h) >= 4) {
        onCommitSelection?.(r)
      }
      setInteraction({ kind: 'idle' })
      return
    }
    if (interaction.kind === 'lasso-drawing') {
      // Need ≥3 distinct points to make a polygon. Otherwise drop.
      if (interaction.points.length >= 3) {
        onCommitPolygonSelection?.(interaction.points)
      }
      setInteraction({ kind: 'idle' })
      return
    }
    // PolyLasso intentionally does NOT commit on mouseup — clicks add
    // vertices, double-click (handled in mousedown) closes.
    if (interaction.kind === 'pen-drawing') {
      // Just release the press — anchors stay; next mousedown adds another.
      setInteraction({ ...interaction, pressed: false })
      return
    }
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

  function commitPenPath(anchors: PathAnchor[], closed: boolean) {
    if (anchors.length < 2) return
    onCommitLayer({
      id: crypto.randomUUID(),
      name: closed ? 'Closed Path' : 'Path',
      visible: true,
      opacity: 100,
      blend: 'normal',
      kind: 'annotation',
      shape: {
        kind: 'path',
        anchors,
        closed,
        color: toolColor,
        strokeWidth: toolStrokeWidth,
      },
    } as AnnotationLayer)
  }

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
    } else if (tool === 'ellipse') {
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer('Ellipse'),
          kind: 'annotation',
          shape: { kind: 'ellipse', x: p.x, y: p.y, w: 0, h: 0, color: toolColor, strokeWidth: toolStrokeWidth },
        } as AnnotationLayer,
      })
    } else if (tool === 'line') {
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer('Line'),
          kind: 'annotation',
          shape: { kind: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: toolColor, strokeWidth: toolStrokeWidth },
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
    } else if (tool === 'blur') {
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer('Blur'),
          kind: 'annotation',
          shape: { kind: 'blur', x: p.x, y: p.y, w: 0, h: 0, radius: 8 },
        } as AnnotationLayer,
      })
    } else if (tool === 'frame') {
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer('Frame'),
          kind: 'annotation',
          shape: { kind: 'frame', x: p.x, y: p.y, w: 0, h: 0 },
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
    } else if (tool === 'dodge' || tool === 'burn') {
      // Dodge / Burn share the brush-stroke + low-opacity build-up pattern.
      // Burn paints black with 'multiply' op for darkening; dodge paints
      // white with 'lighter' for brightening.
      const isBurn = tool === 'burn'
      setInteraction({
        kind: 'drawing',
        layer: {
          ...baseLayer(isBurn ? 'Burn' : 'Dodge'),
          opacity: 30 as const,
          kind: 'annotation',
          shape: {
            kind: 'brush',
            points: [p],
            color: isBurn ? '#000000' : '#ffffff',
            strokeWidth: toolStrokeWidth,
            mode: isBurn ? 'burn' : 'dodge',
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
      if (
        s.kind === 'rect' ||
        s.kind === 'mosaic' ||
        s.kind === 'ellipse' ||
        s.kind === 'blur' ||
        s.kind === 'frame'
      ) {
        setInteraction({
          kind: 'drawing',
          layer: { ...drawing, shape: { ...s, w: p.x - s.x, h: p.y - s.y } } as AnnotationLayer,
        })
      } else if (s.kind === 'arrow' || s.kind === 'line') {
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
    if (panMode) {
      // Workspace owns the cursor in pan mode (grab/grabbing).
      setHoverCursor('inherit')
      return
    }
    if (tool === 'zoom') {
      // PS shows a magnifier with + / - depending on Alt — we approximate with
      // standard CSS cursors for portability.
      setHoverCursor(e.altKey ? 'zoom-out' : 'zoom-in')
      return
    }
    if (tool === 'eyedropper') {
      setHoverCursor('crosshair')
      return
    }
    if (tool === 'crop') {
      setHoverCursor('crosshair')
      return
    }
    if (
      tool === 'bucket' ||
      tool === 'gradient' ||
      tool === 'marquee' ||
      tool === 'lasso' ||
      tool === 'polyLasso' ||
      tool === 'wand' ||
      tool === 'note' ||
      tool === 'frame' ||
      tool === 'pen'
    ) {
      setHoverCursor('crosshair')
      return
    }
    // Path Selection (arrowPath) shares the move/select cursor logic with
    // 'none' — same hit-testing and resize-handle hover beneath.
    if (tool !== 'none' && tool !== 'arrowPath') {
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
    if (
      s.kind === 'rect' ||
      s.kind === 'mosaic' ||
      s.kind === 'ellipse' ||
      s.kind === 'blur' ||
      s.kind === 'frame'
    ) {
      return Math.abs(s.w) < 4 && Math.abs(s.h) < 4
    }
    if (s.kind === 'arrow' || s.kind === 'line') {
      return Math.abs(s.x2 - s.x1) < 4 && Math.abs(s.y2 - s.y1) < 4
    }
    if (s.kind === 'brush') {
      return s.points.length < 2
    }
  }
  return false
}

/**
 * Draw a crop preview overlay onto the live canvas. Dim the area outside the
 * crop rect (4 surrounding rectangles) and stroke a dashed bright outline
 * around it. Coords are in canvas-pixel space (= preview-pixel space at
 * preview scale).
 */
function drawCropOverlay(
  canvas: HTMLCanvasElement | null,
  rect: { x: number; y: number; w: number; h: number },
) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rx = Math.min(rect.x, rect.x + rect.w)
  const ry = Math.min(rect.y, rect.y + rect.h)
  const rw = Math.abs(rect.w)
  const rh = Math.abs(rect.h)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  // Top
  ctx.fillRect(0, 0, canvas.width, ry)
  // Bottom
  ctx.fillRect(0, ry + rh, canvas.width, canvas.height - (ry + rh))
  // Left
  ctx.fillRect(0, ry, rx, rh)
  // Right
  ctx.fillRect(rx + rw, ry, canvas.width - (rx + rw), rh)
  // Outline
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 4])
  ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1)
  ctx.setLineDash([])
  ctx.restore()
}

/**
 * Draw a gradient preview overlay — start point, end point, dashed line. All
 * coords are in canvas-pixel space; identity transform ensures pixel-perfect
 * placement.
 */
function drawGradientOverlay(
  canvas: HTMLCanvasElement | null,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  ctx.setLineDash([])
  // Endpoint dots — outlined for legibility on any background.
  for (const p of [start, end]) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * In-progress lasso/polyLasso preview — open polyline (or open with rubber-
 * band cursor segment for polyLasso). Same white-dashes-over-black look as
 * the committed marching-ants. `rubberBand=true` draws the last segment in
 * a slightly different style to hint that it's not yet committed.
 */
function drawPolygonPreview(
  canvas: HTMLCanvasElement | null,
  points: Point[],
  rubberBand: boolean,
) {
  if (!canvas || points.length < 2) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const trace = (n: number) => {
    ctx.beginPath()
    ctx.moveTo(points[0].x + 0.5, points[0].y + 0.5)
    for (let i = 1; i < n; i++) ctx.lineTo(points[i].x + 0.5, points[i].y + 0.5)
  }
  // Black halo for committed segments (all but last when rubber-banding).
  const committedCount = rubberBand ? points.length - 1 : points.length
  if (committedCount >= 2) {
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1
    ctx.setLineDash([])
    trace(committedCount)
    ctx.stroke()
    ctx.strokeStyle = '#ffffff'
    ctx.setLineDash([4, 3])
    trace(committedCount)
    ctx.stroke()
  }
  // Rubber-band segment: dashed grey, less prominent.
  if (rubberBand && committedCount >= 1) {
    const a = points[committedCount - 1]
    const b = points[committedCount]
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(a.x + 0.5, a.y + 0.5)
    ctx.lineTo(b.x + 0.5, b.y + 0.5)
    ctx.stroke()
  }
  ctx.setLineDash([])
  // Vertex dots — useful for polyLasso to see where you've clicked.
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
    ctx.fillStyle = i === 0 ? '#ffaa00' : '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Build a temporary AnnotationLayer wrapping an in-progress pen path, so the
 * standard render pipeline draws the curves (with crop translation, opacity,
 * etc.) — Canvas overlays anchor markers + the rubber-band cursor segment on
 * top via `drawPenPreview`.
 */
function penPreviewLayer(
  anchors: PathAnchor[],
  color: string,
  strokeWidth: number,
): AnnotationLayer {
  return {
    id: '__pen_preview__',
    name: 'Pen Preview',
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'annotation',
    shape: { kind: 'path', anchors, closed: false, color, strokeWidth },
  }
}

/**
 * In-progress pen overlay — anchor squares (orange first, white rest), handle
 * lines + dots for smooth anchors, and a dashed rubber-band line previewing
 * the next segment from the last anchor to the cursor.
 */
function drawPenPreview(
  canvas: HTMLCanvasElement | null,
  anchors: PathAnchor[],
  cursor: Point,
  pressed: boolean,
) {
  if (!canvas || anchors.length === 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // Rubber-band: show the next pending segment from last anchor to cursor.
  // Skipped while pressed (the user is dragging handles, not aiming the next).
  if (!pressed) {
    const last = anchors[anchors.length - 1]
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(last.x + 0.5, last.y + 0.5)
    if (last.hout) {
      ctx.quadraticCurveTo(
        last.x + last.hout.x + 0.5,
        last.y + last.hout.y + 0.5,
        cursor.x + 0.5,
        cursor.y + 0.5,
      )
    } else {
      ctx.lineTo(cursor.x + 0.5, cursor.y + 0.5)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Handles: lines from anchor to control points, with small dots at endpoints.
  for (const a of anchors) {
    if (a.hin) drawHandle(ctx, a.x, a.y, a.x + a.hin.x, a.y + a.hin.y)
    if (a.hout) drawHandle(ctx, a.x, a.y, a.x + a.hout.x, a.y + a.hout.y)
  }

  // Anchor squares — orange for the first (close-target hint), white otherwise.
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]
    const size = 6
    ctx.fillStyle = i === 0 ? '#ffaa00' : '#ffffff'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.fillRect(a.x - size / 2, a.y - size / 2, size, size)
    ctx.strokeRect(a.x - size / 2, a.y - size / 2, size, size)
  }

  ctx.restore()
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  cx: number,
  cy: number,
) {
  // Tether line
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)'
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(ax + 0.5, ay + 0.5)
  ctx.lineTo(cx + 0.5, cy + 0.5)
  ctx.stroke()
  // Control-point dot
  ctx.fillStyle = '#60a5fa'
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.stroke()
}

/**
 * In-progress marquee selection preview — same look as the committed selection
 * (white dashes over a black halo). Coords in canvas-pixel space; identity
 * transform keeps placement crisp.
 */
function drawMarqueePreview(
  canvas: HTMLCanvasElement | null,
  rect: { x: number; y: number; w: number; h: number },
) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rx = Math.min(rect.x, rect.x + rect.w)
  const ry = Math.min(rect.y, rect.y + rect.h)
  const rw = Math.abs(rect.w)
  const rh = Math.abs(rect.h)
  if (rw < 1 || rh < 1) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1
  ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1)
  ctx.strokeStyle = '#ffffff'
  ctx.setLineDash([4, 3])
  ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1)
  ctx.setLineDash([])
  ctx.restore()
}

/**
 * Read a single pixel from the canvas at the given bitmap coords and return
 * its colour as #rrggbb. Out-of-bounds clicks return null.
 */
function readPixelHex(
  canvas: HTMLCanvasElement | null,
  x: number,
  y: number,
): string | null {
  if (!canvas) return null
  const ix = Math.max(0, Math.min(canvas.width - 1, Math.round(x)))
  const iy = Math.max(0, Math.min(canvas.height - 1, Math.round(y)))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  try {
    const data = ctx.getImageData(ix, iy, 1, 1).data
    return (
      '#' +
      [data[0], data[1], data[2]]
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('')
    )
  } catch {
    return null
  }
}
