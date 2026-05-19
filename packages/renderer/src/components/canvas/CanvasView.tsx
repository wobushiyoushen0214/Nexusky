import { type PointerEvent as ReactPointerEvent, type WheelEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { toast } from '../../stores/toast-store'
import { safeGetJSON, safeSetJSON } from '../../utils/storage'
import type { GraphData, PropertyTableRow } from '@shared/types/ipc'

interface CanvasPosition {
  x: number
  y: number
}

interface DragState {
  id: string
  offsetX: number
  offsetY: number
}

interface PanState {
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

const CARD_WIDTH = 210
const CARD_HEIGHT = 112
const BASE_CANVAS_WIDTH = 1200
const BASE_CANVAS_HEIGHT = 760
const CANVAS_PADDING = 760

function getCanvasStorageKey(vaultPath: string): string {
  return `nexusky-canvas-layout:${encodeURIComponent(vaultPath)}`
}

function defaultPosition(index: number): CanvasPosition {
  const column = index % 4
  const row = Math.floor(index / 4)
  return { x: 40 + column * 250, y: 40 + row * 170 }
}

function getCanvasMetrics(rows: PropertyTableRow[], positions: Record<string, CanvasPosition>) {
  if (rows.length === 0) {
    return {
      minX: -CANVAS_PADDING,
      minY: -CANVAS_PADDING,
      width: BASE_CANVAS_WIDTH + CANVAS_PADDING * 2,
      height: BASE_CANVAS_HEIGHT + CANVAS_PADDING * 2
    }
  }
  const bounds = rows.reduce(
    (acc, row, index) => {
      const pos = positions[row.id] || defaultPosition(index)
      return {
        minX: Math.min(acc.minX, pos.x),
        minY: Math.min(acc.minY, pos.y),
        maxX: Math.max(acc.maxX, pos.x + CARD_WIDTH),
        maxY: Math.max(acc.maxY, pos.y + CARD_HEIGHT)
      }
    },
    { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 }
  )
  const minX = Math.min(0, bounds.minX) - CANVAS_PADDING
  const minY = Math.min(0, bounds.minY) - CANVAS_PADDING
  const maxX = Math.max(BASE_CANVAS_WIDTH, bounds.maxX) + CANVAS_PADDING
  const maxY = Math.max(BASE_CANVAS_HEIGHT, bounds.maxY) + CANVAS_PADDING
  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function CanvasView() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const setMainView = useUIStore((s) => s.setMainView)
  const [rows, setRows] = useState<PropertyTableRow[]>([])
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [positions, setPositions] = useState<Record<string, CanvasPosition>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [panning, setPanning] = useState<PanState | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [zoom, setZoom] = useState(1)
  const canvasRef = useRef<HTMLDivElement>(null)
  const positionsRef = useRef<Record<string, CanvasPosition>>({})
  const metricsRef = useRef(getCanvasMetrics([], {}))
  const previousMetricsRef = useRef(metricsRef.current)
  const initialScrollKeyRef = useRef<string | null>(null)
  const zoomRef = useRef(zoom)

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const canvasMetrics = useMemo(() => getCanvasMetrics(rows, positions), [rows, positions])

  useLayoutEffect(() => {
    const previous = previousMetricsRef.current
    metricsRef.current = canvasMetrics
    previousMetricsRef.current = canvasMetrics
    const viewport = canvasRef.current
    if (!viewport) return
    const dx = (previous.minX - canvasMetrics.minX) * zoom
    const dy = (previous.minY - canvasMetrics.minY) * zoom
    if (dx !== 0) viewport.scrollLeft += dx
    if (dy !== 0) viewport.scrollTop += dy
  }, [canvasMetrics, zoom])

  const loadRows = async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const result = await window.api.invoke('db:get-property-rows', { vaultPath })
      const graphData = await window.api.invoke('db:get-graph', { vaultPath })
      setRows(result)
      setGraph(graphData)
      const saved = safeGetJSON<Record<string, CanvasPosition>>(getCanvasStorageKey(vaultPath), {})
      const merged: Record<string, CanvasPosition> = {}
      result.forEach((row, index) => {
        merged[row.id] = saved[row.id] || defaultPosition(index)
      })
      setPositions(merged)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [vaultPath])

  useEffect(() => {
    if (!dragging || !vaultPath) return
    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const scrollLeft = canvasRef.current!.scrollLeft
      const scrollTop = canvasRef.current!.scrollTop
      const metrics = metricsRef.current
      const x = (event.clientX - rect.left + scrollLeft) / zoom + metrics.minX - dragging.offsetX
      const y = (event.clientY - rect.top + scrollTop) / zoom + metrics.minY - dragging.offsetY
      setPositions((current) => ({ ...current, [dragging.id]: { x, y } }))
    }
    const handlePointerUp = () => {
      setDragging(null)
      safeSetJSON(getCanvasStorageKey(vaultPath), positionsRef.current)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragging, vaultPath, zoom])

  useEffect(() => {
    if (!panning) return
    const handlePointerMove = (event: PointerEvent) => {
      const viewport = canvasRef.current
      if (!viewport) return
      viewport.scrollLeft = panning.scrollLeft - (event.clientX - panning.startX)
      viewport.scrollTop = panning.scrollTop - (event.clientY - panning.startY)
    }
    const handlePointerUp = () => setPanning(null)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [panning])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => [
      row.title,
      row.filePath,
      Object.values(row.properties).flat().join(' ')
    ].join(' ').toLowerCase().includes(q))
  }, [rows, query])

  useEffect(() => {
    const viewport = canvasRef.current
    if (!viewport || filteredRows.length === 0) return
    const key = `${vaultPath || 'no-vault'}:${rows.length}`
    if (initialScrollKeyRef.current === key) return
    initialScrollKeyRef.current = key
    requestAnimationFrame(() => {
      const metrics = metricsRef.current
      viewport.scrollLeft = Math.max(0, -metrics.minX * zoom - 44)
      viewport.scrollTop = Math.max(0, -metrics.minY * zoom - 44)
    })
  }, [filteredRows.length, rows.length, vaultPath, zoom])

  const visibleIds = useMemo(() => new Set(filteredRows.map((row) => row.id)), [filteredRows])

  const canvasEdges = useMemo(() => {
    if (!graph) return []
    return graph.edges
      .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
      .map((edge) => {
        const source = positions[edge.source]
        const target = positions[edge.target]
        if (!source || !target) return null
        return {
          key: `${edge.source}->${edge.target}`,
          x1: source.x - canvasMetrics.minX + CARD_WIDTH / 2,
          y1: source.y - canvasMetrics.minY + CARD_HEIGHT / 2,
          x2: target.x - canvasMetrics.minX + CARD_WIDTH / 2,
          y2: target.y - canvasMetrics.minY + CARD_HEIGHT / 2
        }
      })
      .filter((edge): edge is { key: string; x1: number; y1: number; x2: number; y2: number } => edge !== null)
  }, [canvasMetrics.minX, canvasMetrics.minY, graph, positions, visibleIds])

  const resetLayout = () => {
    const next: Record<string, CanvasPosition> = {}
    rows.forEach((row, index) => {
      next[row.id] = defaultPosition(index)
    })
    setPositions(next)
    if (vaultPath) safeSetJSON(getCanvasStorageKey(vaultPath), next)
    requestAnimationFrame(() => {
      const viewport = canvasRef.current
      if (!viewport) return
      const metrics = metricsRef.current
      viewport.scrollLeft = Math.max(0, -metrics.minX * zoom - 44)
      viewport.scrollTop = Math.max(0, -metrics.minY * zoom - 44)
    })
  }

  const canvasWidth = canvasMetrics.width
  const canvasHeight = canvasMetrics.height

  const zoomAtViewportPoint = (nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = canvasRef.current
    const clamped = Math.max(0.5, Math.min(1.8, nextZoom))
    const currentZoom = zoomRef.current
    if (!viewport) {
      zoomRef.current = clamped
      setZoom(clamped)
      return
    }
    const rect = viewport.getBoundingClientRect()
    const focalClientX = clientX ?? rect.left + viewport.clientWidth / 2
    const focalClientY = clientY ?? rect.top + viewport.clientHeight / 2
    const focalX = focalClientX - rect.left
    const focalY = focalClientY - rect.top
    const canvasX = (viewport.scrollLeft + focalX) / currentZoom
    const canvasY = (viewport.scrollTop + focalY) / currentZoom
    zoomRef.current = clamped
    setZoom(clamped)
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, canvasX * clamped - focalX)
      viewport.scrollTop = Math.max(0, canvasY * clamped - focalY)
    })
  }

  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    const nextZoom = zoomRef.current * Math.exp(-delta * 0.002)
    zoomAtViewportPoint(nextZoom, event.clientX, event.clientY)
  }

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-canvas-card]')) return
    if (target.closest('button,input,textarea,select,a')) return
    if (event.button !== 0 && event.button !== 1) return
    const viewport = canvasRef.current
    if (!viewport) return
    event.preventDefault()
    setPanning({
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    })
  }

  const fitToView = () => {
    const viewport = canvasRef.current
    if (!viewport || filteredRows.length === 0) return
    const bounds = filteredRows.reduce(
      (acc, row, index) => {
        const pos = positions[row.id] || defaultPosition(index)
        return {
          minX: Math.min(acc.minX, pos.x),
          minY: Math.min(acc.minY, pos.y),
          maxX: Math.max(acc.maxX, pos.x + CARD_WIDTH),
          maxY: Math.max(acc.maxY, pos.y + CARD_HEIGHT)
        }
      },
      { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 }
    )
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const nextZoom = Math.max(0.5, Math.min(1.4, Math.min((viewport.clientWidth - 80) / width, (viewport.clientHeight - 80) / height)))
    setZoom(nextZoom)
    requestAnimationFrame(() => {
      const metrics = metricsRef.current
      viewport.scrollLeft = Math.max(0, (bounds.minX - metrics.minX) * nextZoom - 40)
      viewport.scrollTop = Math.max(0, (bounds.minY - metrics.minY) * nextZoom - 40)
    })
  }

  const createCanvasNote = async () => {
    if (!vaultPath) return
    const now = new Date()
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0')
    ].join('')
    let title = `Canvas Note ${stamp}`
    let path = `${vaultPath}/${title}.md`
    for (let index = 2; index < 20; index++) {
      try {
        await window.api.invoke('file:stat', { path })
        title = `Canvas Note ${stamp}-${index}`
        path = `${vaultPath}/${title}.md`
      } catch {
        break
      }
    }
    await window.api.invoke('file:create', { path, vaultPath, content: `# ${title}\n\n` })
    await window.api.invoke('db:index-file', { vaultPath, filePath: path })
    await loadRows()
    toast(t('canvas.created'), 'success')
  }

  const openRow = async (row: PropertyTableRow) => {
    if (!vaultPath) return
    setMainView('editor')
    await openFile(`${vaultPath}/${row.filePath}`)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--editor-bg)' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{t('canvas.title')}</div>
          <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-tertiary)' }}>{t('canvas.summary', { count: rows.length, shown: filteredRows.length })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('canvas.searchPlaceholder')} style={controlStyle} />
          <button onClick={() => setShowGuide((value) => !value)} style={buttonStyle}>{t('canvas.guide')}</button>
          <button onClick={createCanvasNote} disabled={!vaultPath} style={buttonStyle}>{t('canvas.createNote')}</button>
          <div style={{ display: 'flex', alignItems: 'center', height: 30, borderRadius: 6, border: '1px solid var(--border-subtle)', overflow: 'hidden', background: 'var(--bg-elevated)', flexShrink: 0 }}>
            <button onClick={() => zoomAtViewportPoint(zoom - 0.1)} title={t('canvas.zoomOut')} style={zoomButtonStyle}>-</button>
            <button onClick={() => zoomAtViewportPoint(1)} title={t('canvas.zoomReset')} style={{ ...zoomButtonStyle, minWidth: 52 }}>{Math.round(zoom * 100)}%</button>
            <button onClick={() => zoomAtViewportPoint(zoom + 0.1)} title={t('canvas.zoomIn')} style={{ ...zoomButtonStyle, borderRight: 'none' }}>+</button>
          </div>
          <button onClick={fitToView} style={buttonStyle}>{t('canvas.fitView')}</button>
          <button onClick={resetLayout} style={buttonStyle}>{t('canvas.reset')}</button>
          <button onClick={loadRows} disabled={loading} style={buttonStyle}>{loading ? t('canvas.loading') : t('canvas.refresh')}</button>
        </div>
      </div>

      {showGuide && (
        <div style={{ margin: '12px 18px 0', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.7, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('canvas.guideTitle')}</div>
          <div>{t('canvas.guideDrag')}</div>
          <div>{t('canvas.guideOpen')}</div>
          <div>{t('canvas.guideLinks')}</div>
          <div>{t('canvas.guideZoom')}</div>
          <div>{t('canvas.guidePan')}</div>
        </div>
      )}

      <div
        ref={canvasRef}
        onWheel={handleCanvasWheel}
        onPointerDown={handleCanvasPointerDown}
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          background: 'radial-gradient(circle at 1px 1px, var(--border-subtle) 1px, transparent 0)',
          backgroundSize: '24px 24px',
          cursor: panning ? 'grabbing' : 'grab'
        }}
      >
        {filteredRows.length === 0 ? (
          <div style={{ padding: 32, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
            <div>{loading ? t('canvas.loading') : t('canvas.empty')}</div>
            {!loading && <button onClick={createCanvasNote} style={{ ...buttonStyle, marginTop: 10 }}>{t('canvas.createFirst')}</button>}
          </div>
        ) : (
          <div style={{ position: 'relative', width: canvasWidth * zoom, height: canvasHeight * zoom }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              <defs>
                <marker id="canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--border-default)" />
                </marker>
              </defs>
              {canvasEdges.map((edge) => (
                <line key={edge.key} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke="var(--border-default)" strokeWidth="1.4" strokeOpacity="0.75" markerEnd="url(#canvas-arrow)" />
              ))}
            </svg>
            {filteredRows.map((row, index) => {
              const pos = positions[row.id] || defaultPosition(index)
              const tags = Array.isArray(row.properties.tags) ? row.properties.tags.map(String) : []
              return (
                <div
                  key={row.id}
                  data-canvas-card
                  onPointerDown={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setDragging({ id: row.id, offsetX: (event.clientX - rect.left) / zoom, offsetY: (event.clientY - rect.top) / zoom })
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onDoubleClick={() => openRow(row)}
                  style={{
                    position: 'absolute',
                    left: pos.x - canvasMetrics.minX,
                    top: pos.y - canvasMetrics.minY,
                    width: CARD_WIDTH,
                    minHeight: 112,
                    padding: '12px 12px 10px',
                    borderRadius: 8,
                    border: dragging?.id === row.id ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    boxShadow: dragging?.id === row.id ? '0 12px 30px rgba(0,0,0,0.28)' : '0 8px 22px rgba(0,0,0,0.16)',
                    cursor: dragging?.id === row.id ? 'grabbing' : 'grab',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</div>
                  <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.filePath}</div>
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {tags.slice(0, 3).map((tag) => (
                      <span key={tag} style={{ padding: '2px 6px', borderRadius: 999, background: 'var(--accent-muted)', color: 'var(--accent-text)', fontSize: 10 }}>{tag}</span>
                    ))}
                    {tags.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t('canvas.noTags')}</span>}
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const controlStyle: React.CSSProperties = {
  width: 240,
  height: 30,
  padding: '0 9px',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none'
}

const buttonStyle: React.CSSProperties = {
  height: 30,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0
}

const zoomButtonStyle: React.CSSProperties = {
  height: 28,
  minWidth: 30,
  padding: '0 8px',
  border: 'none',
  borderRight: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer'
}
