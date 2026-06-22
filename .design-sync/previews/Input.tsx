import * as React from 'react'
import { Input, Label } from 'toolbox'

function Frame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="dark"
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 24,
        maxWidth: 340,
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
      <Input placeholder="you@example.com" />
    </Frame>
  )
}

export function WithLabel() {
  return (
    <Frame style={{ display: 'grid', gap: 6 }}>
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </Frame>
  )
}

export function Types() {
  return (
    <Frame style={{ display: 'grid', gap: 12 }}>
      <Input type="text" defaultValue="Plain text" />
      <Input type="password" defaultValue="supersecret" />
      <Input type="number" defaultValue={42} />
      <Input type="file" />
    </Frame>
  )
}

export function States() {
  return (
    <Frame style={{ display: 'grid', gap: 12 }}>
      <Input placeholder="Disabled" disabled />
      <Input defaultValue="Invalid value" aria-invalid />
    </Frame>
  )
}
