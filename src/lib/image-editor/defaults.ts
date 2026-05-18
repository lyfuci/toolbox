import type { Adjustments, BrushOptions, EditorState, TextOptions, Transforms } from './types'

export const DEFAULT_TRANSFORMS: Transforms = {
  rotation: 0,
  flipH: false,
  flipV: false,
}

export const DEFAULT_ADJUST: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  blur: 0,
  hue: 0,
  sepia: 0,
  invert: 0,
}

export const initialState = (): EditorState => ({
  imageLayer: {
    id: 'image',
    kind: 'image',
    name: 'Image',
    visible: true,
    opacity: 100,
    blend: 'normal',
  },
  layers: [],
  transforms: { ...DEFAULT_TRANSFORMS },
  adjust: { ...DEFAULT_ADJUST },
  smartSources: {},
})

// Live-preview canvas dimension cap, for snappy filter slider editing.
// Export render uses scale=1 and ignores this.
export const PREVIEW_MAX = 900

// Defaults match the legacy polyline path: hardness=1 + flow=1 means the
// renderer uses the fast/identical-to-old code path. Spacing is pre-set to
// 0.25 (a sensible value if the user touches hardness/flow), so they don't
// need to go hunting for it.
export const DEFAULT_BRUSH_OPTIONS: BrushOptions = {
  hardness: 1,
  spacing: 0.25,
  flow: 1,
  opacity: 1,
}

export const DEFAULT_TEXT_OPTIONS: TextOptions = {
  fontSize: 24,
  fontFamily: 'sans-serif',
  fontWeight: 'normal',
  fontStyle: 'normal',
  align: 'left',
  letterSpacing: 0,
  lineHeight: 1.2,
  underline: false,
}

export const PROJECT_VERSION = 1
export const PROJECT_TAG = 'toolbox-image-editor' as const
