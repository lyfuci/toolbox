import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
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
import { TOOL_ALIASES, toolSearchKeywords } from '@/lib/tool-search'
import { SUPPORTED_LANGS } from '@/i18n'
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
 * Triggers just dispatch setOpen via context so we never end up with two
 * dialogs mounted at once.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  // Search terms are locale-independent on purpose: someone reading the
  // Chinese UI still types "image", and vice versa. Built once — the
  // contents don't change when the display language does.
  const keywordsBySlug = useMemo(() => {
    const fixedT = SUPPORTED_LANGS.map((lang) => i18n.getFixedT(lang))
    const index: Record<string, string[]> = {}
    for (const cat of toolsByCategory()) {
      for (const tool of cat.tools) {
        index[tool.slug] = toolSearchKeywords(
          fixedT.flatMap((tt) => [
            tt(`tools.${tool.slug}.name`),
            tt(`tools.${tool.slug}.description`),
            tt(`categories.${cat.slug}.name`),
          ]),
          TOOL_ALIASES[tool.slug],
        )
      }
    }
    return index
  }, [i18n])

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
        title={t('palette.title')}
        description={t('palette.description')}
      >
        <CommandInput placeholder={t('palette.placeholder')} />
        <CommandList>
          <CommandEmpty>{t('palette.empty')}</CommandEmpty>
          {toolsByCategory().map((cat) => {
            const catName = t(`categories.${cat.slug}.name`)
            return (
              <CommandGroup key={cat.slug} heading={catName}>
                {cat.tools.map((tool) => {
                  const Icon = tool.icon
                  const toolName = t(`tools.${tool.slug}.name`)
                  const toolDesc = t(`tools.${tool.slug}.description`)
                  return (
                    <CommandItem
                      key={tool.slug}
                      value={tool.slug}
                      keywords={keywordsBySlug[tool.slug]}
                      onSelect={() => {
                        navigate(tool.path)
                        setOpen(false)
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{toolName}</span>
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {toolDesc}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )
          })}
        </CommandList>
      </CommandDialog>
    </PaletteContext.Provider>
  )
}

export function SearchTrigger({ className }: { className?: string }) {
  const { setOpen } = usePalette()
  const { t } = useTranslation()
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
      <span className="flex-1 text-left">{t('topbar.searchPlaceholder')}</span>
      <kbd className="pointer-events-none hidden select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
        ⌘K
      </kbd>
    </Button>
  )
}
