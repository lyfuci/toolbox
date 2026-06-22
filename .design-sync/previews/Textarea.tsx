import * as React from 'react'
import { Textarea, Label, Button } from 'toolbox'

function Frame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="dark"
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 24,
        maxWidth: 380,
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
      <Textarea placeholder="Type your message here." />
    </Frame>
  )
}

export function WithLabel() {
  return (
    <Frame style={{ display: 'grid', gap: 6 }}>
      <Label htmlFor="msg">Your message</Label>
      <Textarea id="msg" placeholder="Type your message here." rows={4} />
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
        Your message will be copied to the support team.
      </p>
    </Frame>
  )
}

export function Filled() {
  return (
    <Frame style={{ display: 'grid', gap: 10 }}>
      <Textarea
        rows={4}
        defaultValue={'The toolbox is a pure client-side frontend toolset.\nNo backend, no data leaves the browser.'}
      />
      <Button style={{ justifySelf: 'start' }}>Send message</Button>
    </Frame>
  )
}

export function Disabled() {
  return (
    <Frame>
      <Textarea placeholder="This field is disabled." disabled />
    </Frame>
  )
}
