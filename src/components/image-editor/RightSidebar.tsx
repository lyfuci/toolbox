import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AdjustPanel } from './AdjustPanel'
import { BrushesPanel } from './BrushesPanel'
import type { BrushPreset } from '@/lib/image-editor/brush-presets'
import { ChannelsPanel } from './ChannelsPanel'
import { HistoryPanel } from './HistoryPanel'
import { LayerCompsPanel } from './LayerCompsPanel'
import { LayersPanel } from './LayersPanel'
import { PathsPanel } from './PathsPanel'
import { PropertiesPanel } from './PropertiesPanel'
import type { ImageCache } from '@/lib/image-editor/drawing'
import type { Adjustments, BrushOptions, EditorState, Layer, LayerComp, Transforms } from '@/lib/image-editor/types'

const LAYERS_HEIGHT_KEY = 'pf-layers-h'
const LAYERS_HEIGHT_DEFAULT = 320
const LAYERS_HEIGHT_MIN = 120

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
  zoom: number
  /** Open the Layer Style dialog for the given layer id. */
  onOpenStyle: (id: string) => void
  /** Smart Object > Replace Contents for currently selected SO layer. */
  onReplaceSmartObjectContents: () => void
  /** Right-click on a layer row — parent opens the ContextMenu. */
  onLayerContextMenu?: (id: string, x: number, y: number) => void
  /** Channels panel needs the rendered composite source. */
  image: HTMLImageElement | null
  imageCache?: ImageCache
  /** History panel — passed through from the parent's useHistoryState. */
  history: {
    totalLength: number
    currentIndex: number
    jumpTo: (index: number) => void
  }
  /** Layer Comps panel — save + apply. */
  onSaveLayerComp: (name: string) => void
  onApplyLayerComp: (comp: LayerComp) => void
  onDeleteLayerComp: (id: string) => void
  /** Brushes panel — pick a preset / save current / delete custom. */
  currentBrush: { strokeWidth: number; options: BrushOptions }
  customBrushPresets: BrushPreset[]
  onPickBrushPreset: (preset: BrushPreset) => void
  onSaveCurrentBrush: (name: string) => void
  onDeleteCustomBrush: (id: string) => void
}

