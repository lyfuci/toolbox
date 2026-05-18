import { useTranslation } from 'react-i18next'
import { walkLayers } from '@/lib/image-editor/layer-tree'
import type { AnnotationLayer, EditorState, Layer, PathShape } from '@/lib/image-editor/types'

/**
 * Paths panel — list every annotation layer whose shape is a vector path
 * (PathShape from the Pen tool). Clicking a row selects that layer; the
 * existing selection-chrome / properties flow takes over from there.
 *
 * Each row renders a tiny SVG preview of the path so the user can tell
 * which is which at a glance.
 */
type Props = {
  state: EditorState
  selectedId: string
  onSelect: (id: string) => void
}

type PathLayer = AnnotationLayer & { shape: PathShape }

const isPathLayer = (l: Layer): l is PathLayer =>
  l.kind === 'annotation' && l.shape.kind === 'path'

export function PathsPanel({ state, selectedId, onSelect }: Props) {
  const { t } = useTranslation()
  const pathLayers: PathLayer[] = []
  for (const layer of walkLayers(state.layers)) {
    if (isPathLayer(layer)) pathLayers.push(layer)
  }
  if (pathLayers.length === 0) {
    return (
      <div className="pf-panel-body" style={{ padding: 8 }}>
        <div className="text-xs text-muted-foreground">
          {t('pages.imageEditor.paths.empty')}
        </div>
      </div>
    )
  }
  return (
    <div className="pf-panel-body" style={{ padding: 0 }}>
      <ul className="flex flex-col gap-1 p-2">
        {pathLayers.map((l) => (
          <li
            key={l.id}
            onClick={() => onSelect(l.id)}
            className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs ${
              selectedId === l.id
                ? 'border-primary bg-accent/40'
                : 'border-border/60 bg-background/40 hover:bg-accent/20'
            }`}
          >
            <PathThumbnail path={l.shape} />
            <span className="flex-1 truncate">{l.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {l.shape.anchors.length}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 32×24 SVG sketch of the path; bezier handles included. */
function PathThumbnail({ path }: { path: PathShape }) {
  if (path.anchors.length === 0) {
    return <div className="h-6 w-8 rounded border border-input" />
  }
  // Compute the path bbox to fit the thumbnail.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const a of path.anchors) {
    if (a.x < minX) minX = a.x
    if (a.y < minY) minY = a.y
    if (a.x > maxX) maxX = a.x
    if (a.y > maxY) maxY = a.y
  }
  const pw = Math.max(1, maxX - minX)
  const ph = Math.max(1, maxY - minY)
  const pad = 2
  const W = 32
  const H = 24
  const scale = Math.min((W - pad * 2) / pw, (H - pad * 2) / ph)
  const ox = (W - pw * scale) / 2 - minX * scale
  const oy = (H - ph * scale) / 2 - minY * scale
  const tx = (n: number) => n * scale + ox
  const ty = (n: number) => n * scale + oy
  let d = `M ${tx(path.anchors[0].x)} ${ty(path.anchors[0].y)}`
  for (let i = 1; i < path.anchors.length; i++) {
    const prev = path.anchors[i - 1]
    const curr = path.anchors[i]
    if (prev.hout && curr.hin) {
      d += ` C ${tx(prev.x + prev.hout.x)} ${ty(prev.y + prev.hout.y)} ${tx(curr.x + curr.hin.x)} ${ty(curr.y + curr.hin.y)} ${tx(curr.x)} ${ty(curr.y)}`
    } else {
      d += ` L ${tx(curr.x)} ${ty(curr.y)}`
    }
  }
  if (path.closed) d += ' Z'
  return (
    <svg
      width={W}
      height={H}
      className="rounded border border-input bg-muted/30"
    >
      <path d={d} stroke="currentColor" strokeWidth={1} fill="none" />
    </svg>
  )
}
