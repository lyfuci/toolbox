import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import { decodeQrFromImageData } from '@/lib/qr-decode'

/**
 * Round-trip test with no browser: render a QR to a bit matrix via the same
 * `qrcode` lib the generator uses, rasterise it into an RGBA buffer (scaled up
 * with a quiet zone so jsQR can lock on), then decode it back.
 */
function renderQrToImageData(
  text: string,
  scale = 10,
  quietModules = 4,
): { data: Uint8ClampedArray; width: number; height: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const bits = qr.modules.data // 1 = dark module
  const dim = (size + quietModules * 2) * scale
  const data = new Uint8ClampedArray(dim * dim * 4)
  // Start all-white.
  data.fill(255)
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      if (!bits[my * size + mx]) continue // light module → leave white
      const x0 = (mx + quietModules) * scale
      const y0 = (my + quietModules) * scale
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const idx = ((y0 + py) * dim + (x0 + px)) * 4
          data[idx] = 0
          data[idx + 1] = 0
          data[idx + 2] = 0
          data[idx + 3] = 255
        }
      }
    }
  }
  return { data, width: dim, height: dim }
}

describe('decodeQrFromImageData', () => {
  it('round-trips a URL payload', () => {
    const url = 'https://toolbox.seansun.net'
    const { data, width, height } = renderQrToImageData(url)
    const result = decodeQrFromImageData(data, width, height)
    expect(result?.text).toBe(url)
  })

  it('round-trips arbitrary text', () => {
    const text = 'Hello, 世界 — QR 解码测试 123'
    const { data, width, height } = renderQrToImageData(text)
    const result = decodeQrFromImageData(data, width, height)
    expect(result?.text).toBe(text)
  })

  it('returns null for a blank (all-white) image', () => {
    const dim = 200
    const data = new Uint8ClampedArray(dim * dim * 4)
    data.fill(255)
    expect(decodeQrFromImageData(data, dim, dim)).toBeNull()
  })
})
