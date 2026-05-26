import type { Selection } from 'd3-selection'
import { FILE_BRIGHTNESS_LEVELS, type GraphFilterMaps, type SimNode } from './graph-types'

type DefsSelection = Selection<SVGDefsElement, unknown, null, undefined>

function sanitizeFolderId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '_')
}

function buildMultiColorFilters(
  defs: DefsSelection,
  nodes: SimNode[],
  maps: Pick<GraphFilterMaps, 'multiFilterIds' | 'multiHoverFilterIds'>,
): void {
  nodes.forEach((n, i) => {
    if (!n.colors || n.colors.length <= 1) return
    const colors = n.colors
    const gradId = `node-grad-${i}`
    n.gradientId = gradId
    const grad = defs.append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%').attr('y1', '100%')
      .attr('x2', '100%').attr('y2', '0%')
    colors.forEach((c, ci) => {
      grad.append('stop')
        .attr('offset', `${(ci / (colors.length - 1)) * 100}%`)
        .attr('stop-color', c)
    })

    const isFolder = n.type === 'folder'
    const blurOuter = isFolder ? 10 : 4
    const erodeR = isFolder ? 2 : 1
    const blurInner = isFolder ? 3 : 1.5

    // Normal multi-color filter
    const filterId = `multi-glow-${i}`
    maps.multiFilterIds.set(i, filterId)
    const filter = defs.append('filter')
      .attr('id', filterId)
      .attr('x', '-150%').attr('y', '-150%')
      .attr('width', '400%').attr('height', '400%')

    colors.forEach((c, ci) => {
      filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', String(blurOuter)).attr('result', `outerBlur${ci}`)
      filter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String(0.4 / colors.length * 2)).attr('result', `outerColor${ci}`)
      filter.append('feComposite').attr('in', `outerColor${ci}`).attr('in2', `outerBlur${ci}`).attr('operator', 'in').attr('result', `outerGlow${ci}`)
    })

    filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', String(erodeR)).attr('result', 'eroded')
    filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
    filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', String(blurInner)).attr('result', 'borderBlur')

    colors.forEach((c, ci) => {
      filter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String((isFolder ? 0.35 : 0.5) / colors.length * 2)).attr('result', `innerColor${ci}`)
      filter.append('feComposite').attr('in', `innerColor${ci}`).attr('in2', 'borderBlur').attr('operator', 'in').attr('result', `innerGlow${ci}`)
      filter.append('feComposite').attr('in', `innerGlow${ci}`).attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', `innerClip${ci}`)
    })

    if (isFolder) {
      filter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '1').attr('result', 'blurredSrc')
      filter.append('feComposite').attr('in', 'blurredSrc').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'blurClipped')
    }

    const merge = filter.append('feMerge')
    colors.forEach((_c, ci) => { merge.append('feMergeNode').attr('in', `outerGlow${ci}`) })
    merge.append('feMergeNode').attr('in', isFolder ? 'blurClipped' : 'SourceGraphic')
    colors.forEach((_c, ci) => { merge.append('feMergeNode').attr('in', `innerClip${ci}`) })

    // Hover variant (brighter)
    const hoverFilterId = `multi-hover-${i}`
    maps.multiHoverFilterIds.set(i, hoverFilterId)
    const hFilter = defs.append('filter')
      .attr('id', hoverFilterId)
      .attr('x', '-200%').attr('y', '-200%')
      .attr('width', '500%').attr('height', '500%')

    const hBlurOuter = isFolder ? 18 : 10
    colors.forEach((c, ci) => {
      hFilter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', String(hBlurOuter)).attr('result', `outerBlur${ci}`)
      hFilter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String(0.95 / colors.length * 2)).attr('result', `outerColor${ci}`)
      hFilter.append('feComposite').attr('in', `outerColor${ci}`).attr('in2', `outerBlur${ci}`).attr('operator', 'in').attr('result', `outerGlow${ci}`)
    })

    hFilter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', String(erodeR)).attr('result', 'eroded')
    hFilter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
    hFilter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', String(blurInner)).attr('result', 'borderBlur')

    colors.forEach((c, ci) => {
      hFilter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String((isFolder ? 0.9 : 1.0) / colors.length * 2)).attr('result', `innerColor${ci}`)
      hFilter.append('feComposite').attr('in', `innerColor${ci}`).attr('in2', 'borderBlur').attr('operator', 'in').attr('result', `innerGlow${ci}`)
      hFilter.append('feComposite').attr('in', `innerGlow${ci}`).attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', `innerClip${ci}`)
    })

    if (isFolder) {
      hFilter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '1').attr('result', 'blurredSrc')
      hFilter.append('feComposite').attr('in', 'blurredSrc').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'blurClipped')
    }

    const hMerge = hFilter.append('feMerge')
    colors.forEach((_c, ci) => { hMerge.append('feMergeNode').attr('in', `outerGlow${ci}`) })
    hMerge.append('feMergeNode').attr('in', isFolder ? 'blurClipped' : 'SourceGraphic')
    colors.forEach((_c, ci) => { hMerge.append('feMergeNode').attr('in', `innerClip${ci}`) })
  })
}

