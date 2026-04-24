import { useCallback, useState } from 'react'
import type { ImageCache } from './drawing'

/**
 * Loads HTMLImageElements from data URLs and caches them by URL. Returns the
 * cache (passed into the render pipeline) and a helper to add new images.
 *
 * The cache is held as React state — a new Map reference is published on every
 * load so consumers re-render once an image becomes drawable. Pending loads
 * dedupe via a module-level inflight set so calling `ensure` twice in quick
 * succession doesn't fire two HTTP requests for the same dataUrl.
 */
export function useImageCache() {
  const [cache, setCache] = useState<ImageCache>(() => new Map())

  const ensure = useCallback((dataUrl: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const existing = inflight.get(dataUrl)
      if (existing) {
        existing.then(resolve, reject)
        return
      }
      const p = loadImage(dataUrl)
      inflight.set(dataUrl, p)
      p.then(
        (img) => {
          setCache((prev) => {
            const next = new Map(prev)
            next.set(dataUrl, img)
            return next
          })
          resolve(img)
        },
        (err) => {
          inflight.delete(dataUrl)
          reject(err)
        },
      )
    })
  }, [])

  return { cache, ensure }
}

const inflight = new Map<string, Promise<HTMLImageElement>>()

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('file read failed'))
    r.readAsDataURL(file)
  })
}
