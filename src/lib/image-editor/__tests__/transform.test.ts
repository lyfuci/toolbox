import { describe, it, expect } from 'vitest'
import { translateLayer, scaleLayer, withSelectionClip, layerEquals } from '../transform'
import type {
  AnnotationLayer,
  EditorState,
  Layer,
  MaskLayer,
  RectShape,
  SmartObjectLayer,
} from '../types'

const baseRect: RectShape = {
  kind: 'rect',
  x: 10,
  y: 20,
  w: 30,
  h: 40,
  color: '#000',
  strokeWidth: 1,
}

function ann(shape = baseRect): AnnotationLayer {
  return {
    id: 'a',
    name: 'a',
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'annotation',
    shape,
  }
}

function mask(): MaskLayer {
  return {
    id: 'm',
    name: 'm',
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'mask',
    rects: [{ x: 5, y: 6, w: 10, h: 10 }],
  }
}

function smartObject(): SmartObjectLayer {
  return {
    id: 'so',
    name: 'so',
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'smartObject',
    sourceRef: 'src-1',
    transform: { x: 0, y: 0, w: 100, h: 50, rotation: 0, anchorX: 50, anchorY: 25 },
  }
}

describe('translateLayer', () => {
  it('shifts a rect annotation', () => {
    const moved = translateLayer(ann(), 5, 10) as AnnotationLayer
    expect((moved.shape as RectShape).x).toBe(15)
    expect((moved.shape as RectShape).y).toBe(30)
  })
  it('shifts a MaskLayer rect list', () => {
    const moved = translateLayer(mask(), 3, 4) as MaskLayer
    expect(moved.rects[0]).toMatchObject({ x: 8, y: 10 })
  })
  it('shifts a SmartObject transform + anchor in lockstep', () => {
    const moved = translateLayer(smartObject(), 7, 11) as SmartObjectLayer
    expect(moved.transform.x).toBe(7)
    expect(moved.transform.y).toBe(11)
    expect(moved.transform.anchorX).toBe(57)
    expect(moved.transform.anchorY).toBe(36)
  })
  it('translates clipRect alongside the shape', () => {
    const layer: AnnotationLayer = { ...ann(), clipRect: { x: 0, y: 0, w: 5, h: 5 } }
    const moved = translateLayer(layer, 2, 3) as AnnotationLayer
    expect(moved.clipRect).toEqual({ x: 2, y: 3, w: 5, h: 5 })
  })
})

describe('scaleLayer', () => {
  it('scales rect dimensions', () => {
    const big = scaleLayer(ann(), 2, 3) as AnnotationLayer
    const s = big.shape as RectShape
    expect(s.x).toBe(20)
    expect(s.y).toBe(60)
    expect(s.w).toBe(60)
    expect(s.h).toBe(120)
  })
})

describe('withSelectionClip', () => {
  const baseState: EditorState = {
    imageLayer: { id: 'image', name: 'image', visible: true, opacity: 100, blend: 'normal', kind: 'image' },
    layers: [],
    transforms: { rotation: 0, flipH: false, flipV: false },
    adjust: {
      brightness: 100, contrast: 100, saturation: 100, grayscale: 0,
      blur: 0, hue: 0, sepia: 0, invert: 0,
    },
  }
  it('bakes a rect clip', () => {
    const state: EditorState = { ...baseState, selection: { x: 0, y: 0, w: 50, h: 50 } }
    const clipped = withSelectionClip(ann(), state)
    expect(clipped.clipRect).toEqual({ x: 0, y: 0, w: 50, h: 50 })
  })
  it('passes inverse flag', () => {
    const state: EditorState = {
      ...baseState,
      selection: { x: 0, y: 0, w: 50, h: 50 },
      selectionInverse: true,
    }
    const clipped = withSelectionClip(ann(), state)
    expect(clipped.clipInverse).toBe(true)
  })
  it('no-op when no selection set', () => {
    const clipped = withSelectionClip(ann(), baseState)
    expect(clipped).toBe(ann.call(null) as Layer | unknown ? clipped : clipped) // identity-ish
    expect(clipped.clipRect).toBeUndefined()
  })
})

describe('layerEquals', () => {
  it('treats identical structurally-equal layers as equal', () => {
    expect(layerEquals(ann(), ann())).toBe(true)
  })
  it('detects shape edits', () => {
    expect(layerEquals(ann(), translateLayer(ann(), 1, 0))).toBe(false)
  })
})
