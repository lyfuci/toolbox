import { NavLink, Outlet } from 'react-router'
import { MessageSquarePlus, Wrench } from 'lucide-react'
import { tools } from '@/lib/tools'
import { cn } from '@/lib/utils'
import { useGAPageview } from '@/hooks/useGAPageview'

export function Layout() {
  useGAPageview()

  return (
    <div className="grid min-h-svh grid-cols-[16rem_1fr] bg-background text-foreground">
      <aside className="flex flex-col border-r border-border bg-card/40 px-4 py-6">
        <NavLink
          to="/"
          className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight"
        >
          <Wrench className="h-5 w-5" />
          Toolbox
        </NavLink>

        <nav className="flex flex-col gap-1">
          {tools.map((tool) => {
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
                {tool.name}
              </NavLink>
            )
          })}
        </nav>

        <a
          href="https://github.com/lyfuci/toolbox/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <MessageSquarePlus className="h-4 w-4" />
          反馈 / 提建议
        </a>
      </aside>

      <main className="overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
