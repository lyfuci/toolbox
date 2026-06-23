import * as React from 'react'
import { OptionsBar } from 'toolbox'

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
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Default() {
  return (
    <Frame style={{ display: 'inline-block' }}>
      <OptionsBar
        tool="liquify"
        liquifyMode="twirlCW"
        setLiquifyMode={() => {}}
        liquifySize={120}
        setLiquifySize={() => {}}
        liquifyStrength={65}
        setLiquifyStrength={() => {}}
        fgColor="#3b82f6"
        setFgColor={() => {}}
        bgColor="#ffffff"
        setBgColor={() => {}}
        strokeWidth={12}
        setStrokeWidth={() => {}}
        brushOptions={{ hardness: 0.8, spacing: 0.25, flow: 1, opacity: 1 }}
        setBrushOptions={() => {}}
        textOptions={{
          fontSize: 48,
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          fontStyle: 'normal',
          align: 'left',
          letterSpacing: 0,
          lineHeight: 1.2,
          underline: false,
        }}
        setTextOptions={() => {}}
        bucketTolerance={32}
        setBucketTolerance={() => {}}
        wandTolerance={32}
        setWandTolerance={() => {}}
        selectionMode="replace"
        setSelectionMode={() => {}}
        feather={0}
        setFeather={() => {}}
        isStubTool={false}
        cropAspectId="free"
        setCropAspectId={() => {}}
      />
    </Frame>
  )
}
