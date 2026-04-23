import { useTranslation } from 'react-i18next'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FullscreenToggle({
  isFullscreen,
  onToggle,
}: {
  isFullscreen: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onToggle}
      title={t(isFullscreen ? 'pages.imageEditor.exitFullscreen' : 'pages.imageEditor.fullscreen')}
    >
      {isFullscreen ? (
        <Minimize2 className="h-4 w-4" />
      ) : (
        <Maximize2 className="h-4 w-4" />
      )}
      {isFullscreen
        ? t('pages.imageEditor.exitFullscreen')
        : t('pages.imageEditor.fullscreen')}
    </Button>
  )
}
