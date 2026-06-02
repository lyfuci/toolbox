/**
 * Timeline → ffmpeg export. Builds a single `filter_complex` that composites
 * the whole project into one MP4. Pure: it emits the argv given the project and
 * the concrete input filenames, so it's unit-testable and validatable against a
 * real ffmpeg without a browser.
 *
 * Approach (the standard, robust one):
 *  - A black base canvas at the project W×H×fps for the full duration.
 *  - Each VIDEO clip: trim the source window, scale+pad to W×H (setsar=1),
 *    shift its PTS to its timelineStart, then overlay onto the running canvas
 *    gated by `enable='between(t, start, end)'`. Lower tracks first, upper
 *    tracks last so the top track wins.
 *  - Each AUDIO clip (from audio tracks AND the audio of video clips): atrim
 *    the window, reset PTS, delay by timelineStart (adelay, per-channel ms),
 *    apply volume, then amix all with normalize=0.
 *
 * Inputs are mapped by index in `inputOrder` (sourceId → -i position).
 */
import {
  type Project,
  type Clip,
  clipDuration,
  clipEnd,
  projectDuration,
} from './model'

export type ExportOptions = {
  /** Source id → ffmpeg input index (its position in the -i list). */
  inputIndex: Record<string, number>
  output: string
  crf?: number
  preset?: string
  audioBitrateK?: number
}

const f3 = (n: number) => n.toFixed(3)

/**
 * Build the full ffmpeg argv (excluding the leading `-i input` pairs, which the
 * caller writes from inputOrder). Returns { inputs, filterComplex, args } where
 * `args` is the complete command including `-i` pairs in inputIndex order.
 */
export function buildTimelineExport(
  project: Project,
  inputFiles: { sourceId: string; name: string; hasAudio?: boolean; hasVideo?: boolean }[],
  opts: Omit<ExportOptions, 'inputIndex'>,
): { args: string[]; filterComplex: string; hasAudio: boolean; hasVideo: boolean } {
  const total = projectDuration(project)
  const { width: W, height: H, fps } = project

  // Assign input indices from the provided file order, and remember which
  // sources actually carry an audio/video stream (so we never reference a
  // missing [idx:a] / [idx:v], which would make ffmpeg fail).
  const inputIndex: Record<string, number> = {}
  const srcHasAudio: Record<string, boolean> = {}
  const srcHasVideo: Record<string, boolean> = {}
  inputFiles.forEach((f, i) => {
    inputIndex[f.sourceId] = i
    srcHasAudio[f.sourceId] = f.hasAudio !== false
    srcHasVideo[f.sourceId] = f.hasVideo !== false
  })

  // Collect video chains separately so we only emit the base canvas when there
  // actually are video clips (an unconnected color source makes ffmpeg fail).
  const videoChains: string[] = []
  const videoTracks = project.tracks.filter((t) => t.kind === 'video' && !t.hidden)
  let lastVideoLabel = 'base'
  let vSeq = 0
  for (const track of videoTracks) {
    for (const clip of track.clips) {
      const idx = inputIndex[clip.sourceId]
      if (idx === undefined || !srcHasVideo[clip.sourceId]) continue
      const dur = clipDuration(clip)
      if (dur <= 0) continue
      const vlabel = `v${vSeq}`
      const start = clip.timelineStart
      const end = clipEnd(clip)
      // trim source window → reset PTS → shift to timelineStart → scale+pad.
      videoChains.push(
        `[${idx}:v]trim=${f3(clip.sourceIn)}:${f3(clip.sourceOut)},setpts=PTS-STARTPTS+${f3(start)}/TB,` +
          `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
          `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1[${vlabel}]`,
      )
      const outLabel = `ov${vSeq}`
      videoChains.push(
        `[${lastVideoLabel}][${vlabel}]overlay=enable='between(t,${f3(start)},${f3(end)})'[${outLabel}]`,
      )
      lastVideoLabel = outLabel
      vSeq++
    }
  }
  const hasVideo = vSeq > 0

  const chains: string[] = []
  if (hasVideo) {
    chains.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${f3(Math.max(total, 0.04))}[base]`)
    chains.push(...videoChains)
  }

  // ── Audio ──────────────────────────────────────────────────────────────────
  // Audio comes from audio-track clips, plus the audio of video-track clips
  // whose source has audio (unless the track is muted).
  const audioLabels: string[] = []
  let aSeq = 0
  const addAudioClip = (clip: Clip, muted: boolean | undefined) => {
    if (muted) return
    const idx = inputIndex[clip.sourceId]
    if (idx === undefined || !srcHasAudio[clip.sourceId]) return
    const dur = clipDuration(clip)
    if (dur <= 0) return
    const delayMs = Math.round(clip.timelineStart * 1000)
    const vol = clip.volume ?? 1
    const label = `a${aSeq}`
    chains.push(
      `[${idx}:a]atrim=${f3(clip.sourceIn)}:${f3(clip.sourceOut)},asetpts=PTS-STARTPTS,` +
        `adelay=${delayMs}|${delayMs},volume=${vol}[${label}]`,
    )
    audioLabels.push(`[${label}]`)
    aSeq++
  }
  for (const track of project.tracks) {
    if (track.kind === 'audio') {
      for (const clip of track.clips) addAudioClip(clip, track.muted)
    } else {
      // video track: include its clips' audio unless track muted
      for (const clip of track.clips) addAudioClip(clip, track.muted)
    }
  }
  const hasAudio = audioLabels.length > 0
  if (hasAudio) {
    // normalize=0 so adding tracks doesn't attenuate the mix.
    chains.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:normalize=0[aout]`)
  }

  const filterComplex = chains.join(';')

  // ── Assemble argv ──────────────────────────────────────────────────────────
  const args: string[] = []
  for (const f of inputFiles) args.push('-i', f.name)
  args.push('-filter_complex', filterComplex)
  if (hasVideo) args.push('-map', `[${lastVideoLabel}]`)
  if (hasAudio) args.push('-map', '[aout]')
  if (hasVideo) {
    args.push(
      '-c:v', 'libx264',
      '-preset', opts.preset ?? 'veryfast',
      '-crf', String(opts.crf ?? 23),
      '-pix_fmt', 'yuv420p',
    )
  }
  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', `${opts.audioBitrateK ?? 192}k`)
  }
  // Bound the output to the timeline length.
  args.push('-t', f3(Math.max(total, 0.04)), '-movflags', '+faststart', opts.output)
  return { args, filterComplex, hasAudio, hasVideo }
}
