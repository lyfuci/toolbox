import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Pure CSS visibility for the icon — hides one or the other based on the
 * `html.dark` class that next-themes toggles. Avoids the read-state-in-effect
 * dance and the brief icon flicker on first paint.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useTranslation()
  const toggle = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={t('topbar.toggleTheme')}
      className="h-9 w-9"
    >
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </Button>
  )
}
