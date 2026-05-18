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
  /** Open the Smart Object > Replace Contents file picker for the selected
   *  SO layer. Only shown when the selected layer is a SmartObjectLayer. */
  onReplaceSmartObjectContents: () => void
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
  onReplaceSmartObjectContents,
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

      {layerForFx && layerForFx.kind === 'smartObject' && (
        <SmartObjectSection
          state={state}
          layer={layerForFx}
          patchLayer={patchLayer}
          onReplace={onReplaceSmartObjectContents}
        />
      )}
    </div>
  )
}

/** Smart Object panel: source info + non-destructive transform sliders
 *  (x / y / w / h / rotation) + Replace Contents button. Full Free Transform
 *  on-canvas handles live elsewhere; sliders cover the no-handle case. */
function SmartObjectSection({
  state,
  layer,
  patchLayer,
  onReplace,
}: {
  state: EditorState
  layer: Layer & { kind: 'smartObject' }
  patchLayer: (id: string, patch: Partial<Layer>) => void
  onReplace: () => void
}) {
  const { t } = useTranslation()
  const source = state.smartSources?.[layer.sourceRef]
  const t0 = layer.transform
  const patchTransform = (patch: Partial<typeof t0>) =>
    patchLayer(layer.id, { transform: { ...t0, ...patch } })
  const filters = layer.bakedFilters ?? []
  const removeFilter = (i: number) => {
    const next = [...filters]
    next.splice(i, 1)
    patchLayer(layer.id, { bakedFilters: next })
  }
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="text-xs text-muted-foreground">
        {t('pages.imageEditor.smartObject.title')}
      </div>
      <div className="rounded-md bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
        <div className="truncate font-medium text-foreground">
          {source?.name ?? '—'}
        </div>
        {source && (
          <div className="font-mono">
            {source.w} × {source.h}px
          </div>
        )}
      </div>
      <Slider
        label="X"
        value={Math.round(t0.x)}
        min={-2000}
        max={2000}
        unit="px"
        onChange={(v) => patchTransform({ x: v, anchorX: v + t0.w / 2 })}
      />
      <Slider
        label="Y"
        value={Math.round(t0.y)}
        min={-2000}
        max={2000}
        unit="px"
        onChange={(v) => patchTransform({ y: v, anchorY: v + t0.h / 2 })}
      />
      <Slider
        label={t('pages.imageEditor.smartObject.width')}
        value={Math.round(t0.w)}
        min={1}
        max={4000}
        unit="px"
        onChange={(v) => patchTransform({ w: v, anchorX: t0.x + v / 2 })}
      />
      <Slider
        label={t('pages.imageEditor.smartObject.height')}
        value={Math.round(t0.h)}
        min={1}
        max={4000}
        unit="px"
        onChange={(v) => patchTransform({ h: v, anchorY: t0.y + v / 2 })}
      />
      <Slider
        label={t('pages.imageEditor.smartObject.rotation')}
        value={Math.round(t0.rotation)}
        min={-180}
        max={180}
        unit="°"
        onChange={(v) => patchTransform({ rotation: v })}
      />
      <button
        onClick={onReplace}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent/40"
      >
        {t('pages.imageEditor.smartObject.replaceBtn')}
      </button>
      {filters.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          <div className="text-xs text-muted-foreground">
            {t('pages.imageEditor.smartFilters.title')}
          </div>
          {filters.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded border border-border/60 px-2 py-1 text-[11px]"
            >
              <span className="truncate">
                {t(`pages.imageEditor.filters.${f.kind}`)}
              </span>
              <button
                onClick={() => removeFilter(i)}
                className="text-muted-foreground hover:text-destructive"
                title={t('pages.imageEditor.smartFilters.remove')}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
