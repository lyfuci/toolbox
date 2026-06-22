// design-sync bundle entry (committed, durable).
//
// The toolbox is an app, not a published component library — there is no
// dist entry that re-exports the design-system primitives. This file IS that
// entry: the converter bundles it to `window.Toolbox`, and walking up from
// here lands `PKG_DIR` on the repo root (where `@/` resolves to `src/`).
//
// Keep in sync with `componentSrcMap` in config.json — one `export *` per
// scoped component file.
export * from '@/components/ui/button'
export * from '@/components/ui/card'
export * from '@/components/ui/command'
export * from '@/components/ui/dialog'
export * from '@/components/ui/input'
export * from '@/components/ui/label'
export * from '@/components/ui/scroll-area'
export * from '@/components/ui/separator'
export * from '@/components/ui/sonner'
export * from '@/components/ui/tabs'
export * from '@/components/ui/textarea'
export * from '@/components/ui/tooltip'

// Not a component — the imperative toast API that drives <Toaster />. Exported
// so the Toaster preview (and the design agent) can trigger real toasts off
// window.Toolbox. The canonical import for app code is still `from 'sonner'`.
export { toast } from 'sonner'
