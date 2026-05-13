import { useEffect, useRef, useState, useCallback } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import { select } from 'd3-selection'
import { zoom } from 'd3-zoom'
import { drag } from 'd3-drag'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import type { GraphData } from '@shared/types/ipc'

interface SimNode {
  id: string
  title: string
  filePath?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  linkCount: number
}

interface SimLink {
  source: string | SimNode
  target: string | SimNode
}

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null)
  const graphBuiltForRef = useRef<string | null>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

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
    return () => { cleanup() }
  }, [vaultPath])

  const updateHighlight = useCallback((currentTitle: string) => {
    if (!svgRef.current) return
    const svg = select(svgRef.current)

    svg.selectAll<SVGGElement, SimNode>('g.node-group').each(function (d) {
      const group = select(this)
      const isCurrent = d.title === currentTitle

      const getRadius = (n: SimNode) => Math.max(3, Math.min(8, 3 + n.linkCount * 1.2))

      group.select('.neuron-halo')
        .attr('r', isCurrent ? getRadius(d) + 18 : getRadius(d) + 12)
        .attr('fill', isCurrent ? 'url(#neuron-glow)' : d.linkCount > 0 ? 'url(#neuron-glow)' : 'url(#neuron-dim)')
        .attr('opacity', isCurrent ? 1 : Math.min(0.6, 0.2 + d.linkCount * 0.1))

      group.select('.neuron-soma')
        .attr('r', isCurrent ? getRadius(d) + 4 : getRadius(d))
        .attr('fill', isCurrent ? '#a89cf8' : d.linkCount > 0 ? '#7c6ef5' : '#666666')
        .attr('opacity', isCurrent ? 1 : d.linkCount > 0 ? 0.9 : 0.5)
        .attr('filter', isCurrent || d.linkCount > 2 ? 'url(#glow)' : 'none')

      group.select('.neuron-nucleus')
        .attr('r', isCurrent ? 4 : Math.max(1.5, getRadius(d) * 0.4))
        .attr('opacity', isCurrent ? 0.9 : d.linkCount > 0 ? 0.7 : 0.2)

      group.select('.neuron-label')
        .attr('x', isCurrent ? getRadius(d) + 14 : getRadius(d) + 10)
        .attr('font-size', isCurrent ? '12px' : '10px')
        .attr('font-weight', isCurrent ? '600' : '400')
        .attr('fill', isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)')
        .attr('opacity', isCurrent ? 1 : 0.7)
    })
  }, [])

  // Update highlight when currentFilePath changes without rebuilding the graph
  useEffect(() => {
    if (!graphData || !svgRef.current) return
    if (!graphBuiltForRef.current) return
    const currentTitle = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || ''
    updateHighlight(currentTitle)
  }, [currentFilePath, updateHighlight, graphData])

  // Build the graph only when graphData changes
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

    if (!isLarge) {
      const glowGrad = defs.append('radialGradient').attr('id', 'neuron-glow')
      glowGrad.append('stop').attr('offset', '0%').attr('stop-color', '#7c6ef5').attr('stop-opacity', 0.6)
      glowGrad.append('stop').attr('offset', '50%').attr('stop-color', '#7c6ef5').attr('stop-opacity', 0.15)
      glowGrad.append('stop').attr('offset', '100%').attr('stop-color', '#7c6ef5').attr('stop-opacity', 0)

      const dimGrad = defs.append('radialGradient').attr('id', 'neuron-dim')
      dimGrad.append('stop').attr('offset', '0%').attr('stop-color', '#999999').attr('stop-opacity', 0.4)
      dimGrad.append('stop').attr('offset', '100%').attr('stop-color', '#999999').attr('stop-opacity', 0)

      const synapseGrad = defs.append('linearGradient').attr('id', 'synapse-grad')
      synapseGrad.append('stop').attr('offset', '0%').attr('stop-color', '#7c6ef5').attr('stop-opacity', 0.5)
      synapseGrad.append('stop').attr('offset', '50%').attr('stop-color', '#7c6ef5').attr('stop-opacity', 0.2)
      synapseGrad.append('stop').attr('offset', '100%').attr('stop-color', '#7c6ef5').attr('stop-opacity', 0.5)

      const filter = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
      filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur')
      filter.append('feMerge').selectAll('feMergeNode').data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', (d) => d)
    }

    const g = svg.append('g')

    const currentTitle = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || ''

    const linkCountMap = new Map<string, number>()
    graphData.edges.forEach((e) => {
      linkCountMap.set(e.source, (linkCountMap.get(e.source) || 0) + 1)
      linkCountMap.set(e.target, (linkCountMap.get(e.target) || 0) + 1)
    })

    const filteredNodes = isLarge && nodeCount > 500
      ? graphData.nodes.filter((n) => (linkCountMap.get(n.id) || 0) > 0)
      : graphData.nodes

    const nodes: SimNode[] = filteredNodes.map((n) => ({
      ...n,
      linkCount: linkCountMap.get(n.id) || 0
    }))
    const nodeIds = new Set(nodes.map((n) => n.id))
    const links: SimLink[] = graphData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))

    const getRadius = (d: SimNode) => Math.max(3, Math.min(8, 3 + d.linkCount * 1.2))

    const simulation = forceSimulation(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(isLarge ? 50 : 80).strength(0.4))
      .force('charge', forceManyBody().strength(isLarge ? -80 : -200).distanceMax(isLarge ? 200 : 350))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<SimNode>((d) => getRadius(d) + (isLarge ? 10 : 20)))
      .force('x', forceX(width / 2).strength(0.015))
      .force('y', forceY(height / 2).strength(0.015))

    simulationRef.current = simulation

    const link = g.append('g')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', 'url(#synapse-grad)')
      .attr('stroke-width', 0.8)
      .attr('stroke-opacity', 0.35)

    const nodeGroup = g.append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node-group')
      .attr('cursor', 'pointer')

    const isCurrentNode = (d: SimNode) => d.title === currentTitle

    nodeGroup.append('circle')
      .attr('r', (d) => isCurrentNode(d) ? getRadius(d) + 18 : getRadius(d) + 12)
      .attr('fill', (d) => isCurrentNode(d) ? 'url(#neuron-glow)' : d.linkCount > 0 ? 'url(#neuron-glow)' : 'url(#neuron-dim)')
      .attr('opacity', (d) => isCurrentNode(d) ? 1 : Math.min(0.6, 0.2 + d.linkCount * 0.1))
      .attr('class', 'neuron-halo')

    nodeGroup.append('circle')
      .attr('r', (d) => isCurrentNode(d) ? getRadius(d) + 4 : getRadius(d))
      .attr('fill', (d) => isCurrentNode(d) ? '#a89cf8' : d.linkCount > 0 ? '#7c6ef5' : '#666666')
      .attr('opacity', (d) => isCurrentNode(d) ? 1 : d.linkCount > 0 ? 0.9 : 0.5)
      .attr('filter', (d) => isCurrentNode(d) || d.linkCount > 2 ? 'url(#glow)' : 'none')
      .attr('class', 'neuron-soma')

    nodeGroup.append('circle')
      .attr('r', (d) => isCurrentNode(d) ? 4 : Math.max(1.5, getRadius(d) * 0.4))
      .attr('fill', '#ffffff')
      .attr('opacity', (d) => isCurrentNode(d) ? 0.9 : d.linkCount > 0 ? 0.7 : 0.2)
      .attr('class', 'neuron-nucleus')

    nodeGroup.append('text')
      .text((d) => d.title)
      .attr('x', (d) => (isCurrentNode(d) ? getRadius(d) + 14 : getRadius(d) + 10))
      .attr('y', 3)
      .attr('font-size', (d) => isCurrentNode(d) ? '12px' : '10px')
      .attr('font-weight', (d) => isCurrentNode(d) ? '600' : '400')
      .attr('fill', (d) => isCurrentNode(d) ? 'var(--text-primary)' : 'var(--text-secondary)')
      .attr('font-family', 'Inter, system-ui, sans-serif')
      .attr('opacity', (d) => isCurrentNode(d) ? 1 : 0.7)
      .attr('class', 'neuron-label')

    nodeGroup
      .on('mouseenter', function (_event, d) {
        select(this).select('.neuron-halo').attr('opacity', 0.8)
        select(this).select('.neuron-soma').attr('fill', '#a89cf8').attr('opacity', 1)
        select(this).select('.neuron-label').attr('opacity', 1).attr('fill', 'var(--text-primary)')

        const connectedIds = new Set<string>()
        links.forEach((l) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id
          const t = typeof l.target === 'string' ? l.target : l.target.id
          if (s === d.id) connectedIds.add(t)
          if (t === d.id) connectedIds.add(s)
        })

        nodeGroup.attr('opacity', (n) => n.id === d.id || connectedIds.has(n.id) ? 1 : 0.15)
        link.attr('stroke-opacity', (l: any) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id
          const t = typeof l.target === 'string' ? l.target : l.target.id
          return s === d.id || t === d.id ? 0.7 : 0.05
        }).attr('stroke-width', (l: any) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id
          const t = typeof l.target === 'string' ? l.target : l.target.id
          return s === d.id || t === d.id ? 1.5 : 0.8
        })
      })
      .on('mouseleave', function (_event, d) {
        select(this).select('.neuron-halo').attr('opacity', Math.min(0.6, 0.2 + d.linkCount * 0.1))
        select(this).select('.neuron-soma')
          .attr('fill', d.linkCount > 0 ? '#7c6ef5' : '#666666')
          .attr('opacity', d.linkCount > 0 ? 0.9 : 0.5)
        select(this).select('.neuron-label').attr('opacity', 0.7).attr('fill', 'var(--text-secondary)')
        nodeGroup.attr('opacity', 1)
        link.attr('stroke-opacity', 0.35).attr('stroke-width', 0.8)
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
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)

    simulation.on('end', () => {
      const currentNode = nodes.find((n) => n.title === currentTitle)
      if (currentNode && currentNode.x != null && currentNode.y != null) {
        const { x, y } = currentNode
        const transform = { k: 1.2, x: width / 2 - x * 1.2, y: height / 2 - y * 1.2 }
        svg.transition().duration(600).call(
          zoomBehavior.transform as any,
          { k: transform.k, x: transform.x, y: transform.y } as any
        )
      }
    })

    simulation.on('tick', () => {
      link.attr('d', (d: any) => {
        const dx = d.target.x - d.source.x
        const dy = d.target.y - d.source.y
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.5
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`
      })

      nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    graphBuiltForRef.current = JSON.stringify(graphData)

    return () => { simulation.stop() }
  }, [graphData])

  // Highlight nodes matching search query
  useEffect(() => {
    if (!svgRef.current || !graphData) return
    const svg = select(svgRef.current)
    if (!searchQuery.trim()) {
      svg.selectAll<SVGGElement, SimNode>('g.node-group').attr('opacity', 1)
      return
    }
    const q = searchQuery.toLowerCase()
    svg.selectAll<SVGGElement, SimNode>('g.node-group').attr('opacity', (d) =>
      d.title.toLowerCase().includes(q) ? 1 : 0.15
    )
  }, [searchQuery, graphData])

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>暂无图谱数据</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', opacity: 0.6 }}>在笔记中使用 [[链接]] 建立关系</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="搜索节点..."
        style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, width: 160, height: 28, padding: '0 8px', fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none' }}
      />
      <svg ref={svgRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />
    </div>
  )
}

