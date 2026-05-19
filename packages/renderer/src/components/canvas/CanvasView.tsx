import { useEffect, useMemo, useRef, useState } from 'react'
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

function getCanvasStorageKey(vaultPath: string): string {
  return `nexusky-canvas-layout:${encodeURIComponent(vaultPath)}`
}

function defaultPosition(index: number): CanvasPosition {
  const column = index % 4
  const row = Math.floor(index / 4)
  return { x: 40 + column * 250, y: 40 + row * 170 }
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
  const [showGuide, setShowGuide] = useState(false)
  const [zoom, setZoom] = useState(1)
  const canvasRef = useRef<HTMLDivElement>(null)
  const positionsRef = useRef<Record<string, CanvasPosition>>({})

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

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
      const x = Math.max(0, (event.clientX - rect.left + scrollLeft) / zoom - dragging.offsetX)
      const y = Math.max(0, (event.clientY - rect.top + scrollTop) / zoom - dragging.offsetY)
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

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => [
      row.title,
      row.filePath,
      Object.values(row.properties).flat().join(' ')
    ].join(' ').toLowerCase().includes(q))
  }, [rows, query])

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
          x1: source.x + 105,
          y1: source.y + 56,
          x2: target.x + 105,
          y2: target.y + 56
        }
      })
      .filter((edge): edge is { key: string; x1: number; y1: number; x2: number; y2: number } => edge !== null)
  }, [graph, positions, visibleIds])

  const resetLayout = () => {
    const next: Record<string, CanvasPosition> = {}
    rows.forEach((row, index) => {
      next[row.id] = defaultPosition(index)
    })
    setPositions(next)
    if (vaultPath) safeSetJSON(getCanvasStorageKey(vaultPath), next)
  }

  const canvasWidth = 1200
  const canvasHeight = Math.max(760, Math.ceil(rows.length / 4) * 180 + 120)
  const setClampedZoom = (value: number) => setZoom(Math.max(0.5, Math.min(1.8, value)))

  const fitToView = () => {
    const viewport = canvasRef.current
    if (!viewport || filteredRows.length === 0) return
    const bounds = filteredRows.reduce(
      (acc, row, index) => {
        const pos = positions[row.id] || defaultPosition(index)
        return {
          minX: Math.min(acc.minX, pos.x),
          minY: Math.min(acc.minY, pos.y),
          maxX: Math.max(acc.maxX, pos.x + 210),
          maxY: Math.max(acc.maxY, pos.y + 112)
        }
      },
      { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 }
    )
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const nextZoom = Math.max(0.5, Math.min(1.4, Math.min((viewport.clientWidth - 80) / width, (viewport.clientHeight - 80) / height)))
    setZoom(nextZoom)
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, bounds.minX * nextZoom - 40)
      viewport.scrollTop = Math.max(0, bounds.minY * nextZoom - 40)
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
            <button onClick={() => setClampedZoom(zoom - 0.1)} title={t('canvas.zoomOut')} style={zoomButtonStyle}>-</button>
            <button onClick={() => setZoom(1)} title={t('canvas.zoomReset')} style={{ ...zoomButtonStyle, minWidth: 52 }}>{Math.round(zoom * 100)}%</button>
            <button onClick={() => setClampedZoom(zoom + 0.1)} title={t('canvas.zoomIn')} style={{ ...zoomButtonStyle, borderRight: 'none' }}>+</button>
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
        </div>
      )}

      <div ref={canvasRef} style={{ flex: 1, overflow: 'auto', position: 'relative', background: 'radial-gradient(circle at 1px 1px, var(--border-subtle) 1px, transparent 0)', backgroundSize: '24px 24px' }}>
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
                  onPointerDown={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setDragging({ id: row.id, offsetX: (event.clientX - rect.left) / zoom, offsetY: (event.clientY - rect.top) / zoom })
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onDoubleClick={() => openRow(row)}
                  style={{
                    position: 'absolute',
                    left: pos.x,
                    top: pos.y,
                    width: 210,
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