function buildFolderGlowFilters(defs: DefsSelection, groupColorMap: Map<string, string>, target: Map<string, string>): void {
  groupColorMap.forEach((color, folderId) => {
    const filterId = `folder-glow-${sanitizeFolderId(folderId)}`
    target.set(folderId, filterId)
    const filter = defs.append('filter')
      .attr('id', filterId)
      .attr('x', '-150%').attr('y', '-150%')
      .attr('width', '400%').attr('height', '400%')

    filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', '12').attr('result', 'outerBlur')
    filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.65').attr('result', 'outerColor')
    filter.append('feComposite').attr('in', 'outerColor').attr('in2', 'outerBlur').attr('operator', 'in').attr('result', 'outerGlow')

    filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', '2').attr('result', 'eroded')
    filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
    filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', '3').attr('result', 'borderBlur')
    filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.55').attr('result', 'innerColor')
    filter.append('feComposite').attr('in', 'innerColor').attr('in2', 'borderBlur').attr('operator', 'in').attr('result', 'innerColored')
    filter.append('feComposite').attr('in', 'innerColored').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'innerGlow')

    filter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '1').attr('result', 'blurredSrc')
    filter.append('feComposite').attr('in', 'blurredSrc').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'blurClipped')

    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'outerGlow')
    merge.append('feMergeNode').attr('in', 'blurClipped')
    merge.append('feMergeNode').attr('in', 'innerGlow')
  })
}

function buildFileGlowFilters(
  defs: DefsSelection,
  groupColorMap: Map<string, string>,
  fileFilterIds: Map<string, string>,
  fileLevelFilterIds: Map<string, Map<number, string>>,
): void {
  groupColorMap.forEach((color, folderId) => {
    const levelMap = new Map<number, string>()
    FILE_BRIGHTNESS_LEVELS.forEach((level, li) => {
      const filterId = `file-glow-${sanitizeFolderId(folderId)}-L${li}`
      if (li === 2) fileFilterIds.set(folderId, filterId)
      levelMap.set(li, filterId)
      const filter = defs.append('filter')
        .attr('id', filterId)
        .attr('x', '-150%').attr('y', '-150%')
        .attr('width', '400%').attr('height', '400%')

      filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', String(level.outerBlur)).attr('result', 'outerBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', String(level.outerOpacity)).attr('result', 'outerColor')
      filter.append('feComposite').attr('in', 'outerColor').attr('in2', 'outerBlur').attr('operator', 'in').attr('result', 'outerGlow')

      filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', '1').attr('result', 'eroded')
      filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
      filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', '1.5').attr('result', 'borderBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', String(level.innerOpacity)).attr('result', 'innerColor')
      filter.append('feComposite').attr('in', 'innerColor').attr('in2', 'borderBlur').attr('operator', 'in').attr('result', 'innerColored')
      filter.append('feComposite').attr('in', 'innerColored').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'innerGlow')

      const merge = filter.append('feMerge')
      merge.append('feMergeNode').attr('in', 'outerGlow')
      merge.append('feMergeNode').attr('in', 'SourceGraphic')
      merge.append('feMergeNode').attr('in', 'innerGlow')
    })
    fileLevelFilterIds.set(folderId, levelMap)
  })
}

