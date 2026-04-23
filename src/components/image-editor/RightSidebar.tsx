import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Layers as LayersIcon, Settings2, Sliders } from 'lucide-react'
import { AdjustPanel } from './AdjustPanel'
import { LayersPanel } from './LayersPanel'
import { PropertiesPanel } from './PropertiesPanel'
import type { Adjustments, EditorState, Layer, Transforms } from '@/lib/image-editor/types'

type Props = {
  state: EditorState
  selectedId: string
  onSelect: (id: string) => void
  setLayers: (layers: Layer[]) => void
  patchLayer: (id: string, patch: Partial<Layer>) => void
  patchImageLayer: (patch: Partial<EditorState['imageLayer']>) => void
  deleteLayer: (id: string) => void
  setTransforms: (t: Transforms) => void
  setAdjust: (a: Adjustments) => void
}

/**
 * Right-hand panel column. Three collapsible sections, all visible at once
 * (unlike the previous tab arrangement). Layer list on top, then Properties
 * for the currently selected layer, then Adjust (transforms + filters that
 * apply to the image background).
 */
export function RightSidebar({
  state,
  selectedId,
  onSelect,
  setLayers,
  patchLayer,
  patchImageLayer,
  deleteLayer,
  setTransforms,
  setAdjust,
}: Props) {
  const { t } = useTranslation()
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-l border-border bg-card/40 p-3">
      <Section title={t('pages.imageEditor.layers')} icon={<LayersIcon className="h-3.5 w-3.5" />}>
        <LayersPanel
          state={state}
          selectedId={selectedId}
          onSelect={onSelect}
          setLayers={setLayers}
          patchLayer={patchLayer}
          patchImageLayer={patchImageLayer}
          deleteLayer={deleteLayer}
        />
      </Section>

      <Section title={t('pages.imageEditor.layerProps')} icon={<Settings2 className="h-3.5 w-3.5" />}>
        <PropertiesPanel
          state={state}
          selectedId={selectedId}
          patchLayer={patchLayer}
          patchImageLayer={patchImageLayer}
        />
      </Section>

      <Section title={t('pages.imageEditor.adjust')} icon={<Sliders className="h-3.5 w-3.5" />}>
        <AdjustPanel
          transforms={state.transforms}
          setTransforms={setTransforms}
          adjust={state.adjust}
          setAdjust={setAdjust}
        />
      </Section>
    </aside>
  )
}

function Section({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string
  icon: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded border border-border/60 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/80 hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {icon}
        <span className="flex-1 text-left">{title}</span>
      </button>
      {open ? <div className="border-t border-border/60 px-2 py-2">{children}</div> : null}
    </div>
  )
}
