import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BUILTIN_BRUSH_PRESETS,
  type BrushPreset,
} from '@/lib/image-editor/brush-presets'
import type { BrushOptions } from '@/lib/image-editor/types'

/**
 * Brushes panel — preset library for the Brush / Eraser tools. Click a
 * preset to overwrite the current brushOptions + strokeWidth. Ships
 * built-in presets plus user-saved custom presets (persisted via
 * localStorage; the parent passes them in and handles save/delete).
 */

type Props = {
  current: { strokeWidth: number; options: BrushOptions }
  customPresets: BrushPreset[]
  onPick: (preset: BrushPreset) => void
  onSaveCurrent: (name: string) => void
  onDeleteCustom: (id: string) => void
}

export function BrushesPanel({
  current,
  customPresets,
  onPick,
  onSaveCurrent,
  onDeleteCustom,
}: Props) {
  const { t } = useTranslation()
  const [drafting, setDrafting] = useState(false)
  const [draftName, setDraftName] = useState('')
  const isActive = (p: BrushPreset) =>
    p.strokeWidth === current.strokeWidth &&
    p.options.hardness === current.options.hardness &&
    p.options.spacing === current.options.spacing &&
    p.options.flow === current.options.flow &&
    p.options.opacity === current.options.opacity
  return (
    <div className="pf-panel-body" style={{ padding: 8 }}>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('pages.imageEditor.brushes.builtIn')}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {BUILTIN_BRUSH_PRESETS.map((p) => (
          <li
            key={p.id}
            onClick={() => onPick(p)}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded border p-2 text-[10px] ${
              isActive(p)
                ? 'border-primary bg-accent/40'
                : 'border-border/60 bg-background/40 hover:bg-accent/20'
            }`}
            title={`${p.name} — ${p.strokeWidth}px`}
          >
            <BrushPreview preset={p} />
            <div className="truncate text-center">{p.name}</div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('pages.imageEditor.brushes.custom')}
        </span>
        <button
          onClick={() => {
            setDraftName(t('pages.imageEditor.brushes.defaultName', { n: customPresets.length + 1 }))
            setDrafting(true)
          }}
          className="rounded border border-input bg-background px-2 py-0.5 text-[10px] hover:bg-accent/40"
        >
          + {t('pages.imageEditor.brushes.saveCurrent')}
        </button>
      </div>
      {drafting && (
        <div className="mt-1 flex items-center gap-1">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="h-6 flex-1 rounded border border-input bg-background px-1 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draftName.trim()) {
                onSaveCurrent(draftName.trim())
                setDrafting(false)
              }
              if (e.key === 'Escape') setDrafting(false)
            }}
          />
          <button
            onClick={() => {
              if (draftName.trim()) {
                onSaveCurrent(draftName.trim())
                setDrafting(false)
              }
            }}
            className="rounded border border-input bg-background px-2 py-0.5 text-[10px] hover:bg-accent/40"
          >
            ✓
          </button>
        </div>
      )}
      {customPresets.length === 0 && !drafting && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          {t('pages.imageEditor.brushes.emptyCustom')}
        </div>
      )}
      {customPresets.length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-2">
          {customPresets.map((p) => (
            <li
              key={p.id}
              onClick={() => onPick(p)}
              className={`group relative flex cursor-pointer flex-col items-center gap-1 rounded border p-2 text-[10px] ${
                isActive(p)
                  ? 'border-primary bg-accent/40'
                  : 'border-border/60 bg-background/40 hover:bg-accent/20'
              }`}
              title={`${p.name} — ${p.strokeWidth}px`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteCustom(p.id)
                }}
                className="absolute right-0.5 top-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                title={t('pages.imageEditor.brushes.deleteCustom')}
              >
                ×
              </button>
              <BrushPreview preset={p} />
              <div className="truncate text-center">{p.name}</div>
            </li>
          ))}
        </ul>
      )}
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
