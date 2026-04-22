import { NavLink, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus, Wrench } from 'lucide-react'
import { toolsByCategory } from '@/lib/tools'
import { cn } from '@/lib/utils'
import { useGAPageview } from '@/hooks/useGAPageview'
import { CommandPaletteProvider, SearchTrigger } from '@/components/CommandPalette'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'

export function Layout() {
  useGAPageview()
  const { t } = useTranslation()

  const groups = toolsByCategory()

  return (
    <CommandPaletteProvider>
    <div className="grid min-h-svh grid-cols-[16rem_1fr] bg-background text-foreground">
      <aside className="flex flex-col border-r border-border bg-card/40 px-4 py-6">
        <NavLink
          to="/"
          className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight"
        >
          <Wrench className="h-5 w-5" />
          {t('sidebar.brand')}
        </NavLink>

        <nav className="flex flex-col gap-5">
          {groups.map((cat) => (
            <div key={cat.slug}>
              <div className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {t(`categories.${cat.slug}.name`)}
              </div>
              <div className="flex flex-col gap-0.5">
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
            </div>
          ))}
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
