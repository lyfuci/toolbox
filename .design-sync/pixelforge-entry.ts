// design-sync PixelForge bundle entry (committed, durable). Auto-covers the
// editor's PS-style web UI kit. See pixelforge-conventions.md.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/i18n/en.json'

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
  })
}

// Keep in sync with componentSrcMap in pixelforge.config.json.
export * from '@/components/image-editor/NewDocumentDialog'
export * from '@/components/image-editor/ImageSizeDialog'
export * from '@/components/image-editor/CanvasSizeDialog'
export * from '@/components/image-editor/SaveForWebDialog'
export * from '@/components/image-editor/FillDialog'
export * from '@/components/image-editor/StrokeDialog'
export * from '@/components/image-editor/AdjustmentDialog'
export * from '@/components/image-editor/FilterDialog'
export * from '@/components/image-editor/LayerStyleDialog'
export * from '@/components/image-editor/WarpTextDialog'
export * from '@/components/image-editor/RotateArbitraryDialog'
export * from '@/components/image-editor/SelectModifyDialog'
export * from '@/components/image-editor/ColorPickerDialog'
export * from '@/components/image-editor/ShortcutsDialog'
export * from '@/components/image-editor/MenuBar'
export * from '@/components/image-editor/OptionsBar'
export * from '@/components/image-editor/ToolsPalette'
export * from '@/components/image-editor/StatusBar'
export * from '@/components/image-editor/LayersPanel'
export * from '@/components/image-editor/PropertiesPanel'
export * from '@/components/image-editor/HistoryPanel'
export * from '@/components/image-editor/ActionsPanel'
export * from '@/components/image-editor/PathsPanel'
export * from '@/components/image-editor/LayerCompsPanel'
export * from '@/components/image-editor/AdjustPanel'
export * from '@/components/image-editor/BrushesPanel'
export * from '@/components/image-editor/Slider'
export * from '@/components/image-editor/CurvesEditor'
export * from '@/components/image-editor/ContextMenu'
export * from '@/components/image-editor/DropZone'
