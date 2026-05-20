import { useCallback } from 'react'
import { toast } from 'sonner'
import type { TFunction } from 'i18next'
import {
  saveCustomBrushPresets,
  type BrushPreset,
} from '../brush-presets'
import { fileToDataUrl } from '../image-cache'
import type { BrushOptions } from '../types'

type Args = {
  customBrushPresets: BrushPreset[]
  setCustomBrushPresets: (next: BrushPreset[]) => void
  setStrokeWidth: (n: number) => void
  setBrushOptions: (o: BrushOptions) => void
  ensureImage: (src: string) => Promise<HTMLImageElement>
  t: TFunction
}

const TIP_SIZE = 128

/**
 * Import a brush tip from a user-supplied image file (PNG / JPG / etc.).
 *
 * Resizes to a 128 px tip on a transparent square, derives the tip mask
 * from the image's alpha (PNG) or luminance (no-alpha sources), persists
 * the result as a new custom brush preset, and flips the editor's active
 * brush so the user can paint with it immediately.
 *
 * The alpha-vs-luminance discriminator probes the four corner pixels; if
 * all four are fully opaque we treat the source as a JPG-style "ink on
 * paper" stamp and invert luminance into alpha. PNGs with fully-opaque
 * corners and meaningful interior alpha will misclassify here — known
 * limitation, easy to dodge by exporting with a 1-px transparent border.
 */
export function useBrushTipImport({
  customBrushPresets,
  setCustomBrushPresets,
  setStrokeWidth,
  setBrushOptions,
  ensureImage,
  t,
}: Args) {
  return useCallback(
    async (file: File) => {
      try {
        const dataUrl = await fileToDataUrl(file)
        const img = await ensureImage(dataUrl)
        const c = document.createElement('canvas')
        c.width = TIP_SIZE
        c.height = TIP_SIZE
        const ctx = c.getContext('2d')
        if (!ctx) return
        const srcW = img.naturalWidth
        const srcH = img.naturalHeight
        const fit = Math.max(srcW, srcH, 1)
        const dw = (srcW * TIP_SIZE) / fit
        const dh = (srcH * TIP_SIZE) / fit
        ctx.drawImage(img, (TIP_SIZE - dw) / 2, (TIP_SIZE - dh) / 2, dw, dh)
        try {
          const probe = ctx.getImageData(0, 0, TIP_SIZE, TIP_SIZE)
          const a0 = probe.data[3]
          const a1 = probe.data[(TIP_SIZE - 1) * 4 + 3]
          const a2 = probe.data[((TIP_SIZE - 1) * TIP_SIZE) * 4 + 3]
          const a3 = probe.data[((TIP_SIZE * TIP_SIZE) - 1) * 4 + 3]
          const needsLumKey = a0 === 255 && a1 === 255 && a2 === 255 && a3 === 255
          if (needsLumKey) {
            for (let i = 0; i < probe.data.length; i += 4) {
              const r = probe.data[i]
              const g = probe.data[i + 1]
              const b = probe.data[i + 2]
              const lum = (r * 299 + g * 587 + b * 114) / 1000
              probe.data[i + 3] = 255 - lum
              probe.data[i] = 255
              probe.data[i + 1] = 255
              probe.data[i + 2] = 255
            }
            ctx.putImageData(probe, 0, 0)
          }
        } catch {
          // CORS-tainted (shouldn't happen for local file picks) — keep as-is.
        }
        const tipUrl = c.toDataURL('image/png')
        await ensureImage(tipUrl).catch(() => {})
        const name = (file.name || t('pages.imageEditor.brushes.defaultName', {
          n: customBrushPresets.length + 1,
        })).replace(/\.[^/.]+$/, '')
        const preset: BrushPreset = {
          id: crypto.randomUUID(),
          name,
          strokeWidth: 60,
          options: {
            hardness: 1,
            spacing: 0.15,
            flow: 1,
            opacity: 1,
            tipDataUrl: tipUrl,
          },
          thumbnailDataUrl: tipUrl,
        }
        const next = [...customBrushPresets, preset]
        setCustomBrushPresets(next)
        saveCustomBrushPresets(next)
        setStrokeWidth(60)
        setBrushOptions(preset.options)
        toast.success(t('pages.imageEditor.brushes.importTipDone', { name }))
      } catch {
        toast.error(t('pages.imageEditor.errLoadFailed'))
      }
    },
    [customBrushPresets, setCustomBrushPresets, setStrokeWidth, setBrushOptions, ensureImage, t],
  )
}
