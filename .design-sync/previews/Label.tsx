import * as React from 'react'
import { Label, Input } from 'toolbox'
import { MailIcon } from 'lucide-react'

function Frame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="dark"
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 24,
        maxWidth: 320,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function FormField() {
  return (
    <Frame style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="you@example.com" />
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <Label htmlFor="pw">
          Password <span style={{ color: 'var(--destructive)' }}>*</span>
        </Label>
        <Input id="pw" type="password" defaultValue="supersecret" />
      </div>
    </Frame>
  )
}

export function WithIcon() {
  return (
    <Frame>
      <Label htmlFor="n">
        <MailIcon style={{ width: 16, height: 16 }} /> Email notifications
      </Label>
    </Frame>
  )
}
