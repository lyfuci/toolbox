import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus } from 'lucide-react'

export function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onFile(f)
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
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-16 text-center transition-colors ${
        over
          ? 'border-foreground/50 bg-accent/40'
          : 'border-border bg-card/30 hover:bg-accent/20'
      }`}
    >
      <ImagePlus className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm font-medium">{t('pages.imageEditor.dropTitle')}</p>
      <p className="text-xs text-muted-foreground">{t('pages.imageEditor.dropSub')}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
