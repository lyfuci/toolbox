import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileJson, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from './Slider'
import type { OutputFormat } from '@/lib/image-editor/types'

type Props = {
  format: OutputFormat
  setFormat: (f: OutputFormat) => void
  quality: number
  setQuality: (q: number) => void
  onDownload: () => void
  onSaveProject: () => void
  onLoadProject: (file: File) => void
}

export function OutputPanel({
  format,
  setFormat,
  quality,
  setQuality,
  onDownload,
  onSaveProject,
  onLoadProject,
}: Props) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement | null>(null)
  return (
    <div className="space-y-5">
      <Section title={t('pages.imageEditor.format')}>
        <div className="grid grid-cols-3 gap-2">
          {(['png', 'jpeg', 'webp'] as OutputFormat[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={format === f ? 'default' : 'secondary'}
              onClick={() => setFormat(f)}
            >
              {f.toUpperCase()}
            </Button>
          ))}
        </div>
        {format !== 'png' && (
          <Slider
            label={t('pages.imageEditor.quality')}
            value={quality}
            min={1}
            max={100}
            unit="%"
            onChange={setQuality}
          />
        )}
      </Section>

      <Button onClick={onDownload} className="w-full">
        <Download className="h-4 w-4" />
        {t('common.download')}
      </Button>

      <Section title={t('pages.imageEditor.project')}>
        <Button size="sm" variant="secondary" onClick={onSaveProject} className="w-full">
          <FileJson className="h-4 w-4" />
          {t('pages.imageEditor.projectSave')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          className="w-full"
        >
          <FileUp className="h-4 w-4" />
          {t('pages.imageEditor.projectLoad')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onLoadProject(f)
            e.target.value = ''
          }}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground/70">{title}</Label>
      {children}
    </div>
  )
}
