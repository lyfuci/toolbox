import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdjustmentKind, FilterKind, LayerEffectKind } from '@/lib/image-editor/types'

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
  /** Optional submenu — when set, the item renders with a "›" hint and
   *  a nested flyout opens on hover instead of firing `onClick`. Used by
   *  Open Recent + Export-with-preset. One level deep only. */
  submenu?: MenuAction[]
}
export type MenuSection = MenuAction[] | { sep: true }

/** Minimal shape MenuBar needs to render the "Export with preset" flyout —
 *  intentionally a structural subset of `ExportPreset` so MenuBar stays
 *  agnostic of the preset module's full type / persistence concerns. */
export type ExportPresetSummary = {
  id: string
  name: string
}

type MenuDef = {
  id: string
  label: string
  sections: (MenuAction[] | { sep: true })[]
}

type Props = {
  /** Action handlers — the editor wires only what it implements. */
  handlers: {
    newDocument?: () => void
    open?: () => void
    /** Recent files list — `onOpenRecent(index)` re-loads the chosen entry. */
    recentFiles?: Array<{ name: string }>
    onOpenRecent?: (index: number) => void
    save?: () => void
    saveAs?: () => void
    download?: () => void
    exportPng?: () => void
    saveForWeb?: () => void
    exportJpeg?: () => void
    exportWebp?: () => void
    /** Preset list for the "Export with preset" submenu. Each item becomes
     *  a child entry; clicking it fires `onExportWithPreset(id)`. */
    exportPresets?: ExportPresetSummary[]
    onExportWithPreset?: (id: string) => void
    undo?: () => void
    redo?: () => void
    canUndo?: boolean
    canRedo?: boolean
    rotate90?: () => void
    flipH?: () => void
    flipV?: () => void
    rotateArbitrary?: () => void
    imageSize?: () => void
    canvasSize?: () => void
    trim?: () => void
    revealAll?: () => void
    openAdjustment?: (kind: AdjustmentKind) => void
    openFilter?: (kind: FilterKind) => void
    duplicateLayer?: () => void
    deleteLayer?: () => void
    newGroup?: () => void
    groupSelected?: () => void
    ungroupSelected?: () => void
    canGroupSelected?: boolean
    canUngroupSelected?: boolean
    selectAll?: () => void
    deselect?: () => void
    reselect?: () => void
    inverseSelection?: () => void
    selectExpand?: () => void
    selectContract?: () => void
    selectFeather?: () => void
    selectSmooth?: () => void
    selectGrow?: () => void
    selectColorRange?: () => void
    selectSubject?: () => void
    removeBackground?: () => void
    canDeselect?: boolean
    canReselect?: boolean
    canModifySelection?: boolean
    canSelectFromImage?: boolean
    cut?: () => void
    copy?: () => void
    copyMerged?: () => void
    paste?: () => void
    pasteInPlace?: () => void
    fill?: () => void
    stroke?: () => void
    canPaste?: boolean
    mergeDown?: () => void
    mergeVisible?: () => void
    stampVisible?: () => void
    flatten?: () => void
    /** Open Layer Style dialog. `kind` preselects an effect; undefined = "Blending Options" (no preselect). */
    openLayerStyle?: (kind?: LayerEffectKind) => void
    /** Smart Object commands. */
    convertToSmartObject?: () => void
    replaceSmartObjectContents?: () => void
    /** True when selected layer is a SmartObjectLayer (enables Replace Contents). */
    isSmartObjectSelected?: boolean
    /** Toggle the clipping mask flag on the currently selected layer. */
    toggleClippingMask?: () => void
    isClippingMaskSelected?: boolean
    /** Raster Layer Mask actions. */
    newRasterMask?: () => void
    convertMaskToRaster?: () => void
    /** True when selected layer is a MaskLayer with `rects` and no dataUrl yet. */
    isRectMaskSelected?: boolean
    /** Add a per-adjustment / per-filter raster mask to the selected layer. */
    addAdjustmentMask?: () => void
    isAdjustmentOrFilterSelected?: boolean
    /** Remove the mask from selected layer (deletes MaskLayer or clears
     *  adjustment/filter mask). */
    removeMask?: () => void
    canRemoveMask?: boolean
    /** Apply Mask — bake selected MaskLayer into the layer below + remove mask. */
    applyMask?: () => void
    canApplyMask?: boolean
    zoomIn?: () => void
    zoomOut?: () => void
    zoomFit?: () => void
    zoomActualPixels?: () => void
    zoomFitScreen?: () => void
    toggleGrid?: () => void
    toggleSnap?: () => void
    showGrid?: boolean
    snapToGrid?: boolean
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
          {
            id: 'newDoc',
            label: t('pages.imageEditor.menu.newDocument') + '…',
            shortcut: '⌘N',
            onClick: handlers.newDocument,
          },
          { id: 'open', label: t('pages.imageEditor.menu.open'), shortcut: '⌘O', onClick: handlers.open },
          handlers.recentFiles && handlers.recentFiles.length > 0
            ? {
                id: 'openRecent',
                label: t('pages.imageEditor.menu.openRecent'),
                submenu: handlers.recentFiles.map((r, i) => ({
                  id: `recent-${i}`,
                  label: r.name,
                  onClick: () => handlers.onOpenRecent?.(i),
                })),
              }
            : {
                id: 'openRecentDisabled',
                label: t('pages.imageEditor.menu.openRecent'),
                disabled: true,
              },
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
          {
            id: 'saveForWeb',
            label: t('pages.imageEditor.menu.saveForWeb') + '…',
            shortcut: '⌥⇧⌘S',
            onClick: handlers.saveForWeb,
          },
          {
            id: 'exportPreset',
            label: t('pages.imageEditor.menu.exportWithPreset'),
            // Always render the submenu container. If the user has no
            // presets at all (built-ins are seeded by the editor, so this
            // is rare) the empty list disables the parent item.
            disabled: !handlers.exportPresets || handlers.exportPresets.length === 0,
            submenu: (handlers.exportPresets ?? []).map((p) => ({
              id: `preset-${p.id}`,
              label: p.name,
              onClick: () => handlers.onExportWithPreset?.(p.id),
            })),
          },
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
        { sep: true },
        [
          {
            id: 'cut',
            label: t('pages.imageEditor.menu.cut'),
            shortcut: '⌘X',
            onClick: handlers.cut,
          },
          {
            id: 'copy',
            label: t('pages.imageEditor.menu.copy'),
            shortcut: '⌘C',
            onClick: handlers.copy,
          },
          {
            id: 'copyMerged',
            label: t('pages.imageEditor.menu.copyMerged'),
            shortcut: '⇧⌘C',
            onClick: handlers.copyMerged,
          },
          {
            id: 'paste',
            label: t('pages.imageEditor.menu.paste'),
            shortcut: '⌘V',
            onClick: handlers.paste,
            disabled: !handlers.canPaste,
          },
          {
            id: 'pasteInPlace',
            label: t('pages.imageEditor.menu.pasteInPlace'),
            shortcut: '⇧⌘V',
            onClick: handlers.pasteInPlace,
            disabled: !handlers.canPaste,
          },
        ],
        { sep: true },
        [
          {
            id: 'fill',
            label: t('pages.imageEditor.menu.fill') + '…',
            shortcut: '⇧F5',
            onClick: handlers.fill,
          },
          {
            id: 'stroke',
            label: t('pages.imageEditor.menu.stroke') + '…',
            onClick: handlers.stroke,
          },
        ],
      ],
    },
    {
      id: 'image',
      label: t('pages.imageEditor.menu.image'),
      sections: [
        [
          {
            id: 'imageSize',
            label: t('pages.imageEditor.menu.imageSize') + '…',
            shortcut: '⌥⌘I',
            onClick: handlers.imageSize,
          },
          {
            id: 'canvasSize',
            label: t('pages.imageEditor.menu.canvasSize') + '…',
            shortcut: '⌥⌘C',
            onClick: handlers.canvasSize,
          },
        ],
        { sep: true },
        [
          { id: 'rot90', label: t('pages.imageEditor.menu.rotate90'), onClick: handlers.rotate90 },
          {
            id: 'rotArb',
            label: t('pages.imageEditor.menu.rotateArbitrary') + '…',
            onClick: handlers.rotateArbitrary,
          },
          { id: 'flipH', label: t('pages.imageEditor.menu.flipH'), onClick: handlers.flipH },
          { id: 'flipV', label: t('pages.imageEditor.menu.flipV'), onClick: handlers.flipV },
        ],
        { sep: true },
        [
          { id: 'trim', label: t('pages.imageEditor.menu.trim'), onClick: handlers.trim },
          {
            id: 'revealAll',
            label: t('pages.imageEditor.menu.revealAll'),
            onClick: handlers.revealAll,
          },
        ],
        { sep: true },
        [
          {
            id: 'adj-bc',
            label: t('pages.imageEditor.adjustments.brightnessContrast') + '…',
            onClick: () => handlers.openAdjustment?.('brightnessContrast'),
          },
          {
            id: 'adj-levels',
            label: t('pages.imageEditor.adjustments.levels') + '…',
            shortcut: '⌘L',
            onClick: () => handlers.openAdjustment?.('levels'),
          },
          {
            id: 'adj-curves',
            label: t('pages.imageEditor.adjustments.curves') + '…',
            shortcut: '⌘M',
            onClick: () => handlers.openAdjustment?.('curves'),
          },
          {
            id: 'adj-exposure',
            label: t('pages.imageEditor.adjustments.exposure') + '…',
            onClick: () => handlers.openAdjustment?.('exposure'),
          },
        ],
        { sep: true },
        [
          {
            id: 'adj-vibrance',
            label: t('pages.imageEditor.adjustments.vibrance') + '…',
            onClick: () => handlers.openAdjustment?.('vibrance'),
          },
          {
            id: 'adj-hsl',
            label: t('pages.imageEditor.adjustments.hueSaturation') + '…',
            shortcut: '⌘U',
            onClick: () => handlers.openAdjustment?.('hueSaturation'),
          },
          {
            id: 'adj-cb',
            label: t('pages.imageEditor.adjustments.colorBalance') + '…',
            shortcut: '⌘B',
            onClick: () => handlers.openAdjustment?.('colorBalance'),
          },
        ],
        { sep: true },
        [
          {
            id: 'adj-invert',
            label: t('pages.imageEditor.adjustments.invert'),
            shortcut: '⌘I',
            onClick: () => handlers.openAdjustment?.('invert'),
          },
          {
            id: 'adj-posterize',
            label: t('pages.imageEditor.adjustments.posterize') + '…',
            onClick: () => handlers.openAdjustment?.('posterize'),
          },
          {
            id: 'adj-threshold',
            label: t('pages.imageEditor.adjustments.threshold') + '…',
            onClick: () => handlers.openAdjustment?.('threshold'),
          },
          {
            id: 'adj-channelMixer',
            label: t('pages.imageEditor.adjustments.channelMixer.title') + '…',
            onClick: () => handlers.openAdjustment?.('channelMixer'),
          },
          {
            id: 'adj-gradientMap',
            label: t('pages.imageEditor.adjustments.gradientMap') + '…',
            onClick: () => handlers.openAdjustment?.('gradientMap'),
          },
          {
            id: 'adj-photoFilter',
            label: t('pages.imageEditor.adjustments.photoFilter') + '…',
            onClick: () => handlers.openAdjustment?.('photoFilter'),
          },
          {
            id: 'adj-cameraRaw',
            label: t('pages.imageEditor.adjustments.cameraRaw.title') + '…',
            onClick: () => handlers.openAdjustment?.('cameraRaw'),
          },
        ],
      ],
    },
    {
      id: 'select',
      label: t('pages.imageEditor.menu.select'),
      sections: [
        [
          {
            id: 'selAll',
            label: t('pages.imageEditor.selectMenu.all'),
            shortcut: '⌘A',
            onClick: handlers.selectAll,
          },
          {
            id: 'selDeselect',
            label: t('pages.imageEditor.selectMenu.deselect'),
            shortcut: '⌘D',
            onClick: handlers.deselect,
            disabled: !handlers.canDeselect,
          },
          {
            id: 'selReselect',
            label: t('pages.imageEditor.selectMenu.reselect'),
            shortcut: '⇧⌘D',
            onClick: handlers.reselect,
            disabled: !handlers.canReselect,
          },
          {
            id: 'selInverse',
            label: t('pages.imageEditor.selectMenu.inverse'),
            shortcut: '⇧⌘I',
            onClick: handlers.inverseSelection,
          },
        ],
        { sep: true },
        [
          {
            id: 'selSubject',
            label: t('pages.imageEditor.selectMenu.subject'),
            onClick: handlers.selectSubject,
            disabled: !handlers.canSelectFromImage,
          },
          {
            id: 'selColorRange',
            label: t('pages.imageEditor.selectMenu.colorRange'),
            onClick: handlers.selectColorRange,
            disabled: !handlers.canSelectFromImage,
          },
          {
            id: 'selRemoveBg',
            label: t('pages.imageEditor.selectMenu.removeBackground'),
            onClick: handlers.removeBackground,
            disabled: !handlers.canSelectFromImage,
          },
        ],
        { sep: true },
        [
          {
            id: 'selExpand',
            label: t('pages.imageEditor.selectMenu.expand') + '…',
            onClick: handlers.selectExpand,
            disabled: !handlers.canModifySelection,
          },
          {
            id: 'selContract',
            label: t('pages.imageEditor.selectMenu.contract') + '…',
            onClick: handlers.selectContract,
            disabled: !handlers.canModifySelection,
          },
          {
            id: 'selFeather',
            label: t('pages.imageEditor.selectMenu.feather'),
            onClick: handlers.selectFeather,
            disabled: !handlers.canModifySelection,
          },
          {
            id: 'selSmooth',
            label: t('pages.imageEditor.selectMenu.smooth'),
            onClick: handlers.selectSmooth,
            disabled: !handlers.canModifySelection,
          },
          {
            id: 'selGrow',
            label: t('pages.imageEditor.selectMenu.grow'),
            onClick: handlers.selectGrow,
            disabled: !handlers.canModifySelection,
          },
        ],
      ],
    },
    {
      id: 'filter',
      label: t('pages.imageEditor.menu.filter'),
      sections: [
        [
          {
            id: 'flt-gaussianBlur',
            label: t('pages.imageEditor.filters.gaussianBlur') + '…',
            shortcut: '⇧⌘F',
            onClick: () => handlers.openFilter?.('gaussianBlur'),
          },
          {
            id: 'flt-boxBlur',
            label: t('pages.imageEditor.filters.boxBlur') + '…',
            onClick: () => handlers.openFilter?.('boxBlur'),
          },
        ],
        { sep: true },
        [
          {
            id: 'flt-sharpen',
            label: t('pages.imageEditor.filters.sharpen') + '…',
            onClick: () => handlers.openFilter?.('sharpen'),
          },
          {
            id: 'flt-unsharpMask',
            label: t('pages.imageEditor.filters.unsharpMask') + '…',
            onClick: () => handlers.openFilter?.('unsharpMask'),
          },
          {
            id: 'flt-highPass',
            label: t('pages.imageEditor.filters.highPass') + '…',
            onClick: () => handlers.openFilter?.('highPass'),
          },
        ],
        { sep: true },
        [
          {
            id: 'flt-addNoise',
            label: t('pages.imageEditor.filters.addNoise') + '…',
            onClick: () => handlers.openFilter?.('addNoise'),
          },
          {
            id: 'flt-despeckle',
            label: t('pages.imageEditor.filters.despeckle'),
            onClick: () => handlers.openFilter?.('despeckle'),
          },
        ],
        { sep: true },
        [
          {
            id: 'flt-mosaic',
            label: t('pages.imageEditor.filters.mosaic') + '…',
            onClick: () => handlers.openFilter?.('mosaic'),
          },
          {
            id: 'flt-findEdges',
            label: t('pages.imageEditor.filters.findEdges'),
            onClick: () => handlers.openFilter?.('findEdges'),
          },
          {
            id: 'flt-emboss',
            label: t('pages.imageEditor.filters.emboss') + '…',
            onClick: () => handlers.openFilter?.('emboss'),
          },
          {
            id: 'flt-localContrast',
            label: t('pages.imageEditor.filters.localContrast') + '…',
            onClick: () => handlers.openFilter?.('localContrast'),
          },
          {
            id: 'flt-smartSharpen',
            label: t('pages.imageEditor.filters.smartSharpen') + '…',
            onClick: () => handlers.openFilter?.('smartSharpen'),
          },
          {
            id: 'flt-motionBlur',
            label: t('pages.imageEditor.filters.motionBlur') + '…',
            onClick: () => handlers.openFilter?.('motionBlur'),
          },
          {
            id: 'flt-radialBlur',
            label: t('pages.imageEditor.filters.radialBlur') + '…',
            onClick: () => handlers.openFilter?.('radialBlur'),
          },
          {
            id: 'flt-pinch',
            label: t('pages.imageEditor.filters.pinch') + '…',
            onClick: () => handlers.openFilter?.('pinch'),
          },
          {
            id: 'flt-twirl',
            label: t('pages.imageEditor.filters.twirl') + '…',
            onClick: () => handlers.openFilter?.('twirl'),
          },
          {
            id: 'flt-spherize',
            label: t('pages.imageEditor.filters.spherize') + '…',
            onClick: () => handlers.openFilter?.('spherize'),
          },
          {
            id: 'flt-polarCoordinates',
            label: t('pages.imageEditor.filters.polarCoordinates') + '…',
            onClick: () => handlers.openFilter?.('polarCoordinates'),
          },
          {
            id: 'flt-lensFlare',
            label: t('pages.imageEditor.filters.lensFlare') + '…',
            onClick: () => handlers.openFilter?.('lensFlare'),
          },
        ],
      ],
    },
    {
      id: 'layer',
      label: t('pages.imageEditor.menu.layer'),
      sections: [
        [
          {
            id: 'newGroup',
            label: t('pages.imageEditor.menu.newGroup'),
            onClick: handlers.newGroup,
          },
        ],
        { sep: true },
        [
          {
            id: 'ls-blending',
            label: t('pages.imageEditor.menu.blendingOptions') + '…',
            onClick: () => handlers.openLayerStyle?.(),
          },
          {
            id: 'ls-dropShadow',
            label: t('pages.imageEditor.layerStyle.kind.dropShadow') + '…',
            onClick: () => handlers.openLayerStyle?.('dropShadow'),
          },
          {
            id: 'ls-innerShadow',
            label: t('pages.imageEditor.layerStyle.kind.innerShadow') + '…',
            onClick: () => handlers.openLayerStyle?.('innerShadow'),
          },
          {
            id: 'ls-outerGlow',
            label: t('pages.imageEditor.layerStyle.kind.outerGlow') + '…',
            onClick: () => handlers.openLayerStyle?.('outerGlow'),
          },
          {
            id: 'ls-innerGlow',
            label: t('pages.imageEditor.layerStyle.kind.innerGlow') + '…',
            onClick: () => handlers.openLayerStyle?.('innerGlow'),
          },
          {
            id: 'ls-stroke',
            label: t('pages.imageEditor.layerStyle.kind.stroke') + '…',
            onClick: () => handlers.openLayerStyle?.('stroke'),
          },
          {
            id: 'ls-colorOverlay',
            label: t('pages.imageEditor.layerStyle.kind.colorOverlay') + '…',
            onClick: () => handlers.openLayerStyle?.('colorOverlay'),
          },
          {
            id: 'ls-gradientOverlay',
            label: t('pages.imageEditor.layerStyle.kind.gradientOverlay') + '…',
            onClick: () => handlers.openLayerStyle?.('gradientOverlay'),
          },
          {
            id: 'ls-patternOverlay',
            label: t('pages.imageEditor.layerStyle.kind.patternOverlay') + '…',
            onClick: () => handlers.openLayerStyle?.('patternOverlay'),
          },
          {
            id: 'ls-satin',
            label: t('pages.imageEditor.layerStyle.kind.satin') + '…',
            onClick: () => handlers.openLayerStyle?.('satin'),
          },
          {
            id: 'ls-bevelEmboss',
            label: t('pages.imageEditor.layerStyle.kind.bevelEmboss') + '…',
            onClick: () => handlers.openLayerStyle?.('bevelEmboss'),
          },
        ],
        { sep: true },
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
        { sep: true },
        [
          {
            id: 'groupSel',
            label: t('pages.imageEditor.menu.groupLayers'),
            shortcut: '⌘G',
            onClick: handlers.groupSelected,
            disabled: !handlers.canGroupSelected,
          },
          {
            id: 'ungroupSel',
            label: t('pages.imageEditor.menu.ungroupLayers'),
            shortcut: '⇧⌘G',
            onClick: handlers.ungroupSelected,
            disabled: !handlers.canUngroupSelected,
          },
        ],
        { sep: true },
        [
          {
            id: 'mergeDown',
            label: t('pages.imageEditor.menu.mergeDown'),
            shortcut: '⌘E',
            onClick: handlers.mergeDown,
          },
          {
            id: 'mergeVisible',
            label: t('pages.imageEditor.menu.mergeVisible'),
            shortcut: '⇧⌘E',
            onClick: handlers.mergeVisible,
          },
          {
            id: 'stampVisible',
            label: t('pages.imageEditor.menu.stampVisible'),
            shortcut: '⌥⇧⌘E',
            onClick: handlers.stampVisible,
          },
          {
            id: 'flatten',
            label: t('pages.imageEditor.menu.flatten'),
            onClick: handlers.flatten,
          },
        ],
        { sep: true },
        [
          {
            id: 'convertSO',
            label: t('pages.imageEditor.menu.convertToSmartObject'),
            onClick: handlers.convertToSmartObject,
          },
          {
            id: 'clippingMask',
            label:
              (handlers.isClippingMaskSelected
                ? t('pages.imageEditor.menu.releaseClippingMask')
                : t('pages.imageEditor.menu.createClippingMask')),
            shortcut: '⌥⌘G',
            onClick: handlers.toggleClippingMask,
          },
          {
            id: 'newRasterMask',
            label: t('pages.imageEditor.menu.newRasterMask'),
            onClick: handlers.newRasterMask,
          },
          {
            id: 'convertMaskToRaster',
            label: t('pages.imageEditor.menu.convertMaskToRaster'),
            onClick: handlers.convertMaskToRaster,
            disabled: !handlers.isRectMaskSelected,
          },
          {
            id: 'addAdjustmentMask',
            label: t('pages.imageEditor.menu.addAdjustmentMask'),
            onClick: handlers.addAdjustmentMask,
            disabled: !handlers.isAdjustmentOrFilterSelected,
          },
          {
            id: 'removeMask',
            label: t('pages.imageEditor.menu.removeMask'),
            onClick: handlers.removeMask,
            disabled: !handlers.canRemoveMask,
          },
          {
            id: 'applyMask',
            label: t('pages.imageEditor.menu.applyMask'),
            onClick: handlers.applyMask,
            disabled: !handlers.canApplyMask,
          },
          {
            id: 'replaceSO',
            label: t('pages.imageEditor.menu.replaceSmartObjectContents') + '…',
            onClick: handlers.replaceSmartObjectContents,
            disabled: !handlers.isSmartObjectSelected,
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
          {
            id: 'fitScreen',
            label: t('pages.imageEditor.menu.zoomFit'),
            shortcut: '⌘0',
            onClick: handlers.zoomFitScreen,
          },
          {
            id: 'actual',
            label: t('pages.imageEditor.menu.actualPixels'),
            shortcut: '⌘1',
            onClick: handlers.zoomActualPixels,
          },
        ],
        { sep: true },
        [
          {
            id: 'showGrid',
            label:
              (handlers.showGrid ? '✓ ' : '') +
              t('pages.imageEditor.menu.showGrid'),
            shortcut: "⌘'",
            onClick: handlers.toggleGrid,
          },
          {
            id: 'snapGrid',
            label:
              (handlers.snapToGrid ? '✓ ' : '') +
              t('pages.imageEditor.menu.snapToGrid'),
            shortcut: '⇧⌘;',
            onClick: handlers.toggleSnap,
          },
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
          <MenuItem key={`${i}-${it.id}`} item={it} onClose={onClose} />
        ))
      })}
    </div>
  )
}

/**
 * Individual menu item. Handles its own hover-flyout when `submenu` is set,
 * positioned to the right of the parent dropdown. Keeps the existing
 * "click → action → close" flow for leaf items.
 */
function MenuItem({ item, onClose }: { item: MenuAction; onClose: () => void }) {
  const [hover, setHover] = useState(false)
  const hasSub = !!item.submenu && item.submenu.length > 0
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={`pf-mi ${item.disabled ? 'pf-disabled' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (item.disabled) return
          if (hasSub) return // hover-only — don't close on click
          item.onClick?.()
          onClose()
        }}
      >
        <span />
        <span>{item.label}</span>
        {hasSub ? (
          <span className="pf-kbd" style={{ opacity: 0.7 }}>›</span>
        ) : item.shortcut ? (
          <span className="pf-kbd">{item.shortcut}</span>
        ) : (
          <span />
        )}
      </div>
      {hasSub && hover && (
        <div
          className="pf-menu-dd"
          style={{ position: 'absolute', top: 0, left: '100%', marginLeft: 2, zIndex: 60 }}
          onClick={(e) => e.stopPropagation()}
        >
          {item.submenu!.map((sub) => (
            <MenuItem key={sub.id} item={sub} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  )
}
