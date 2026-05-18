import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EditorState, LayerComp } from '@/lib/image-editor/types'

/**
 * Layer Comps panel. Captures named snapshots of the layer tree + image
 * layer; clicking a comp restores those fields. Other state (selection /
 * crop / transforms / adjust) is left alone — same as PS, which treats
 * comps as a "layer state restorer" rather than a full state-machine
 * checkpoint.
 *
 * Save: click "New" → prompt for name → snapshot current state.
 * Apply: click a comp's row.
 * Delete: × icon.
 */
type Props = {
  state: EditorState
  onSaveComp: (name: string) => void
  onApplyComp: (comp: LayerComp) => void
  onDeleteComp: (id: string) => void
}

export function LayerCompsPanel({ state, onSaveComp, onApplyComp, onDeleteComp }: Props) {
  const { t } = useTranslation()
  const [drafting, setDrafting] = useState(false)
  const [draftName, setDraftName] = useState('')
  const comps = state.layerComps ?? []
  return (
    <div className="pf-panel-body" style={{ padding: 8 }}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium">
          {t('pages.imageEditor.layerComps.title')}
        </div>
        <button
          onClick={() => {
            setDraftName(
              t('pages.imageEditor.layerComps.defaultName', { n: comps.length + 1 }),
            )
            setDrafting(true)
          }}
          className="rounded border border-input bg-background px-2 py-0.5 text-[11px] hover:bg-accent/40"
        >
          + {t('pages.imageEditor.layerComps.newBtn')}
        </button>
      </div>
      {drafting && (
        <div className="mt-2 flex items-center gap-1">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="h-6 flex-1 rounded border border-input bg-background px-1 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draftName.trim()) {
                onSaveComp(draftName.trim())
                setDrafting(false)
              }
              if (e.key === 'Escape') setDrafting(false)
            }}
          />
          <button
            onClick={() => {
              if (draftName.trim()) {
                onSaveComp(draftName.trim())
                setDrafting(false)
              }
            }}
            className="rounded border border-input bg-background px-2 py-0.5 text-[11px] hover:bg-accent/40"
          >
            ✓
          </button>
        </div>
      )}
      {comps.length === 0 && !drafting && (
        <div className="mt-3 text-xs text-muted-foreground">
          {t('pages.imageEditor.layerComps.empty')}
        </div>
      )}
      <ul className="mt-2 flex flex-col gap-1">
        {comps.map((c) => (
          <li
            key={c.id}
            className="group flex items-center gap-2 rounded border border-border/60 bg-background/40 px-2 py-1 text-xs hover:bg-accent/20"
          >
            <button
              onClick={() => onApplyComp(c)}
              className="flex-1 text-left"
              title={t('pages.imageEditor.layerComps.applyHint')}
            >
              <div className="truncate font-medium">{c.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {c.layers.length} {t('pages.imageEditor.layerComps.layersCount')}
              </div>
            </button>
            <button
              onClick={() => onDeleteComp(c.id)}
              className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              title={t('pages.imageEditor.layerComps.delete')}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
