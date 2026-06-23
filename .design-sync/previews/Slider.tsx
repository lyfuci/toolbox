import * as React from 'react'
import { Slider } from 'toolbox'

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
    <Frame style={{ width: 240 }}>
      <Slider label="Opacity" value={75} min={0} max={100} unit="%" onChange={() => {}} />
    </Frame>
  )
}

export function Variants() {
  return (
    <Frame style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Slider label="Opacity" value={75} min={0} max={100} unit="%" onChange={() => {}} />
      <Slider label="Feather" value={2.5} min={0} max={50} step={0.5} unit=" px" onChange={() => {}} />
      <Slider label="Hue" value={-20} min={-180} max={180} unit="°" onChange={() => {}} />
    </Frame>
  )
}