function buildFolderHoverFilters(defs: DefsSelection, groupColorMap: Map<string, string>, target: Map<string, string>): void {
  groupColorMap.forEach((color, folderId) => {
    const filterId = `folder-hover-${sanitizeFolderId(folderId)}`
    target.set(folderId, filterId)
    const filter = defs.append('filter')
      .attr('id', filterId)
      .attr('x', '-200%').attr('y', '-200%')
      .attr('width', '500%').attr('height', '500%')

    filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', '18').attr('result', 'outerBlur')
    filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.95').attr('result', 'outerColor')
    filter.append('feComposite').attr('in', 'outerColor').attr('in2', 'outerBlur').attr('operator', 'in').attr('result', 'outerGlow')

    filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', '2').attr('result', 'eroded')
    filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
    filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', '3').attr('result', 'borderBlur')
    filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.9').attr('result', 'innerColor')
    filter.append('feComposite').attr('in', 'innerColor').attr('in2', 'borderBlur').attr('operator', 'in').attr('result', 'innerColored')
    filter.append('feComposite').attr('in', 'innerColored').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'innerGlow')

    filter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '1').attr('result', 'blurredSrc')
    filter.append('feComposite').attr('in', 'blurredSrc').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'blurClipped')

    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'outerGlow')
    merge.append('feMergeNode').attr('in', 'blurClipped')
    merge.append('feMergeNode').attr('in', 'innerGlow')
  })
}

function buildFileHoverFilters(defs: DefsSelection, groupColorMap: Map<string, string>, target: Map<string, string>): void {
  groupColorMap.forEach((color, folderId) => {
    const filterId = `file-hover-${sanitizeFolderId(folderId)}`
    target.set(folderId, filterId)
    const filter = defs.append('filter')
      .attr('id', filterId)
      .attr('x', '-200%').attr('y', '-200%')
      .attr('width', '500%').attr('height', '500%')

    filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', '10').attr('result', 'outerBlur')
    filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.95').attr('result', 'outerColor')
    filter.append('feComposite').attr('in', 'outerColor').attr('in2', 'outerBlur').attr('operator', 'in').attr('result', 'outerGlow')

    filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', '1').attr('result', 'eroded')
    filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
    filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', '2').attr('result', 'borderBlur')
    filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '1').attr('result', 'innerColor')
    filter.append('feComposite').attr('in', 'innerColor').attr('in2', 'borderBlur').attr('operator', 'in').attr('result', 'innerColored')
    filter.append('feComposite').attr('in', 'innerColored').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'innerGlow')

    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'outerGlow')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')
    merge.append('feMergeNode').attr('in', 'innerGlow')
  })
}

/**
 * Build all graph SVG filters in one go. Mutates `nodes` to set `gradientId`
 * on multi-color nodes (matching previous inline behavior). Returns 7 maps
 * the renderer uses to look up filter IDs by node/folder/level.
 *
 * When `isHeavy` is true, all heavy filters are skipped and empty maps are
 * returned so heavy graphs render with plain strokes (the renderer already
 * checks `multiFilterIds.has(idx)` etc. so empty maps degrade cleanly).
 */
export function setupGraphFilters(
  defs: DefsSelection,
  nodes: SimNode[],
  groupColorMap: Map<string, string>,
  isHeavy: boolean,
): GraphFilterMaps {
  const maps: GraphFilterMaps = {
    multiFilterIds: new Map(),
    multiHoverFilterIds: new Map(),
    folderFilterIds: new Map(),
    folderHoverFilterIds: new Map(),
    fileFilterIds: new Map(),
    fileHoverFilterIds: new Map(),
    fileLevelFilterIds: new Map(),
  }
  if (isHeavy) return maps
  buildMultiColorFilters(defs, nodes, maps)
  buildFolderGlowFilters(defs, groupColorMap, maps.folderFilterIds)
  buildFileGlowFilters(defs, groupColorMap, maps.fileFilterIds, maps.fileLevelFilterIds)
  buildFolderHoverFilters(defs, groupColorMap, maps.folderHoverFilterIds)
  buildFileHoverFilters(defs, groupColorMap, maps.fileHoverFilterIds)
  return maps
}
