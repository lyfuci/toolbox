import * as React from 'react'
import { PropertiesPanel } from 'toolbox'

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
      <PropertiesPanel
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
              opacity: 85,
              blend: 'screen',
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
        patchLayer={() => {}}
        patchImageLayer={() => {}}
        onOpenStyle={() => {}}
        onReplaceSmartObjectContents={() => {}}
      />
    </Frame>
  )
}
