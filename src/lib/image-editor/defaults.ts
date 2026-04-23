import type { Adjustments, EditorState, Transforms } from './types'

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
})

// Live-preview canvas dimension cap, for snappy filter slider editing.
// Export render uses scale=1 and ignores this.
export const PREVIEW_MAX = 900

export const PROJECT_VERSION = 1
export const PROJECT_TAG = 'toolbox-image-editor' as const
