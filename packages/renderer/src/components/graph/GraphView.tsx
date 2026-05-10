import { useEffect, useRef, useState } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
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
}

interface SimLink {
  source: string | SimNode
  target: string | SimNode
}

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
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

    const g = svg.append('g')

    const nodes: SimNode[] = graphData.nodes.map((n) => ({ ...n }))
    const links: SimLink[] = graphData.edges.map((e) => ({ source: e.source, target: e.target }))

    const simulation = forceSimulation(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(80))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide(30))

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'var(--border-default)')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6)

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')

    node.append('circle')
      .attr('r', 5)
      .attr('fill', 'var(--accent)')
      .attr('stroke', 'var(--accent-text)')
      .attr('stroke-width', 1.5)

    node.append('text')
      .text((d) => d.title)
      .attr('x', 10)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-family', 'Inter, sans-serif')

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

    node.call(dragBehavior)

    node.on('click', async (_event, d) => {
      if (!vaultPath) return
      const notes = await window.api.invoke('db:search-notes', { vaultPath, query: d.title })
      if (notes.length > 0) {
        openFile(`${vaultPath}/${notes[0].filePath}`)
      }
    })

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => { simulation.stop() }
  }, [graphData])

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px] text-[var(--text-tertiary)]">暂无图谱数据</p>
      </div>
    )
  }

  return (
    <svg ref={svgRef} className="w-full h-full" style={{ background: 'var(--bg-base)' }} />
  )
}
