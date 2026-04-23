import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Slider } from './Slider'
import { BLEND_MODES, type BlendMode, type EditorState, type Layer } from '@/lib/image-editor/types'

type Props = {
  state: EditorState
  selectedId: string
  patchLayer: (id: string, patch: Partial<Layer>) => void
  patchImageLayer: (patch: Partial<EditorState['imageLayer']>) => void
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
}: Props) {
  const { t } = useTranslation()
  const selected: Layer | EditorState['imageLayer'] | undefined =
    selectedId === 'image'
      ? state.imageLayer
      : state.layers.find((l) => l.id === selectedId)

  if (!selected) {
    return (
      <div className="text-xs text-muted-foreground">
        {t('pages.imageEditor.noLayerSelected')}
      </div>
    )
  }

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
    </div>
  )
}
