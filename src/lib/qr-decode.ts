import jsQR from 'jsqr'

/**
 * QR decoding — pure client-side. The raw pixel decode runs on an `ImageData`
 * buffer (no network, no canvas dependency), so it's unit-testable in Node.
 * The File/Blob entry point uses an offscreen canvas to rasterise the image,
 * which only exists in the browser.
 */

export type QrDecodeResult = {
  /** The decoded text payload. */
  text: string
}

/**
 * Decode a QR code from raw RGBA pixels. Returns `null` when no QR is found.
 * Thin wrapper over jsQR so callers don't depend on its option shape.
 */
export function decodeQrFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): QrDecodeResult | null {
  const found = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
  if (!found || !found.data) return null
  return { text: found.data }
}

/**
 * Rasterise a Blob/File image and decode any QR in it. Downscales very large
 * images to keep the decode fast (QR detection doesn't need full resolution).
 * Browser-only — depends on `createImageBitmap` + canvas.
 */
export async function decodeQrFromBlob(blob: Blob): Promise<QrDecodeResult | null> {
  const bitmap = await createImageBitmap(blob)
  try {
    const MAX = 1600
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(bitmap, 0, 0, w, h)
    const img = ctx.getImageData(0, 0, w, h)
    return decodeQrFromImageData(img.data, w, h)
  } finally {
    bitmap.close()
  }
}
