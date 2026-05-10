import { useEffect, useRef, useState } from 'react'
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
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const [graphData, setGraphData] = useState<GraphData | null>(null)

  useEffect(() => {
    if (!vaultPath) return
    window.api.invoke('db:get-graph', { vaultPath }).then(setGraphData)
  }, [vaultPath])

  useEffect(() => {
    if (!graphData || !svgRef.current) return
    if (graphData.nodes.length === 0) return

    const svg = select(svgRef.current)
    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    svg.selectAll('*').remove()

    const defs = svg.append('defs')
    const gradient = defs.append('radialGradient').attr('id', 'node-glow')
    gradient.append('stop').attr('offset', '0%').attr('stop-color', 'var(--accent)').attr('stop-opacity', 0.6)
    gradient.append('stop').attr('offset', '100%').attr('stop-color', 'var(--accent)').attr('stop-opacity', 0)

    const g = svg.append('g')

    const linkCountMap = new Map<string, number>()
    graphData.edges.forEach((e) => {
      linkCountMap.set(e.source, (linkCountMap.get(e.source) || 0) + 1)
      linkCountMap.set(e.target, (linkCountMap.get(e.target) || 0) + 1)
    })

    const nodes: SimNode[] = graphData.nodes.map((n) => ({
      ...n,
      linkCount: linkCountMap.get(n.id) || 0
    }))
    const links: SimLink[] = graphData.edges.map((e) => ({ source: e.source, target: e.target }))

    const getRadius = (d: SimNode) => Math.max(4, Math.min(12, 4 + d.linkCount * 1.5))

    const simulation = forceSimulation(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(100).strength(0.5))
      .force('charge', forceManyBody().strength(-300).distanceMax(400))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<SimNode>((d) => getRadius(d) + 10))
      .force('x', forceX(width / 2).strength(0.02))
      .force('y', forceY(height / 2).strength(0.02))

    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'var(--border-default)')
      .attr('stroke-width', 0.8)
      .attr('stroke-opacity', 0.4)

    const nodeGroup = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')

    // Glow for active node
    nodeGroup.append('circle')
      .attr('r', (d) => getRadius(d) + 8)
      .attr('fill', 'url(#node-glow)')
      .attr('opacity', 0)
      .attr('class', 'node-glow')

    // Main circle
    nodeGroup.append('circle')
      .attr('r', getRadius)
      .attr('fill', (d) => d.linkCount > 0 ? 'var(--accent)' : 'var(--text-tertiary)')
      .attr('stroke', 'var(--bg-base)')
      .attr('stroke-width', 2)
      .attr('class', 'node-circle')

    // Label
    nodeGroup.append('text')
      .text((d) => d.title)
      .attr('x', (d) => getRadius(d) + 6)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', 'var(--text-tertiary)')
      .attr('font-family', 'Inter, system-ui, sans-serif')
      .attr('opacity', 0.8)
      .attr('class', 'node-label')

    // Hover interactions
    nodeGroup
      .on('mouseenter', function (_event, d) {
        select(this).select('.node-glow').attr('opacity', 1)
        select(this).select('.node-label').attr('fill', 'var(--text-primary)').attr('opacity', 1).attr('font-size', '11px')
        select(this).select('.node-circle').attr('stroke', 'var(--accent-text)').attr('stroke-width', 2)

        const connectedIds = new Set<string>()
        links.forEach((l) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id
          const t = typeof l.target === 'string' ? l.target : l.target.id
          if (s === d.id) connectedIds.add(t)
          if (t === d.id) connectedIds.add(s)
        })

        nodeGroup.attr('opacity', (n) => n.id === d.id || connectedIds.has(n.id) ? 1 : 0.2)
        link.attr('stroke-opacity', (l: any) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id
          const t = typeof l.target === 'string' ? l.target : l.target.id
          return s === d.id || t === d.id ? 0.8 : 0.1
        }).attr('stroke-width', (l: any) => {
          const s = typeof l.source === 'string' ? l.source : l.source.id
          const t = typeof l.target === 'string' ? l.target : l.target.id
          return s === d.id || t === d.id ? 1.5 : 0.8
        })
      })
      .on('mouseleave', function () {
        select(this).select('.node-glow').attr('opacity', 0)
        select(this).select('.node-label').attr('fill', 'var(--text-tertiary)').attr('opacity', 0.8).attr('font-size', '10px')
        select(this).select('.node-circle').attr('stroke', 'var(--bg-base)').attr('stroke-width', 2)
        nodeGroup.attr('opacity', 1)
        link.attr('stroke-opacity', 0.4).attr('stroke-width', 0.8)
      })

    // Drag
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

    // Click to open
    nodeGroup.on('click', async (_event, d) => {
      if (!vaultPath) return
      const notes = await window.api.invoke('db:search-notes', { vaultPath, query: d.title })
      if (notes.length > 0) {
        openFile(`${vaultPath}/${notes[0].filePath}`)
      }
    })

    // Zoom
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => { simulation.stop() }
  }, [graphData, currentFilePath])

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
    <svg ref={svgRef} style={{ width: '100%', height: '100%', background: 'var(--bg-base)' }} />
  )
}
