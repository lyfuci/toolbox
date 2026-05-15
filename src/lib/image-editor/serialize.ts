import { initialState, PROJECT_TAG, PROJECT_VERSION } from './defaults'
import type { EditorState, Layer, Project } from './types'

export function serializeProject(args: {
  image: HTMLImageElement
  filename: string
  state: EditorState
}): Blob {
  const { image, filename, state } = args
  // Re-encode the image to PNG so the project is self-contained.
  const c = document.createElement('canvas')
  c.width = image.naturalWidth
  c.height = image.naturalHeight
  c.getContext('2d')?.drawImage(image, 0, 0)
  const dataUrl = c.toDataURL('image/png')
  const project: Project = {
    version: PROJECT_VERSION,
    tool: PROJECT_TAG,
    source: { name: `${filename}.png`, dataUrl },
    state,
  }
  return new Blob([JSON.stringify(project)], { type: 'application/json' })
}

export function parseProject(text: string): Project {
  const obj = JSON.parse(text) as Partial<Project>
  if (
    obj.tool !== PROJECT_TAG ||
    typeof obj.version !== 'number' ||
    !obj.source ||
    typeof obj.source.dataUrl !== 'string' ||
    !obj.state
  ) {
    throw new Error('invalid project file')
  }
  // Forwards-compat: fill in any missing fields with defaults so an older
  // project can be opened with newer code.
  const fallback = initialState()
  return {
    version: obj.version,
    tool: PROJECT_TAG,
    source: { name: obj.source.name ?? 'image.png', dataUrl: obj.source.dataUrl },
    state: {
      imageLayer: { ...fallback.imageLayer, ...obj.state.imageLayer },
      layers: normalizeLayerTree(
        Array.isArray(obj.state.layers) ? obj.state.layers : [],
      ),
      transforms: { ...fallback.transforms, ...obj.state.transforms },
      adjust: { ...fallback.adjust, ...obj.state.adjust },
      cropRect: obj.state.cropRect,
      selection: obj.state.selection,
      selectionPath: obj.state.selectionPath,
    },
  }
}

/**
 * Walk a parsed-from-JSON layer array and fill defaults for any GroupLayer
 * that's missing fields the renderer expects. Pre-group projects have no
 * groups so this is a no-op for them; this is here so future schema additions
 * inside `GroupLayer` can be defaulted without bumping `PROJECT_VERSION`.
 */
function normalizeLayerTree(layers: unknown[]): Layer[] {
  return layers.map((raw) => {
    const l = raw as Layer & { children?: unknown; expanded?: unknown }
    if (l.kind === 'group') {
      const children = Array.isArray(l.children)
        ? normalizeLayerTree(l.children as unknown[])
        : []
      const expanded = typeof l.expanded === 'boolean' ? l.expanded : true
      return { ...l, children, expanded }
    }
    return l
  })
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}
