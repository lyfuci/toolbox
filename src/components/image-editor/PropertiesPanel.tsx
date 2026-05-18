import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Slider } from './Slider'
import { findLayerById } from '@/lib/image-editor/layer-tree'
import { effectsOf } from '@/lib/image-editor/layer-effects'
import {
  BLEND_MODES,
  type BlendMode,
  type EditorState,
  type Layer,
} from '@/lib/image-editor/types'

type Props = {
  state: EditorState
  selectedId: string
  patchLayer: (id: string, patch: Partial<Layer>) => void
  patchImageLayer: (patch: Partial<EditorState['imageLayer']>) => void
  /** Open the Layer Style dialog for the currently selected layer.
   *  Hidden when the image background is selected (no fx support there). */
  onOpenStyle: (id: string) => void
}

/**
 * Per-layer properties panel: opacity slider + blend mode picker for the
 * currently selected layer. Image background gets the same controls (PS-style).
 * If nothing's selected, shows a stub.
 */
export function PropertiesPanel({
  state,
  selectedId,
  patchLayer,
  patchImageLayer,
  onOpenStyle,
}: Props) {
  const { t } = useTranslation()
  const selected: Layer | EditorState['imageLayer'] | null =
    selectedId === 'image'
      ? state.imageLayer
      : findLayerById(state.layers, selectedId)

  if (!selected) {
    return (
      <div className="text-xs text-muted-foreground">
        {t('pages.imageEditor.noLayerSelected')}
      </div>
    )
  }

  // Effects only apply to user layers — image background renders through the
  // crop/transform path which doesn't go through the per-layer effects stack.
  const isUserLayer = selectedId !== 'image'
  const layerForFx = isUserLayer ? (selected as Layer) : null
  const fxCount = layerForFx ? effectsOf(layerForFx).length : 0

  return (
    <div className="space-y-3">
      <Slider
        label={t('pages.imageEditor.opacity')}
        value={selected.opacity}
        min={0}
        max={100}
        unit="%"
        onChange={(v) =>
          selectedId === 'image'
            ? patchImageLayer({ opacity: v })
            : patchLayer(selectedId, { opacity: v })
        }
      />
      <div className="flex items-center gap-2">
        <Label className="w-16 text-xs text-muted-foreground">
          {t('pages.imageEditor.blend')}
        </Label>
        <select
          value={selected.blend}
          onChange={(e) => {
            const b = e.target.value as BlendMode
            if (selectedId === 'image') patchImageLayer({ blend: b })
            else patchLayer(selectedId, { blend: b })
          }}
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          {BLEND_MODES.map((b) => (
            <option key={b} value={b} className="bg-background text-foreground">
              {t(`pages.imageEditor.blendMode.${b}`)}
            </option>
          ))}
        </select>
      </div>

      {isUserLayer && (
        <div className="space-y-2 border-t border-border pt-3">
          <button
            onClick={() => onOpenStyle(selectedId)}
            className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground hover:bg-accent/40"
          >
            <span className="flex items-center gap-2">
              <span className="rounded border border-border/60 px-1 font-mono text-[10px] italic text-primary">
                fx
              </span>
              {t('pages.imageEditor.layerStyle.title')}
            </span>
            {fxCount > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                ×{fxCount}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
