import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
  Input,
  Label,
} from 'toolbox'

// Overlay: rendered open (defaultOpen) in a single-mode card (cfg.overrides).
// modal renders Radix's own DialogOverlay (portaled to <body>, so its
// `fixed inset-0` backdrop works — a wrapper div would not, the card sits
// under a CSS transform). The content is portaled too, so the dark theme +
// explicit `color` go on DialogContent itself (else its title/labels inherit
// the page's light-vars near-black color and vanish on the dark surface).
export function EditProfile() {
  return (
    <Dialog defaultOpen>
      <DialogContent className="dark" style={{ colorScheme: 'dark', color: 'var(--foreground)' }}>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div style={{ display: 'grid', gap: 12, padding: '4px 0' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <Label htmlFor="name">Display name</Label>
            <Input id="name" defaultValue="Sean Sun" />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <Label htmlFor="user">Username</Label>
            <Input id="user" defaultValue="@lyfuci" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
