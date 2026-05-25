import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import { drag } from 'd3-drag'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { getErrorMessage, isCancellationError } from '../../utils/errors'
import { ConfirmModal } from '../ConfirmModal'
import type { GraphData, GraphEdge, GraphEdgeLinkType, GraphMode, GraphNode } from '@shared/types/ipc'
import './GraphView.css'

const GROUP_COLORS = [
  '#7c6ef5', '#f59e0b', '#10b981', '#ef4444', '#06b6d4',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
]

interface SimNode {
  id: string
  title: string
  filePath?: string
  type: 'file' | 'folder'
  group?: string
  color?: string
  colors?: string[]
  gradientId?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  linkCount: number
}

interface SimLink {
  source: string | SimNode
  target: string | SimNode
  weight?: number
  linkType: GraphEdgeLinkType
}

function getLinkEndpointId(endpoint: string | SimNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

function getLinkEndpoint(endpoint: string | SimNode, nodeMap: Map<string, SimNode>): SimNode | null {
  return typeof endpoint === 'string' ? nodeMap.get(endpoint) ?? null : endpoint
}

function hasPosition(node: SimNode | null): node is SimNode & { x: number; y: number } {
  return !!node && node.x != null && node.y != null
}

function getRadius(d: SimNode) {
  if (d.type === 'folder') return 24
  if (d.linkCount >= 8) return 12
  if (d.linkCount >= 5) return 9
  if (d.linkCount >= 3) return 7
  if (d.linkCount >= 1) return 5
  return 3
}

export function GraphView() {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const nodeMapRef = useRef<Map<string, SimNode>>(new Map())
  const tickHandlerRef = useRef<(() => void) | null>(null)
  const endHandlerRef = useRef<(() => void) | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const graphBuiltForRef = useRef<string | null>(null)
  const aiStopRequestedRef = useRef(false)
  const autoInferAttemptedRef = useRef<string | null>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const setMainView = useUIStore((s) => s.setMainView)
  const graphMode = useUIStore((s) => s.graphMode)
  const setGraphMode = useUIStore((s) => s.setGraphMode)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [minLinks, setMinLinks] = useState(0)
  const [showLabels, setShowLabels] = useState(true)
  const [showOrphans, setShowOrphans] = useState(true)
  const [showArrows, setShowArrows] = useState(false)
  const [showFolders, setShowFolders] = useState(true)
  const [showExplicitEdges, setShowExplicitEdges] = useState(true)
  const [showInferredEdges, setShowInferredEdges] = useState(true)
  const [showFolderEdges, setShowFolderEdges] = useState(true)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [indexStatus, setIndexStatus] = useState<string | null>(null)
  const [chargeStrength, setChargeStrength] = useState(-350)
  const [linkDistance, setLinkDistance] = useState(80)
  const [centerStrength, setCenterStrength] = useState(0.02)
  const [confirmInferOpen, setConfirmInferOpen] = useState(false)

  const groupColorMap = useMemo(() => {
    if (!graphData) return new Map<string, string>()
    const folders = graphData.nodes.filter((n: GraphNode) => n.type === 'folder')
    const map = new Map<string, string>()
    folders.forEach((f: GraphNode, i: number) => {
      map.set(f.id, GROUP_COLORS[i % GROUP_COLORS.length])
    })
    return map
  }, [graphData])

  useEffect(() => {
    if (!vaultPath) return
    window.api.invoke('db:get-graph', { vaultPath, mode: graphMode }).then(setGraphData)
  }, [vaultPath, graphMode])

  useEffect(() => {
    if (!vaultPath) return
    const refresh = () => {
      window.api.invoke('db:get-graph', { vaultPath, mode: graphMode }).then(setGraphData)
    }
    const cleanup = window.api.onVaultChanged(refresh)
    window.addEventListener('graph-data-updated', refresh)
    return () => { cleanup(); window.removeEventListener('graph-data-updated', refresh) }
  }, [vaultPath, graphMode])

  useEffect(() => {
    if (!vaultPath || !graphData) return
    if (graphMode !== 'semantic') return
    if (autoInferAttemptedRef.current === vaultPath) return

    const hasInferred = graphData.edges.some((e) => e.linkType === 'inferred')
    if (hasInferred) {
      autoInferAttemptedRef.current = vaultPath
      return
    }

    autoInferAttemptedRef.current = vaultPath
    let cancelled = false
    ;(async () => {
      try {
        const result = await window.api.invoke('db:auto-infer-tfidf-links', { vaultPath })
        if (cancelled) return
        if (result.success && (result.added ?? 0) > 0) {
          window.dispatchEvent(new CustomEvent('graph-data-updated'))
        }
      } catch {}
    })()

    return () => { cancelled = true }
  }, [vaultPath, graphMode, graphData])

  useEffect(() => {
    const cleanup = window.api.onAiMemoryProgress((data: { current: number; total: number; generated: number; skipped: number; failed: number; title?: string; state: 'running' | 'done' }) => {
      if (aiStopRequestedRef.current) return
      if (data.state === 'done') return
      const title = data.title ? `：${data.title}` : ''
      setIndexStatus(`正在生成记忆 ${data.current}/${data.total}${title}`)
    })
    return () => cleanup()
  }, [])

  const showLabelsRef = useRef(showLabels)
  const showArrowsRef = useRef(showArrows)

  useEffect(() => {
    showLabelsRef.current = showLabels
  }, [showLabels])

  useEffect(() => {
    showArrowsRef.current = showArrows
  }, [showArrows])

  const runGlobalInference = async () => {
    if (!vaultPath) return
    aiStopRequestedRef.current = false
    setConfirmInferOpen(false)
    setIndexStatus(t('common.aiAnalyzing'))
    try {
      const result = await window.api.invoke('ai:infer-global-links', { vaultPath })
      if (result.success) {
        setIndexStatus(t('common.semanticFound', { count: result.added }))
        window.dispatchEvent(new CustomEvent('graph-data-updated'))
      } else if (result.error && isCancellationError(result.error)) {
        setIndexStatus('已停止 AI 分析')
      } else {
        setIndexStatus(result.error || t('common.semanticFailed'))
      }
    } catch (e: unknown) {
      setIndexStatus(isCancellationError(e) ? '已停止 AI 分析' : getErrorMessage(e, t('common.semanticFailed')))
    }
    setTimeout(() => setIndexStatus(null), 3000)
  }

  const updateHighlight = useCallback((currentRelPath: string) => {
    if (!svgRef.current) return
    const svg = select(svgRef.current)

    svg.selectAll<SVGGElement, SimNode>('g.graph-node').each(function (d) {
      const group = select(this)
      const isCurrent = d.filePath === currentRelPath
      const isFolder = d.type === 'folder'
      const r = getRadius(d)

      group.select('.node-core')
        .attr('r', r)
        .attr('fill', 'var(--bg-base)')
        .attr('opacity', 1)

      group.select('.node-pulse')
        .style('display', isCurrent ? '' : 'none')

      group.select('.node-label')
        .classed('active', isCurrent)
        .classed('hub-label', isFolder)
        .classed('hidden', !showLabelsRef.current)
    })
  }, [])

  useEffect(() => {
    if (!graphData || !svgRef.current) return
    if (!graphBuiltForRef.current) return
    const currentRelPath = currentFilePath ? currentFilePath.replace(vaultPath + '/', '').replace(vaultPath + '\\', '') : ''
    updateHighlight(currentRelPath)
  }, [currentFilePath, updateHighlight, graphData])

  useEffect(() => {
    if (!graphData || !svgRef.current) return
    if (graphData.nodes.length === 0) return

    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' })
      workerRef.current.terminate()
      workerRef.current = null
    }
    tickHandlerRef.current = null
    endHandlerRef.current = null

    const svg = select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight
    const nodeCount = graphData.nodes.length
    // Heavy graphs skip expensive SVG filters and per-link gradients so the
    // initial render stays smooth. Behaviour & interactions are preserved.
    const isHeavy = nodeCount > 80
    const isLarge = nodeCount > 200

    svg.selectAll('*').remove()

    const defs = svg.append('defs')

    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('refY', 0)
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L10,0L0,4')
      .attr('fill', 'context-stroke')

    const g = svg.append('g')

    const currentRelPath = currentFilePath ? currentFilePath.replace(vaultPath + '/', '').replace(vaultPath + '\\', '') : ''

    const linkCountMap = new Map<string, number>()
    graphData.edges.forEach((e: GraphEdge) => {
      linkCountMap.set(e.source, (linkCountMap.get(e.source) || 0) + 1)
      linkCountMap.set(e.target, (linkCountMap.get(e.target) || 0) + 1)
    })

    const filteredNodes = isLarge && nodeCount > 500
      ? graphData.nodes.filter((n: { id: string }) => (linkCountMap.get(n.id) || 0) > 0)
      : graphData.nodes

    const folderIdSet = new Set(graphData.nodes.filter((n: GraphNode) => n.type === 'folder').map((n: GraphNode) => n.id))
    const nodeToFolder = new Map<string, string>()
    graphData.edges.forEach((e: GraphEdge) => {
      if (folderIdSet.has(e.source) && !folderIdSet.has(e.target)) {
        nodeToFolder.set(e.target, e.source)
      }
    })

    // Pre-aggregate incoming folder colors per node in one O(E) pass instead
    // of one O(E) scan per node (was O(N*E)).
    const incomingColorsMap = new Map<string, Set<string>>()
    graphData.edges.forEach((e: GraphEdge) => {
      if (e.source === e.target) return
      const srcFolderId = folderIdSet.has(e.source) ? e.source : nodeToFolder.get(e.source)
      if (!srcFolderId) return
      const srcColor = groupColorMap.get(srcFolderId)
      if (!srcColor) return
      let set = incomingColorsMap.get(e.target)
      if (!set) {
        set = new Set<string>()
        incomingColorsMap.set(e.target, set)
      }
      set.add(srcColor)
    })

    const nodes: SimNode[] = filteredNodes.map((n: { id: string; title: string; filePath?: string; type: 'file' | 'folder' }) => {
      const folderId = n.type === 'folder' ? n.id : nodeToFolder.get(n.id)
      const color = folderId ? groupColorMap.get(folderId) : undefined

      const incomingColors = incomingColorsMap.get(n.id)
      const colorSet = new Set<string>()
      if (color) colorSet.add(color)
      if (incomingColors) incomingColors.forEach((c) => colorSet.add(c))

      const colorsArr = [...colorSet]
      return {
        ...n,
        linkCount: linkCountMap.get(n.id) || 0,
        group: folderId,
        color: colorsArr.length > 0 ? colorsArr[0] : undefined,
        colors: colorsArr.length > 1 ? colorsArr : undefined,
      }
    })
    const nodeIds = new Set(nodes.map((n: SimNode) => n.id))
    const links: SimLink[] = graphData.edges
      .filter((e: GraphEdge) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e: GraphEdge) => ({ source: e.source, target: e.target, linkType: e.linkType }))

    const nodeMap = new Map<string, SimNode>()
    nodes.forEach((n) => nodeMap.set(n.id, n))
    nodeMapRef.current = nodeMap

    // Link gradients for bone-joint style connections (skipped on heavy graphs;
    // we fall back to a plain stroke and avoid rewriting <stop> coords each tick).
    if (!isHeavy) {
      links.forEach((l, i) => {
        const sId = typeof l.source === 'string' ? l.source : l.source.id
        const tId = typeof l.target === 'string' ? l.target : l.target.id
        const sNode = nodeMap.get(sId)
        const tNode = nodeMap.get(tId)
        const color = sNode?.color || tNode?.color || 'var(--text-tertiary)'
        const grad = defs.append('linearGradient')
          .attr('id', `link-grad-${i}`)
          .attr('gradientUnits', 'userSpaceOnUse')
        grad.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', '0.7')
        grad.append('stop').attr('offset', '30%').attr('stop-color', color).attr('stop-opacity', '0.2')
        grad.append('stop').attr('offset', '70%').attr('stop-color', color).attr('stop-opacity', '0.2')
        grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', '0.7')
      })
    }

    const linkGroup = g.append('g').attr('class', 'graph-links')
    const link = linkGroup
      .selectAll<SVGPathElement, SimLink>('path')
      .data(links)
      .join('path')
      .attr('class', (l) => `graph-link link-${l.linkType}`)
      .attr('stroke', (l, i) => {
        if (!isHeavy) return `url(#link-grad-${i})`
        const sId = typeof l.source === 'string' ? l.source : l.source.id
        const tId = typeof l.target === 'string' ? l.target : l.target.id
        const sNode = nodeMap.get(sId)
        const tNode = nodeMap.get(tId)
        return sNode?.color || tNode?.color || 'var(--text-tertiary)'
      })
      .attr('stroke-width', 0.8)
      .attr('marker-end', showArrowsRef.current ? 'url(#arrowhead)' : null)

    const nodeGroup = g.append('g').attr('class', 'graph-nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'graph-node')

    const isCurrentNode = (d: SimNode) => d.filePath === currentRelPath

    // Create gradients and multi-color filters for multi-group nodes
    const multiFilterIds = new Map<number, string>()
    const multiHoverFilterIds = new Map<number, string>()
    if (!isHeavy) {
      nodes.forEach((n, i) => {
      if (n.colors && n.colors.length > 1) {
        const gradId = `node-grad-${i}`
        n.gradientId = gradId
        const grad = defs.append('linearGradient')
          .attr('id', gradId)
          .attr('x1', '0%').attr('y1', '100%')
          .attr('x2', '100%').attr('y2', '0%')
        n.colors.forEach((c, ci) => {
          grad.append('stop')
            .attr('offset', `${(ci / (n.colors!.length - 1)) * 100}%`)
            .attr('stop-color', c)
        })

        const isFolder = n.type === 'folder'
        const blurOuter = isFolder ? 10 : 4
        const erodeR = isFolder ? 2 : 1
        const blurInner = isFolder ? 3 : 1.5

        // Normal filter with blended colors
        const filterId = `multi-glow-${i}`
        multiFilterIds.set(i, filterId)
        const filter = defs.append('filter')
          .attr('id', filterId)
          .attr('x', '-150%').attr('y', '-150%')
          .attr('width', '400%').attr('height', '400%')

        // Outer glow layers per color, blended
        n.colors.forEach((c, ci) => {
          filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', String(blurOuter)).attr('result', `outerBlur${ci}`)
          filter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String(0.4 / n.colors!.length * 2)).attr('result', `outerColor${ci}`)
          filter.append('feComposite').attr('in', `outerColor${ci}`).attr('in2', `outerBlur${ci}`).attr('operator', 'in').attr('result', `outerGlow${ci}`)
        })

        // Inner shadow layers per color
        filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', String(erodeR)).attr('result', 'eroded')
        filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
        filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', String(blurInner)).attr('result', 'borderBlur')

        n.colors.forEach((c, ci) => {
          filter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String((isFolder ? 0.35 : 0.5) / n.colors!.length * 2)).attr('result', `innerColor${ci}`)
          filter.append('feComposite').attr('in', `innerColor${ci}`).attr('in2', 'borderBlur').attr('operator', 'in').attr('result', `innerGlow${ci}`)
          filter.append('feComposite').attr('in', `innerGlow${ci}`).attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', `innerClip${ci}`)
        })

        if (isFolder) {
          filter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '1').attr('result', 'blurredSrc')
          filter.append('feComposite').attr('in', 'blurredSrc').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'blurClipped')
        }

        const merge = filter.append('feMerge')
        n.colors.forEach((_c, ci) => { merge.append('feMergeNode').attr('in', `outerGlow${ci}`) })
        merge.append('feMergeNode').attr('in', isFolder ? 'blurClipped' : 'SourceGraphic')
        n.colors.forEach((_c, ci) => { merge.append('feMergeNode').attr('in', `innerClip${ci}`) })

        // Hover filter (brighter)
        const hoverFilterId = `multi-hover-${i}`
        multiHoverFilterIds.set(i, hoverFilterId)
        const hFilter = defs.append('filter')
          .attr('id', hoverFilterId)
          .attr('x', '-200%').attr('y', '-200%')
          .attr('width', '500%').attr('height', '500%')

        const hBlurOuter = isFolder ? 18 : 10
        n.colors.forEach((c, ci) => {
          hFilter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', String(hBlurOuter)).attr('result', `outerBlur${ci}`)
          hFilter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String(0.95 / n.colors!.length * 2)).attr('result', `outerColor${ci}`)
          hFilter.append('feComposite').attr('in', `outerColor${ci}`).attr('in2', `outerBlur${ci}`).attr('operator', 'in').attr('result', `outerGlow${ci}`)
        })

        hFilter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', String(erodeR)).attr('result', 'eroded')
        hFilter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
        hFilter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', String(blurInner)).attr('result', 'borderBlur')

        n.colors.forEach((c, ci) => {
          hFilter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String((isFolder ? 0.9 : 1.0) / n.colors!.length * 2)).attr('result', `innerColor${ci}`)
          hFilter.append('feComposite').attr('in', `innerColor${ci}`).attr('in2', 'borderBlur').attr('operator', 'in').attr('result', `innerGlow${ci}`)
          hFilter.append('feComposite').attr('in', `innerGlow${ci}`).attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', `innerClip${ci}`)
        })

        if (isFolder) {
          hFilter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '1').attr('result', 'blurredSrc')
          hFilter.append('feComposite').attr('in', 'blurredSrc').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'blurClipped')
        }

        const hMerge = hFilter.append('feMerge')
        n.colors.forEach((_c, ci) => { hMerge.append('feMergeNode').attr('in', `outerGlow${ci}`) })
        hMerge.append('feMergeNode').attr('in', isFolder ? 'blurClipped' : 'SourceGraphic')
        n.colors.forEach((_c, ci) => { hMerge.append('feMergeNode').attr('in', `innerClip${ci}`) })
      }
    })
    } // end if (!isHeavy) for multi-color filters

    // Create folder glow filters per color
    const folderFilterIds = new Map<string, string>()
    if (!isHeavy) {
      groupColorMap.forEach((color, folderId) => {
      const filterId = `folder-glow-${folderId.replace(/[^a-zA-Z0-9]/g, '_')}`
      folderFilterIds.set(folderId, filterId)
      const filter = defs.append('filter')
        .attr('id', filterId)
        .attr('x', '-150%').attr('y', '-150%')
        .attr('width', '400%').attr('height', '400%')

      // Outer glow
      filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', '12').attr('result', 'outerBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.65').attr('result', 'outerColor')
      filter.append('feComposite').attr('in', 'outerColor').attr('in2', 'outerBlur').attr('operator', 'in').attr('result', 'outerGlow')

      // Inner shadow at edges
      filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', '2').attr('result', 'eroded')
      filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
      filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', '3').attr('result', 'borderBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.55').attr('result', 'innerColor')
      filter.append('feComposite').attr('in', 'innerColor').attr('in2', 'borderBlur').attr('operator', 'in').attr('result', 'innerColored')
      filter.append('feComposite').attr('in', 'innerColored').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'innerGlow')

      // Blur the source slightly for glass feel
      filter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '1').attr('result', 'blurredSrc')
      filter.append('feComposite').attr('in', 'blurredSrc').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'blurClipped')

      // Merge: outer glow + blurred body + inner shadow
      const merge = filter.append('feMerge')
      merge.append('feMergeNode').attr('in', 'outerGlow')
      merge.append('feMergeNode').attr('in', 'blurClipped')
      merge.append('feMergeNode').attr('in', 'innerGlow')
    })
    } // end if (!isHeavy) for folder-glow filters

    // Small file node glow filter per color, with brightness levels based on linkCount
    // Level 0: linkCount 0 (dim), Level 1: 1-2, Level 2: 3-4, Level 3: 5-7, Level 4: 8+ (bright)
    const fileFilterIds = new Map<string, string>()
    const fileLevelFilterIds = new Map<string, Map<number, string>>()
    if (!isHeavy) {
    const BRIGHTNESS_LEVELS = [
      { outerBlur: 2, outerOpacity: 0.12, innerOpacity: 0.15 },
      { outerBlur: 3, outerOpacity: 0.25, innerOpacity: 0.3 },
      { outerBlur: 4, outerOpacity: 0.4, innerOpacity: 0.5 },
      { outerBlur: 5, outerOpacity: 0.55, innerOpacity: 0.6 },
      { outerBlur: 6, outerOpacity: 0.7, innerOpacity: 0.75 },
    ]

    groupColorMap.forEach((color, folderId) => {
      const levelMap = new Map<number, string>()
      BRIGHTNESS_LEVELS.forEach((level, li) => {
        const filterId = `file-glow-${folderId.replace(/[^a-zA-Z0-9]/g, '_')}-L${li}`
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
    } // end if (!isHeavy) for file-glow filters

    function getLinkLevel(linkCount: number): number {
      if (linkCount >= 8) return 4
      if (linkCount >= 5) return 3
      if (linkCount >= 3) return 2
      if (linkCount >= 1) return 1
      return 0
    }

    const getNodeFill = (d: SimNode, idx: number) => {
      return 'var(--bg-base)'
    }

    const nodeIndexMap = new Map<string, number>()
    nodes.forEach((n, i) => nodeIndexMap.set(n.id, i))

    nodeGroup.append('circle')
      .attr('class', 'node-core')
      .attr('r', (d) => getRadius(d))
      .attr('fill', (d, i) => getNodeFill(d, i))
      .attr('opacity', 1)
      .attr('stroke', (d) => {
        if (d.gradientId) return `url(#${d.gradientId})`
        if (d.type === 'folder') return d.color || 'var(--accent)'
        return d.color || 'var(--text-tertiary)'
      })
      .attr('stroke-width', (d) => d.type === 'folder' ? 1.5 : 1)
      .attr('stroke-opacity', (d) => {
        if (d.type === 'folder') return 0.9
        const level = getLinkLevel(d.linkCount)
        return 0.35 + level * 0.15
      })
      .attr('filter', (d) => {
        const idx = nodeIndexMap.get(d.id)
        if (idx != null && multiFilterIds.has(idx)) {
          return `url(#${multiFilterIds.get(idx)})`
        }
        if (d.type === 'folder' && d.group) {
          const fId = folderFilterIds.get(d.group)
          return fId ? `url(#${fId})` : null
        }
        if (d.type === 'file' && d.group) {
          const levelMap = fileLevelFilterIds.get(d.group)
          if (levelMap) {
            const level = getLinkLevel(d.linkCount)
            const fId = levelMap.get(level)
            return fId ? `url(#${fId})` : null
          }
        }
        return null
      })

    // Label — show for folder nodes or current node
    nodeGroup.append('text')
      .text((d) => d.title)
      .attr('class', (d) => `node-label${isCurrentNode(d) ? ' active' : d.type === 'folder' ? ' hub-label' : ''}${!showLabelsRef.current ? ' hidden' : ''}`)
      .attr('text-anchor', 'middle')
      .attr('y', (d) => {
        const r = getRadius(d)
        return d.type === 'folder' ? 4 : r + 14
      })

    // Hover filter variants (brighter glow for hover state)
    const folderHoverFilterIds = new Map<string, string>()
    const fileHoverFilterIds = new Map<string, string>()
    if (!isHeavy) {
      groupColorMap.forEach((color, folderId) => {
      const filterId = `folder-hover-${folderId.replace(/[^a-zA-Z0-9]/g, '_')}`
      folderHoverFilterIds.set(folderId, filterId)
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

    groupColorMap.forEach((color, folderId) => {
      const filterId = `file-hover-${folderId.replace(/[^a-zA-Z0-9]/g, '_')}`
      fileHoverFilterIds.set(folderId, filterId)
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
    } // end if (!isHeavy) for hover filters

    // Current node: use hover filter for stronger glow + pulse ring
    nodeGroup.filter(isCurrentNode).select('.node-core')
      .attr('stroke-opacity', 0.9)
      .attr('filter', (d) => {
        const idx = nodeIndexMap.get(d.id)
        if (idx != null && multiHoverFilterIds.has(idx)) {
          return `url(#${multiHoverFilterIds.get(idx)})`
        }
        if (d.type === 'folder' && d.group) {
          const fId = folderHoverFilterIds.get(d.group)
          return fId ? `url(#${fId})` : null
        }
        if (d.type === 'file' && d.group) {
          const fId = fileHoverFilterIds.get(d.group)
          return fId ? `url(#${fId})` : null
        }
        return null
      })

    nodeGroup.filter(isCurrentNode).append('circle')
      .attr('class', 'node-pulse')
      .attr('r', (d) => getRadius(d) + 8)
      .style('stroke', (d) => d.color || 'var(--accent)')
      .style('stroke-width', '2px')

    // Hover interactions
    nodeGroup
      .on('mouseenter', function (_event, d) {
        const group = select(this)
        group.select('.node-label').classed('hidden', false).attr('opacity', 1).style('fill', 'var(--text-primary)')

        const r = getRadius(d)
        const hoverR = Math.min(r * 1.25, r + 4)
        group.select('.node-core')
          .attr('r', hoverR)
          .attr('stroke-opacity', 0.9)
          .attr('filter', () => {
            const idx = nodeIndexMap.get(d.id)
            if (idx != null && multiHoverFilterIds.has(idx)) {
              return `url(#${multiHoverFilterIds.get(idx)})`
            }
            if (d.type === 'folder' && d.group) {
              const fId = folderHoverFilterIds.get(d.group)
              return fId ? `url(#${fId})` : null
            }
            if (d.type === 'file' && d.group) {
              const fId = fileHoverFilterIds.get(d.group)
              return fId ? `url(#${fId})` : null
            }
            return null
        })

        const connectedIds = new Set<string>()
        links.forEach((l) => {
          const s = getLinkEndpointId(l.source)
          const t = getLinkEndpointId(l.target)
          if (s === d.id) connectedIds.add(t)
          if (t === d.id) connectedIds.add(s)
        })

        nodeGroup.classed('dimmed', (n) => n.id !== d.id && !connectedIds.has(n.id))

        nodeGroup.each(function (n) {
          if (!connectedIds.has(n.id) || n.id === d.id) return
          const connGroup = select(this)
          connGroup.select('.node-core')
            .attr('stroke-opacity', 0.9)
            .attr('filter', () => {
              const idx = nodeIndexMap.get(n.id)
              if (idx != null && multiHoverFilterIds.has(idx)) {
                return `url(#${multiHoverFilterIds.get(idx)})`
              }
              if (n.type === 'folder' && n.group) {
                const fId = folderHoverFilterIds.get(n.group)
                return fId ? `url(#${fId})` : null
              }
              if (n.type === 'file' && n.group) {
                const fId = fileHoverFilterIds.get(n.group)
                return fId ? `url(#${fId})` : null
              }
              return null
            })
          connGroup.select('.node-label').classed('hidden', false).attr('opacity', 1)
        })

        link.classed('highlighted', (l) => {
          const s = getLinkEndpointId(l.source)
          const t = getLinkEndpointId(l.target)
          return s === d.id || t === d.id
        }).classed('dimmed', (l) => {
          const s = getLinkEndpointId(l.source)
          const t = getLinkEndpointId(l.target)
          return s !== d.id && t !== d.id
        })
      })
      .on('mouseleave', function () {
        nodeGroup.classed('dimmed', false)
        link.classed('highlighted', false).classed('dimmed', false)

        nodeGroup.each(function (d) {
          const group = select(this)
          const isCurrent = d.filePath === currentRelPath
          const r = getRadius(d)
          group.select('.node-core')
            .attr('r', r)
            .attr('fill', 'var(--bg-base)')
            .attr('opacity', 1)
            .attr('stroke-opacity', d.type === 'folder' ? 0.8 : 0.35 + getLinkLevel(d.linkCount) * 0.15)
            .attr('filter', () => {
              const idx = nodeIndexMap.get(d.id)
              if (idx != null && multiFilterIds.has(idx)) {
                return `url(#${multiFilterIds.get(idx)})`
              }
              if (d.type === 'folder' && d.group) {
                const fId = folderFilterIds.get(d.group)
                return fId ? `url(#${fId})` : null
              }
              if (d.type === 'file' && d.group) {
                const levelMap = fileLevelFilterIds.get(d.group)
                if (levelMap) {
                  const level = getLinkLevel(d.linkCount)
                  const fId = levelMap.get(level)
                  return fId ? `url(#${fId})` : null
                }
              }
              return null
            })
          group.select('.node-label')
            .classed('hidden', !showLabelsRef.current)
            .attr('opacity', isCurrent ? 1 : 0.75)
            .style('fill', isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)')
        })
      })

    const dragBehavior = drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active && workerRef.current) {
          draggingIdRef.current = d.id
          workerRef.current.postMessage({ type: 'drag-start', id: d.id, x: d.x ?? 0, y: d.y ?? 0 })
        }
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
        if (workerRef.current) {
          workerRef.current.postMessage({ type: 'drag-move', id: d.id, x: event.x, y: event.y })
        }
      })
      .on('end', (event, d) => {
        if (!event.active && workerRef.current) {
          workerRef.current.postMessage({ type: 'drag-end', id: d.id })
        }
        draggingIdRef.current = null
        d.fx = null
        d.fy = null
      })

    nodeGroup.call(dragBehavior)

    nodeGroup.on('click', (_event, d) => {
      if (!vaultPath) return
      if (d.type === 'folder') return
      if (d.filePath) {
        setMainView('editor')
        requestAnimationFrame(() => {
          openFile(`${vaultPath}/${d.filePath}`)
        })
      }
    })

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)

    const renderTick = () => {
      link
        .attr('d', (d) => {
          const source = getLinkEndpoint(d.source, nodeMap)
          const target = getLinkEndpoint(d.target, nodeMap)
          if (!hasPosition(source) || !hasPosition(target)) return ''
          const sx = source.x
          const sy = source.y
          const tx = target.x
          const ty = target.y
          const dx = tx - sx
          const dy = ty - sy
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const sr = getRadius(source)
          const tr = getRadius(target)
          const x1 = sx + (dx / dist) * sr
          const y1 = sy + (dy / dist) * sr
          const x2 = tx - (dx / dist) * tr
          const y2 = ty - (dy / dist) * tr
          return `M${x1},${y1} L${x2},${y2}`
        })

      // Update link gradient positions only when gradients exist (small graphs).
      if (!isHeavy) {
        link.each(function (d, i) {
          const source = getLinkEndpoint(d.source, nodeMap)
          const target = getLinkEndpoint(d.target, nodeMap)
          if (!hasPosition(source) || !hasPosition(target)) return
          const grad = select(defs.node()!).select(`#link-grad-${i}`)
          if (!grad.empty()) {
            grad.attr('x1', source.x).attr('y1', source.y)
              .attr('x2', target.x).attr('y2', target.y)
          }
        })
      }

      nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`)
    }

    let pendingFrame = false
    const onEnd = () => {
      const currentNode = nodes.find((n) => n.filePath === currentRelPath)
      if (currentNode && currentNode.x != null && currentNode.y != null) {
        const { x, y } = currentNode
        const transform = { k: 1.2, x: width / 2 - x * 1.2, y: height / 2 - y * 1.2 }
        svg.transition().duration(800).call(
          zoomBehavior.transform,
          zoomIdentity.translate(transform.x, transform.y).scale(transform.k)
        )
      }
    }
    endHandlerRef.current = onEnd

    const onTick = (positions: Array<string | number>) => {
      for (let i = 0; i < positions.length; i += 3) {
        const id = positions[i] as string
        const node = nodeMap.get(id)
        if (!node) continue
        node.x = positions[i + 1] as number
        node.y = positions[i + 2] as number
      }
      if (pendingFrame) return
      pendingFrame = true
      requestAnimationFrame(() => {
        pendingFrame = false
        renderTick()
      })
    }
    tickHandlerRef.current = () => renderTick()

    const worker = new Worker(new URL('../../workers/graph-force-worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<{ type: 'tick'; payload: Array<string | number>; alpha: number } | { type: 'end' }>) => {
      const data = event.data
      if (data.type === 'tick') onTick(data.payload)
      else if (data.type === 'end') onEnd()
    }
    worker.postMessage({
      type: 'start',
      nodes: nodes.map((n) => ({ id: n.id, linkCount: n.linkCount, type: n.type })),
      links: links.map((l) => ({ source: typeof l.source === 'string' ? l.source : l.source.id, target: typeof l.target === 'string' ? l.target : l.target.id })),
      width,
      height,
      params: { chargeStrength, linkDistance, centerStrength, isLarge, isHeavy }
    })

    graphBuiltForRef.current = JSON.stringify(graphData)

    return () => {
      worker.postMessage({ type: 'stop' })
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }
  }, [graphData, groupColorMap])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = select(svgRef.current)
    svg.selectAll('.graph-link').attr('marker-end', showArrows ? 'url(#arrowhead)' : null)
  }, [showArrows])

  useEffect(() => {
    if (!workerRef.current) return
    const nodeCount = graphData?.nodes.length || 0
    const isLarge = nodeCount > 200
    const isHeavy = nodeCount > 80
    workerRef.current.postMessage({
      type: 'update-params',
      params: { chargeStrength, linkDistance, centerStrength, isLarge, isHeavy }
    })
  }, [chargeStrength, linkDistance, centerStrength, graphData])

  useEffect(() => {
    if (!svgRef.current || !graphData) return
    const svg = select(svgRef.current)
    const q = searchQuery.trim().toLowerCase()
    svg.selectAll<SVGGElement, SimNode>('g.graph-node').classed('dimmed', (d) => {
      if (!showFolders && d.type === 'folder') return true
      if (!showOrphans && d.linkCount === 0) return true
      if (minLinks > 0 && d.linkCount < minLinks) return true
      if (q && !d.title.toLowerCase().includes(q)) return true
      return false
    })
  }, [searchQuery, minLinks, showOrphans, showFolders, graphData])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = select(svgRef.current)
    svg.selectAll<SVGGElement, SimNode>('g.graph-node .node-label').classed('hidden', !showLabels)
  }, [showLabels])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = select(svgRef.current)
    svg.selectAll<SVGPathElement, SimLink>('path.graph-link')
      .classed('hidden-type', (l) => {
        if (l.linkType === 'explicit') return !showExplicitEdges
        if (l.linkType === 'inferred') return !showInferredEdges
        if (l.linkType === 'folder') return !showFolderEdges
        return false
      })
  }, [showExplicitEdges, showInferredEdges, showFolderEdges, graphData])

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-inner">
          <p className="graph-empty-title">{t('graph.emptyTitle')}</p>
          <p className="graph-empty-hint">{t('graph.emptyHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="graph-container">
      {panelCollapsed && (
        <button className="graph-panel-expand" onClick={() => setPanelCollapsed(false)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
      <div className={`graph-panel${panelCollapsed ? ' collapsed' : ''}`}>
        <div className="graph-panel-header">
          <div className="graph-panel-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>
              <line x1="8" y1="8" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="8"/><line x1="8" y1="16" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="16"/>
            </svg>
            {t('graph.title').toUpperCase()}
          </div>
          <button className="graph-panel-collapse" onClick={() => setPanelCollapsed(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {!panelCollapsed && (
          <>
            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.mode').toUpperCase()}</div>
              <div className="graph-mode-switcher" role="tablist">
                <button
                  role="tab"
                  aria-selected={graphMode === 'semantic'}
                  className={`graph-mode-tab${graphMode === 'semantic' ? ' active' : ''}`}
                  onClick={() => setGraphMode('semantic')}
                  title={t('graph.modeSemanticHint')}
                >
                  {t('graph.modeSemantic')}
                </button>
                <button
                  role="tab"
                  aria-selected={graphMode === 'connection'}
                  className={`graph-mode-tab${graphMode === 'connection' ? ' active' : ''}`}
                  onClick={() => setGraphMode('connection')}
                  title={t('graph.modeConnectionHint')}
                >
                  {t('graph.modeConnection')}
                </button>
                <button
                  role="tab"
                  aria-selected={graphMode === 'folder'}
                  className={`graph-mode-tab${graphMode === 'folder' ? ' active' : ''}`}
                  onClick={() => setGraphMode('folder')}
                  title={t('graph.modeFolderHint')}
                >
                  {t('graph.modeFolder')}
                </button>
              </div>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.filters').toUpperCase()}</div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('graph.search')}
                className="graph-search"
              />
              <label className="graph-filter-label">
                {t('graph.linksGte')}
                <select
                  value={minLinks}
                  onChange={(e) => setMinLinks(Number(e.target.value))}
                  className="graph-filter-select"
                >
                  <option value={0}>{t('graph.all')}</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </label>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.groups').toUpperCase()}</div>
              <div className="graph-groups-list">
                {graphData.nodes.filter((n: GraphNode) => n.type === 'folder').map((folder: GraphNode) => (
                  <div key={folder.id} className="graph-group-item">
                    <span className="graph-group-dot" style={{ background: groupColorMap.get(folder.id) }} />
                    <span className="graph-group-name">{folder.title}</span>
                  </div>
                ))}
                {graphData.nodes.filter((n: GraphNode) => n.type === 'folder').length === 0 && (
                  <div className="graph-panel-info">{t('graph.noFolderGroups')}</div>
                )}
              </div>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.display').toUpperCase()}</div>
              <label className="graph-toggle">
                <span>{t('graph.labels')}</span>
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span>{t('graph.orphans')}</span>
                <input type="checkbox" checked={showOrphans} onChange={(e) => setShowOrphans(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span>{t('graph.arrows')}</span>
                <input type="checkbox" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              {graphMode === 'folder' && (
                <label className="graph-toggle">
                  <span>{t('graph.folders')}</span>
                  <input type="checkbox" checked={showFolders} onChange={(e) => setShowFolders(e.target.checked)} />
                  <span className="graph-toggle-slider" />
                </label>
              )}
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.edgeTypes').toUpperCase()}</div>
              <label className="graph-toggle">
                <span className="graph-edge-legend">
                  <span className="graph-edge-swatch swatch-explicit" />
                  {t('graph.explicit')}
                </span>
                <input type="checkbox" checked={showExplicitEdges} onChange={(e) => setShowExplicitEdges(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              {graphMode === 'semantic' && (
                <label className="graph-toggle">
                  <span className="graph-edge-legend">
                    <span className="graph-edge-swatch swatch-inferred" />
                    {t('graph.inferred')}
                  </span>
                  <input type="checkbox" checked={showInferredEdges} onChange={(e) => setShowInferredEdges(e.target.checked)} />
                  <span className="graph-toggle-slider" />
                </label>
              )}
              {graphMode === 'folder' && (
                <label className="graph-toggle">
                  <span className="graph-edge-legend">
                    <span className="graph-edge-swatch swatch-folder" />
                    {t('graph.folderEdges')}
                  </span>
                  <input type="checkbox" checked={showFolderEdges} onChange={(e) => setShowFolderEdges(e.target.checked)} />
                  <span className="graph-toggle-slider" />
                </label>
              )}
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.forces').toUpperCase()}</div>
              <label className="graph-slider-label">
                <span>{t('graph.repulsion')}</span>
                <span className="graph-slider-value">{chargeStrength}</span>
              </label>
              <input
                type="range"
                min="-800"
                max="-50"
                step="10"
                value={chargeStrength}
                onChange={(e) => setChargeStrength(Number(e.target.value))}
                className="graph-slider"
              />
              <label className="graph-slider-label">
                <span>{t('graph.distance')}</span>
                <span className="graph-slider-value">{linkDistance}</span>
              </label>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={linkDistance}
                onChange={(e) => setLinkDistance(Number(e.target.value))}
                className="graph-slider"
              />
              <label className="graph-slider-label">
                <span>{t('graph.aggregation')}</span>
                <span className="graph-slider-value">{centerStrength.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="0.1"
                step="0.005"
                value={centerStrength}
                onChange={(e) => setCenterStrength(Number(e.target.value))}
                className="graph-slider"
              />
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.info').toUpperCase()}</div>
              <div className="graph-panel-info">
                {t('graph.nodes', { count: graphData.nodes.length })} · {t('graph.connections', { count: graphData.edges.length })}
              </div>
              <button
                className="graph-back-btn"
                style={{ marginTop: 8 }}
                disabled={!!indexStatus}
                onClick={async () => {
                  if (!vaultPath) return
                  setIndexStatus(t('common.indexing'))
                  try {
                    const result = await window.api.invoke('db:index-vault', { vaultPath })
                    setIndexStatus(`${t('graph.reindex')}: ${result.indexed} ${t('graph.nodes', { count: result.indexed })}`)
                    window.dispatchEvent(new CustomEvent('graph-data-updated'))
                  } catch (e: unknown) {
                    setIndexStatus(`Error: ${getErrorMessage(e, t('common.semanticFailed'))}`)
                  }
                  setTimeout(() => setIndexStatus(null), 3000)
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2 11.5a10 10 0 0 1 18.8-4.3"/><path d="M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                {t('graph.reindex')}
              </button>
              <button
                className="graph-back-btn"
                style={{ marginTop: 8 }}
                disabled={!!indexStatus}
                onClick={() => setConfirmInferOpen(true)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
                </svg>
                {t('graph.inferGlobal')}
              </button>
              <button
                className="graph-back-btn"
                style={{ marginTop: 8 }}
                disabled={!!indexStatus}
                onClick={async () => {
                  if (!vaultPath) return
                  aiStopRequestedRef.current = false
                  setIndexStatus('正在生成记忆文件...')
                  try {
                    const result = await window.api.invoke('ai:generate-memories', { vaultPath })
                    if (result.success) {
                      const failedText = result.failed ? `，失败 ${result.failed} 篇` : ''
                      const scopeText = result.limited ? `（本次处理最近 ${result.total}/${result.totalNotes} 篇）` : ''
                      setIndexStatus(`记忆生成完成：新增 ${result.generated} 篇，跳过 ${result.skipped} 篇${failedText}${scopeText}`)
                    } else if (result.error && isCancellationError(result.error)) {
                      setIndexStatus('已停止记忆生成')
                    } else {
                      setIndexStatus(result.error || '记忆生成已停止')
                    }
                  } catch (e: unknown) {
                    setIndexStatus(isCancellationError(e) ? '已停止记忆生成' : getErrorMessage(e, '记忆生成已停止'))
                  }
                  setTimeout(() => setIndexStatus(null), 5000)
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V11h3a3 3 0 0 1 3 3v1"/><path d="M6 11V9.4C4.8 8.8 4 7.5 4 6a4 4 0 0 1 8 0"/><rect x="2" y="17" width="8" height="5" rx="1"/><rect x="14" y="17" width="8" height="5" rx="1"/>
                </svg>
                生成记忆
              </button>
              {indexStatus && (
                <button
                  className="graph-back-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    aiStopRequestedRef.current = true
                    window.api.invoke('ai:stop', undefined).catch(() => {})
                    setIndexStatus('已请求停止 AI 任务')
                  }}
                >
                  停止
                </button>
              )}
              {indexStatus && (
                <div className="graph-panel-info" style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>
                  {indexStatus}
                </div>
              )}
            </div>

            <div className="graph-panel-footer">
              <button className="graph-back-btn" onClick={() => setMainView('editor')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
                {t('graph.backToEditor')}
              </button>
            </div>
          </>
        )}
      </div>
      <svg ref={svgRef} className="graph-svg" />
      <ConfirmModal
        open={confirmInferOpen}
        title="重新计算语义关联"
        message="将重新计算全库语义关联，并替换现有的 AI 推理链接。是否继续？"
        confirmText="重新计算"
        onConfirm={runGlobalInference}
        onCancel={() => setConfirmInferOpen(false)}
      />
    </div>
  )
}
