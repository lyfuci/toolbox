import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  zoom: number
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
}: Props) {
  const { t } = useTranslation()
  const [g1, setG1] = useState<'layers' | 'channels' | 'paths'>('layers')
  const [g2, setG2] = useState<'properties' | 'info'>('properties')
  const [g3, setG3] = useState<'adjustments' | 'navigator'>('adjustments')

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
      >
        {g1 === 'layers' && (
          <div className="pf-panel-body" style={{ padding: 0 }}>
            <LayersPanel
              state={state}
              selectedId={selectedId}
              onSelect={onSelect}
              setLayers={setLayers}
              patchLayer={patchLayer}
              patchImageLayer={patchImageLayer}
              deleteLayer={deleteLayer}
            />
          </div>
        )}
        {g1 === 'channels' && <StubPanel msg={t('pages.imageEditor.panelStubChannels')} />}
        {g1 === 'paths' && <StubPanel msg={t('pages.imageEditor.panelStubPaths')} />}
      </PanelGroup>

      <PanelGroup
        tabs={[
          { id: 'properties', label: t('pages.imageEditor.panelProperties') },
          { id: 'info', label: t('pages.imageEditor.panelInfo') },
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
            />
          </div>
        )}
        {g2 === 'info' && <StubPanel msg={t('pages.imageEditor.panelStubInfo')} />}
      </PanelGroup>

      <PanelGroup
        tabs={[
          { id: 'adjustments', label: t('pages.imageEditor.panelAdjust') },
          { id: 'navigator', label: t('pages.imageEditor.panelNavigator') },
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
      </PanelGroup>
    </aside>
  )
}

function PanelGroup({
  tabs,
  active,
  setActive,
  children,
}: {
  tabs: { id: string; label: string }[]
  active: string
  setActive: (id: string) => void
  children: ReactNode
}) {
  return (
    <div className="pf-panel-group">
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
