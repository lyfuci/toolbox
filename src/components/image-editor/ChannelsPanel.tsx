import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { renderEditorToCanvas } from '@/lib/image-editor/composite-ops'
import type { ImageCache } from '@/lib/image-editor/drawing'
import type { EditorState } from '@/lib/image-editor/types'

/**
 * Read-only Channels panel. Renders 4 small thumbnails — R, G, B, and
 * alpha — extracted from the editor's current composite. Per-channel
 * editing is a v2 feature (would need a mask routed through the render
 * pipeline); this v1 panel shows what's there.
 */
type Props = {
  image: HTMLImageElement | null
  state: EditorState
  imageCache: ImageCache | undefined
}

const PREVIEW_EDGE = 96
const CHANNELS = ['R', 'G', 'B', 'A'] as const

export function ChannelsPanel({ image, state, imageCache }: Props) {
  const { t } = useTranslation()
  // Single ref to the container holds all four canvases via id-based
  // querySelector — keeps the linter happy (no ref-per-channel destructure).
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!image || !containerRef.current) return
    const src = renderEditorToCanvas(image, state, imageCache, {
      includeImageBackground: true,
    })
    const ratio = Math.min(PREVIEW_EDGE / src.width, PREVIEW_EDGE / src.height, 1)
    const w = Math.max(1, Math.round(src.width * ratio))
    const h = Math.max(1, Math.round(src.height * ratio))
    const scaled = document.createElement('canvas')
    scaled.width = w
    scaled.height = h
    const sctx = scaled.getContext('2d')
    if (!sctx) return
    sctx.drawImage(src, 0, 0, w, h)
    let data: ImageData | null = null
    try {
      data = sctx.getImageData(0, 0, w, h)
    } catch {
      return // CORS-tainted
    }
    if (!data) return
    for (const ch of CHANNELS) {
      const canvas = containerRef.current.querySelector<HTMLCanvasElement>(
        `canvas[data-channel="${ch}"]`,
      )
      if (!canvas) continue
      canvas.width = w
      canvas.height = h
      const cctx = canvas.getContext('2d')
      if (!cctx) continue
      const out = cctx.createImageData(w, h)
      const offset = ch === 'R' ? 0 : ch === 'G' ? 1 : ch === 'B' ? 2 : 3
      for (let i = 0; i < data.data.length; i += 4) {
        const v = data.data[i + offset]
        out.data[i] = v
        out.data[i + 1] = v
        out.data[i + 2] = v
        out.data[i + 3] = 255
      }
      cctx.putImageData(out, 0, 0)
    }
  }, [image, state, imageCache])

  if (!image) {
    return (
      <div className="pf-panel-body" style={{ padding: 8 }}>
        <div className="text-xs text-muted-foreground">
          {t('pages.imageEditor.channels.noImage')}
        </div>
      </div>
    )
  }

  return (
    <div className="pf-panel-body" style={{ padding: 8 }} ref={containerRef}>
      <div className="space-y-2">
        {CHANNELS.map((ch) => (
          <div key={ch} className="flex items-center gap-2">
            <canvas
              data-channel={ch}
              className="rounded border border-input"
              style={{ background: '#000', maxWidth: PREVIEW_EDGE, maxHeight: PREVIEW_EDGE }}
            />
            <span className="text-xs font-medium">
              {t(`pages.imageEditor.channels.${ch}`)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10px] italic text-muted-foreground">
        {t('pages.imageEditor.channels.readOnlyHint')}
      </div>
    </div>
  )
}
