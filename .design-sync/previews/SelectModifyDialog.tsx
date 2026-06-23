import * as React from 'react'
import { SelectModifyDialog } from 'toolbox'

// PixelForge mirrors the editor's app-level dark mode (html.dark). Setting it on
// the document root makes BOTH in-flow panels and portaled dialogs (which mount
// on <body>, outside any wrapper) resolve the dark tokens correctly.
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
        minHeight: 120,
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
    <Frame>
      <SelectModifyDialog open="expand" onApply={() => {}} onCancel={() => {}} />
    </Frame>
  )
}
