import { useTranslation } from 'react-i18next'
import {
  Download,
  FileJson,
  FileUp,
  ImagePlus,
  Maximize2,
  Minimize2,
  Redo2,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRef } from 'react'
import { FieldTooltip } from '@/components/FieldTooltip'
import type { OutputFormat } from '@/lib/image-editor/types'

type Props = {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void

  format: OutputFormat
  setFormat: (f: OutputFormat) => void
  quality: number
  setQuality: (q: number) => void
  onDownload: () => void

  onSaveProject: () => void
  onLoadProject: (file: File) => void
  onReplaceImage: () => void

  focused: boolean
  toggleFocus: () => void
}

/**
 * Top action bar (PS menu-bar-like). Houses the everyday actions: undo / redo,
 * format + quality + download, project save/load, replace image, focus mode.
 * Stays compact on narrow viewports by hiding the quality slider to overflow.
 */
export function TopActionBar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  format,
  setFormat,
  quality,
  setQuality,
  onDownload,
  onSaveProject,
  onLoadProject,
  onReplaceImage,
  focused,
  toggleFocus,
}: Props) {
  const { t } = useTranslation()
  const projectInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card/40 px-3 py-2">
      {/* Undo / Redo */}
      <Button size="sm" variant="ghost" disabled={!canUndo} onClick={onUndo} title="Cmd/Ctrl+Z">
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" disabled={!canRedo} onClick={onRedo} title="Cmd/Ctrl+Shift+Z">
        <Redo2 className="h-4 w-4" />
      </Button>

      <Separator />

      {/* File ops */}
      <Button size="sm" variant="ghost" onClick={onReplaceImage} title={t('pages.imageEditor.replaceImage')}>
        <ImagePlus className="h-4 w-4" />
        <span className="hidden text-xs sm:inline">{t('pages.imageEditor.replaceImage')}</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onSaveProject}
        title={t('pages.imageEditor.projectSave')}
      >
        <FileJson className="h-4 w-4" />
        <span className="hidden text-xs sm:inline">{t('pages.imageEditor.projectSave')}</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => projectInputRef.current?.click()}
        title={t('pages.imageEditor.projectLoad')}
      >
        <FileUp className="h-4 w-4" />
        <span className="hidden text-xs sm:inline">{t('pages.imageEditor.projectLoad')}</span>
      </Button>
      <input
        ref={projectInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onLoadProject(f)
          e.target.value = ''
        }}
      />

      <div className="ml-auto flex items-center gap-2">
        {/* Format + quality */}
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as OutputFormat)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
        {format !== 'png' && (
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">{t('pages.imageEditor.quality')}</label>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-20 accent-primary"
              title={`${quality}%`}
            />
            <span className="w-7 font-mono text-[11px] text-foreground">{quality}</span>
          </div>
        )}
        <Button size="sm" onClick={onDownload}>
          <Download className="h-4 w-4" />
          {t('common.download')}
        </Button>

        <Separator />

        {/* Focus mode toggle */}
        <FieldTooltip body={focused ? t('pages.imageEditor.focusExitHint') : t('pages.imageEditor.focusEnterHint')} underline={false}>
          <Button size="sm" variant="ghost" onClick={toggleFocus}>
            {focused ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="text-xs">
              {focused ? t('pages.imageEditor.exitFullscreen') : t('pages.imageEditor.fullscreen')}
            </span>
          </Button>
        </FieldTooltip>
      </div>
    </div>
  )
}

function Separator() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />
}
