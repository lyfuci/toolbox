import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Compact drop-zone used by Base64 / Hex / Hash / HMAC. Single-file: emits the
 * first file picked or dropped. Click anywhere on it to open the file picker.
 */
export function FileDrop({
  onFile,
  accept,
  className,
  label,
  hint,
}: {
  onFile: (file: File) => void
  accept?: string
  className?: string
  label?: ReactNode
  hint?: ReactNode
}) {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const acceptFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    onFile(files[0])
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setOver(false)
    acceptFiles(e.dataTransfer.files)
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
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
        over
          ? 'border-foreground/50 bg-accent/40'
          : 'border-border bg-card/30 hover:bg-accent/20',
        className,
      )}
    >
      <Upload className="h-7 w-7 text-muted-foreground" />
      <p className="text-sm font-medium">{label ?? t('common.dropFileLabel')}</p>
      <p className="text-xs text-muted-foreground">{hint ?? t('common.dropFileHint')}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          acceptFiles(e.target.files)
          // Reset so the same file can be picked twice in a row.
          e.target.value = ''
        }}
      />
    </div>
  )
}
