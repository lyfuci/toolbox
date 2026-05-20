import { describe, it, expect } from 'vitest'
import { normalizeRect, pointInBBox, pickLayer, pickHandle, getHandles } from '../hit'
import type { AnnotationLayer, Layer, RectShape } from '../types'

function rectLayer(id: string, x: number, y: number, w: number, h: number): AnnotationLayer {
  const shape: RectShape = { kind: 'rect', x, y, w, h, color: '#000', strokeWidth: 1 }
  return {
    id,
    name: id,
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'annotation',
    shape,
  }
}

describe('normalizeRect', () => {
  it('flips negative width', () => {
    expect(normalizeRect({ x: 10, y: 10, w: -5, h: 6 })).toEqual({ x: 5, y: 10, w: 5, h: 6 })
  })
  it('flips negative height', () => {
    expect(normalizeRect({ x: 10, y: 10, w: 5, h: -6 })).toEqual({ x: 10, y: 4, w: 5, h: 6 })
  })
})

describe('pointInBBox', () => {
  it('inside hits true', () => {
    expect(pointInBBox({ x: 5, y: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(true)
  })
  it('outside hits false', () => {
    expect(pointInBBox({ x: 11, y: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(false)
  })
})

describe('pickLayer', () => {
  it('returns topmost layer under point', () => {
    const layers: Layer[] = [
      rectLayer('lower', 0, 0, 100, 100),
      rectLayer('upper', 20, 20, 50, 50),
    ]
    // (30, 30) hits both — `upper` is on top.
    expect(pickLayer(layers, { x: 30, y: 30 })).toBe('upper')
    // (5, 5) only hits lower.
    expect(pickLayer(layers, { x: 5, y: 5 })).toBe('lower')
    // (200, 200) hits nothing.
    expect(pickLayer(layers, { x: 200, y: 200 })).toBeNull()
  })
})

describe('getHandles + pickHandle', () => {
  it('returns 4 corner handles for rect', () => {
    const handles = getHandles(rectLayer('r', 0, 0, 100, 50))
    expect(handles.length).toBeGreaterThanOrEqual(4)
    // Should include the four corners.
    const positions = handles.map((h) => `${h.x},${h.y}`)
    expect(positions).toContain('0,0')
    expect(positions).toContain('100,50')
  })
  it('hits a corner via pickHandle', () => {
    const handles = getHandles(rectLayer('r', 0, 0, 100, 50))
    expect(pickHandle(handles, { x: 0, y: 0 })).not.toBeNull()
    expect(pickHandle(handles, { x: 200, y: 200 })).toBeNull()
  })
})
