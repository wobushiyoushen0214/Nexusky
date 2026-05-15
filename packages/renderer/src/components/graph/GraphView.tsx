import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import { select } from 'd3-selection'
import { zoom } from 'd3-zoom'
import { drag } from 'd3-drag'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import type { GraphData, GraphNode } from '@shared/types/ipc'
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
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null)
  const graphBuiltForRef = useRef<string | null>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const setMainView = useUIStore((s) => s.setMainView)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [minLinks, setMinLinks] = useState(0)
  const [showLabels, setShowLabels] = useState(true)
  const [showOrphans, setShowOrphans] = useState(true)
  const [showArrows, setShowArrows] = useState(false)
  const [showFolders, setShowFolders] = useState(true)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [chargeStrength, setChargeStrength] = useState(-350)
  const [linkDistance, setLinkDistance] = useState(80)
  const [centerStrength, setCenterStrength] = useState(0.02)

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
    window.api.invoke('db:get-graph', { vaultPath }).then(setGraphData)
  }, [vaultPath])

  useEffect(() => {
    if (!vaultPath) return
    const refresh = () => {
      window.api.invoke('db:get-graph', { vaultPath }).then(setGraphData)
    }
    const cleanup = window.api.onVaultChanged(refresh)
    window.addEventListener('graph-data-updated', refresh)
    return () => { cleanup(); window.removeEventListener('graph-data-updated', refresh) }
  }, [vaultPath])

  const showLabelsRef = useRef(showLabels)
  showLabelsRef.current = showLabels

  const showArrowsRef = useRef(showArrows)
  showArrowsRef.current = showArrows

  const updateHighlight = useCallback((currentTitle: string) => {
    if (!svgRef.current) return
    const svg = select(svgRef.current)

    svg.selectAll<SVGGElement, SimNode>('g.graph-node').each(function (d) {
      const group = select(this)
      const isCurrent = d.title === currentTitle
      const isFolder = d.type === 'folder'
      const r = getRadius(d)
      const nodeFill = isCurrent ? 'var(--accent-text)' : 'var(--bg-base)'

      group.select('.node-core')
        .attr('r', r)
        .attr('fill', nodeFill)
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
    const currentTitle = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || ''
    updateHighlight(currentTitle)
  }, [currentFilePath, updateHighlight, graphData])

  useEffect(() => {
    if (!graphData || !svgRef.current) return
    if (graphData.nodes.length === 0) return

    if (simulationRef.current) {
      simulationRef.current.stop()
      simulationRef.current = null
    }

    const svg = select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight
    const nodeCount = graphData.nodes.length
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

    const currentTitle = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || ''

    const linkCountMap = new Map<string, number>()
    graphData.edges.forEach((e: { source: string; target: string }) => {
      linkCountMap.set(e.source, (linkCountMap.get(e.source) || 0) + 1)
      linkCountMap.set(e.target, (linkCountMap.get(e.target) || 0) + 1)
    })

    const filteredNodes = isLarge && nodeCount > 500
      ? graphData.nodes.filter((n: { id: string }) => (linkCountMap.get(n.id) || 0) > 0)
      : graphData.nodes

    const folderIdSet = new Set(graphData.nodes.filter((n: GraphNode) => n.type === 'folder').map((n: GraphNode) => n.id))
    const nodeToFolder = new Map<string, string>()
    graphData.edges.forEach((e: { source: string; target: string }) => {
      if (folderIdSet.has(e.source) && !folderIdSet.has(e.target)) {
        nodeToFolder.set(e.target, e.source)
      }
    })

    const nodes: SimNode[] = filteredNodes.map((n: { id: string; title: string; filePath?: string; type: 'file' | 'folder' }) => {
      const folderId = n.type === 'folder' ? n.id : nodeToFolder.get(n.id)
      const color = folderId ? groupColorMap.get(folderId) : undefined

      const incomingColors = new Set<string>()
      if (color) incomingColors.add(color)
      graphData.edges.forEach((e: { source: string; target: string }) => {
        if (e.target === n.id && e.source !== n.id) {
          const srcFolderId = folderIdSet.has(e.source) ? e.source : nodeToFolder.get(e.source)
          if (srcFolderId) {
            const srcColor = groupColorMap.get(srcFolderId)
            if (srcColor) incomingColors.add(srcColor)
          }
        }
      })

      const colorsArr = [...incomingColors]
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
      .filter((e: { source: string; target: string }) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e: { source: string; target: string }) => ({ source: e.source, target: e.target }))

    const simulation = forceSimulation(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(isLarge ? 50 : linkDistance).strength(0.4))
      .force('charge', forceManyBody().strength(isLarge ? -150 : chargeStrength).distanceMax(isLarge ? 300 : 500))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<SimNode>((d) => getRadius(d) + (isLarge ? 8 : 16)))
      .force('x', forceX(width / 2).strength(centerStrength))
      .force('y', forceY(height / 2).strength(centerStrength))

    simulationRef.current = simulation

    const nodeMap = new Map<string, SimNode>()
    nodes.forEach((n) => nodeMap.set(n.id, n))

    const linkGroup = g.append('g').attr('class', 'graph-links')
    const link = linkGroup
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'graph-link')
      .attr('stroke', (l) => {
        const sId = typeof l.source === 'string' ? l.source : l.source.id
        const tId = typeof l.target === 'string' ? l.target : l.target.id
        const sNode = nodeMap.get(sId)
        const tNode = nodeMap.get(tId)
        return sNode?.color || tNode?.color || 'var(--text-tertiary)'
      })
      .attr('stroke-width', 0.5)
      .attr('marker-end', showArrowsRef.current ? 'url(#arrowhead)' : null)

    const nodeGroup = g.append('g').attr('class', 'graph-nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'graph-node')

    const isCurrentNode = (d: SimNode) => d.title === currentTitle

    // Create gradients and multi-color filters for multi-group nodes
    const multiFilterIds = new Map<number, string>()
    const multiHoverFilterIds = new Map<number, string>()
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

        const hBlurOuter = isFolder ? 14 : 7
        n.colors.forEach((c, ci) => {
          hFilter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', String(hBlurOuter)).attr('result', `outerBlur${ci}`)
          hFilter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String(0.7 / n.colors!.length * 2)).attr('result', `outerColor${ci}`)
          hFilter.append('feComposite').attr('in', `outerColor${ci}`).attr('in2', `outerBlur${ci}`).attr('operator', 'in').attr('result', `outerGlow${ci}`)
        })

        hFilter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', String(erodeR)).attr('result', 'eroded')
        hFilter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
        hFilter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', String(blurInner)).attr('result', 'borderBlur')

        n.colors.forEach((c, ci) => {
          hFilter.append('feFlood').attr('flood-color', c).attr('flood-opacity', String((isFolder ? 0.6 : 0.8) / n.colors!.length * 2)).attr('result', `innerColor${ci}`)
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

    // Create folder glow filters per color
    const folderFilterIds = new Map<string, string>()
    groupColorMap.forEach((color, folderId) => {
      const filterId = `folder-glow-${folderId.replace(/[^a-zA-Z0-9]/g, '_')}`
      folderFilterIds.set(folderId, filterId)
      const filter = defs.append('filter')
        .attr('id', filterId)
        .attr('x', '-150%').attr('y', '-150%')
        .attr('width', '400%').attr('height', '400%')

      // Outer glow
      filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', '10').attr('result', 'outerBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.4').attr('result', 'outerColor')
      filter.append('feComposite').attr('in', 'outerColor').attr('in2', 'outerBlur').attr('operator', 'in').attr('result', 'outerGlow')

      // Inner shadow at edges
      filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', '2').attr('result', 'eroded')
      filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
      filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', '3').attr('result', 'borderBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.35').attr('result', 'innerColor')
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

    // Small file node glow filter per color
    const fileFilterIds = new Map<string, string>()
    groupColorMap.forEach((color, folderId) => {
      const filterId = `file-glow-${folderId.replace(/[^a-zA-Z0-9]/g, '_')}`
      fileFilterIds.set(folderId, filterId)
      const filter = defs.append('filter')
        .attr('id', filterId)
        .attr('x', '-150%').attr('y', '-150%')
        .attr('width', '400%').attr('height', '400%')

      // Outer glow
      filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', '4').attr('result', 'outerBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.4').attr('result', 'outerColor')
      filter.append('feComposite').attr('in', 'outerColor').attr('in2', 'outerBlur').attr('operator', 'in').attr('result', 'outerGlow')

      // Inner shadow
      filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', '1').attr('result', 'eroded')
      filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
      filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', '1.5').attr('result', 'borderBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.5').attr('result', 'innerColor')
      filter.append('feComposite').attr('in', 'innerColor').attr('in2', 'borderBlur').attr('operator', 'in').attr('result', 'innerColored')
      filter.append('feComposite').attr('in', 'innerColored').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'innerGlow')

      const merge = filter.append('feMerge')
      merge.append('feMergeNode').attr('in', 'outerGlow')
      merge.append('feMergeNode').attr('in', 'SourceGraphic')
      merge.append('feMergeNode').attr('in', 'innerGlow')
    })

    const getNodeFill = (d: SimNode, idx: number) => {
      if (isCurrentNode(d)) return 'var(--accent-text)'
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
      .attr('stroke-opacity', (d) => d.type === 'folder' ? 0.6 : 0.5)
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
          const fId = fileFilterIds.get(d.group)
          return fId ? `url(#${fId})` : null
        }
        return null
      })

    // Pulse ring on current node
    nodeGroup.filter(isCurrentNode).append('circle')
      .attr('class', 'node-pulse')
      .attr('r', (d) => getRadius(d) + 8)

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
    groupColorMap.forEach((color, folderId) => {
      const filterId = `folder-hover-${folderId.replace(/[^a-zA-Z0-9]/g, '_')}`
      folderHoverFilterIds.set(folderId, filterId)
      const filter = defs.append('filter')
        .attr('id', filterId)
        .attr('x', '-200%').attr('y', '-200%')
        .attr('width', '500%').attr('height', '500%')

      filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', '14').attr('result', 'outerBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.7').attr('result', 'outerColor')
      filter.append('feComposite').attr('in', 'outerColor').attr('in2', 'outerBlur').attr('operator', 'in').attr('result', 'outerGlow')

      filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', '2').attr('result', 'eroded')
      filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
      filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', '3').attr('result', 'borderBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.6').attr('result', 'innerColor')
      filter.append('feComposite').attr('in', 'innerColor').attr('in2', 'borderBlur').attr('operator', 'in').attr('result', 'innerColored')
      filter.append('feComposite').attr('in', 'innerColored').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'innerGlow')

      filter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '1').attr('result', 'blurredSrc')
      filter.append('feComposite').attr('in', 'blurredSrc').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'blurClipped')

      const merge = filter.append('feMerge')
      merge.append('feMergeNode').attr('in', 'outerGlow')
      merge.append('feMergeNode').attr('in', 'blurClipped')
      merge.append('feMergeNode').attr('in', 'innerGlow')
    })

    const fileHoverFilterIds = new Map<string, string>()
    groupColorMap.forEach((color, folderId) => {
      const filterId = `file-hover-${folderId.replace(/[^a-zA-Z0-9]/g, '_')}`
      fileHoverFilterIds.set(folderId, filterId)
      const filter = defs.append('filter')
        .attr('id', filterId)
        .attr('x', '-200%').attr('y', '-200%')
        .attr('width', '500%').attr('height', '500%')

      filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', '7').attr('result', 'outerBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.7').attr('result', 'outerColor')
      filter.append('feComposite').attr('in', 'outerColor').attr('in2', 'outerBlur').attr('operator', 'in').attr('result', 'outerGlow')

      filter.append('feMorphology').attr('in', 'SourceAlpha').attr('operator', 'erode').attr('radius', '1').attr('result', 'eroded')
      filter.append('feComposite').attr('in', 'SourceAlpha').attr('in2', 'eroded').attr('operator', 'out').attr('result', 'borderRing')
      filter.append('feGaussianBlur').attr('in', 'borderRing').attr('stdDeviation', '1.5').attr('result', 'borderBlur')
      filter.append('feFlood').attr('flood-color', color).attr('flood-opacity', '0.8').attr('result', 'innerColor')
      filter.append('feComposite').attr('in', 'innerColor').attr('in2', 'borderBlur').attr('operator', 'in').attr('result', 'innerColored')
      filter.append('feComposite').attr('in', 'innerColored').attr('in2', 'SourceAlpha').attr('operator', 'in').attr('result', 'innerGlow')

      const merge = filter.append('feMerge')
      merge.append('feMergeNode').attr('in', 'outerGlow')
      merge.append('feMergeNode').attr('in', 'SourceGraphic')
      merge.append('feMergeNode').attr('in', 'innerGlow')
    })

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
          const s = typeof l.source === 'string' ? l.source : l.source.id
          const t = typeof l.target === 'string' ? l.target : l.target.id
          if (s === d.id) connectedIds.add(t)
          if (t === d.id) connectedIds.add(s)
        })

        nodeGroup.classed('dimmed', (n) => n.id !== d.id && !connectedIds.has(n.id))

        link.classed('highlighted', (l: any) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id
          const t = typeof l.target === 'string' ? l.target : l.target.id
          return s === d.id || t === d.id
        }).classed('dimmed', (l: any) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id
          const t = typeof l.target === 'string' ? l.target : l.target.id
          return s !== d.id && t !== d.id
        })
      })
      .on('mouseleave', function () {
        nodeGroup.classed('dimmed', false)
        link.classed('highlighted', false).classed('dimmed', false)

        nodeGroup.each(function (d) {
          const group = select(this)
          const isCurrent = d.title === currentTitle
          const r = getRadius(d)
          const nodeFill = isCurrent ? 'var(--accent-text)' : 'var(--bg-base)'
          group.select('.node-core')
            .attr('r', r)
            .attr('fill', nodeFill)
            .attr('opacity', 1)
            .attr('stroke-opacity', d.type === 'folder' ? 0.6 : 0.5)
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
                const fId = fileFilterIds.get(d.group)
                return fId ? `url(#${fId})` : null
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
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    nodeGroup.call(dragBehavior)

    nodeGroup.on('click', async (_event, d) => {
      if (!vaultPath) return
      if (d.filePath) {
        openFile(`${vaultPath}/${d.filePath}`)
      }
    })

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)

    simulation.on('end', () => {
      const currentNode = nodes.find((n) => n.title === currentTitle)
      if (currentNode && currentNode.x != null && currentNode.y != null) {
        const { x, y } = currentNode
        const transform = { k: 1.2, x: width / 2 - x * 1.2, y: height / 2 - y * 1.2 }
        svg.transition().duration(800).call(
          zoomBehavior.transform as any,
          { k: transform.k, x: transform.x, y: transform.y } as any
        )
      }
    })

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => {
          const dx = d.target.x - d.source.x
          const dy = d.target.y - d.source.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          return d.source.x + (dx / dist) * getRadius(d.source as SimNode)
        })
        .attr('y1', (d: any) => {
          const dx = d.target.x - d.source.x
          const dy = d.target.y - d.source.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          return d.source.y + (dy / dist) * getRadius(d.source as SimNode)
        })
        .attr('x2', (d: any) => {
          const dx = d.target.x - d.source.x
          const dy = d.target.y - d.source.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          return d.target.x - (dx / dist) * getRadius(d.target as SimNode)
        })
        .attr('y2', (d: any) => {
          const dx = d.target.x - d.source.x
          const dy = d.target.y - d.source.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          return d.target.y - (dy / dist) * getRadius(d.target as SimNode)
        })

      nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    graphBuiltForRef.current = JSON.stringify(graphData)

    return () => { simulation.stop() }
  }, [graphData, groupColorMap])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = select(svgRef.current)
    svg.selectAll('.graph-link').attr('marker-end', showArrows ? 'url(#arrowhead)' : null)
  }, [showArrows])

  useEffect(() => {
    if (!simulationRef.current) return
    const sim = simulationRef.current
    const nodeCount = graphData?.nodes.length || 0
    const isLarge = nodeCount > 200
    const linkForce = sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>> | null
    if (linkForce) {
      linkForce.distance(isLarge ? 50 : linkDistance)
    }
    sim.force('charge', forceManyBody().strength(isLarge ? -150 : chargeStrength).distanceMax(isLarge ? 300 : 500))
    sim.force('x', forceX().strength(centerStrength))
    sim.force('y', forceY().strength(centerStrength))
    sim.alpha(0.3).restart()
  }, [chargeStrength, linkDistance, centerStrength])

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

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-inner">
          <p className="graph-empty-title">暂无图谱数据</p>
          <p className="graph-empty-hint">在笔记中使用 [[链接]] 建立关系</p>
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
            GRAPH
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
              <div className="graph-panel-section-title">FILTERS</div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="graph-search"
              />
              <label className="graph-filter-label">
                链接 ≥
                <select
                  value={minLinks}
                  onChange={(e) => setMinLinks(Number(e.target.value))}
                  className="graph-filter-select"
                >
                  <option value={0}>全部</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </label>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">GROUPS</div>
              <div className="graph-groups-list">
                {graphData.nodes.filter((n: GraphNode) => n.type === 'folder').map((folder: GraphNode) => (
                  <div key={folder.id} className="graph-group-item">
                    <span className="graph-group-dot" style={{ background: groupColorMap.get(folder.id) }} />
                    <span className="graph-group-name">{folder.title}</span>
                  </div>
                ))}
                {graphData.nodes.filter((n: GraphNode) => n.type === 'folder').length === 0 && (
                  <div className="graph-panel-info">无文件夹分组</div>
                )}
              </div>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">DISPLAY</div>
              <label className="graph-toggle">
                <span>Labels</span>
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span>Orphans</span>
                <input type="checkbox" checked={showOrphans} onChange={(e) => setShowOrphans(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span>Arrows</span>
                <input type="checkbox" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span>Folders</span>
                <input type="checkbox" checked={showFolders} onChange={(e) => setShowFolders(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">FORCES</div>
              <label className="graph-slider-label">
                <span>斥力</span>
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
                <span>距离</span>
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
                <span>聚合</span>
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
              <div className="graph-panel-section-title">INFO</div>
              <div className="graph-panel-info">
                {graphData.nodes.length} 节点 · {graphData.edges.length} 连接
              </div>
            </div>

            <div className="graph-panel-footer">
              <button className="graph-back-btn" onClick={() => setMainView('editor')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
                返回编辑器
              </button>
            </div>
          </>
        )}
      </div>
      <svg ref={svgRef} className="graph-svg" />
    </div>
  )
}
