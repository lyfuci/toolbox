import type { LoadedSource } from './useTimeline'
import { newId } from '@/lib/timeline/model'

/**
 * Probe a media File in the browser to discover duration, dimensions and
 * whether it carries video/audio — using a native element (no ffmpeg needed
 * just to inspect). Audio presence is inferred: audio/* MIME, or a video whose
 * element reports audio tracks where available (best-effort, defaults to true
 * for video since most clips have audio).
 */
export function probeSource(file: File): Promise<LoadedSource> {
  const url = URL.createObjectURL(file)
  const isVideo = file.type.startsWith('video/')
  const isAudio = file.type.startsWith('audio/')

  return new Promise((resolve) => {
    const el = document.createElement(isVideo ? 'video' : 'audio') as HTMLVideoElement
    el.preload = 'metadata'
    el.src = url
    const finish = (extra: Partial<LoadedSource>) => {
      resolve({
        id: newId('src'),
        name: file.name,
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        hasVideo: isVideo,
        hasAudio: isAudio || isVideo, // assume video clips have audio
        file,
        url,
        ...extra,
      })
    }
    el.onloadedmetadata = () => {
      // Detect audio tracks where the API exists.
      let hasAudio = isAudio || isVideo
      const withTracks = el as unknown as { mozHasAudio?: boolean; audioTracks?: { length: number } }
      if (typeof withTracks.mozHasAudio === 'boolean') hasAudio = withTracks.mozHasAudio
      else if (withTracks.audioTracks) hasAudio = withTracks.audioTracks.length > 0
      finish({
        width: isVideo ? el.videoWidth || undefined : undefined,
        height: isVideo ? el.videoHeight || undefined : undefined,
        hasAudio,
      })
    }
    el.onerror = () => finish({})
  })
}
