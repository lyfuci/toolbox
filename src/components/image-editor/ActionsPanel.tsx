import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Action } from '@/lib/image-editor/types'

/**
 * Actions panel — save the editor's current EditorState as a named action,
 * or start a multi-step recording that captures every history-set call until
 * stopped. Playing a 1-step action restores instantly; multi-step actions
 * replay with a small delay so the progression is visible.
 *
 * Limitation: snapshots store layer + selection / crop / etc., but not the
 * image pixels themselves (those live outside EditorState). Replaying an
 * action that references a layer id that no longer exists will leave the
 * canvas in an undefined state; in practice the user is expected to use
 * actions within the same document.
 */
type Props = {
  actions: Action[]
  /** True while a recording is in progress. */
  isRecording: boolean
  recordingName?: string
  recordingStepCount: number
  onSaveSnapshot: (name: string) => void
  onStartRecording: (name: string) => void
  onStopRecording: () => void
  onCancelRecording: () => void
  onPlayAction: (id: string) => void
  onDeleteAction: (id: string) => void
}

export function ActionsPanel({
  actions,
  isRecording,
  recordingName,
  recordingStepCount,
  onSaveSnapshot,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onPlayAction,
  onDeleteAction,
}: Props) {
  const { t } = useTranslation()
  const [drafting, setDrafting] = useState<'snapshot' | 'record' | null>(null)
  const [draftName, setDraftName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const commitDraft = () => {
    const name = draftName.trim()
    if (!name) return
    if (drafting === 'snapshot') onSaveSnapshot(name)
    if (drafting === 'record') onStartRecording(name)
    setDrafting(null)
    setDraftName('')
  }

  return (
    <div className="pf-panel-body" style={{ padding: 8 }}>
      {isRecording && (
        <div className="mb-2 flex items-center justify-between rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px]">
          <span>
            ● {t('pages.imageEditor.actions.recording', {
              name: recordingName,
              n: recordingStepCount,
            })}
          </span>
          <span className="flex gap-1">
            <button
              onClick={onStopRecording}
              className="rounded border border-input bg-background px-2 py-0.5 hover:bg-accent/40"
            >
              {t('pages.imageEditor.actions.stop')}
            </button>
            <button
              onClick={onCancelRecording}
              className="text-muted-foreground hover:text-destructive"
            >
              ×
            </button>
          </span>
        </div>
      )}
      {!isRecording && (
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            onClick={() => {
              setDrafting('snapshot')
              setDraftName(
                t('pages.imageEditor.actions.defaultSnapshot', { n: actions.length + 1 }),
              )
              setTimeout(() => inputRef.current?.focus(), 0)
            }}
            className="flex-1 rounded border border-input bg-background px-2 py-0.5 text-[10px] hover:bg-accent/40"
          >
            + {t('pages.imageEditor.actions.saveSnapshot')}
          </button>
          <button
            onClick={() => {
              setDrafting('record')
              setDraftName(
                t('pages.imageEditor.actions.defaultRecording', { n: actions.length + 1 }),
              )
              setTimeout(() => inputRef.current?.focus(), 0)
            }}
            className="flex-1 rounded border border-input bg-background px-2 py-0.5 text-[10px] hover:bg-accent/40"
          >
            ● {t('pages.imageEditor.actions.record')}
          </button>
        </div>
      )}
      {drafting && (
        <div className="mb-2 flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft()
              if (e.key === 'Escape') {
                setDrafting(null)
                setDraftName('')
              }
            }}
            className="h-6 flex-1 rounded border border-input bg-background px-1 text-xs"
          />
          <button
            onClick={commitDraft}
            className="rounded border border-input bg-background px-2 py-0.5 text-[10px] hover:bg-accent/40"
          >
            ✓
          </button>
        </div>
      )}
      {actions.length === 0 && !isRecording && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          {t('pages.imageEditor.actions.empty')}
        </div>
      )}
      {actions.length > 0 && (
        <ul className="space-y-1">
          {actions.map((a) => (
            <li
              key={a.id}
              className="group flex items-center justify-between rounded border border-border/60 bg-background/40 px-2 py-1 text-xs hover:bg-accent/20"
            >
              <span className="min-w-0 truncate" title={a.name}>
                {a.steps.length > 1 ? `[${a.steps.length}] ` : ''}
                {a.name}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onPlayAction(a.id)}
                  className="rounded border border-input bg-background px-1.5 py-0.5 text-[10px] hover:bg-accent/40"
                  title={t('pages.imageEditor.actions.play')}
                >
                  ▶
                </button>
                <button
                  onClick={() => onDeleteAction(a.id)}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  title={t('pages.imageEditor.actions.delete')}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
