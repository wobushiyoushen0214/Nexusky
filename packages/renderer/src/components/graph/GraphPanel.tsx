import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { isCancellationError, getErrorMessage } from '../../utils/errors'
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

  const handleGenerateMemories = async () => {
    if (!vaultPath) return
    onStartAi()
    setIndexStatus('正在生成记忆文件...')
    try {
      const result = await window.api.invoke('ai:generate-memories', { vaultPath })
      if (result.success) {
        const failedText = result.failed ? `，失败 ${result.failed} 篇` : ''
        const scopeText = result.limited ? `（本次处理最近 ${result.total}/${result.totalNotes} 篇）` : ''
        setIndexStatus(`记忆生成完成：新增 ${result.generated} 篇，跳过 ${result.skipped} 篇${failedText}${scopeText}`)
        window.dispatchEvent(new CustomEvent('graph-data-updated'))
      } else if (result.error && isCancellationError(result.error)) {
        setIndexStatus('已停止记忆生成')
      } else {
        setIndexStatus(result.error || '记忆生成已停止')
      }
    } catch (e: unknown) {
      setIndexStatus(isCancellationError(e) ? '已停止记忆生成' : getErrorMessage(e, '记忆生成已停止'))
    }
    setTimeout(() => setIndexStatus(null), 5000)
  }

  return (
    <>
      {collapsed && (
        <button className="graph-panel-expand" onClick={() => onToggleCollapsed(false)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
      <div className={`graph-panel${collapsed ? ' collapsed' : ''}`}>
        <div className="graph-panel-header">
          <div className="graph-panel-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>
              <line x1="8" y1="8" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="8"/><line x1="8" y1="16" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="16"/>
            </svg>
            {t('graph.title').toUpperCase()}
          </div>
          <button className="graph-panel-collapse" onClick={() => onToggleCollapsed(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {!collapsed && (
          <>
            <div className="graph-scope-strip">
              <button
                className={`graph-scope-pill${activeFolderPath == null ? ' active' : ''}`}
                onClick={onOpenOverview}
              >
                {t('graph.overview')}
              </button>
              {activeFolderPath != null && (
                <>
                  <span className="graph-scope-current" title={activeFolderPath || t('graph.rootGroup')}>
                    {activeFolderPath || t('graph.rootGroup')}
                  </span>
                  <button className="graph-scope-nav" onClick={onOpenParentFolder}>
                    {t('graph.parent')}
                  </button>
                </>
              )}
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.filters').toUpperCase()}</div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('graph.search')}
                className="graph-search"
              />
              <label className="graph-filter-label">
                {t('graph.linksGte')}
                <select
                  value={minLinks}
                  onChange={(e) => setMinLinks(Number(e.target.value))}
                  className="graph-filter-select"
                >
                  <option value={0}>{t('graph.all')}</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </label>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.groups').toUpperCase()}</div>
              <div className="graph-groups-list">
                {groupLegend.map((group) => {
                  const visible = !hiddenGroupIds.has(group.id)
                  return (
                    <label
                      key={group.id}
                      className={`graph-group-item${visible ? '' : ' muted'}`}
                      title={visible ? t('graph.hideGroup') : t('graph.showGroup')}
                    >
                      <span className="graph-group-dot" style={{ background: group.color }} />
                      <span className="graph-group-name">{group.title}</span>
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => onToggleGroup(group.id)}
                      />
                      <span className="graph-toggle-slider graph-group-switch" />
                    </label>
                  )
                })}
                {groupLegend.length === 0 && (
                  <div className="graph-panel-info">{t('graph.noFolderGroups')}</div>
                )}
              </div>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.display').toUpperCase()}</div>
              <label className="graph-toggle">
                <span>{t('graph.labels')}</span>
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span>{t('graph.orphans')}</span>
                <input type="checkbox" checked={showOrphans} onChange={(e) => setShowOrphans(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span>{t('graph.arrows')}</span>
                <input type="checkbox" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span>{t('graph.folders')}</span>
                <input type="checkbox" checked={showFolders} onChange={(e) => setShowFolders(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.edgeTypes').toUpperCase()}</div>
              <label className="graph-toggle">
                <span className="graph-edge-legend">
                  <span className="graph-edge-swatch swatch-explicit" />
                  {t('graph.explicit')}
                </span>
                <input type="checkbox" checked={showExplicitEdges} onChange={(e) => setShowExplicitEdges(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span className="graph-edge-legend">
                  <span className="graph-edge-swatch swatch-inferred" />
                  {t('graph.inferred')}
                </span>
                <input type="checkbox" checked={showInferredEdges} onChange={(e) => setShowInferredEdges(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
              <label className="graph-toggle">
                <span className="graph-edge-legend">
                  <span className="graph-edge-swatch swatch-folder" />
                  {t('graph.folderEdges')}
                </span>
                <input type="checkbox" checked={showFolderEdges} onChange={(e) => setShowFolderEdges(e.target.checked)} />
                <span className="graph-toggle-slider" />
              </label>
            </div>

            <div className="graph-panel-section">
              <div className="graph-panel-section-title">{t('graph.info').toUpperCase()}</div>
              <div className="graph-panel-info">
                {t('graph.nodes', { count: graphData.nodes.length })} · {t('graph.connections', { count: graphData.edges.length })}
              </div>
              <button
                className="graph-back-btn"
                style={{ marginTop: 8 }}
                disabled={!!indexStatus}
                onClick={handleReindex}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2 11.5a10 10 0 0 1 18.8-4.3"/><path d="M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                {t('graph.reindex')}
              </button>
              <button
                className="graph-back-btn"
                style={{ marginTop: 8 }}
                disabled={!!indexStatus}
                onClick={onOpenInferConfirm}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
                </svg>
                {t('graph.inferGlobal')}
              </button>
              <button
                className="graph-back-btn"
                style={{ marginTop: 8 }}
                disabled={!!indexStatus}
                onClick={handleGenerateMemories}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V11h3a3 3 0 0 1 3 3v1"/><path d="M6 11V9.4C4.8 8.8 4 7.5 4 6a4 4 0 0 1 8 0"/><rect x="2" y="17" width="8" height="5" rx="1"/><rect x="14" y="17" width="8" height="5" rx="1"/>
                </svg>
                生成记忆
              </button>
              {indexStatus && (
                <button
                  className="graph-back-btn"
                  style={{ marginTop: 8 }}
                  onClick={onStopAi}
                >
                  停止
                </button>
              )}
              {indexStatus && (
                <div className="graph-panel-info" style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>
                  {indexStatus}
                </div>
              )}
            </div>

            <div className="graph-panel-footer">
              <button className="graph-back-btn" onClick={onBackToEditor}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
                {t('graph.backToEditor')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
