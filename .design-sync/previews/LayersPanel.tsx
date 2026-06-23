import * as React from 'react'
import { LayersPanel } from 'toolbox'

function Frame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  React.useEffect(() => {
    const el = document.documentElement
    el.classList.add('dark')
    return () => el.classList.remove('dark')
  }, [])
  return (
    <div
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 16,
        width: 300,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Default() {
  return (
    <Frame>
      <LayersPanel
        state={{
          imageLayer: {
            kind: 'image',
            id: 'image',
            name: 'Background',
            visible: true,
            opacity: 100,
            blend: 'normal',
          },
          layers: [
            {
              kind: 'annotation',
              id: 'l1',
              name: 'Headline',
              visible: true,
              opacity: 100,
              blend: 'normal',
              colorTag: 'blue',
              effects: [
                {
                  kind: 'dropShadow',
                  enabled: true,
                  color: '#000000',
                  opacity: 75,
                  blend: 'multiply',
                  distance: 5,
                  angle: 135,
                  size: 5,
                },
              ],
              shape: { kind: 'text', x: 40, y: 60, text: 'Summer Sale', color: '#ffffff', fontSize: 48 },
            },
            {
              kind: 'annotation',
              id: 'l2',
              name: 'Banner Box',
              visible: true,
              opacity: 80,
              blend: 'multiply',
              colorTag: 'red',
              effects: [],
              shape: { kind: 'rect', x: 24, y: 20, w: 320, h: 120, color: '#22d3ee', strokeWidth: 4, fill: '#0e7490' },
            },
            {
              kind: 'annotation',
              id: 'l3',
              name: 'Hidden Sketch',
              visible: false,
              opacity: 60,
              blend: 'normal',
              effects: [],
              shape: {
                kind: 'brush',
                points: [
                  { x: 10, y: 10 },
                  { x: 80, y: 90 },
                ],
                color: '#f43f5e',
                strokeWidth: 6,
              },
            },
          ],
          transforms: { rotation: 0, flipH: false, flipV: false },
          adjust: {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            grayscale: 0,
            blur: 0,
            hue: 0,
            sepia: 0,
            invert: 0,
          },
        }}
        selectedId="l1"
        onSelect={() => {}}
        setLayers={() => {}}
        patchLayer={() => {}}
        patchImageLayer={() => {}}
        deleteLayer={() => {}}
        onOpenStyle={() => {}}
        renamingId={null}
        onStartRename={() => {}}
        onCommitRename={() => {}}
        onSetColorTag={() => {}}
      />
    </Frame>
  )
}
