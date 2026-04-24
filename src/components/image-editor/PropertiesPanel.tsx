import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Slider } from './Slider'
import {
  BLEND_MODES,
  type BlendMode,
  type EditorState,
  type Layer,
  type Shadow,
} from '@/lib/image-editor/types'

type Props = {
  state: EditorState
  selectedId: string
  patchLayer: (id: string, patch: Partial<Layer>) => void
  patchImageLayer: (patch: Partial<EditorState['imageLayer']>) => void
}

const DEFAULT_SHADOW: Shadow = {
  enabled: true,
  offsetX: 4,
  offsetY: 4,
  blur: 8,
  color: 'rgba(0, 0, 0, 0.5)',
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

      <ShadowControls
        shadow={selected.shadow}
        onChange={(next) => {
          if (selectedId === 'image') patchImageLayer({ shadow: next })
          else patchLayer(selectedId, { shadow: next })
        }}
      />
    </div>
  )
}

function ShadowControls({
  shadow,
  onChange,
}: {
  shadow: Shadow | undefined
  onChange: (s: Shadow | undefined) => void
}) {
  const { t } = useTranslation()
  const enabled = shadow?.enabled ?? false
  const s: Shadow = shadow ?? DEFAULT_SHADOW
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange(e.target.checked ? { ...s, enabled: true } : undefined)
          }
          className="h-3.5 w-3.5 accent-primary"
        />
        {t('pages.imageEditor.dropShadow')}
      </label>
      {enabled && (
        <>
          <Slider
            label={t('pages.imageEditor.shadowX')}
            value={s.offsetX}
            min={-50}
            max={50}
            onChange={(v) => onChange({ ...s, offsetX: v })}
          />
          <Slider
            label={t('pages.imageEditor.shadowY')}
            value={s.offsetY}
            min={-50}
            max={50}
            onChange={(v) => onChange({ ...s, offsetY: v })}
          />
          <Slider
            label={t('pages.imageEditor.shadowBlur')}
            value={s.blur}
            min={0}
            max={50}
            onChange={(v) => onChange({ ...s, blur: v })}
          />
          <div className="flex items-center gap-2">
            <Label className="w-16 text-xs text-muted-foreground">
              {t('pages.imageEditor.shadowColor')}
            </Label>
            {/* Color input doesn't accept rgba, so we keep the alpha implicit
                in the default and let the user pick a hex color. Stripping
                alpha = solid shadow on hex change. */}
            <input
              type="color"
              value={hexFromColor(s.color)}
              onChange={(e) => onChange({ ...s, color: e.target.value })}
              className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
            />
          </div>
        </>
      )}
    </div>
  )
}

/** Best-effort: pull a #rrggbb out of rgba()/hex/etc for the color input. */
function hexFromColor(c: string): string {
  if (c.startsWith('#') && c.length >= 7) return c.slice(0, 7)
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, '0')
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
  }
  return '#000000'
}
