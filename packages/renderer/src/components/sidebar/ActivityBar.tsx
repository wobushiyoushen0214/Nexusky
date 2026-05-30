import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useActivityBarStore } from '../../stores/activity-bar-store'
import { ACTIVITY_BAR_REGISTRY, isActivityBarItemAvailable } from './activity-bar-registry'
import { ContextMenu } from '../ContextMenu'

const iconMap: Record<string, React.ReactNode> = {
  files: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>,
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  chat: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  graph: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><line x1="8.5" y1="7.5" x2="15.5" y2="16.5" /><line x1="15.5" y1="7.5" x2="8.5" y2="16.5" /></svg>,
  canvas: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="5" rx="1" /><rect x="14" y="6" width="6" height="5" rx="1" /><rect x="7" y="15" width="7" height="5" rx="1" /><path d="M10 9l3 2" /><path d="M14 11l-3 4" /></svg>,
  outline: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
  properties: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M8 8h8" /><path d="M8 12h5" /><path d="M8 16h8" /></svg>,
  tags: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  calendar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  'daily-note': <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
  maintenance: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
}

export function ActivityBar() {
  const { t } = useTranslation()
  const { setSearchOpen, toggleRightPanel, setSettingsOpen, setMainView, mainView, rightPanel, sidebarCollapsed, toggleSidebar, setMaintenancePanelSection } = useUIStore()
  const { vaultPath, refreshFiles } = useVaultStore()
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const { visibleIds, toggleVisibility } = useActivityBarStore()

  const [moreOpen, setMoreOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!moreOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (moreRef.current?.contains(target)) return
      if (moreButtonRef.current?.contains(target)) return
      setMoreOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [moreOpen])

  const actionMap: Record<string, () => void> = {
    files: () => {
      const state = useUIStore.getState()
      if (state.mainView !== 'editor') {
        setMainView('editor')
        if (state.sidebarCollapsed) toggleSidebar()
      } else {
        toggleSidebar()
      }
    },
    search: () => setSearchOpen(true),
    chat: () => toggleRightPanel('chat'),
    graph: () => {
      const state = useUIStore.getState()
      if (state.mainView === 'graph') {
        setMainView('editor')
        if (state.sidebarCollapsed) toggleSidebar()
      } else {
        setMainView('graph')
        if (!state.sidebarCollapsed) toggleSidebar()
      }
    },
    canvas: () => {
      setMainView('canvas')
      if (!useUIStore.getState().sidebarCollapsed) toggleSidebar()
    },
    outline: () => toggleRightPanel('outline'),
    properties: () => toggleRightPanel('properties'),
    tags: () => toggleRightPanel('tags'),
    calendar: () => toggleRightPanel('calendar'),
    'daily-note': async () => {
      if (!vaultPath) return
      const p = await window.api.invoke('template:daily-note', { vaultPath })
      if (p) { await refreshFiles(); await openFile(p) }
    },
    maintenance: () => {
      setMaintenancePanelSection('queue')
      toggleRightPanel('maintenance')
    },
  }

  const visibleItems = visibleIds
    .map((id) => ACTIVITY_BAR_REGISTRY.find((i) => i.id === id))
    .filter(Boolean)

  const hiddenItems = ACTIVITY_BAR_REGISTRY.filter((item) => !visibleIds.includes(item.id))
  const availabilityContext = { mainView, currentFilePath }

  const getActiveId = () => {
    if (useUIStore.getState().mainView === 'graph') return 'graph'
    if (['bases', 'canvas', 'timeline'].includes(useUIStore.getState().mainView)) return 'canvas'
    if (!sidebarCollapsed) return 'files'
    if (rightPanel === 'chat') return 'chat'
    if (rightPanel === 'outline') return 'outline'
    if (rightPanel === 'properties') return 'properties'
    if (rightPanel === 'tags') return 'tags'
    if (rightPanel === 'calendar') return 'calendar'
    if (rightPanel === 'maintenance') return 'maintenance'
    return ''
  }

  const activeId = getActiveId()

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const contextMenuItems = ACTIVITY_BAR_REGISTRY
    .filter((item) => !item.pinned)
    .map((item) => ({
      label: `${visibleIds.includes(item.id) ? '✓ ' : '    '}${t(item.labelKey)}`,
      onClick: () => toggleVisibility(item.id),
    }))

  return (
    <div
      onContextMenu={handleContextMenu}
      style={{
        width: 48,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        position: 'relative',
      }}
    >
      {/* Top icons */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 4, overflow: 'hidden' }}>
        {visibleItems.map((item) => {
          const isActive = item!.id === activeId
          const isDisabled = !isActivityBarItemAvailable(item!, availabilityContext)
          return (
            <button
              key={item!.id}
              onClick={isDisabled ? undefined : actionMap[item!.id]}
              disabled={isDisabled}
              title={`${t(item!.labelKey)}${item!.shortcut ? ` (${item!.shortcut})` : ''}${isDisabled ? ` - ${t('activityBar.requiresCurrentFile')}` : ''}`}
              style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: 'none',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                color: isDisabled ? 'var(--border-default)' : isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.55 : 1,
                position: 'relative',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive && !isDisabled) {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive && !isDisabled) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-tertiary)'
                }
              }}
            >
              {iconMap[item!.id]}
            </button>
          )
        })}

        {/* More button - only show if there are hidden items */}
        {hiddenItems.length > 0 && (
          <button
            ref={moreButtonRef}
            onClick={() => setMoreOpen(!moreOpen)}
            title={t('activityBar.more')}
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              background: moreOpen ? 'var(--bg-hover)' : 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={(e) => {
              if (!moreOpen) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-tertiary)'
              }
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
          </button>
        )}
      </div>

      {/* Bottom: settings */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 12 }}>
        <button
          onClick={() => setSettingsOpen(true)}
          title={t('activityBar.settings') + ' (Ctrl+,)'}
          style={{
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </button>
      </div>

      {/* More menu popup */}
      {moreOpen && (
        <div ref={moreRef} style={{
          position: 'absolute',
          top: (visibleItems.length + 1) * 44 + 8,
          left: 52,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: 4,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          minWidth: 160,
          zIndex: 100,
        }}>
          {hiddenItems.map((item) => {
            const isDisabled = !isActivityBarItemAvailable(item, availabilityContext)
            return (
              <button
                key={item.id}
                onClick={isDisabled ? undefined : () => { actionMap[item.id]?.(); setMoreOpen(false) }}
                disabled={isDisabled}
                title={isDisabled ? t('activityBar.requiresCurrentFile') : undefined}
                style={{ width: '100%', height: 30, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: isDisabled ? 'var(--border-default)' : 'var(--text-secondary)', background: 'transparent', border: 'none', borderRadius: 4, cursor: isDisabled ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: isDisabled ? 0.55 : 1 }}
                onMouseEnter={(e) => { if (!isDisabled) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { if (!isDisabled) e.currentTarget.style.background = 'transparent' }}
              >
                <span>{t(item.labelKey)}</span>
                {item.shortcut && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{item.shortcut}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Right-click context menu for customization */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
