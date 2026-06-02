import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Play, Pause, Download, Trash2, Plus, Film, Music, ZoomIn, ZoomOut, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DropZone } from '@/components/media/DropZone'
import { OutputView, type OutputResult } from '@/components/media/OutputView'
import { QuickToolsDialog } from '@/components/media/QuickToolsDialog'
import { useTimeline } from '@/components/media/timeline/useTimeline'
import { useTimelinePlayer } from '@/components/media/timeline/useTimelinePlayer'
import { Timeline } from '@/components/media/timeline/Timeline'
import { probeSource } from '@/components/media/timeline/probe-source'
import { getFFmpeg, fmtTime } from '@/lib/ffmpeg'
import { runTimelineExport } from '@/lib/timeline/run-export'

type ExportState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'exporting'; progress: number }

export function MediaPage() {
  const { t } = useTranslation()
  const tl = useTimeline()
  const { canvasRef, playing, time, duration: playerDuration, play, pause, seek } = useTimelinePlayer(
    tl.project,
    tl.sources,
  )
  const [pxPerSec, setPxPerSec] = useState(40)
  const [exp, setExp] = useState<ExportState>({ kind: 'idle' })
  const [output, setOutput] = useState<OutputResult | null>(null)
  const [crf, setCrf] = useState(23)
  const [quickOpen, setQuickOpen] = useState(false)

  useEffect(() => {
    return () => {
      for (const s of Object.values(tl.sources)) URL.revokeObjectURL(s.url)
      if (output) URL.revokeObjectURL(output.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sourceList = useMemo(() => Object.values(tl.sources), [tl.sources])

  const onFiles = async (files: File[]) => {
    for (const file of files) {
      if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
        toast.error(t('media.timeline.errNotMedia', { name: file.name }))
        continue
      }
      const src = await probeSource(file)
      tl.addSource(src)
      tl.addClipFromSource(src)
    }
  }

  const doExport = async () => {
    if (exp.kind !== 'idle') return
    if (tl.duration <= 0) {
      toast.error(t('media.timeline.errEmpty'))
      return
    }
    pause()
    setExp({ kind: 'loading' })
    try {
      await getFFmpeg()
      setExp({ kind: 'exporting', progress: 0 })
      const blob = await runTimelineExport(
        tl.project,
        sourceList.map((s) => ({ sourceId: s.id, file: s.file, hasAudio: s.hasAudio, hasVideo: s.hasVideo })),
        {
          crf,
          preset: 'veryfast',
          onProgress: (r) => setExp({ kind: 'exporting', progress: r }),
          onLog: (l) => console.info('[ffmpeg]', l.message),
        },
      )
      if (output) URL.revokeObjectURL(output.url)
      setOutput({ url: URL.createObjectURL(blob), filename: 'timeline.mp4', mime: 'video/mp4', size: blob.size })
      toast.success(t('media.processingDone'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { duration: 8000 })
    } finally {
      setExp({ kind: 'idle' })
    }
  }

  const selectedClip = useMemo(() => {
    for (const tr of tl.project.tracks) {
      const c = tr.clips.find((x) => x.id === tl.selectedClipId)
      if (c) return c
    }
    return null
  }, [tl.project, tl.selectedClipId])

  const busy = exp.kind !== 'idle'
  const hasContent = sourceList.length > 0

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('tools.media.name')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('media.description')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setQuickOpen(true)} className="shrink-0">
          <Wand2 className="mr-1 h-4 w-4" />
          {t('media.quick.title')}
        </Button>
      </header>

      <QuickToolsDialog open={quickOpen} onOpenChange={setQuickOpen} />

      {!hasContent ? (
        <DropZone onFiles={onFiles} />
      ) : (
        <div className="space-y-4">
          {/* Preview + transport */}
          <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <div className="flex flex-col items-center rounded-lg border border-border bg-black/60 p-3">
              <canvas
                ref={canvasRef}
                width={tl.project.width}
                height={tl.project.height}
                className="max-h-[360px] w-auto max-w-full rounded bg-black"
                style={{ aspectRatio: `${tl.project.width} / ${tl.project.height}` }}
              />
              <div className="mt-3 flex w-full items-center gap-3">
                <Button size="icon" variant="secondary" onClick={() => (playing ? pause() : play())}>
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <span className="font-mono text-xs text-muted-foreground">
                  {fmtTime(time)} / {fmtTime(playerDuration)}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setPxPerSec((p) => Math.max(10, p - 10))} title={t('media.timeline.zoomOut')}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setPxPerSec((p) => Math.min(160, p + 10))} title={t('media.timeline.zoomIn')}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Source bin + clip inspector */}
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-card/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t('media.timeline.sources')}</Label>
                  <label className="cursor-pointer text-xs text-primary hover:underline">
                    <Plus className="mr-0.5 inline h-3 w-3" />
                    {t('media.timeline.addMedia')}
                    <input
                      type="file"
                      accept="video/*,audio/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        if (e.target.files) onFiles([...e.target.files])
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
                <ul className="space-y-1">
                  {sourceList.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-xs">
                      {s.hasVideo ? <Film className="h-3 w-3 shrink-0 text-sky-400" /> : <Music className="h-3 w-3 shrink-0 text-emerald-400" />}
                      <span className="truncate" title={s.name}>{s.name}</span>
                      <button
                        type="button"
                        onClick={() => tl.addClipFromSource(s.id)}
                        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                        title={t('media.timeline.appendClip')}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {selectedClip && (
                <div className="rounded-lg border border-border bg-card/40 p-3">
                  <Label className="mb-2 block text-xs text-muted-foreground">{t('media.timeline.clipProps')}</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">{t('media.timeline.volume')}</Label>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={selectedClip.volume ?? 1}
                      onChange={(e) => tl.setClipVolume(selectedClip.id, Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="w-8 text-right font-mono text-xs">{((selectedClip.volume ?? 1) * 100).toFixed(0)}%</span>
                  </div>
                  <Button size="sm" variant="ghost" className="mt-2 text-destructive" onClick={() => tl.removeClip(selectedClip.id)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    {t('media.timeline.deleteClip')}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <Timeline
            project={tl.project}
            sources={tl.sources}
            pxPerSec={pxPerSec}
            time={time}
            selectedClipId={tl.selectedClipId}
            onSeek={seek}
            onSelectClip={tl.setSelectedClipId}
            onMoveClip={tl.moveClip}
            onTrimClip={tl.trimClip}
            onToggleMute={tl.toggleTrackMute}
          />

          {/* Add-track + export */}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => tl.addTrack('video')}>
              <Film className="mr-1 h-4 w-4" /> {t('media.timeline.addVideoTrack')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => tl.addTrack('audio')}>
              <Music className="mr-1 h-4 w-4" /> {t('media.timeline.addAudioTrack')}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('media.crf')}</Label>
              <input type="range" min={18} max={32} value={crf} onChange={(e) => setCrf(Number(e.target.value))} className="w-28 accent-primary" disabled={busy} />
              <span className="w-6 font-mono text-xs">{crf}</span>
              <Button onClick={doExport} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                {t('media.timeline.export')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-card/50 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {exp.kind === 'loading'
              ? t('media.loadingCore')
              : t('media.timeline.exporting', { percent: (exp.progress * 100).toFixed(0) })}
          </span>
          {exp.kind === 'exporting' && (
            <div className="ml-auto h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${exp.progress * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {output && !busy && (
        <div className="mt-6">
          <OutputView result={output} onClear={() => { URL.revokeObjectURL(output.url); setOutput(null) }} />
        </div>
      )}
    </div>
  )
}
