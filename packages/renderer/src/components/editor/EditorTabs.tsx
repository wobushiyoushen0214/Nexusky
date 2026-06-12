import { memo, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { ContextMenu } from '../ContextMenu'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export const EditorTabs = memo(function EditorTabs() {
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabIndex = useEditorStore((s) => s.activeTabIndex)
  const closeTab = useEditorStore((s) => s.closeTab)
  const switchTab = useEditorStore((s) => s.switchTab)
  const reorderTab = useEditorStore((s) => s.reorderTab)
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useEditorStore((s) => s.closeTabsToRight)
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const dragTabRef = useRef<number | null>(null)
  const tabBarRef = useRef<HTMLDivElement | null>(null)
  const tabButtonRefs = useRef<Array<HTMLDivElement | null>>([])

  const activeTabPath = tabs[activeTabIndex]?.path

  useEffect(() => {
    const tabBar = tabBarRef.current
    const activeTab = tabButtonRefs.current[activeTabIndex]
    if (!tabBar || !activeTab) return
    requestAnimationFrame(() => {
      const maxLeft = Math.max(0, tabBar.scrollWidth - tabBar.clientWidth)
      const centeredLeft = activeTab.offsetLeft - ((tabBar.clientWidth - activeTab.offsetWidth) / 2)
      tabBar.scrollTo({
        left: Math.max(0, Math.min(centeredLeft, maxLeft)),
        behavior: 'smooth'
      })
    })
  }, [activeTabIndex, activeTabPath])

  if (tabs.length === 0) return null

  return (
    <>
      <div
        className="editor-tab-bar hide-scrollbar"
        ref={tabBarRef}
        onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY }}
      >
        {tabs.map((tab, i) => {
          const tabName = tab.path.split(/[\\/]/).pop()?.replace(/\.md$/, '')
          const closeLabel = tabName ? `关闭 ${tabName}` : '关闭标签'
          const isActive = i === activeTabIndex
          return (
            <div
              key={tab.path}
              className={`editor-tab${isActive ? ' is-active' : ''}`}
              ref={(node) => { tabButtonRefs.current[i] = node }}
              draggable
              onDragStart={() => { dragTabRef.current = i }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={() => { if (dragTabRef.current !== null && dragTabRef.current !== i) { reorderTab(dragTabRef.current, i) }; dragTabRef.current = null }}
              onDragEnd={() => { dragTabRef.current = null }}
              onClick={() => switchTab(i)}
              onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(i) } }}
              onContextMenu={(e) => { e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, index: i }) }}
            >
              <span className="editor-tab-icon">
                {tab.isDirty ? (
                  <span className="editor-tab-dirty" />
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                )}
              </span>
              <span className="editor-tab-title">{tabName}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="editor-tab-close"
                    aria-label={closeLabel}
                    onClick={(e) => { e.stopPropagation(); closeTab(i) }}
                    style={{ width: 20, height: 20, padding: 0 }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{closeLabel}</TooltipContent>
              </Tooltip>
            </div>
          )
        })}
      </div>
      {tabContextMenu && (
        <ContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          items={[
            { label: tabs[tabContextMenu.index]?.pinned ? '取消固定' : '固定标签', onClick: () => { const tab = tabs[tabContextMenu.index]; if (tab?.pinned) useEditorStore.getState().unpinTab(tabContextMenu.index); else useEditorStore.getState().pinTab(tabContextMenu.index) } },
            { label: '关闭', onClick: () => closeTab(tabContextMenu.index) },
            { label: '关闭其他', onClick: () => closeOtherTabs(tabContextMenu.index) },
            { label: '关闭右侧', onClick: () => closeTabsToRight(tabContextMenu.index) },
            { label: '关闭已保存', onClick: () => useEditorStore.getState().closeSavedTabs() },
            { label: '复制路径', onClick: () => { navigator.clipboard.writeText(tabs[tabContextMenu.index]?.path || '') } },
            { label: '在右侧打开', onClick: () => { const path = tabs[tabContextMenu.index]?.path; if (path) useEditorStore.getState().openSplit(path) } },
          ]}
          onClose={() => setTabContextMenu(null)}
        />
      )}
    </>
  )
})
