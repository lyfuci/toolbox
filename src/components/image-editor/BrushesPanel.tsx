import { useTranslation } from 'react-i18next'
import { BUILTIN_BRUSH_PRESETS, type BrushPreset } from '@/lib/image-editor/brush-presets'
import type { BrushOptions } from '@/lib/image-editor/types'

/**
 * Brushes panel — preset library for the Brush / Eraser tools. Click a
 * preset to overwrite the current brushOptions + strokeWidth. v1 ships a
 * handful of built-in presets covering the common "hard round / soft
 * round / texture" trio plus a couple of stylised options.
 */

type Props = {
  current: { strokeWidth: number; options: BrushOptions }
  onPick: (preset: BrushPreset) => void
}

export function BrushesPanel({ current, onPick }: Props) {
  const { t } = useTranslation()
  return (
    <div className="pf-panel-body" style={{ padding: 8 }}>
      <ul className="grid grid-cols-3 gap-2">
        {BUILTIN_BRUSH_PRESETS.map((p) => {
          const active =
            p.strokeWidth === current.strokeWidth &&
            p.options.hardness === current.options.hardness &&
            p.options.spacing === current.options.spacing &&
            p.options.flow === current.options.flow &&
            p.options.opacity === current.options.opacity
          return (
            <li
              key={p.id}
              onClick={() => onPick(p)}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded border p-2 text-[10px] ${
                active
                  ? 'border-primary bg-accent/40'
                  : 'border-border/60 bg-background/40 hover:bg-accent/20'
              }`}
              title={`${p.name} — ${p.strokeWidth}px`}
            >
              <BrushPreview preset={p} />
              <div className="truncate text-center">{p.name}</div>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 text-[10px] italic text-muted-foreground">
        {t('pages.imageEditor.brushes.customHint')}
      </div>
    </div>
  )
}

/** Render a tiny preview of the brush tip — a single circular stamp
 *  approximating the hardness falloff via a radial gradient. */
function BrushPreview({ preset }: { preset: BrushPreset }) {
  const size = 32
  const r = Math.min(size / 2 - 2, Math.max(4, preset.strokeWidth / 2))
  // SVG radial gradient: solid centre out to soft fringe based on hardness.
  const stops = [
    { offset: 0, opacity: preset.options.opacity },
    { offset: preset.options.hardness, opacity: preset.options.opacity },
    { offset: 1, opacity: 0 },
  ]
  return (
    <svg width={size} height={size}>
      <defs>
        <radialGradient id={`bp-${preset.id}`} cx="50%" cy="50%" r="50%">
          {stops.map((s, i) => (
            <stop key={i} offset={`${s.offset * 100}%`} stopColor="currentColor" stopOpacity={s.opacity} />
          ))}
        </radialGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill={`url(#bp-${preset.id})`} />
    </svg>
  )
}
