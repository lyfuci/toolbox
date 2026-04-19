import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { toolsByCategory } from '@/lib/tools'
import { cn } from '@/lib/utils'

type PaletteContextValue = { setOpen: (open: boolean) => void }

const PaletteContext = createContext<PaletteContextValue | null>(null)

function usePalette() {
  const ctx = useContext(PaletteContext)
  if (!ctx) {
    throw new Error('CommandPalette triggers must be inside <CommandPaletteProvider>')
  }
  return ctx
}

/**
 * Owns the single dialog instance + the global cmd/ctrl+K listener.
 * Triggers ({@link SearchTrigger}, {@link HeroSearchTrigger}) just dispatch
 * setOpen via context so we never end up with two dialogs mounted at once.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <PaletteContext.Provider value={{ setOpen }}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="搜索工具"
        description="按工具名或描述搜索"
      >
        <CommandInput placeholder="搜索工具..." />
        <CommandList>
          <CommandEmpty>没有匹配的工具</CommandEmpty>
          {toolsByCategory().map((cat) => (
            <CommandGroup key={cat.slug} heading={cat.name}>
              {cat.tools.map((tool) => {
                const Icon = tool.icon
                return (
                  <CommandItem
                    key={tool.slug}
                    value={`${tool.name} ${tool.description} ${cat.name}`}
                    onSelect={() => {
                      navigate(tool.path)
                      setOpen(false)
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{tool.name}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {tool.description}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </PaletteContext.Provider>
  )
}

export function SearchTrigger({ className }: { className?: string }) {
  const { setOpen } = usePalette()
  return (
    <Button
      variant="outline"
      onClick={() => setOpen(true)}
      className={cn(
        'h-9 justify-start gap-2 px-3 text-sm font-normal text-muted-foreground',
        className,
      )}
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-left">搜索工具...</span>
      <kbd className="pointer-events-none hidden select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
        ⌘K
      </kbd>
    </Button>
  )
}

/** Hero variant for the home page — visually prominent, opens the same dialog. */
export function HeroSearchTrigger({ className }: { className?: string }) {
  const { setOpen } = usePalette()
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-3 text-left text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent/40',
        className,
      )}
    >
      <Search className="h-5 w-5" />
      <span className="flex-1">搜索工具…</span>
      <kbd className="pointer-events-none hidden select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[11px] sm:inline-flex">
        ⌘K
      </kbd>
    </button>
  )
}
