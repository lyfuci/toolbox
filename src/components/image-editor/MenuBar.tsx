import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * PS-style menu bar — File / Edit / Image / Layer / View menus across the
 * top, each with a dropdown. Most items here are "wired to existing actions
 * where they exist, otherwise no-op-with-toast" — the bar is primarily a
 * familiar structural element for users coming from PS.
 *
 * Items the editor currently supports get a real callback; the rest are
 * disabled (rendered greyed out) so the user can see the surface without
 * being misled.
 */
export type MenuAction = {
  id: string
  label: string
  shortcut?: string
  onClick?: () => void
  disabled?: boolean
}
export type MenuSection = MenuAction[] | { sep: true }

type MenuDef = {
  id: string
  label: string
  sections: (MenuAction[] | { sep: true })[]
}

type Props = {
  /** Action handlers — the editor wires only what it implements. */
  handlers: {
    open?: () => void
    save?: () => void
    saveAs?: () => void
    download?: () => void
    exportPng?: () => void
    exportJpeg?: () => void
    exportWebp?: () => void
    undo?: () => void
    redo?: () => void
    canUndo?: boolean
    canRedo?: boolean
    rotate90?: () => void
    flipH?: () => void
    flipV?: () => void
    duplicateLayer?: () => void
    deleteLayer?: () => void
    zoomIn?: () => void
    zoomOut?: () => void
    zoomFit?: () => void
    toggleFocus?: () => void
  }
}

export function MenuBar({ handlers }: Props) {
  const { t } = useTranslation()
  const [openIdx, setOpenIdx] = useState(-1)

  // ESC closes the menu. Click outside closes via .pf-menu-backdrop.
  useEffect(() => {
    if (openIdx < 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIdx(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIdx])

  const menus: MenuDef[] = [
    {
      id: 'file',
      label: t('pages.imageEditor.menu.file'),
      sections: [
        [
          { id: 'open', label: t('pages.imageEditor.menu.open'), shortcut: '⌘O', onClick: handlers.open },
          {
            id: 'save',
            label: t('pages.imageEditor.menu.saveProject'),
            shortcut: '⌘S',
            onClick: handlers.save,
          },
        ],
        { sep: true },
        [
          { id: 'png', label: t('pages.imageEditor.menu.exportPng'), shortcut: '⌘E', onClick: handlers.exportPng ?? handlers.download },
          { id: 'jpg', label: t('pages.imageEditor.menu.exportJpeg'), onClick: handlers.exportJpeg },
          { id: 'webp', label: t('pages.imageEditor.menu.exportWebp'), onClick: handlers.exportWebp },
        ],
      ],
    },
    {
      id: 'edit',
      label: t('pages.imageEditor.menu.edit'),
      sections: [
        [
          {
            id: 'undo',
            label: t('pages.imageEditor.menu.undo'),
            shortcut: '⌘Z',
            onClick: handlers.undo,
            disabled: !handlers.canUndo,
          },
          {
            id: 'redo',
            label: t('pages.imageEditor.menu.redo'),
            shortcut: '⇧⌘Z',
            onClick: handlers.redo,
            disabled: !handlers.canRedo,
          },
        ],
      ],
    },
    {
      id: 'image',
      label: t('pages.imageEditor.menu.image'),
      sections: [
        [
          { id: 'rot90', label: t('pages.imageEditor.menu.rotate90'), onClick: handlers.rotate90 },
          { id: 'flipH', label: t('pages.imageEditor.menu.flipH'), onClick: handlers.flipH },
          { id: 'flipV', label: t('pages.imageEditor.menu.flipV'), onClick: handlers.flipV },
        ],
      ],
    },
    {
      id: 'layer',
      label: t('pages.imageEditor.menu.layer'),
      sections: [
        [
          {
            id: 'dup',
            label: t('pages.imageEditor.menu.duplicateLayer'),
            shortcut: '⌘J',
            onClick: handlers.duplicateLayer,
          },
          {
            id: 'delLayer',
            label: t('pages.imageEditor.menu.deleteLayer'),
            shortcut: '⌫',
            onClick: handlers.deleteLayer,
          },
        ],
      ],
    },
    {
      id: 'view',
      label: t('pages.imageEditor.menu.view'),
      sections: [
        [
          { id: 'zin', label: t('pages.imageEditor.menu.zoomIn'), shortcut: '⌘+', onClick: handlers.zoomIn },
          { id: 'zout', label: t('pages.imageEditor.menu.zoomOut'), shortcut: '⌘-', onClick: handlers.zoomOut },
          { id: 'fit', label: t('pages.imageEditor.menu.zoomFit'), shortcut: '⌘0', onClick: handlers.zoomFit },
        ],
        { sep: true },
        [
          {
            id: 'focus',
            label: t('pages.imageEditor.menu.toggleFocus'),
            shortcut: 'F',
            onClick: handlers.toggleFocus,
          },
        ],
      ],
    },
  ]

  return (
    <div className="pf-menubar">
      <span className="pf-menubar-name">
        <b>PixelForge</b>
      </span>
      {menus.map((m, i) => (
        <MenuButton
          key={m.id}
          label={m.label}
          open={openIdx === i}
          onToggle={() => setOpenIdx((cur) => (cur === i ? -1 : i))}
          onHover={() => {
            if (openIdx >= 0 && openIdx !== i) setOpenIdx(i)
          }}
        >
          {openIdx === i && (
            <MenuDropdown
              sections={m.sections}
              onClose={() => setOpenIdx(-1)}
            />
          )}
        </MenuButton>
      ))}
      {openIdx >= 0 && (
        <div
          className="pf-menu-backdrop"
          onClick={() => setOpenIdx(-1)}
          aria-hidden
        />
      )}
    </div>
  )
}

function MenuButton({
  label,
  open,
  onToggle,
  onHover,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  onHover: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  return (
    <div
      ref={ref}
      className={`pf-menu-item ${open ? 'pf-open' : ''}`}
      onClick={onToggle}
      onMouseEnter={onHover}
      style={{ position: 'relative' }}
    >
      {label}
      {children}
    </div>
  )
}

function MenuDropdown({
  sections,
  onClose,
}: {
  sections: (MenuAction[] | { sep: true })[]
  onClose: () => void
}) {
  return (
    <div className="pf-menu-dd" onClick={(e) => e.stopPropagation()}>
      {sections.flatMap((sec, i) => {
        if ('sep' in sec) return [<div key={`s${i}`} className="pf-mi pf-sep" />]
        return sec.map((it) => (
          <div
            key={`${i}-${it.id}`}
            className={`pf-mi ${it.disabled ? 'pf-disabled' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (it.disabled) return
              it.onClick?.()
              onClose()
            }}
          >
            <span />
            <span>{it.label}</span>
            {it.shortcut ? <span className="pf-kbd">{it.shortcut}</span> : <span />}
          </div>
        ))
      })}
    </div>
  )
}
