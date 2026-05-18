import { useTranslation } from 'react-i18next'

/**
 * History panel. Renders a flat list of timeline entries — past (greyed),
 * present (highlighted), undone-redoable (italic) — and lets the user
 * jump to any index. We don't currently capture per-step labels (the
 * editor's actions don't tag their history pushes), so the panel shows
 * indexed entries; a future revision can pass labels through.
 */
type Props = {
  totalLength: number
  currentIndex: number
  onJumpTo: (index: number) => void
}

export function HistoryPanel({ totalLength, currentIndex, onJumpTo }: Props) {
  const { t } = useTranslation()
  if (totalLength <= 1) {
    return (
      <div className="pf-panel-body" style={{ padding: 8 }}>
        <div className="text-xs text-muted-foreground">
          {t('pages.imageEditor.history.empty')}
        </div>
      </div>
    )
  }
  // Render newest-first (PS convention — top of panel = most recent).
  const entries: number[] = []
  for (let i = totalLength - 1; i >= 0; i--) entries.push(i)
  return (
    <div className="pf-panel-body" style={{ padding: 0 }}>
      <ul className="flex flex-col gap-px p-1">
        {entries.map((idx) => {
          const isCurrent = idx === currentIndex
          const isPast = idx < currentIndex
          const isFuture = idx > currentIndex
          return (
            <li
              key={idx}
              onClick={() => onJumpTo(idx)}
              className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${
                isCurrent
                  ? 'bg-accent text-foreground'
                  : isPast
                    ? 'text-muted-foreground hover:bg-accent/40'
                    : isFuture
                      ? 'italic text-muted-foreground/70 hover:bg-accent/40'
                      : ''
              }`}
            >
              <span className="w-8 font-mono text-[10px]">
                {String(idx + 1).padStart(3, ' ')}
              </span>
              <span className="flex-1">
                {idx === 0
                  ? t('pages.imageEditor.history.initial')
                  : t('pages.imageEditor.history.step', { n: idx })}
              </span>
              {isCurrent && (
                <span className="text-[10px] uppercase tracking-wide text-primary">
                  ●
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
