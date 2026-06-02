import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, MessageSquarePlus, Wrench } from 'lucide-react'
import { toolsByCategory, tools, type CategorySlug } from '@/lib/tools'
import { cn } from '@/lib/utils'
import { useGAPageview } from '@/hooks/useGAPageview'
import { CommandPaletteProvider, SearchTrigger } from '@/components/CommandPalette'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'

const COLLAPSE_KEY = 'sidebar.collapsed.v1'

// Which category owns the current path, so we can keep it expanded.
function categoryForPath(pathname: string): CategorySlug | null {
  const tool = tools.find((tl) => tl.path === pathname)
  return tool?.category ?? null
}

function loadCollapsed(): Set<CategorySlug> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    if (raw) return new Set(JSON.parse(raw) as CategorySlug[])
  } catch {
    /* ignore malformed storage */
  }
  return new Set()
}

export function Layout() {
  useGAPageview()
  const { t } = useTranslation()
  const location = useLocation()

  // The actual scroll container is the document/window: outer is `min-h-svh`
  // so <main>'s `overflow-auto` never engages and content scrolls the page.
  // Without this effect, navigating between tools after scrolling drops the
  // user mid-page. `behavior: 'auto'` (no smooth) — entering a new page
  // should feel like a jump, not an animated slide.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  const groups = toolsByCategory()

  // Per-category collapse state, persisted. A category is "open" unless its
  // slug is in the collapsed set — EXCEPT the category owning the active route,
  // which is always shown expanded so you can see where you are.
  const [collapsed, setCollapsed] = useState<Set<CategorySlug>>(loadCollapsed)
  const activeCategory = categoryForPath(location.pathname)

  const toggleCategory = (slug: CategorySlug) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const collapseAll = () => {
    const all = new Set(groups.map((g) => g.slug))
    setCollapsed(all)
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...all]))
    } catch {
      /* ignore */
    }
  }
  const expandAll = () => {
    setCollapsed(new Set())
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([]))
    } catch {
      /* ignore */
    }
  }
  const allCollapsed = collapsed.size >= groups.length

  return (
    <CommandPaletteProvider>
    <div className="grid min-h-svh grid-cols-[16rem_1fr] bg-background text-foreground">
      <aside className="flex max-h-svh flex-col border-r border-border bg-card/40 px-4 py-6">
        <NavLink
          to="/"
          className="mb-4 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight"
        >
          <Wrench className="h-5 w-5" />
          {t('sidebar.brand')}
        </NavLink>

        <button
          type="button"
          onClick={allCollapsed ? expandAll : collapseAll}
          className="mb-2 self-end px-2 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          {allCollapsed ? t('sidebar.expandAll') : t('sidebar.collapseAll')}
        </button>

        <nav className="flex flex-col gap-1 overflow-y-auto">
          {groups.map((cat) => {
            const isActiveCat = cat.slug === activeCategory
            const isOpen = isActiveCat || !collapsed.has(cat.slug)
            return (
              <div key={cat.slug}>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.slug)}
                  className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 shrink-0 transition-transform',
                      isOpen && 'rotate-90',
                    )}
                  />
                  {t(`categories.${cat.slug}.name`)}
                  <span className="ml-auto tabular-nums text-muted-foreground/50">
                    {cat.tools.length}
                  </span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-0.5 pb-1">
                    {cat.tools.map((tool) => {
                      const Icon = tool.icon
                      return (
                        <NavLink
                          key={tool.slug}
                          to={tool.path}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                              isActive
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                            )
                          }
                        >
                          <Icon className="h-4 w-4" />
                          {t(`tools.${tool.slug}.name`)}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-h-svh flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-3 border-b border-border bg-background/80 px-6 backdrop-blur">
          <SearchTrigger className="w-72" />
          <a
            href="https://github.com/lyfuci/toolbox/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <MessageSquarePlus className="h-4 w-4" />
            {t('topbar.feedback')}
          </a>
          <LanguageToggle />
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </CommandPaletteProvider>
  )
}
