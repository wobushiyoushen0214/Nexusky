import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, zoomTransform } from 'd3-zoom'
import { drag } from 'd3-drag'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { getErrorMessage, isCancellationError } from '../../utils/errors'
import { ConfirmModal } from '../ConfirmModal'
import { GraphPanel } from './GraphPanel'
import { setupGraphFilters } from './graph-filters'
import { DEFAULT_GRAPH_DISPLAY_STATE, buildGraphRelationLinkCountMap, getGraphFolderNodeId, getGraphNodeGroupId, getLinkLevel, getNodeRadius, getStableGraphGroupIndex, isGraphLabelHidden, isGraphNodeHiddenByDisplay, isGraphNodeHiddenByGroup, seedNodePositionsFromCaches, shouldSkipGraphAutoZoom, type SimLink, type SimNode } from './graph-types'
import type { GraphData, GraphEdge, GraphMode, GraphNode } from '@shared/types/ipc'
import './GraphView.css'

const GROUP_COLORS = [
  '#7c6ef5', '#f59e0b', '#10b981', '#ef4444', '#06b6d4',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
]

function getLinkEndpointId(endpoint: string | SimNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

function getLinkEndpoint(endpoint: string | SimNode, nodeMap: Map<string, SimNode>): SimNode | null {
  return typeof endpoint === 'string' ? nodeMap.get(endpoint) ?? null : endpoint
}

function hasPosition(node: SimNode | null): node is SimNode & { x: number; y: number } {
  return !!node && node.x != null && node.y != null
}

function getGraphGroupColor(path: string): string {
  return GROUP_COLORS[getStableGraphGroupIndex(path || '.', GROUP_COLORS.length)]
}

function getGraphNodeFill(node: { type: 'file' | 'folder'; color?: string }): string {
  if (!node.color) return 'var(--bg-base)'
  const mix = node.type === 'folder' ? 28 : 18
  return `color-mix(in srgb, ${node.color} ${mix}%, var(--bg-base))`
}

const getRadius = getNodeRadius

export function GraphView() {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const nodeMapRef = useRef<Map<string, SimNode>>(new Map())
  const tickHandlerRef = useRef<(() => void) | null>(null)
  const endHandlerRef = useRef<(() => void) | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const hiddenGroupIdsRef = useRef<Set<string>>(new Set())
  const lastKnownNodePositionsRef = useRef<Map<string, [number, number]>>(new Map())
  const layoutCacheRef = useRef<Map<string, Map<string, [number, number]>>>(new Map())
  const graphBuiltForRef = useRef<string | null>(null)
  const graphRequestIdRef = useRef(0)
  const aiStopRequestedRef = useRef(false)
  const autoInferAttemptedRef = useRef<string | null>(null)
  const silentMemoryRefreshRef = useRef(false)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const setMainView = useUIStore((s) => s.setMainView)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [minLinks, setMinLinks] = useState(0)
  const [showLabels, setShowLabels] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showLabels)
  const [showOrphans, setShowOrphans] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showOrphans)
  const [showArrows, setShowArrows] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showArrows)
  const [showFolders, setShowFolders] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showFolders)
  const [showExplicitEdges, setShowExplicitEdges] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showExplicitEdges)
  const [showInferredEdges, setShowInferredEdges] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showInferredEdges)
  const [showFolderEdges, setShowFolderEdges] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showFolderEdges)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [indexStatus, setIndexStatus] = useState<string | null>(null)
  const [chargeStrength, setChargeStrength] = useState(-350)
  const [linkDistance, setLinkDistance] = useState(80)
  const [centerStrength, setCenterStrength] = useState(0.02)
  const [confirmInferOpen, setConfirmInferOpen] = useState(false)
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(() => new Set())
  const [activeFolderPath, setActiveFolderPath] = useState<string | null>(null)
  const activeGraphMode: GraphMode = activeFolderPath == null ? 'group' : 'folder-scope'
  const graphScopeKey = activeFolderPath == null ? 'groups' : `folder:${activeFolderPath || '.'}`

  const groupColorMap = useMemo(() => {
    const map = new Map<string, string>()
    if (activeFolderPath != null) {
      map.set(getGraphFolderNodeId(activeFolderPath), getGraphGroupColor(activeFolderPath || '.'))
    }
    if (!graphData) return map
    const folders = graphData.nodes.filter((n: GraphNode) => n.type === 'folder')
    folders.forEach((f: GraphNode) => {
      map.set(f.id, getGraphGroupColor(f.filePath || f.id))
    })
    return map
  }, [activeFolderPath, graphData])

  const loadGraph = useCallback(() => {
    if (!vaultPath) return
    const requestId = ++graphRequestIdRef.current
    window.api.invoke('db:get-graph', { vaultPath, mode: activeGraphMode, rootPath: activeFolderPath ?? '' }).then((data) => {
      if (requestId === graphRequestIdRef.current) setGraphData(data)
    })
  }, [activeFolderPath, activeGraphMode, vaultPath])

  useEffect(() => {
    graphRequestIdRef.current += 1
    setGraphData(null)
    setActiveFolderPath(null)
  }, [vaultPath])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  useEffect(() => {
    if (!vaultPath) return
    const refresh = () => loadGraph()
    const cleanup = window.api.onVaultChanged(refresh)
    const cleanupFile = window.api.onFileChanged(refresh)
    window.addEventListener('graph-data-updated', refresh)
    return () => { cleanup(); cleanupFile(); window.removeEventListener('graph-data-updated', refresh) }
  }, [loadGraph, vaultPath])

  useEffect(() => {
    if (!vaultPath || !graphData) return
    if (autoInferAttemptedRef.current === vaultPath) return

    autoInferAttemptedRef.current = vaultPath
    let cancelled = false
    ;(async () => {
      silentMemoryRefreshRef.current = true
      try {
        await window.api.invoke('ai:generate-memories', { vaultPath })
        if (cancelled) return
        const result = await window.api.invoke('ai:infer-global-links', { vaultPath })
        if (cancelled) return
        if (result.success) {
          window.dispatchEvent(new CustomEvent('graph-data-updated'))
        }
      } catch {}
      finally {
        if (!cancelled) silentMemoryRefreshRef.current = false
      }
    })()

    return () => {
      cancelled = true
      silentMemoryRefreshRef.current = false
    }
  }, [vaultPath, graphData])

  useEffect(() => {
    if (!graphData) return
    const folderIds = new Set(graphData.nodes.filter((n: GraphNode) => n.type === 'folder').map((n: GraphNode) => n.id))
    setHiddenGroupIds((current) => {
      let changed = false
      const next = new Set<string>()
      for (const groupId of current) {
        if (folderIds.has(groupId)) next.add(groupId)
        else changed = true
      }
      return changed ? next : current
    })
  }, [graphData])

  const toggleGroupVisibility = useCallback((groupId: string) => {
    setHiddenGroupIds((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  const openGraphFolder = useCallback((folderPath: string) => {
    graphRequestIdRef.current += 1
    setGraphData(null)
    setHiddenGroupIds(new Set())
    setActiveFolderPath(folderPath)
  }, [])

  const openGraphOverview = useCallback(() => {
    graphRequestIdRef.current += 1
    setGraphData(null)
    setHiddenGroupIds(new Set())
    setActiveFolderPath(null)
  }, [])

  const openParentGraphFolder = useCallback(() => {
    if (activeFolderPath == null || activeFolderPath === '') {
      openGraphOverview()
      return
    }
    const index = activeFolderPath.lastIndexOf('/')
    if (index < 0) openGraphOverview()
    else openGraphFolder(activeFolderPath.slice(0, index))
  }, [activeFolderPath, openGraphFolder, openGraphOverview])

  const applyGroupVisibility = useCallback((hiddenGroups: ReadonlySet<string>) => {
    if (!svgRef.current) return
    const svg = select(svgRef.current)
    const nodeMap = nodeMapRef.current

    svg.selectAll<SVGGElement, SimNode>('g.graph-node')
      .classed('group-hidden', (d) => isGraphNodeHiddenByGroup(d, hiddenGroups))

    svg.selectAll<SVGPathElement, SimLink>('path.graph-link')
      .classed('group-hidden', (d) => {
        const source = getLinkEndpoint(d.source, nodeMap)
        const target = getLinkEndpoint(d.target, nodeMap)
        return isGraphNodeHiddenByGroup(source, hiddenGroups) || isGraphNodeHiddenByGroup(target, hiddenGroups)
      })
  }, [])

  useEffect(() => {
    hiddenGroupIdsRef.current = hiddenGroupIds
    applyGroupVisibility(hiddenGroupIds)
  }, [applyGroupVisibility, hiddenGroupIds])

  useEffect(() => {
    const cleanup = window.api.onAiMemoryProgress((data: { current: number; total: number; generated: number; skipped: number; failed: number; title?: string; state: 'running' | 'done' }) => {
      if (silentMemoryRefreshRef.current) return
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
        .attr('fill', getGraphNodeFill(d))
        .attr('opacity', 1)

      group.select('.node-pulse')
        .style('display', isCurrent ? '' : 'none')

      group.select('.node-label')
        .classed('active', isCurrent)
        .classed('hub-label', isFolder)
        .classed('hidden', isGraphLabelHidden(d, showLabelsRef.current, isCurrent))
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

    const graphDataKey = `${graphScopeKey}:${JSON.stringify(graphData)}`
    const isVisibilityOnlyRerender = graphBuiltForRef.current === graphDataKey
    const svg = select(svgRef.current)
    const preservedTransform = zoomTransform(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight
    const nodeCount = graphData.nodes.length
    // Very dense graphs skip expensive SVG filters and per-link gradients so
    // initial render stays smooth. Medium-sized graphs keep the visual style.
    const isHeavy = nodeCount > 80
    const skipVisualEffects = nodeCount > 220
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

    const g = svg.append('g').attr('transform', preservedTransform.toString())

    const currentRelPath = currentFilePath ? currentFilePath.replace(vaultPath + '/', '').replace(vaultPath + '\\', '') : ''

    const linkCountMap = buildGraphRelationLinkCountMap(graphData.edges)

    const folderIdSet = new Set(graphData.nodes.filter((n: GraphNode) => n.type === 'folder').map((n: GraphNode) => n.id))
    const nodeToFolder = new Map<string, string>()
    graphData.edges.forEach((e: GraphEdge) => {
      if (folderIdSet.has(e.source) && !folderIdSet.has(e.target)) {
        nodeToFolder.set(e.target, e.source)
      }
    })

    const nodesForLayout = isLarge && nodeCount > 500
      ? graphData.nodes.filter((n: GraphNode) => n.type === 'folder' || (linkCountMap.get(n.id) || 0) > 0)
      : graphData.nodes

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

    const nodes: SimNode[] = nodesForLayout.map((n: { id: string; title: string; filePath?: string; type: 'file' | 'folder' }) => {
      const folderId = getGraphNodeGroupId(n, nodeToFolder, activeFolderPath)
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
      .map((e: GraphEdge) => ({ source: e.source, target: e.target, linkType: e.linkType, weight: e.weight }))

    const nodeMap = new Map<string, SimNode>()
    nodes.forEach((n) => nodeMap.set(n.id, n))
    nodeMapRef.current = nodeMap

    // Layout cache: when the same vault + mode is opened again, seed node
    // positions from the last simulation end so the graph doesn't fly
    // around. High hit rate also lets us start at a low alpha so the
    // worker barely needs to move anything.
    const layoutCacheKey = `${vaultPath ?? ''}::${graphScopeKey}`
    const cachedPositions = layoutCacheRef.current.get(layoutCacheKey)
    const { hits: positionSeedHits, hitRate: positionSeedHitRate } = seedNodePositionsFromCaches(
      nodes,
      cachedPositions,
      lastKnownNodePositionsRef.current,
    )
    const layoutStartAlpha = positionSeedHitRate >= 0.8 ? 0.08 : undefined

    // Link gradients for bone-joint style connections (skipped on very dense
    // graphs; we fall back to a plain stroke and avoid rewriting <stop> coords
    // each tick).
    if (!skipVisualEffects) {
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
        if (!skipVisualEffects) return `url(#link-grad-${i})`
        const sId = typeof l.source === 'string' ? l.source : l.source.id
        const tId = typeof l.target === 'string' ? l.target : l.target.id
        const sNode = nodeMap.get(sId)
        const tNode = nodeMap.get(tId)
        return sNode?.color || tNode?.color || 'var(--text-tertiary)'
      })
      .attr('stroke-width', (l) => Math.min(2.4, 0.8 + ((l.weight ?? 1) - 1) * 0.25))
      .attr('marker-end', showArrowsRef.current ? 'url(#arrowhead)' : null)

    const nodeGroup = g.append('g').attr('class', 'graph-nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'graph-node')
      .classed('group-hidden', (d) => isGraphNodeHiddenByGroup(d, hiddenGroupIdsRef.current))

    const isCurrentNode = (d: SimNode) => d.filePath === currentRelPath

    // Build all <defs> filters (multi-color, folder glow, file glow at 5
    // brightness levels, plus their hover variants) in one helper call.
    // When visual effects are skipped we get empty maps and fall through to
    // plain strokes.
    const {
      multiFilterIds,
      multiHoverFilterIds,
      folderFilterIds,
      folderHoverFilterIds,
      fileHoverFilterIds,
      fileLevelFilterIds,
    } = setupGraphFilters(defs, nodes, groupColorMap, skipVisualEffects)

    const nodeIndexMap = new Map<string, number>()
    nodes.forEach((n, i) => nodeIndexMap.set(n.id, i))

    nodeGroup.append('circle')
      .attr('class', 'node-core')
      .attr('r', (d) => getRadius(d))
      .attr('fill', (d) => getGraphNodeFill(d))
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
      .attr('class', (d) => `node-label${isCurrentNode(d) ? ' active' : d.type === 'folder' ? ' hub-label' : ''}${isGraphLabelHidden(d, showLabelsRef.current, isCurrentNode(d)) ? ' hidden' : ''}`)
      .attr('text-anchor', 'middle')
      .attr('y', (d) => {
        const r = getRadius(d)
        return d.type === 'folder' ? 4 : r + 14
      })

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
            .attr('fill', getGraphNodeFill(d))
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
            .classed('hidden', isGraphLabelHidden(d, showLabelsRef.current, isCurrent))
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
      if (d.type === 'folder') {
        openGraphFolder(d.filePath ?? '')
        return
      }
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
    svg.call(zoomBehavior.transform, preservedTransform)

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

      // Update link gradient positions only when gradients exist.
      if (!skipVisualEffects) {
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
      const positionsToCache = new Map<string, [number, number]>()
      for (const n of nodes) {
        if (n.x != null && n.y != null) {
          positionsToCache.set(n.id, [n.x, n.y])
          lastKnownNodePositionsRef.current.set(n.id, [n.x, n.y])
        }
      }
      if (positionsToCache.size > 0) {
        layoutCacheRef.current.set(layoutCacheKey, positionsToCache)
      }

      // Skip the auto-zoom on cache-hit reruns; the graph is already in
      // the user's expected layout and snapping the camera feels jarring.
      if (shouldSkipGraphAutoZoom(positionSeedHitRate, isVisibilityOnlyRerender)) return
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

    applyGroupVisibility(hiddenGroupIdsRef.current)

    const onTick = (positions: Array<string | number>) => {
      for (let i = 0; i < positions.length; i += 3) {
        const id = positions[i] as string
        const node = nodeMap.get(id)
        if (!node) continue
        node.x = positions[i + 1] as number
        node.y = positions[i + 2] as number
        lastKnownNodePositionsRef.current.set(id, [node.x, node.y])
      }
      if (pendingFrame) return
      pendingFrame = true
      requestAnimationFrame(() => {
        pendingFrame = false
        renderTick()
      })
    }
    tickHandlerRef.current = () => renderTick()

    // Initial paint from cached positions so the SVG isn't blank while
    // we wait for the first worker tick. Especially matters on cache hits
    // where the worker barely moves anything.
    if (positionSeedHits > 0) renderTick()

    const worker = new Worker(new URL('../../workers/graph-force-worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<{ type: 'tick'; payload: Array<string | number>; alpha: number } | { type: 'end' }>) => {
      const data = event.data
      if (data.type === 'tick') onTick(data.payload)
      else if (data.type === 'end') onEnd()
    }
    worker.postMessage({
      type: 'start',
      nodes: nodes.map((n) => ({ id: n.id, linkCount: n.linkCount, type: n.type, x: n.x, y: n.y })),
      links: links.map((l) => ({ source: typeof l.source === 'string' ? l.source : l.source.id, target: typeof l.target === 'string' ? l.target : l.target.id })),
      width,
      height,
      params: { chargeStrength, linkDistance, centerStrength, isLarge, isHeavy },
      startAlpha: layoutStartAlpha
    })

    graphBuiltForRef.current = graphDataKey

    return () => {
      worker.postMessage({ type: 'stop' })
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }
  }, [activeFolderPath, applyGroupVisibility, graphData, graphScopeKey, groupColorMap, openGraphFolder])

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
    const hiddenNodeIds = new Set<string>()

    svg.selectAll<SVGGElement, SimNode>('g.graph-node').each((d) => {
      if (isGraphNodeHiddenByDisplay(d, { showFolders, showOrphans, minLinks })) {
        hiddenNodeIds.add(d.id)
      }
    }).classed('filtered', (d) => hiddenNodeIds.has(d.id))
      .classed('dimmed', (d) => {
        if (hiddenNodeIds.has(d.id)) return false
        return !!q && !d.title.toLowerCase().includes(q)
      })

    svg.selectAll<SVGPathElement, SimLink>('path.graph-link').classed('filtered', (l) => {
      const sourceId = getLinkEndpointId(l.source)
      const targetId = getLinkEndpointId(l.target)
      return hiddenNodeIds.has(sourceId) || hiddenNodeIds.has(targetId)
    })
  }, [searchQuery, minLinks, showOrphans, showFolders, graphData])

  useEffect(() => {
    if (!svgRef.current || !graphData) return
    const svg = select(svgRef.current)
    const currentRelPath = currentFilePath ? currentFilePath.replace(vaultPath + '/', '').replace(vaultPath + '\\', '') : ''
    svg.selectAll<SVGTextElement, SimNode>('g.graph-node .node-label')
      .classed('hidden', (d) => isGraphLabelHidden(d, showLabels, d.filePath === currentRelPath))
  }, [showLabels, currentFilePath, vaultPath, graphData])

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
      <GraphPanel
        collapsed={panelCollapsed}
        onToggleCollapsed={setPanelCollapsed}
        graphData={graphData}
        groupColorMap={groupColorMap}
        vaultPath={vaultPath}
        activeFolderPath={activeFolderPath}
        onOpenOverview={openGraphOverview}
        onOpenParentFolder={openParentGraphFolder}
        hiddenGroupIds={hiddenGroupIds}
        onToggleGroup={toggleGroupVisibility}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        minLinks={minLinks}
        setMinLinks={setMinLinks}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        showOrphans={showOrphans}
        setShowOrphans={setShowOrphans}
        showArrows={showArrows}
        setShowArrows={setShowArrows}
        showFolders={showFolders}
        setShowFolders={setShowFolders}
        showExplicitEdges={showExplicitEdges}
        setShowExplicitEdges={setShowExplicitEdges}
        showInferredEdges={showInferredEdges}
        setShowInferredEdges={setShowInferredEdges}
        showFolderEdges={showFolderEdges}
        setShowFolderEdges={setShowFolderEdges}
        chargeStrength={chargeStrength}
        setChargeStrength={setChargeStrength}
        linkDistance={linkDistance}
        setLinkDistance={setLinkDistance}
        centerStrength={centerStrength}
        setCenterStrength={setCenterStrength}
        indexStatus={indexStatus}
        setIndexStatus={setIndexStatus}
        onOpenInferConfirm={() => setConfirmInferOpen(true)}
        onStartAi={() => {
          aiStopRequestedRef.current = false
          silentMemoryRefreshRef.current = false
        }}
        onStopAi={() => {
          aiStopRequestedRef.current = true
          window.api.invoke('ai:stop', undefined).catch(() => {})
          setIndexStatus('已请求停止 AI 任务')
        }}
        onBackToEditor={() => setMainView('editor')}
      />
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
