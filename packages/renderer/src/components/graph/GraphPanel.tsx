import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isCancellationError, getErrorMessage } from '../../utils/errors'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select'
import { Switch } from '../ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { GraphData, GraphNode } from '@shared/types/ipc'

interface GraphPanelProps {
  collapsed: boolean
  onToggleCollapsed: (next: boolean) => void

  graphData: GraphData
  groupColorMap: Map<string, string>
  vaultPath: string | null
  activeFolderPath: string | null
  onOpenOverview: () => void
  onOpenParentFolder: () => void

  hiddenGroupIds: Set<string>
  onToggleGroup: (groupId: string) => void

  searchQuery: string
  setSearchQuery: (q: string) => void
  minLinks: number
  setMinLinks: (n: number) => void

  showLabels: boolean
  setShowLabels: (v: boolean) => void
  showOrphans: boolean
  setShowOrphans: (v: boolean) => void
  showArrows: boolean
  setShowArrows: (v: boolean) => void
  showFolders: boolean
  setShowFolders: (v: boolean) => void

  showExplicitEdges: boolean
  setShowExplicitEdges: (v: boolean) => void
  showInferredEdges: boolean
  setShowInferredEdges: (v: boolean) => void
  showFolderEdges: boolean
  setShowFolderEdges: (v: boolean) => void

  indexStatus: string | null
  setIndexStatus: (s: string | null) => void
  onOpenInferConfirm: () => void
  onStartAi: () => void
  onStopAi: () => void
  onBackToEditor: () => void
}

