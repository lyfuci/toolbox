import * as React from 'react'
import { ActionsPanel } from 'toolbox'

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
      <ActionsPanel
        actions={[
          {
            id: 'a1',
            name: 'Auto Tone + Sharpen',
            createdAt: '2026-06-20T10:00:00Z',
            steps: [{}, {}, {}],
          },
          {
            id: 'a2',
            name: 'Crop to Square',
            createdAt: '2026-06-21T14:30:00Z',
            steps: [{}],
          },
          {
            id: 'a3',
            name: 'B&W Filmic',
            createdAt: '2026-06-22T09:15:00Z',
            steps: [{}, {}],
          },
        ]}
        isRecording={false}
        recordingStepCount={0}
        onSaveSnapshot={() => {}}
        onStartRecording={() => {}}
        onStopRecording={() => {}}
        onCancelRecording={() => {}}
        onPlayAction={() => {}}
        onDeleteAction={() => {}}
      />
    </Frame>
  )
}
