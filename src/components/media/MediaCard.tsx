import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Scissors, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { fmtTime } from '@/lib/ffmpeg'

export type MediaItem = {
  id: string
  file: File
  url: string
  isAudio: boolean
  duration: number | null
  inSec: number
  outSec: number | null
}

export function MediaCard({
  item,
  onUpdate,
  onRemove,
}: {
  item: MediaItem
  onUpdate: (patch: Partial<MediaItem>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onLoaded = () => onUpdate({ duration: el.duration || null })
    const onTime = () => setCurrentTime(el.currentTime)
    el.addEventListener('loadedmetadata', onLoaded)
    el.addEventListener('timeupdate', onTime)
    return () => {
      el.removeEventListener('loadedmetadata', onLoaded)
      el.removeEventListener('timeupdate', onTime)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url])

  const setIn = () => {
    const t = ref.current?.currentTime ?? 0
    if (item.outSec != null && t >= item.outSec) return
    onUpdate({ inSec: t })
  }
  const setOut = () => {
    const t = ref.current?.currentTime ?? 0
    if (t <= item.inSec) return
    onUpdate({ outSec: t })
  }
  const reset = () =>
    onUpdate({ inSec: 0, outSec: item.duration })

  const effectiveOut = item.outSec ?? item.duration ?? 0
  const trimmedDuration = Math.max(0, effectiveOut - item.inSec)

  return (
    <Card className="overflow-hidden p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={item.file.name}>
            {item.file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {(item.file.size / 1024 / 1024).toFixed(2)} MB ·{' '}
            {item.file.type || '?'}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 overflow-hidden rounded-md bg-black">
        {item.isAudio ? (
          <audio
            ref={ref as React.RefObject<HTMLAudioElement>}
            src={item.url}
            controls
            className="w-full"
          />
        ) : (
          <video
            ref={ref as React.RefObject<HTMLVideoElement>}
            src={item.url}
            controls
            className="aspect-video w-full bg-black"
          />
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Stat label="In" value={fmtTime(item.inSec)} />
        <Stat
          label="Out"
          value={
            item.outSec != null
              ? fmtTime(item.outSec)
              : item.duration
                ? fmtTime(item.duration)
                : '—'
          }
        />
        <Stat label="Length" value={fmtTime(trimmedDuration)} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={setIn}>
          <Scissors className="h-3 w-3" />
          Set in @ {fmtTime(currentTime)}
        </Button>
        <Button size="sm" variant="secondary" onClick={setOut}>
          <Scissors className="h-3 w-3" />
          Set out @ {fmtTime(currentTime)}
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} className="ml-auto">
          <RotateCcw className="h-3 w-3" />
          {t('media.cardReset')}
        </Button>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-border bg-card/50 px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
