import * as React from 'react'
import { ToolsPalette } from 'toolbox'

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
      <ToolsPalette
        tool="brush"
        setTool={() => {}}
        fgColor="#f43f5e"
        bgColor="#ffffff"
        setFgColor={() => {}}
        setBgColor={() => {}}
        swapColors={() => {}}
        resetColors={() => {}}
        onStubClick={() => {}}
        onOpenColorPicker={() => {}}
      />
    </Frame>
  )
}
