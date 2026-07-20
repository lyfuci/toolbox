import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Loader2, Play, Pause, Download, Trash2, Plus, Film, Music, ZoomIn, ZoomOut, Wand2,
  ChevronFirst, ChevronLast, StepBack, StepForward, Maximize2, Minimize2, Keyboard,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { DropZone } from '@/components/media/DropZone'
import { OutputView, type OutputResult } from '@/components/media/OutputView'
import { QuickToolsDialog } from '@/components/media/QuickToolsDialog'
import { MediaShortcutsDialog } from '@/components/media/MediaShortcutsDialog'
import { useTimeline } from '@/components/media/timeline/useTimeline'
import { useTimelinePlayer } from '@/components/media/timeline/useTimelinePlayer'
import { useMediaShortcuts } from '@/components/media/timeline/useMediaShortcuts'
import { Timeline } from '@/components/media/timeline/Timeline'
import { probeSource } from '@/components/media/timeline/probe-source'
import { getFFmpeg } from '@/lib/ffmpeg'
import { formatTC, frameDuration } from '@/lib/timeline/timecode'
import { clipDuration } from '@/lib/timeline/model'
import { runTimelineExport } from '@/lib/timeline/run-export'

type ExportState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'exporting'; progress: number }

// Snap epsilon for boundary navigation — treats "at a boundary" as within a
// third of a frame so Up/Down don't get stuck re-selecting the current edge.
const EPS = 0.001

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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    return () => {
      for (const s of Object.values(tl.sources)) URL.revokeObjectURL(s.url)
      if (output) URL.revokeObjectURL(output.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sourceList = useMemo(() => Object.values(tl.sources), [tl.sources])
  const fps = tl.project.fps
  const hasContent = sourceList.length > 0

  // All distinct clip edges (+ 0 and end) for Up/Down playhead navigation.
  const boundaries = useMemo(() => {
    const set = new Set<number>([0, tl.duration])
    for (const tr of tl.project.tracks) {
      for (const c of tr.clips) {
        set.add(c.timelineStart)
        set.add(c.timelineStart + clipDuration(c))
      }
    }
    return [...set].filter((n) => n >= 0).sort((a, b) => a - b)
  }, [tl.project, tl.duration])

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

  // ── Transport ──────────────────────────────────────────────────────────
  const stepFrame = (dir: 1 | -1) => seek(time + dir * frameDuration(fps))
  const stepSecond = (dir: 1 | -1) => seek(time + dir)
  const goStart = () => seek(0)
  // Land one frame shy of the very end so the last real frame shows (clipAt
  // treats clip ends as exclusive, so exactly-at-duration paints black).
  const goEnd = () => seek(Math.max(0, playerDuration - frameDuration(fps)))
  const stepBoundary = (dir: 1 | -1) => {
    const next =
      dir === 1
        ? boundaries.find((b) => b > time + EPS)
        : [...boundaries].reverse().find((b) => b < time - EPS)
    if (next != null) seek(next)
  }
  const zoom = (dir: 1 | -1) => setPxPerSec((p) => Math.min(160, Math.max(10, p + dir * 10)))
  const togglePlay = () => (playing ? pause() : play())

  useMediaShortcuts({
    enabled: hasContent,
    focused,
    onPlayPause: togglePlay,
    onStepFrame: stepFrame,
    onStepSecond: stepSecond,
    onStepClipBoundary: stepBoundary,
    onGoStart: goStart,
    onGoEnd: goEnd,
    onZoom: zoom,
    onToggleFullscreen: () => setFocused((v) => !v),
    onExitFullscreen: () => setFocused(false),
    onToggleHelp: () => setShortcutsOpen((v) => !v),
  })

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

  // Blur transport buttons after click so a following Space hits the global
  // play/pause handler instead of re-activating the focused button.
  const tap = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    fn()
    e.currentTarget.blur()
  }

  const rootClass = focused
    ? 'fixed inset-0 z-50 flex flex-col bg-background'
    : 'mx-auto max-w-7xl px-8 py-12'

  return (
    <div className={rootClass} data-nle="">
      <header
        className={cn(
          'flex items-start justify-between gap-4',
          focused ? 'shrink-0 border-b border-border px-4 py-2' : 'mb-6',
        )}
      >
        <div className="min-w-0">
          <h1 className={cn('font-semibold tracking-tight', focused ? 'text-base' : 'text-2xl')}>
            {t('tools.media.name')}
          </h1>
          {!focused && <p className="mt-1 text-sm text-muted-foreground">{t('media.description')}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShortcutsOpen(true)}
            title={t('media.shortcuts.title') + ' (?)'}
          >
            <Keyboard className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setQuickOpen(true)}>
            <Wand2 className="mr-1 h-4 w-4" />
            {t('media.quick.title')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFocused((v) => !v)}
            title={t(focused ? 'media.exitFullscreen' : 'media.fullscreen') + ' (F)'}
          >
            {focused ? <Minimize2 className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
            {t(focused ? 'media.exitFullscreen' : 'media.fullscreen')}
          </Button>
        </div>
      </header>

      <QuickToolsDialog open={quickOpen} onOpenChange={setQuickOpen} />
      <MediaShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {!hasContent ? (
        <div className={cn(focused && 'min-h-0 flex-1 overflow-auto p-4')}>
          <DropZone onFiles={onFiles} />
        </div>
      ) : (
        <div className={cn('space-y-4', focused && 'flex min-h-0 flex-1 flex-col overflow-hidden p-4')}>
          {/* Preview + transport */}
          <div
            className={cn(
              'grid gap-4',
              focused ? 'min-h-0 flex-1 lg:grid-cols-[1fr_280px]' : 'lg:grid-cols-[1fr_260px]',
            )}
          >
            <div
              className={cn(
                'flex flex-col items-center rounded-lg border border-border bg-black/60 p-3',
                focused && 'min-h-0',
              )}
            >
              <div className={cn('flex w-full items-center justify-center', focused && 'min-h-0 flex-1')}>
                <canvas
                  ref={canvasRef}
                  width={tl.project.width}
                  height={tl.project.height}
                  className={cn(
                    'w-auto max-w-full rounded bg-black object-contain',
                    focused ? 'max-h-full' : 'max-h-[360px]',
                  )}
                  style={{ aspectRatio: `${tl.project.width} / ${tl.project.height}` }}
                />
              </div>
              <div className="mt-3 flex w-full items-center gap-2">
                <div className="flex items-center gap-0.5">
                  <Button size="icon" variant="ghost" onClick={tap(goStart)} title={t('media.transport.start')}>
                    <ChevronFirst className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={tap(() => stepFrame(-1))} title={t('media.transport.stepBack')}>
                    <StepBack className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="secondary" onClick={tap(togglePlay)} title={t('media.transport.playPause')}>
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={tap(() => stepFrame(1))} title={t('media.transport.stepFwd')}>
                    <StepForward className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={tap(goEnd)} title={t('media.transport.end')}>
                    <ChevronLast className="h-4 w-4" />
                  </Button>
                </div>
                <span className="ml-1 font-mono text-xs tabular-nums text-foreground/90">
                  {formatTC(time, fps)}
                  <span className="text-muted-foreground"> / {formatTC(playerDuration, fps)}</span>
                </span>
                <div className="ml-auto flex items-center gap-0.5">
                  <Button size="icon" variant="ghost" onClick={() => zoom(-1)} title={t('media.timeline.zoomOut')}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => zoom(1)} title={t('media.timeline.zoomIn')}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Source bin + clip inspector */}
            <div className={cn('space-y-3', focused && 'min-h-0 overflow-y-auto')}>
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
          <div className={cn(focused && 'shrink-0')}>
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
          </div>

          {/* Add-track + export */}
          <div className={cn('flex flex-wrap items-center gap-3', focused && 'shrink-0')}>
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
