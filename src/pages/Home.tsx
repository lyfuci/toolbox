import { Link } from 'react-router'
import { toolsByCategory } from '@/lib/tools'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function HomePage() {
  const groups = toolsByCategory()

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Toolbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A small set of personal frontend tools — everything runs in the browser.
        </p>
      </header>

      <div className="flex flex-col gap-10">
        {groups.map((cat) => (
          <section key={cat.slug}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold tracking-tight">{cat.name}</h2>
              {cat.description ? (
                <p className="text-xs text-muted-foreground">{cat.description}</p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cat.tools.map((tool) => {
                const Icon = tool.icon
                return (
                  <Link key={tool.slug} to={tool.path} className="group">
                    <Card className="h-full transition-colors group-hover:border-foreground/30 group-hover:bg-accent/40">
                      <CardHeader>
                        <Icon className="mb-3 h-6 w-6 text-muted-foreground group-hover:text-foreground" />
                        <CardTitle>{tool.name}</CardTitle>
                        <CardDescription>{tool.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
