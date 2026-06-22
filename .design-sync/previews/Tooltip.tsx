import * as React from 'react'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, Button } from 'toolbox'
import { PlusIcon } from 'lucide-react'

// TooltipContent is portaled to <body> and positioned over the trigger, so the
// frame keeps generous padding to keep the (popped-above) chip on the dark
// surface. TooltipContent carries its own `.dark`; it already colors itself via
// `text-background` (inverted chip), so it gets NO explicit color override.
// A `position:fixed` wrapper does NOT work here — the capture's single-mode
// card sits under a CSS `transform`, which re-bases fixed positioning.
export function Hover() {
  return (
    <div
      className="dark"
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 64,
      }}
    >
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Add to library">
              <PlusIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="dark" style={{ colorScheme: 'dark' }} sideOffset={6}>
            Add to library
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
