import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DropZone({
  onFiles,
}: {
  onFiles: (files: File[]) => void
}) {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = (files: FileList | null) => {
    if (!files || !files.length) return
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith('video/') || f.type.startsWith('audio/'),
    )
    if (arr.length) onFiles(arr)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setOver(false)
    accept(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
        over
          ? 'border-foreground/50 bg-accent/40'
          : 'border-border bg-card/30 hover:bg-accent/20',
      )}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{t('media.dropZoneTitle')}</p>
      <p className="text-xs text-muted-foreground">{t('media.dropZoneSub')}</p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*"
        multiple
        hidden
        onChange={(e) => accept(e.target.files)}
      />
    </div>
  )
}
