import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/ui-store'
import { useEditorStore } from '../../stores/editor-store'
import { useActivityBarStore } from '../../stores/activity-bar-store'
import { ACTIVITY_BAR_REGISTRY, isActivityBarItemAvailable } from './activity-bar-registry'
import { ContextMenu } from '../ContextMenu'

const iconMap: Record<string, React.ReactNode> = {
  overview: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>,
  files: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>,
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  chat: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  graph: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><line x1="8.5" y1="7.5" x2="15.5" y2="16.5" /><line x1="15.5" y1="7.5" x2="8.5" y2="16.5" /></svg>,
}

export function ActivityBar() {
  const { t } = useTranslation()
  const { setSearchOpen, toggleRightPanel, setSettingsOpen, setMainView, mainView, rightPanel, sidebarCollapsed, openFilesSidebar, toggleSidebar } = useUIStore()
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const { visibleIds, toggleVisibility } = useActivityBarStore()

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const actionMap: Record<string, () => void> = {
    overview: () => {
      setMainView('overview')
      if (!useUIStore.getState().sidebarCollapsed) {
        toggleSidebar()
      }
    },
    files: () => {
      const state = useUIStore.getState()
      if (state.mainView === 'editor' && !state.sidebarCollapsed) {
        toggleSidebar()
      } else {
        openFilesSidebar()
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
  }

  const visibleItems = visibleIds
    .map((id) => ACTIVITY_BAR_REGISTRY.find((i) => i.id === id))
    .filter(Boolean)

  const availabilityContext = { mainView, currentFilePath }

  const getActiveId = () => {
    if (mainView !== 'graph' && !sidebarCollapsed) return 'files'
    if (mainView === 'overview') return 'overview'
    if (useUIStore.getState().mainView === 'graph') return 'graph'
    if (rightPanel === 'chat') return 'chat'
    return ''
  }

  const activeId = getActiveId()
  const activeIndex = visibleItems.findIndex((item) => item?.id === activeId)

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
      className="activity-bar"
      onContextMenu={handleContextMenu}
      style={{
        width: 46,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'transparent',
        borderRadius: 14,
        padding: '5px 4px 7px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Top icons */}
      <div className="activity-bar__items" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, overflow: 'visible', position: 'relative' }}>
        {activeIndex >= 0 && (
          <div
            className="activity-bar__liquid-indicator"
            style={{ transform: `translate3d(-50%, ${activeIndex * 40}px, 0)` }}
          />
        )}
        {visibleItems.map((item) => {
          const isActive = item!.id === activeId
          const isDisabled = !isActivityBarItemAvailable(item!, availabilityContext)
          return (
            <button
              key={item!.id}
              className={`activity-bar__button${isActive ? ' is-active' : ''}${isDisabled ? ' is-disabled' : ''}`}
              onClick={isDisabled ? undefined : actionMap[item!.id]}
              disabled={isDisabled}
              title={`${t(item!.labelKey)}${item!.shortcut ? ` (${item!.shortcut})` : ''}${isDisabled ? ` - ${t('activityBar.requiresCurrentFile')}` : ''}`}
              style={{
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 9,
                border: '1px solid transparent',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.55 : 1,
                position: 'relative',
                zIndex: 1,
                boxShadow: 'none',
                transform: isActive ? 'translateY(1px) scale(0.97)' : 'translateY(0) scale(1)',
                transition: 'color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s',
              }}
            >
              <span className="activity-bar__button-icon">
                {iconMap[item!.id]}
              </span>
            </button>
          )
        })}

      </div>

      {/* Bottom: settings */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 0 }}>
        <button
          onClick={() => setSettingsOpen(true)}
          title={t('activityBar.settings') + ' (Ctrl+,)'}
          style={{
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 9,
            border: 0,
            background: 'transparent',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            transition: 'color 0.15s, background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--control-bg)'
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
