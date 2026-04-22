import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Two-locale toggle: flips between en and zh-CN. If/when a third locale lands,
// swap this for a dropdown.
export function LanguageToggle() {
  const { i18n, t } = useTranslation()
  const resolved = i18n.resolvedLanguage ?? i18n.language
  const isZh = resolved.startsWith('zh')
  const nextLang = isZh ? 'en' : 'zh-CN'
  const label = isZh ? 'EN' : '中'
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={t('topbar.toggleLanguage')}
      onClick={() => i18n.changeLanguage(nextLang)}
      className="h-9 w-9 gap-1 text-xs font-medium"
      title={label}
    >
      <Languages className="h-4 w-4" />
    </Button>
  )
}
