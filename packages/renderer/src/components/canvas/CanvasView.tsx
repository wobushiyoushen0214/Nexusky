import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { safeGetJSON, safeSetJSON } from '../../utils/storage'
import type { PropertyTableRow } from '@shared/types/ipc'

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
  const [positions, setPositions] = useState<Record<string, CanvasPosition>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState<DragState | null>(null)
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
      setRows(result)
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
      const x = Math.max(0, event.clientX - rect.left + canvasRef.current!.scrollLeft - dragging.offsetX)
      const y = Math.max(0, event.clientY - rect.top + canvasRef.current!.scrollTop - dragging.offsetY)
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
  }, [dragging, vaultPath])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => [
      row.title,
      row.filePath,
      Object.values(row.properties).flat().join(' ')
    ].join(' ').toLowerCase().includes(q))
  }, [rows, query])

  const resetLayout = () => {
    const next: Record<string, CanvasPosition> = {}
    rows.forEach((row, index) => {
      next[row.id] = defaultPosition(index)
    })
    setPositions(next)
    if (vaultPath) safeSetJSON(getCanvasStorageKey(vaultPath), next)
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
          <button onClick={resetLayout} style={buttonStyle}>{t('canvas.reset')}</button>
          <button onClick={loadRows} disabled={loading} style={buttonStyle}>{loading ? t('canvas.loading') : t('canvas.refresh')}</button>
        </div>
      </div>

      <div ref={canvasRef} style={{ flex: 1, overflow: 'auto', position: 'relative', background: 'radial-gradient(circle at 1px 1px, var(--border-subtle) 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        {filteredRows.length === 0 ? (
          <div style={{ padding: 32, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>{loading ? t('canvas.loading') : t('canvas.empty')}</div>
        ) : (
          <div style={{ position: 'relative', width: 1200, height: Math.max(760, Math.ceil(rows.length / 4) * 180 + 120) }}>
            {filteredRows.map((row, index) => {
              const pos = positions[row.id] || defaultPosition(index)
              const tags = Array.isArray(row.properties.tags) ? row.properties.tags.map(String) : []
              return (
                <div
                  key={row.id}
                  onPointerDown={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setDragging({ id: row.id, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top })
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
