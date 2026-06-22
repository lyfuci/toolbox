import * as React from 'react'
import { Button } from 'toolbox'
import { MailIcon, PlusIcon, Trash2Icon, ChevronRightIcon, Loader2Icon } from 'lucide-react'

// Renders the component on the toolbox's signature dark surface. Layout is via
// inline styles so it never depends on a utility class that might be absent
// from the shipped (build-snapshot) stylesheet; theme tokens come from `.dark`.
function Frame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="dark"
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 24,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Variants() {
  return (
    <Frame>
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </Frame>
  )
}

export function Sizes() {
  return (
    <Frame>
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </Frame>
  )
}

export function WithIcons() {
  return (
    <Frame>
      <Button>
        <MailIcon /> Email
      </Button>
      <Button variant="outline">
        <PlusIcon /> Add item
      </Button>
      <Button variant="destructive">
        <Trash2Icon /> Delete
      </Button>
      <Button variant="secondary">
        Continue <ChevronRightIcon />
      </Button>
      <Button size="icon" variant="outline" aria-label="Add">
        <PlusIcon />
      </Button>
    </Frame>
  )
}

export function States() {
  return (
    <Frame>
      <Button disabled>Disabled</Button>
      <Button variant="outline" disabled>
        Disabled
      </Button>
      <Button disabled>
        <Loader2Icon className="animate-spin" /> Loading
      </Button>
    </Frame>
  )
}