export function GraphPanel(props: GraphPanelProps) {
  const { t } = useTranslation()
  const scrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [panelScrolling, setPanelScrolling] = useState(false)
  const {
    collapsed, onToggleCollapsed,
    graphData, groupColorMap, vaultPath,
    activeFolderPath, onOpenOverview, onOpenParentFolder,
    hiddenGroupIds, onToggleGroup,
    searchQuery, setSearchQuery, minLinks, setMinLinks,
    showLabels, setShowLabels, showOrphans, setShowOrphans,
    showArrows, setShowArrows, showFolders, setShowFolders,
    showExplicitEdges, setShowExplicitEdges,
    showInferredEdges, setShowInferredEdges,
    showFolderEdges, setShowFolderEdges,
    indexStatus, setIndexStatus,
    onOpenInferConfirm, onStartAi, onStopAi, onBackToEditor
  } = props
  const folderTitleById = useMemo(() => {
    const map = new Map<string, string>()
    graphData.nodes.forEach((node: GraphNode) => {
      if (node.type === 'folder') map.set(node.id, node.title)
    })
    return map
  }, [graphData.nodes])

  const groupLegend = useMemo(() => {
    const items: Array<{ id: string; title: string; color: string }> = []
    groupColorMap.forEach((color, id) => {
      const explicit = folderTitleById.get(id)
      let title = explicit
      if (!title) {
        const path = id.startsWith('folder:') ? id.slice('folder:'.length) : id
        if (!path || path === '.') title = t('graph.rootGroup')
        else title = path.split('/').pop() || path
      }
      items.push({ id, title, color })
    })
    return items.sort((a, b) => a.title.localeCompare(b.title))
  }, [folderTitleById, groupColorMap, t])

  const handleReindex = async () => {
    if (!vaultPath) return
    setIndexStatus(t('common.indexing'))
    try {
      const result = await window.api.invoke('db:index-vault', { vaultPath })
      setIndexStatus(`${t('graph.reindex')}: ${result.indexed} ${t('graph.nodes', { count: result.indexed })}`)
      window.dispatchEvent(new CustomEvent('graph-data-updated'))
    } catch (e: unknown) {
      setIndexStatus(`Error: ${getErrorMessage(e, t('common.semanticFailed'))}`)
    }
    setTimeout(() => setIndexStatus(null), 3000)
  }

  const handlePanelScroll = () => {
    setPanelScrolling(true)
    if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current)
    scrollHideTimerRef.current = setTimeout(() => setPanelScrolling(false), 700)
  }

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current)
    }
  }, [])

  const handleGenerateMemories = async () => {
    if (!vaultPath) return
    onStartAi()
    setIndexStatus(t('graph.memory.generating'))
    try {
      const result = await window.api.invoke('ai:generate-memories', { vaultPath })
      if (result.success) {
        const failedText = result.failed ? t('graph.memory.failedFragment', { failed: result.failed }) : ''
        const scopeText = result.limited ? t('graph.memory.scopeFragment', { total: result.total, totalNotes: result.totalNotes }) : ''
        setIndexStatus(t('graph.memory.done', {
          generated: result.generated,
          skipped: result.skipped,
          failedText,
          scopeText
        }))
        window.dispatchEvent(new CustomEvent('graph-data-updated'))
      } else if (result.error && isCancellationError(result.error)) {
        setIndexStatus(t('graph.memory.stopped'))
      } else {
        setIndexStatus(result.error || t('graph.memory.stopped'))
      }
    } catch (e: unknown) {
      setIndexStatus(isCancellationError(e) ? t('graph.memory.stopped') : getErrorMessage(e, t('graph.memory.stopped')))
    }
    setTimeout(() => setIndexStatus(null), 5000)
  }

  return (
    <>
      {collapsed && (
        <Button type="button" variant="ghost" size="icon" className="graph-panel-expand" onClick={() => onToggleCollapsed(false)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Button>
      )}
      <div
        className={`graph-panel file-tree-scroll${collapsed ? ' collapsed' : ''}${panelScrolling ? ' is-scrolling' : ''}`}
        onScroll={handlePanelScroll}
      >
        <div className="graph-panel-header">
          <div className="graph-panel-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>
              <line x1="8" y1="8" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="8"/><line x1="8" y1="16" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="16"/>
            </svg>
            {t('graph.title').toUpperCase()}
          </div>
          <Button type="button" variant="ghost" size="icon" className="graph-panel-collapse" onClick={() => onToggleCollapsed(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Button>
        </div>

        {!collapsed && (
          <>
            <div className="graph-scope-strip">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={`graph-scope-pill${activeFolderPath == null ? ' active' : ''}`}
                onClick={onOpenOverview}
              >
                {t('graph.overview')}
              </Button>
              {activeFolderPath != null && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="graph-scope-current">
                        {activeFolderPath || t('graph.rootGroup')}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{activeFolderPath || t('graph.rootGroup')}</TooltipContent>
                  </Tooltip>
                  <Button type="button" variant="ghost" size="xs" className="graph-scope-nav" onClick={onOpenParentFolder}>
                    {t('graph.parent')}
                  </Button>
                </>
              )}
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.filters').toUpperCase()}</div>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('graph.search')}
                className="graph-search"
              />
              <div className="graph-filter-label">
                <span>{t('graph.linksGte')}</span>
                <Select value={String(minLinks)} onValueChange={(value) => setMinLinks(Number(value))}>
                  <SelectTrigger
                    className="graph-filter-select"
                    aria-label={t('graph.linksGte')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="0">{t('graph.all')}</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.groups').toUpperCase()}</div>
              <div className="graph-groups-list">
                {groupLegend.map((group, index) => {
                  const visible = !hiddenGroupIds.has(group.id)
                  const switchId = `graph-group-${index}`
                  const groupHint = visible ? t('graph.hideGroup') : t('graph.showGroup')
                  return (
                    <div
                      key={group.id}
                      className={`graph-group-item${visible ? '' : ' muted'}`}
                    >
                      <span className="graph-group-dot" style={{ background: group.color }} />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <label htmlFor={switchId} className="graph-group-name">{group.title}</label>
                        </TooltipTrigger>
                        <TooltipContent>{groupHint}</TooltipContent>
                      </Tooltip>
                      <Switch
                        id={switchId}
                        checked={visible}
                        onCheckedChange={() => onToggleGroup(group.id)}
                        aria-label={groupHint}
                        className="graph-toggle-switch graph-group-switch"
                      />
                    </div>
                  )
                })}
                {groupLegend.length === 0 && (
                  <div className="graph-panel-info">{t('graph.noFolderGroups')}</div>
                )}
              </div>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.display').toUpperCase()}</div>
              <div className="graph-toggle">
                <label htmlFor="graph-toggle-labels" className="graph-toggle-label">{t('graph.labels')}</label>
                <Switch
                  id="graph-toggle-labels"
                  checked={showLabels}
                  onCheckedChange={setShowLabels}
                  className="graph-toggle-switch"
                />
              </div>
              <div className="graph-toggle">
                <label htmlFor="graph-toggle-orphans" className="graph-toggle-label">{t('graph.orphans')}</label>
                <Switch
                  id="graph-toggle-orphans"
                  checked={showOrphans}
                  onCheckedChange={setShowOrphans}
                  className="graph-toggle-switch"
                />
              </div>
              <div className="graph-toggle">
                <label htmlFor="graph-toggle-arrows" className="graph-toggle-label">{t('graph.arrows')}</label>
                <Switch
                  id="graph-toggle-arrows"
                  checked={showArrows}
                  onCheckedChange={setShowArrows}
                  className="graph-toggle-switch"
                />
              </div>
              <div className="graph-toggle">
                <label htmlFor="graph-toggle-folders" className="graph-toggle-label">{t('graph.folders')}</label>
                <Switch
                  id="graph-toggle-folders"
                  checked={showFolders}
                  onCheckedChange={setShowFolders}
                  className="graph-toggle-switch"
                />
              </div>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.edgeTypes').toUpperCase()}</div>
              <div className="graph-toggle">
                <label htmlFor="graph-toggle-explicit-edges" className="graph-edge-legend">
                  <span className="graph-edge-swatch swatch-explicit" />
                  {t('graph.explicit')}
                </label>
                <Switch
                  id="graph-toggle-explicit-edges"
                  checked={showExplicitEdges}
                  onCheckedChange={setShowExplicitEdges}
                  className="graph-toggle-switch"
                />
              </div>
              <div className="graph-toggle">
                <label htmlFor="graph-toggle-inferred-edges" className="graph-edge-legend">
                  <span className="graph-edge-swatch swatch-inferred" />
                  {t('graph.inferred')}
                </label>
                <Switch
                  id="graph-toggle-inferred-edges"
                  checked={showInferredEdges}
                  onCheckedChange={setShowInferredEdges}
                  className="graph-toggle-switch"
                />
              </div>
              <div className="graph-toggle">
                <label htmlFor="graph-toggle-folder-edges" className="graph-edge-legend">
                  <span className="graph-edge-swatch swatch-folder" />
                  {t('graph.folderEdges')}
                </label>
                <Switch
                  id="graph-toggle-folder-edges"
                  checked={showFolderEdges}
                  onCheckedChange={setShowFolderEdges}
                  className="graph-toggle-switch"
                />
              </div>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.info').toUpperCase()}</div>
              <div className="graph-panel-info">
                {t('graph.nodes', { count: graphData.nodes.length })} · {t('graph.connections', { count: graphData.edges.length })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="graph-back-btn"
                style={{ marginTop: 8 }}
                disabled={!!indexStatus}
                onClick={handleReindex}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2 11.5a10 10 0 0 1 18.8-4.3"/><path d="M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                {t('graph.reindex')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="graph-back-btn"
                style={{ marginTop: 8 }}
                disabled={!!indexStatus}
                onClick={onOpenInferConfirm}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
                </svg>
                {t('graph.inferGlobal')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="graph-back-btn"
                style={{ marginTop: 8 }}
                disabled={!!indexStatus}
                onClick={handleGenerateMemories}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V11h3a3 3 0 0 1 3 3v1"/><path d="M6 11V9.4C4.8 8.8 4 7.5 4 6a4 4 0 0 1 8 0"/><rect x="2" y="17" width="8" height="5" rx="1"/><rect x="14" y="17" width="8" height="5" rx="1"/>
                </svg>
                {t('graph.memory.generate')}
              </Button>
              {indexStatus && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="graph-back-btn"
                  style={{ marginTop: 8 }}
                  onClick={onStopAi}
                >
                  {t('common.stop')}
                </Button>
              )}
              {indexStatus && (
                <div className="graph-panel-info" style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>
                  {indexStatus}
                </div>
              )}
            </div>

            <div className="graph-panel-footer">
              <Button type="button" variant="ghost" size="sm" className="graph-back-btn" onClick={onBackToEditor}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
                {t('graph.backToEditor')}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