/**
 * Right column — three stacked panel groups, each with its own tab strip
 * (PS-style). Group 1: Layers / Channels / Paths. Group 2: Properties /
 * Info. Group 3: Adjustments / Navigator. Channels / Paths / Info /
 * Navigator are stub-but-present so the visual completeness matches the
 * design hand-off; the Layers / Properties / Adjustments tabs are the
 * functional ones from the existing implementation.
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
  zoom,
  onOpenStyle,
  onReplaceSmartObjectContents,
  onLayerContextMenu,
  image,
  imageCache,
  history,
  onSaveLayerComp,
  onApplyLayerComp,
  onDeleteLayerComp,
  currentBrush,
  customBrushPresets,
  onPickBrushPreset,
  onSaveCurrentBrush,
  onDeleteCustomBrush,
}: Props) {
  const { t } = useTranslation()
  const [g1, setG1] = useState<'layers' | 'channels' | 'paths'>('layers')
  const [g2, setG2] = useState<'properties' | 'info' | 'history'>('properties')
  const [g3, setG3] = useState<'adjustments' | 'navigator' | 'comps' | 'brushes'>('adjustments')

  // Layers section height — fixed by default, drag-resizable via the handle
  // below the panel. Persisted in localStorage so layout sticks across reloads.
  // The panel body inside scrolls when its content overflows this height —
  // important for layer groups, which can otherwise push the rest of the
  // right sidebar offscreen.
  const [layersHeight, setLayersHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return LAYERS_HEIGHT_DEFAULT
    const v = Number(window.localStorage.getItem(LAYERS_HEIGHT_KEY))
    return Number.isFinite(v) && v >= LAYERS_HEIGHT_MIN ? v : LAYERS_HEIGHT_DEFAULT
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LAYERS_HEIGHT_KEY, String(layersHeight))
  }, [layersHeight])

  const startLayersResize = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = layersHeight
    const onMove = (ev: MouseEvent) => {
      const maxH = Math.max(LAYERS_HEIGHT_MIN + 100, window.innerHeight * 0.75)
      const next = Math.max(LAYERS_HEIGHT_MIN, Math.min(maxH, startH + (ev.clientY - startY)))
      setLayersHeight(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <aside className="pf-right">
      <PanelGroup
        tabs={[
          { id: 'layers', label: t('pages.imageEditor.panelLayers') },
          { id: 'channels', label: t('pages.imageEditor.panelChannels') },
          { id: 'paths', label: t('pages.imageEditor.panelPaths') },
        ]}
        active={g1}
        setActive={(id) => setG1(id as typeof g1)}
        fixedHeight={layersHeight}
      >
        {g1 === 'layers' && (
          <div className="pf-panel-body pf-scroll-y" style={{ padding: 0 }}>
            <LayersPanel
              state={state}
              selectedId={selectedId}
              onSelect={onSelect}
              setLayers={setLayers}
              patchLayer={patchLayer}
              patchImageLayer={patchImageLayer}
              deleteLayer={deleteLayer}
              onOpenStyle={onOpenStyle}
              onLayerContextMenu={onLayerContextMenu}
            />
          </div>
        )}
        {g1 === 'channels' && (
          <ChannelsPanel image={image} state={state} imageCache={imageCache} />
        )}
        {g1 === 'paths' && (
          <PathsPanel state={state} selectedId={selectedId} onSelect={onSelect} />
        )}
      </PanelGroup>
      <div
        className="pf-resize-handle"
        onMouseDown={startLayersResize}
        title={t('pages.imageEditor.layers.resizeHandle')}
      />


      <PanelGroup
        tabs={[
          { id: 'properties', label: t('pages.imageEditor.panelProperties') },
          { id: 'info', label: t('pages.imageEditor.panelInfo') },
          { id: 'history', label: t('pages.imageEditor.panelHistory') },
        ]}
        active={g2}
        setActive={(id) => setG2(id as typeof g2)}
      >
        {g2 === 'properties' && (
          <div className="pf-panel-body" style={{ padding: 0 }}>
            <PropertiesPanel
              state={state}
              selectedId={selectedId}
              patchLayer={patchLayer}
              patchImageLayer={patchImageLayer}
              onOpenStyle={onOpenStyle}
              onReplaceSmartObjectContents={onReplaceSmartObjectContents}
            />
          </div>
        )}
        {g2 === 'info' && <StubPanel msg={t('pages.imageEditor.panelStubInfo')} />}
        {g2 === 'history' && (
          <HistoryPanel
            totalLength={history.totalLength}
            currentIndex={history.currentIndex}
            onJumpTo={history.jumpTo}
          />
        )}
      </PanelGroup>

      <PanelGroup
        tabs={[
          { id: 'adjustments', label: t('pages.imageEditor.panelAdjust') },
          { id: 'navigator', label: t('pages.imageEditor.panelNavigator') },
          { id: 'comps', label: t('pages.imageEditor.panelComps') },
          { id: 'brushes', label: t('pages.imageEditor.panelBrushes') },
        ]}
        active={g3}
        setActive={(id) => setG3(id as typeof g3)}
      >
        {g3 === 'adjustments' && (
          <div className="pf-panel-body" style={{ padding: 8 }}>
            <AdjustPanel
              transforms={state.transforms}
              setTransforms={setTransforms}
              adjust={state.adjust}
              setAdjust={setAdjust}
            />
          </div>
        )}
        {g3 === 'navigator' && <NavigatorStub zoom={zoom} />}
        {g3 === 'comps' && (
          <LayerCompsPanel
            state={state}
            onSaveComp={onSaveLayerComp}
            onApplyComp={onApplyLayerComp}
            onDeleteComp={onDeleteLayerComp}
          />
        )}
        {g3 === 'brushes' && (
          <BrushesPanel
            current={currentBrush}
            customPresets={customBrushPresets}
            onPick={onPickBrushPreset}
            onSaveCurrent={onSaveCurrentBrush}
            onDeleteCustom={onDeleteCustomBrush}
          />
        )}
      </PanelGroup>
    </aside>
  )
}

function PanelGroup({
  tabs,
  active,
  setActive,
  children,
  fixedHeight,
}: {
  tabs: { id: string; label: string }[]
  active: string
  setActive: (id: string) => void
  children: ReactNode
  /**
   * Pin the group to a given pixel height — header stays at natural height,
   * the body fills the remainder and scrolls internally. Used for the Layers
   * group so the right sidebar layout stays stable when many layers / groups
   * push the natural height past the viewport.
   */
  fixedHeight?: number
}) {
  return (
    <div
      className="pf-panel-group"
      style={fixedHeight ? { height: fixedHeight, minHeight: 0 } : undefined}
    >
      <div className="pf-panel-tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`pf-panel-tab ${active === t.id ? 'pf-active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </div>
        ))}
        <div style={{ flex: 1, borderRight: '1px solid var(--pf-line)' }} />
      </div>
      {children}
    </div>
  )
}

function StubPanel({ msg }: { msg: string }) {
  return (
    <div
      className="pf-panel-body"
      style={{ color: 'var(--pf-fg-dim)', fontStyle: 'italic', minHeight: 60 }}
    >
      {msg}
    </div>
  )
}

function NavigatorStub({ zoom }: { zoom: number }) {
  const { t } = useTranslation()
  return (
    <div className="pf-panel-body" style={{ padding: 8 }}>
      <div
        style={{
          height: 80,
          background: 'var(--pf-bg-canvas)',
          border: '1px solid var(--pf-line)',
          marginBottom: 6,
        }}
      />
      <div style={{ color: 'var(--pf-fg-mid)', fontSize: 11 }}>
        {t('pages.imageEditor.zoom')}: {Math.round(zoom * 100)}%
      </div>
    </div>
  )
}
