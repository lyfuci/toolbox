import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { TFunction } from 'i18next'
import type { Action, EditorState } from '../types'

type HistoryAPI = {
  set: (s: EditorState) => void
}

/**
 * Strip the `actions` field off a state snapshot before storing it inside
 * an Action's steps. Stops actions from nesting recursively (an action that
 * captures the current state should not also capture every prior action).
 */
export function stripActions(s: EditorState): EditorState {
  if (!s.actions) return s
  const { actions: _omit, ...rest } = s
  void _omit
  return rest
}

/**
 * useActionHandlers — bundles the actions-panel state + handlers. Returns
 * the read-only UI signals (isRecording / step counter / current name) and
 * the dispatch functions consumed by ActionsPanel.
 *
 * Recording lives on a ref so the state-change effect can append without
 * triggering its own re-render; React state mirrors the step count for the
 * UI badge.
 */
export function useActionHandlers(
  state: EditorState,
  history: HistoryAPI,
  t: TFunction,
) {
  const recordingRef = useRef<{ name: string; steps: EditorState[] } | null>(null)
  const [recordingName, setRecordingName] = useState<string | undefined>(undefined)
  const [stepCount, setStepCount] = useState(0)
  const lastRecordedRef = useRef<EditorState | null>(null)
  // Guards the state-change recorder from capturing its own playback frames
  // when the user hits Play on a multi-step action while a recording is
  // active. Otherwise replay would feed back into the open recording.
  const playbackInProgressRef = useRef(false)

  useEffect(() => {
    const rec = recordingRef.current
    if (!rec) return
    if (playbackInProgressRef.current) return
    if (lastRecordedRef.current === state) return
    rec.steps.push(stripActions(state))
    lastRecordedRef.current = state
    setStepCount(rec.steps.length)
  }, [state])

  const handleSaveSnapshot = useCallback(
    (name: string) => {
      const action: Action = {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        steps: [stripActions(state)],
      }
      history.set({ ...state, actions: [...(state.actions ?? []), action] })
      toast.success(t('pages.imageEditor.actions.snapshotSaved'))
    },
    [state, history, t],
  )

  const handleStartRecording = useCallback(
    (name: string) => {
      recordingRef.current = { name, steps: [stripActions(state)] }
      lastRecordedRef.current = state
      setRecordingName(name)
      setStepCount(1)
      toast.message(t('pages.imageEditor.actions.recordStarted'))
    },
    [state, t],
  )

  const handleStopRecording = useCallback(() => {
    const rec = recordingRef.current
    if (!rec) return
    recordingRef.current = null
    setRecordingName(undefined)
    setStepCount(0)
    if (rec.steps.length < 2) {
      toast.message(t('pages.imageEditor.actions.recordEmpty'))
      return
    }
    const action: Action = {
      id: crypto.randomUUID(),
      name: rec.name,
      createdAt: new Date().toISOString(),
      steps: rec.steps,
    }
    history.set({ ...state, actions: [...(state.actions ?? []), action] })
    toast.success(t('pages.imageEditor.actions.recordSaved', { n: rec.steps.length }))
  }, [state, history, t])

  const handleCancelRecording = useCallback(() => {
    recordingRef.current = null
    setRecordingName(undefined)
    setStepCount(0)
    toast.message(t('pages.imageEditor.actions.recordCancelled'))
  }, [t])

  const handlePlayAction = useCallback(
    (id: string) => {
      const action = state.actions?.find((a) => a.id === id)
      if (!action || action.steps.length === 0) return
      // Flip the playback guard so the recorder effect skips intermediate
      // playback frames. Otherwise replaying a multi-step action while
      // recording would feed those frames back into the open recording.
      playbackInProgressRef.current = true
      if (action.steps.length === 1) {
        history.set({ ...action.steps[0], actions: state.actions })
        toast.success(t('pages.imageEditor.actions.played', { name: action.name }))
        // 1-step replay finishes synchronously after the React commit; clear
        // the guard in a microtask so the recorder picks up subsequent
        // *user* edits again.
        queueMicrotask(() => { playbackInProgressRef.current = false })
        return
      }
      const steps = action.steps
      const delay = 200
      steps.forEach((step, i) => {
        setTimeout(() => {
          history.set({ ...step, actions: state.actions })
        }, i * delay)
      })
      setTimeout(() => {
        playbackInProgressRef.current = false
        toast.success(t('pages.imageEditor.actions.played', { name: action.name }))
      }, steps.length * delay)
    },
    [state, history, t],
  )

  const handleDeleteAction = useCallback(
    (id: string) => {
      const next = (state.actions ?? []).filter((a) => a.id !== id)
      history.set({ ...state, actions: next })
    },
    [state, history],
  )

  return {
    isRecording: recordingName !== undefined,
    recordingName,
    stepCount,
    handleSaveSnapshot,
    handleStartRecording,
    handleStopRecording,
    handleCancelRecording,
    handlePlayAction,
    handleDeleteAction,
  }
}
