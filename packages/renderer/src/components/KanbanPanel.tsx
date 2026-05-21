import { useEffect, useMemo, useRef, useState } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { toast } from '../stores/toast-store'
import { getErrorMessage, isCancellationError } from '../utils/errors'
import type { KanbanAiPlan, KanbanColumn, KanbanRelation, KanbanTask } from '@shared/types/ipc'

const RELATION_LABEL: Record<KanbanRelation['relationType'], string> = {
  blocks: '阻塞',
  depends_on: '依赖',
  related: '关联'
}

const PRIORITY_LABEL = ['低', '中', '高', '紧急']
const PRIORITY_COLOR = [
  'var(--text-tertiary)',
  'var(--accent-text)',
  'oklch(0.75 0.12 85)',
  'oklch(0.65 0.15 25)'
]

const PRIORITY_TONE = [
  'color-mix(in srgb, var(--bg-elevated) 78%, transparent)',
  'color-mix(in srgb, var(--accent-muted) 58%, transparent)',
  'oklch(0.38 0.055 85 / 0.48)',
  'oklch(0.36 0.07 25 / 0.5)'
]

type PendingKanbanAiWrite =
  | { mode: 'breakdown'; plan: KanbanAiPlan; taskId: string; title: string; description?: string; columnId: string }
  | { mode: 'from-note'; plan: KanbanAiPlan; filePath: string; content: string; columnId?: string }
  | { mode: 'indexed'; plan: KanbanAiPlan; columnId?: string }

export function KanbanPanel() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const currentContent = useEditorStore((s) => s.content)
  const openFile = useEditorStore((s) => s.openFile)
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [relations, setRelations] = useState<KanbanRelation[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [hoverTaskId, setHoverTaskId] = useState<string | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dropColumnId, setDropColumnId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newTaskColumnId, setNewTaskColumnId] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [boardLoading, setBoardLoading] = useState(true)
  const aiStopRequestedRef = useRef(false)
  const [detailDraft, setDetailDraft] = useState<Partial<KanbanTask>>({})
  const [newRelationTarget, setNewRelationTarget] = useState('')
  const [newRelationType, setNewRelationType] = useState<KanbanRelation['relationType']>('related')
  const [pendingAiWrite, setPendingAiWrite] = useState<PendingKanbanAiWrite | null>(null)

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) || null, [tasks, selectedTaskId])
  const totalTasks = tasks.length
  const columnNameById = useMemo(() => new Map(columns.map((column) => [column.id, column.name])), [columns])

  const relatedTaskIds = useMemo(() => {
    const anchor = hoverTaskId || selectedTaskId
    if (!anchor) return new Set<string>()
    const ids = new Set<string>([anchor])
    for (const relation of relations) {
      if (relation.sourceTaskId === anchor) ids.add(relation.targetTaskId)
      if (relation.targetTaskId === anchor) ids.add(relation.sourceTaskId)
    }
    return ids
  }, [hoverTaskId, selectedTaskId, relations])

  useEffect(() => {
    if (!vaultPath) return
    loadBoard(true)
  }, [vaultPath])

  useEffect(() => {
    setDetailDraft(selectedTask || {})
    setNewRelationTarget('')
    setNewRelationType('related')
  }, [selectedTaskId, selectedTask])

  useEffect(() => {
    if (columns.length === 0) {
      setNewTaskColumnId('')
      return
    }
    if (!columns.some((column) => column.id === newTaskColumnId)) {
      setNewTaskColumnId(columns[0].id)
    }
  }, [columns, newTaskColumnId])

  const loadBoard = async (showSkeleton = false) => {
    if (!vaultPath) return
    if (showSkeleton) setBoardLoading(true)
    try {
      const [nextColumns, nextTasks, nextRelations] = await Promise.all([
        window.api.invoke('kanban:get-columns', { vaultPath }),
        window.api.invoke('kanban:get-tasks', { vaultPath }),
        window.api.invoke('kanban:get-relations', { vaultPath })
      ])
      setColumns(nextColumns)
      setTasks(nextTasks)
      setRelations(nextRelations)
      if (selectedTaskId && !nextTasks.some((task) => task.id === selectedTaskId)) {
        setSelectedTaskId(null)
      }
    } catch (e: unknown) {
      toast(getErrorMessage(e) || '看板加载失败', 'error')
    } finally {
      setBoardLoading(false)
    }
  }

  const tasksByColumn = (columnId: string) => tasks
    .filter((task) => task.columnId === columnId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)

  const handleCreateTask = async (columnId?: string) => {
    if (!vaultPath || !newTitle.trim()) return
    const targetColumnId = columnId || newTaskColumnId || columns[0]?.id
    if (!targetColumnId) return
    const id = crypto.randomUUID()
    await window.api.invoke('kanban:create-task', {
      vaultPath,
      id,
      columnId: targetColumnId,
      title: newTitle.trim(),
      priority: 1
    })
    setNewTitle('')
    await loadBoard()
    setSelectedTaskId(id)
  }

  const handleDropTask = async (columnId: string, beforeTaskId?: string, droppedTaskId?: string) => {
    const taskId = droppedTaskId || draggingTaskId
    if (!vaultPath || !taskId) return
    const moving = tasks.find((task) => task.id === taskId)
    if (!moving) return

    const remaining = tasks.filter((task) => task.id !== taskId)
    const targetTasks = remaining
      .filter((task) => task.columnId === columnId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const insertIndex = beforeTaskId ? Math.max(0, targetTasks.findIndex((task) => task.id === beforeTaskId)) : targetTasks.length
    targetTasks.splice(insertIndex < 0 ? targetTasks.length : insertIndex, 0, { ...moving, columnId })

    const nextTasks = remaining.filter((task) => task.columnId !== columnId).concat(targetTasks.map((task, index) => ({ ...task, sortOrder: index })))
    setTasks(nextTasks)
    setDraggingTaskId(null)
    setDropColumnId(null)

    await window.api.invoke('kanban:reorder-tasks', {
      vaultPath,
      moves: targetTasks.map((task, index) => ({ id: task.id, columnId, sortOrder: index }))
    })
    await loadBoard()
  }

  const handleSaveDetail = async () => {
    if (!vaultPath || !selectedTask) return
    const title = String(detailDraft.title || '').trim()
    if (!title) {
      toast('任务标题不能为空', 'error')
      return
    }
    await window.api.invoke('kanban:update-task', {
      vaultPath,
      id: selectedTask.id,
      title,
      description: String(detailDraft.description || ''),
      columnId: String(detailDraft.columnId || selectedTask.columnId),
      priority: Number(detailDraft.priority || 0),
      dueDate: detailDraft.dueDate || null
    })
    toast('任务已保存', 'success')
    await loadBoard()
  }

  const handleDeleteTask = async () => {
    if (!vaultPath || !selectedTask) return
    await window.api.invoke('kanban:delete-task', { vaultPath, id: selectedTask.id })
    setSelectedTaskId(null)
    await loadBoard()
  }

  const handleCreateRelation = async () => {
    if (!vaultPath || !selectedTask || !newRelationTarget) return
    await window.api.invoke('kanban:create-relation', {
      vaultPath,
      id: crypto.randomUUID(),
      sourceTaskId: selectedTask.id,
      targetTaskId: newRelationTarget,
      relationType: newRelationType
    })
    await loadBoard()
    setNewRelationTarget('')
  }

  const handleAnalyze = async () => {
    if (!vaultPath) return
    aiStopRequestedRef.current = false
    setBusy('analyze')
    setAnalysis('')
    try {
      const result = await window.api.invoke('kanban:ai-analyze', { vaultPath })
      setAnalysis(result.summary)
    } catch (e: unknown) {
      if (aiStopRequestedRef.current || isCancellationError(e)) return
      toast(getErrorMessage(e) || 'AI 分析失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleBreakdown = async () => {
    if (!vaultPath || !selectedTask) return
    aiStopRequestedRef.current = false
    setBusy('breakdown')
    try {
      const result = await window.api.invoke('kanban:ai-breakdown-task', {
        vaultPath,
        taskId: selectedTask.id,
        title: selectedTask.title,
        description: selectedTask.description,
        columnId: selectedTask.columnId,
        preview: true
      })
      if (!result.plan?.tasks?.length) {
        toast('AI 没有生成可写入的子任务', 'info')
        return
      }
      setPendingAiWrite({
        mode: 'breakdown',
        plan: result.plan,
        taskId: selectedTask.id,
        title: selectedTask.title,
        description: selectedTask.description,
        columnId: selectedTask.columnId
      })
    } catch (e: unknown) {
      if (aiStopRequestedRef.current || isCancellationError(e)) return
      toast(getErrorMessage(e) || '任务拆解失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleGenerateFromNote = async () => {
    if (!vaultPath || !currentFilePath) {
      toast('请先打开一篇笔记', 'info')
      return
    }
    aiStopRequestedRef.current = false
    setBusy('from-note')
    try {
      const result = await window.api.invoke('kanban:ai-from-note', {
        vaultPath,
        filePath: currentFilePath,
        content: currentContent,
        columnId: columns[0]?.id,
        preview: true
      })
      if (!result.plan?.tasks?.length) {
        toast('AI 没有从当前笔记提取到任务', 'info')
        return
      }
      setPendingAiWrite({
        mode: 'from-note',
        plan: result.plan,
        filePath: currentFilePath,
        content: currentContent,
        columnId: columns[0]?.id
      })
    } catch (e: unknown) {
      if (aiStopRequestedRef.current || isCancellationError(e)) return
      toast(getErrorMessage(e) || '从笔记生成任务失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleImportIndexedTasks = async () => {
    if (!vaultPath) return
    aiStopRequestedRef.current = false
    setBusy('import-indexed')
    try {
      const result = await window.api.invoke('kanban:import-indexed-tasks', {
        vaultPath,
        columnId: columns[0]?.id,
        preview: true
      })
      if (!result.plan?.tasks?.length) {
        toast('没有可导入的 Markdown 待办', 'info')
        return
      }
      setPendingAiWrite({
        mode: 'indexed',
        plan: result.plan,
        columnId: columns[0]?.id
      })
    } catch (e: unknown) {
      const message = getErrorMessage(e)
      if (message.includes("No handler registered for 'kanban:import-indexed-tasks'")) {
        toast('导入待办需要重启应用加载新的主进程能力', 'error')
      } else {
        toast(message || '导入 Markdown 待办失败', 'error')
      }
    } finally {
      setBusy(null)
    }
  }

  const confirmAiWrite = async () => {
    if (!vaultPath || !pendingAiWrite) return
    const pending = pendingAiWrite
    setPendingAiWrite(null)
    aiStopRequestedRef.current = false
    setBusy(pending.mode === 'breakdown' ? 'breakdown' : pending.mode === 'indexed' ? 'import-indexed' : 'from-note')
    try {
      if (pending.mode === 'breakdown') {
        const committed = await window.api.invoke('kanban:ai-breakdown-task', {
          vaultPath,
          taskId: pending.taskId,
          title: pending.title,
          description: pending.description,
          columnId: pending.columnId,
          plan: pending.plan
        })
        toast(committed.summary, 'success')
      } else if (pending.mode === 'indexed') {
        const committed = await window.api.invoke('kanban:import-indexed-tasks', {
          vaultPath,
          columnId: pending.columnId,
          plan: pending.plan
        })
        toast(committed.summary, 'success')
      } else {
        const committed = await window.api.invoke('kanban:ai-from-note', {
          vaultPath,
          filePath: pending.filePath,
          content: pending.content,
          columnId: pending.columnId,
          plan: pending.plan
        })
        toast(committed.summary, 'success')
      }
      await loadBoard()
    } catch (e: unknown) {
      if (aiStopRequestedRef.current || isCancellationError(e)) return
      const message = getErrorMessage(e)
      if (message.includes("No handler registered for 'kanban:import-indexed-tasks'")) {
        toast('导入待办需要重启应用加载新的主进程能力', 'error')
      } else {
        toast(message || 'AI 任务写入失败', 'error')
      }
    } finally {
      setBusy(null)
    }
  }

  const handleStopAiTask = () => {
    aiStopRequestedRef.current = true
    window.api.invoke('ai:stop', undefined).catch(() => {})
    setBusy(null)
    toast('已请求停止 AI 任务', 'info')
  }

  const selectedRelations = selectedTask
    ? relations.filter((relation) => relation.sourceTaskId === selectedTask.id || relation.targetTaskId === selectedTask.id)
    : []

  const candidateRelationTargets = selectedTask
    ? tasks.filter((task) => task.id !== selectedTask.id && !selectedRelations.some((relation) => relation.sourceTaskId === task.id || relation.targetTaskId === task.id))
    : []
  const createDisabled = !newTitle.trim() || columns.length === 0

  if (!vaultPath) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
        先打开一个知识库
      </div>
    )
  }

  return (
    <div style={boardShellStyle}>
      <div style={boardHeaderStyle}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={boardEyebrowStyle}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', flexShrink: 0 }} />
                <span>{totalTasks} 个任务</span>
              </div>
              <div style={boardTitleStyle}>任务看板</div>
              <div style={boardSubtitleStyle}>按状态推进任务，AI 只在需要时辅助拆解和排序。</div>
            </div>
            <div style={boardActionRowStyle}>
              {busy && (
                <button
                  onClick={handleStopAiTask}
                  title="停止 AI 任务"
                  style={{ ...squareButtonStyle, color: 'var(--danger)', borderColor: 'rgba(248, 113, 113, 0.28)', background: 'var(--danger-muted)' }}
                >
                  <Icon name="x" />
                </button>
              )}
              <button onClick={handleImportIndexedTasks} disabled={busy === 'import-indexed'} title="导入 Markdown 待办" style={toolButtonStyle}>
                {busy === 'import-indexed' ? <span style={miniLoadingStyle} /> : <Icon name="note" />}
                <span>导入待办</span>
              </button>
              <button onClick={handleGenerateFromNote} disabled={busy === 'from-note'} title="从当前笔记生成任务" style={toolButtonStyle}>
                {busy === 'from-note' ? <span style={miniLoadingStyle} /> : <Icon name="spark" />}
                <span>从笔记生成</span>
              </button>
              <button onClick={handleAnalyze} disabled={busy === 'analyze'} title="AI 分析" style={insightButtonStyle}>
                {busy === 'analyze' ? <span style={miniLoadingStyle} /> : <Icon name="spark" />}
                <span>分析</span>
              </button>
            </div>
          </div>
          <div style={boardComposerStyle}>
            <select
              value={newTaskColumnId}
              onChange={(e) => setNewTaskColumnId(e.target.value)}
              disabled={columns.length === 0}
              title="选择任务状态"
              style={boardComposerSelectStyle}
            >
              {columns.length === 0 ? (
                <option value="">暂无列</option>
              ) : columns.map((column) => (
                <option key={column.id} value={column.id}>{column.name}</option>
              ))}
            </select>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTask()
                if (e.key === 'Escape') setNewTitle('')
              }}
              placeholder="添加一个新任务"
              style={boardComposerInputStyle}
            />
            <button
              onClick={() => handleCreateTask()}
              disabled={createDisabled}
              style={{ ...primaryButtonStyle, height: 34, opacity: createDisabled ? 0.45 : 1, cursor: createDisabled ? 'default' : 'pointer' }}
            >
              添加任务
            </button>
          </div>
        </div>
      </div>

      <div style={boardContentStyle}>
        {analysis && (
          <div style={analysisCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon name="spark" />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-text)' }}>AI 建议</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)' }}>{analysis}</div>
          </div>
        )}

        {boardLoading ? (
          <BoardSkeleton columnCount={Math.max(3, columns.length || 3)} />
        ) : columns.length === 0 ? (
          <div style={emptyBoardStyle}>
            <Icon name="note" />
            <span>看板还没有列</span>
          </div>
        ) : (
          <div style={boardGridStyle}>
            {columns.map((column) => {
              const columnTasks = tasksByColumn(column.id)
              const isDropTarget = dropColumnId === column.id
              return (
                <section
                  key={column.id}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropColumnId(column.id) }}
                  onDragLeave={() => setDropColumnId(null)}
                  onDrop={(e) => {
                    const taskId = e.dataTransfer.getData('application/x-nexusky-kanban-task') || e.dataTransfer.getData('text/plain')
                    handleDropTask(column.id, undefined, taskId || undefined)
                  }}
                  style={{
                    ...laneStyle,
                    borderColor: isDropTarget ? 'color-mix(in srgb, var(--accent) 52%, var(--border-subtle))' : 'var(--border-subtle)',
                    background: isDropTarget ? 'color-mix(in srgb, var(--accent-muted) 68%, var(--bg-base))' : laneStyle.background,
                    outline: isDropTarget ? '1px solid color-mix(in srgb, var(--accent) 24%, transparent)' : 'none',
                    overflow: 'hidden',
                    minHeight: 420
                  }}
                >
                  <div style={laneHeaderStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={columnDotStyle(column.name)} />
                      <span style={{ minWidth: 0 }}>
                        <span style={laneTitleStyle}>{column.name}</span>
                        <span style={laneMetaStyle}>{columnLaneHint(column.name, columnTasks.length)}</span>
                      </span>
                    </div>
                    <span style={countPillStyle}>{columnTasks.length}</span>
                  </div>

                  <div style={laneStackStyle(columnTasks.length > 0)}>
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        relationCount={relations.filter((relation) => relation.sourceTaskId === task.id || relation.targetTaskId === task.id).length}
                        highlighted={relatedTaskIds.has(task.id)}
                        selected={task.id === selectedTaskId}
                        onSelect={() => setSelectedTaskId(task.id)}
                        onHover={(hover) => setHoverTaskId(hover ? task.id : null)}
                        statusLabel={columnNameById.get(task.columnId) || column.name}
                        statusColor={columnStatusColor(columnNameById.get(task.columnId) || column.name)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', task.id)
                          e.dataTransfer.setData('application/x-nexusky-kanban-task', task.id)
                          setDraggingTaskId(task.id)
                        }}
                        onDragEnd={() => {
                          setDraggingTaskId(null)
                          setDropColumnId(null)
                        }}
                        onDropBefore={(e) => {
                          const taskId = e.dataTransfer.getData('application/x-nexusky-kanban-task') || e.dataTransfer.getData('text/plain')
                          handleDropTask(column.id, task.id, taskId || undefined)
                        }}
                      />
                    ))}
                    {columnTasks.length === 0 && <EmptyColumn />}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {selectedTask && (
        <div
          style={detailOverlayStyle}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedTaskId(null)
          }}
        >
          <aside style={detailModalStyle} onMouseDown={(e) => e.stopPropagation()}>
          <div style={detailHeaderStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={detailTitleRowStyle}>
                <span style={columnDotStyle(columnNameById.get(String(detailDraft.columnId || selectedTask.columnId)) || '')} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 730, color: 'var(--text-primary)' }}>任务详情</div>
                <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTask.sourceFilePath || '看板任务'}</div>
              </div>
              </div>
            </div>
            <button onClick={() => setSelectedTaskId(null)} style={iconButtonStyle} title="关闭">
              <Icon name="x" />
            </button>
          </div>

          <div style={detailBodyStyle}>
            <section style={detailSectionStyle}>
            <Field label="标题">
              <input value={String(detailDraft.title || '')} onChange={(e) => setDetailDraft((draft) => ({ ...draft, title: e.target.value }))} style={detailInputStyle} />
            </Field>
            <Field label="说明">
              <textarea value={String(detailDraft.description || '')} onChange={(e) => setDetailDraft((draft) => ({ ...draft, description: e.target.value }))} style={detailTextareaStyle} />
            </Field>
            </section>

            <section style={detailSectionStyle}>
            <div style={detailMetaGridStyle}>
              <Field label="状态">
                <select value={String(detailDraft.columnId || selectedTask.columnId)} onChange={(e) => setDetailDraft((draft) => ({ ...draft, columnId: e.target.value }))} style={detailInputStyle}>
                  {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
                </select>
              </Field>
              <Field label="优先级">
                <select value={Number(detailDraft.priority || 0)} onChange={(e) => setDetailDraft((draft) => ({ ...draft, priority: Number(e.target.value) }))} style={detailInputStyle}>
                  {PRIORITY_LABEL.map((label, index) => <option key={label} value={index}>{label}</option>)}
                </select>
              </Field>
              <Field label="截止日">
                <input type="date" value={String(detailDraft.dueDate || '')} onChange={(e) => setDetailDraft((draft) => ({ ...draft, dueDate: e.target.value || null }))} style={detailInputStyle} />
              </Field>
            </div>
            </section>

            <div style={detailActionRowStyle}>
              <button onClick={handleSaveDetail} style={primaryButtonStyle}>保存</button>
              <button onClick={handleBreakdown} disabled={busy === 'breakdown'} style={toolbarButtonStyle}>{busy === 'breakdown' ? '拆解中' : 'AI 拆解'}</button>
              {!selectedTask.sourceFilePath && <button onClick={handleDeleteTask} style={dangerButtonStyle}>删除</button>}
            </div>

            {selectedTask.sourceFilePath && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 14 }}>
                <button onClick={() => openFile(`${vaultPath}/${selectedTask.sourceFilePath}`)} style={toolbarButtonStyle}>打开来源笔记</button>
                <button onClick={handleDeleteTask} style={dangerButtonStyle}>删除</button>
              </div>
            )}

            <section style={detailRelationSectionStyle}>
              <div style={detailSectionTitleStyle}>
                <Icon name="link" />
                <span>关联关系</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {selectedRelations.map((relation) => {
                  const otherId = relation.sourceTaskId === selectedTask.id ? relation.targetTaskId : relation.sourceTaskId
                  const other = tasks.find((task) => task.id === otherId)
                  return (
                    <div key={relation.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                      <span style={relationBadgeStyle}>{RELATION_LABEL[relation.relationType]}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{other?.title || '未知任务'}</span>
                      <button onClick={async () => { if (!vaultPath) return; await window.api.invoke('kanban:delete-relation', { vaultPath, id: relation.id }); await loadBoard() }} style={smallIconButtonStyle}>
                        <Icon name="x" />
                      </button>
                    </div>
                  )
                })}
                {selectedRelations.length === 0 && <div style={{ padding: '8px 0', fontSize: 11, color: 'var(--text-tertiary)' }}>暂无关联</div>}
              </div>
              <select value={newRelationTarget} onChange={(e) => setNewRelationTarget(e.target.value)} style={{ ...detailInputStyle, marginBottom: 7 }}>
                <option value="">选择关联任务</option>
                {candidateRelationTargets.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
              <div style={detailRelationControlsStyle}>
                <select value={newRelationType} onChange={(e) => setNewRelationType(e.target.value as KanbanRelation['relationType'])} style={detailInputStyle}>
                  <option value="related">关联</option>
                  <option value="blocks">阻塞</option>
                  <option value="depends_on">依赖</option>
                </select>
                <button onClick={handleCreateRelation} style={toolbarButtonStyle}>添加</button>
              </div>
            </section>
          </div>
          </aside>
        </div>
      )}
      <AiWritePreviewModal
        pending={pendingAiWrite}
        onConfirm={confirmAiWrite}
        onCancel={() => setPendingAiWrite(null)}
      />
    </div>
  )
}

function TaskCard({
  task,
  statusLabel,
  statusColor,
  relationCount,
  highlighted,
  selected,
  onSelect,
  onHover,
  onDragStart,
  onDragEnd,
  onDropBefore
}: {
  task: KanbanTask
  statusLabel: string
  statusColor: string
  relationCount: number
  highlighted: boolean
  selected: boolean
  onSelect: () => void
  onHover: (hover: boolean) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
  onDropBefore: (event: React.DragEvent<HTMLButtonElement>) => void
}) {
  const priorityIndex = Math.max(0, Math.min(3, task.priority))
  const hasMeta = task.priority > 0 || task.dueDate || task.sourceFilePath || relationCount > 0 || statusLabel

  return (
    <button
      draggable
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
      onDrop={(e) => { e.stopPropagation(); onDropBefore(e) }}
      style={{
        width: '100%',
        minHeight: 68,
        padding: 0,
        textAlign: 'left',
        borderRadius: 10,
        border: `1px solid ${selected || highlighted ? taskAccentBorder(priorityIndex) : 'var(--border-subtle)'}`,
        background: selected ? taskSelectedBackground(priorityIndex) : highlighted ? 'color-mix(in srgb, var(--bg-elevated) 82%, transparent)' : 'var(--bg-surface)',
        color: 'var(--text-primary)',
        cursor: 'grab',
        overflow: 'hidden',
        boxShadow: 'none',
        transition: 'background 180ms cubic-bezier(0.16, 1, 0.3, 1), border-color 180ms cubic-bezier(0.16, 1, 0.3, 1), transform 180ms cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <div style={{ minWidth: 0, padding: '10px 11px 9px' }}>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={taskStatusDotStyle(statusColor)} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 690, lineHeight: 1.42, overflowWrap: 'anywhere' }}>{task.title}</span>
          <span style={{ ...priorityPillStyle, color: PRIORITY_COLOR[priorityIndex], background: PRIORITY_TONE[priorityIndex] }}>{PRIORITY_LABEL[priorityIndex]}</span>
        </span>
        {task.description && <span style={{ marginTop: 6, paddingLeft: 15, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.description}</span>}
        {hasMeta && (
          <span style={{ ...taskMetaRowStyle, paddingLeft: 15 }}>
            {statusLabel && <span style={taskStatusPillStyle(statusColor)}>{statusLabel}</span>}
            {task.dueDate && <span style={taskMetaPillStyle(dueDateTone(task.dueDate))}>{task.dueDate}</span>}
            {task.sourceFilePath && <span style={taskMetaPillStyle('neutral')}>笔记</span>}
            {relationCount > 0 && (
              <span title="有关联任务" style={{ ...taskMetaPillStyle('cool'), marginLeft: 'auto' }}>
                <Icon name="link" />
                {relationCount}
              </span>
            )}
          </span>
        )}
      </div>
    </button>
  )
}

function EmptyColumn() {
  return (
    <div style={emptyColumnStyle}>
      <Icon name="plus" />
      <span>暂无任务</span>
    </div>
  )
}

function BoardSkeleton({ columnCount }: { columnCount: number }) {
  return (
    <div style={boardGridStyle} aria-label="看板加载中">
      {Array.from({ length: columnCount }).map((_, columnIndex) => (
        <section key={columnIndex} style={{ ...laneStyle, overflow: 'hidden', minHeight: 420 }}>
          <div style={laneHeaderStyle}>
            <span style={{ ...skeletonLineStyle, width: 96 }} />
            <span style={{ ...skeletonLineStyle, width: 24 }} />
          </div>
          <div style={{ ...laneStackStyle(true), paddingTop: 10 }}>
            {Array.from({ length: 4 }).map((__, taskIndex) => (
              <div key={taskIndex} style={skeletonCardStyle}>
                <span style={{ ...skeletonLineStyle, width: `${62 + taskIndex * 7}%` }} />
                <span style={{ ...skeletonLineStyle, width: `${42 + taskIndex * 5}%`, opacity: 0.58 }} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function AiWritePreviewModal({
  pending,
  onConfirm,
  onCancel
}: {
  pending: PendingKanbanAiWrite | null
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!pending) return null
  const modeLabel = pending.mode === 'indexed' ? '导入待办' : pending.mode === 'from-note' ? '从笔记生成' : 'AI 拆解'
  const heading = pending.mode === 'indexed' ? '导入这些 Markdown 待办' : pending.mode === 'from-note' ? '把笔记线索写入任务画布' : '把拆解结果写入任务画布'
  const tasks = pending.plan.tasks.slice(0, 7)
  const hiddenCount = Math.max(0, pending.plan.tasks.length - tasks.length)

  return (
    <div style={aiWriteOverlayStyle} onClick={onCancel}>
      <div style={aiWriteModalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={aiWriteHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={aiWriteKickerStyle}>
              <Icon name="spark" />
              <span>{modeLabel}</span>
            </div>
            <div style={aiWriteTitleStyle}>{heading}</div>
          </div>
          <button onClick={onCancel} style={iconButtonStyle} title="关闭">
            <Icon name="x" />
          </button>
        </div>

        <div style={aiWriteStatsStyle}>
          <span style={aiWriteStatStyle}>{pending.plan.tasks.length} 个任务</span>
          <span style={aiWriteStatStyle}>{pending.plan.relations.length} 条关联</span>
          <span style={aiWriteStatStyle}>写入待办列</span>
        </div>

        <div style={aiWriteListStyle}>
          {tasks.map((task, index) => (
            <div key={`${task.title}-${index}`} style={aiWriteTaskRowStyle}>
              <span style={aiWriteTaskIndexStyle}>{String(index + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0 }}>
                <div style={aiWriteTaskTitleStyle}>{task.title}</div>
                {task.description && <div style={aiWriteTaskDescStyle}>{task.description}</div>}
              </div>
            </div>
          ))}
          {hiddenCount > 0 && (
            <div style={aiWriteMoreStyle}>
              另有 {hiddenCount} 个任务会一起写入
            </div>
          )}
        </div>

        {pending.plan.relations.length > 0 && (
          <div style={aiWriteRelationHintStyle}>
            <Icon name="link" />
            <span>依赖和关联会随任务一起进入画布。</span>
          </div>
        )}

        <div style={aiWriteFooterStyle}>
          <button onClick={onCancel} style={toolbarButtonStyle}>取消</button>
          <button onClick={onConfirm} autoFocus style={primaryButtonStyle}>写入画布</button>
        </div>
      </div>
    </div>
  )
}

function Icon({ name }: { name: 'plus' | 'note' | 'spark' | 'link' | 'x' }) {
  const common = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'plus') {
    return <svg {...common}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
  }
  if (name === 'note') {
    return <svg {...common}><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>
  }
  if (name === 'spark') {
    return <svg {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
  }
  if (name === 'link') {
    return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" /></svg>
  }
  return <svg {...common}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 9 }}>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  )
}

const toolbarButtonStyle: React.CSSProperties = {
  height: 32,
  minWidth: 0,
  padding: '0 11px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 7,
  border: '1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent)',
  background: 'color-mix(in srgb, var(--bg-elevated) 72%, transparent)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease'
}

const compactButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  gap: 5,
  height: 30,
  padding: '0 8px',
  fontSize: 11
}

const toolButtonStyle: React.CSSProperties = {
  ...compactButtonStyle,
  height: 32,
  padding: '0 10px',
  background: 'var(--bg-base)',
  borderColor: 'var(--border-subtle)',
  color: 'var(--text-secondary)'
}

const insightButtonStyle: React.CSSProperties = {
  ...toolButtonStyle,
  color: 'var(--accent-text)',
  borderColor: 'rgba(124, 110, 245, 0.28)',
  background: 'var(--accent-muted)'
}

const primaryButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  background: 'var(--accent)',
  borderColor: 'var(--accent)',
  color: 'oklch(0.96 0.01 280)',
  fontWeight: 600
}

const dangerButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  color: 'var(--danger)',
  background: 'var(--danger-muted)'
}

const squareButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0
}

const boardShellStyle: React.CSSProperties = {
  height: '100%',
  position: 'relative',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  background: 'color-mix(in srgb, var(--editor-bg) 90%, var(--bg-base))',
  overflow: 'hidden'
}

const boardHeaderStyle: React.CSSProperties = {
  padding: '16px 18px 13px',
  borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 76%, transparent)',
  background: 'color-mix(in srgb, var(--editor-bg) 86%, var(--bg-surface))'
}

const boardEyebrowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 22,
  color: 'var(--text-tertiary)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0
}

const boardTitleStyle: React.CSSProperties = {
  marginTop: 2,
  color: 'var(--text-primary)',
  fontSize: 18,
  fontWeight: 760,
  lineHeight: 1.18,
  letterSpacing: 0
}

const boardSubtitleStyle: React.CSSProperties = {
  marginTop: 5,
  color: 'var(--text-tertiary)',
  fontSize: 11,
  lineHeight: 1.45
}

const boardActionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 7,
  flexShrink: 0,
  flexWrap: 'wrap'
}

const boardContentStyle: React.CSSProperties = {
  minHeight: 0,
  overflow: 'auto',
  padding: 18
}

const boardComposerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '132px minmax(220px, 460px) auto',
  alignItems: 'center',
  gap: 8,
  maxWidth: 720
}

const boardComposerSelectStyle: React.CSSProperties = {
  minWidth: 0,
  width: '100%',
  height: 34,
  padding: '0 9px',
  borderRadius: 7,
  border: '1px solid color-mix(in srgb, var(--border-subtle) 86%, transparent)',
  background: 'color-mix(in srgb, var(--bg-elevated) 72%, transparent)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  outline: 'none'
}

const boardComposerInputStyle: React.CSSProperties = {
  minWidth: 0,
  width: '100%',
  height: 34,
  padding: '0 11px',
  borderRadius: 7,
  border: '1px solid color-mix(in srgb, var(--border-default) 76%, transparent)',
  background: 'color-mix(in srgb, var(--bg-base) 76%, transparent)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none'
}

const boardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(282px, 1fr))',
  alignItems: 'start',
  gap: 14,
  minWidth: 920
}

const laneStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  borderRadius: 8,
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'color-mix(in srgb, var(--bg-base) 86%, var(--bg-surface))'
}

const laneHeaderStyle: React.CSSProperties = {
  height: 48,
  padding: '0 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent)',
  background: 'color-mix(in srgb, var(--bg-surface) 72%, transparent)'
}

const laneTitleStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 690,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const laneMetaStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 2,
  color: 'var(--text-tertiary)',
  fontSize: 10,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

function laneStackStyle(hasTasks: boolean): React.CSSProperties {
  return {
    padding: hasTasks ? '9px 9px 11px' : '9px 9px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minHeight: 0
  }
}

const emptyColumnStyle: React.CSSProperties = {
  minHeight: 0,
  height: '100%',
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '12px 10px',
  borderRadius: 8,
  border: '1px dashed color-mix(in srgb, var(--border-subtle) 76%, transparent)',
  background: 'color-mix(in srgb, var(--bg-surface) 62%, transparent)',
  fontSize: 11,
  lineHeight: 1.5,
  color: 'var(--text-tertiary)',
  textAlign: 'center'
}

const emptyBoardStyle: React.CSSProperties = {
  minHeight: 320,
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: 10,
  border: '1px dashed var(--border-subtle)',
  borderRadius: 10,
  background: 'var(--bg-base)',
  color: 'var(--text-tertiary)',
  fontSize: 12
}

const skeletonLineStyle: React.CSSProperties = {
  display: 'block',
  height: 10,
  borderRadius: 999,
  background: 'linear-gradient(90deg, var(--bg-elevated), color-mix(in srgb, var(--bg-elevated) 62%, var(--text-tertiary)), var(--bg-elevated))',
  backgroundSize: '220% 100%',
  animation: 'pulse 1.35s ease-in-out infinite'
}

const skeletonCardStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: '13px 12px',
  minHeight: 68,
  borderRadius: 10,
  border: '1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent)',
  background: 'color-mix(in srgb, var(--bg-surface) 70%, transparent)'
}

const iconButtonStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
  fontSize: 16
}

const smallIconButtonStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
  flexShrink: 0
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none'
}

const analysisCardStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: '12px 13px',
  borderRadius: 10,
  border: '1px solid rgba(124, 110, 245, 0.22)',
  background: 'color-mix(in srgb, var(--accent-muted) 82%, var(--bg-base))'
}

const aiWriteOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 210,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  background: 'rgba(8, 8, 13, 0.62)'
}

const aiWriteModalStyle: React.CSSProperties = {
  width: 'min(620px, calc(100vw - 40px))',
  maxHeight: 'min(720px, calc(100vh - 40px))',
  display: 'grid',
  gridTemplateRows: 'auto auto minmax(0, 1fr) auto auto',
  overflow: 'hidden',
  borderRadius: 12,
  border: '1px solid color-mix(in srgb, var(--border-default) 88%, transparent)',
  background: 'var(--bg-elevated)',
  boxShadow: '0 24px 70px rgba(0, 0, 0, 0.42)'
}

const aiWriteHeaderStyle: React.CSSProperties = {
  minHeight: 86,
  padding: '18px 18px 14px',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 14
}

const aiWriteKickerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: 'var(--accent-text)',
  fontSize: 11,
  fontWeight: 680
}

const aiWriteTitleStyle: React.CSSProperties = {
  marginTop: 7,
  color: 'var(--text-primary)',
  fontSize: 18,
  fontWeight: 760,
  lineHeight: 1.28
}

const aiWriteStatsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  flexWrap: 'wrap',
  padding: '0 18px 12px'
}

const aiWriteStatStyle: React.CSSProperties = {
  height: 24,
  padding: '0 9px',
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  background: 'color-mix(in srgb, var(--bg-elevated) 82%, transparent)',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 75%, transparent)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontWeight: 590
}

const aiWriteListStyle: React.CSSProperties = {
  minHeight: 0,
  overflowY: 'auto',
  padding: '0 18px 14px',
  display: 'grid',
  gap: 8
}

const aiWriteTaskRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '34px minmax(0, 1fr)',
  gap: 10,
  padding: '10px 11px',
  borderRadius: 8,
  border: '1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent)',
  background: 'color-mix(in srgb, var(--bg-surface) 74%, transparent)'
}

const aiWriteTaskIndexStyle: React.CSSProperties = {
  color: 'var(--accent-text)',
  fontSize: 11,
  fontWeight: 760,
  fontVariantNumeric: 'tabular-nums'
}

const aiWriteTaskTitleStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: 13,
  fontWeight: 650,
  lineHeight: 1.42,
  overflowWrap: 'anywhere'
}

const aiWriteTaskDescStyle: React.CSSProperties = {
  marginTop: 4,
  color: 'var(--text-tertiary)',
  fontSize: 11,
  lineHeight: 1.45,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
}

const aiWriteMoreStyle: React.CSSProperties = {
  padding: '4px 2px',
  color: 'var(--text-tertiary)',
  fontSize: 11,
  textAlign: 'center'
}

const aiWriteRelationHintStyle: React.CSSProperties = {
  margin: '0 18px 14px',
  padding: '9px 10px',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  borderRadius: 8,
  background: 'color-mix(in srgb, var(--accent-muted) 70%, transparent)',
  color: 'var(--text-secondary)',
  fontSize: 11
}

const aiWriteFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '14px 18px 18px',
  borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 74%, transparent)'
}

const detailOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  zIndex: 8,
  padding: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(8, 8, 13, 0.54)'
}

const detailModalStyle: React.CSSProperties = {
  width: 'min(680px, calc(100vw - 48px))',
  maxHeight: 'min(640px, calc(100vh - 48px))',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  overflow: 'hidden',
  borderRadius: 12,
  border: '1px solid color-mix(in srgb, var(--border-default) 86%, transparent)',
  background: 'var(--bg-elevated)',
  boxShadow: '0 24px 70px rgba(0, 0, 0, 0.42)'
}

const detailHeaderStyle: React.CSSProperties = {
  minHeight: 58,
  padding: '0 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent)',
  background: 'color-mix(in srgb, var(--bg-surface) 58%, transparent)'
}

const detailTitleRowStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 9
}

const detailBodyStyle: React.CSSProperties = {
  minHeight: 0,
  padding: '16px 16px 18px',
  overflowY: 'auto',
  display: 'grid',
  gap: 12
}

const detailSectionStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10
}

const detailMetaGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10
}

const detailInputStyle: React.CSSProperties = {
  ...inputStyle,
  height: 34,
  paddingLeft: 12,
  borderColor: 'color-mix(in srgb, var(--border-subtle) 86%, transparent)',
  background: 'color-mix(in srgb, var(--bg-surface) 64%, transparent)',
  fontSize: 12.5
}

const detailTextareaStyle: React.CSSProperties = {
  ...detailInputStyle,
  minHeight: 88,
  paddingTop: 9,
  resize: 'vertical',
  lineHeight: 1.55
}

const detailActionRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8,
  alignItems: 'center'
}

const detailRelationSectionStyle: React.CSSProperties = {
  paddingTop: 12,
  borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent)'
}

const detailSectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginBottom: 8,
  color: 'var(--text-primary)',
  fontSize: 12,
  fontWeight: 650
}

const detailRelationControlsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 7
}

const countPillStyle: React.CSSProperties = {
  minWidth: 22,
  height: 18,
  padding: '0 6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  background: 'color-mix(in srgb, var(--bg-elevated) 76%, transparent)',
  color: 'var(--text-tertiary)',
  fontSize: 10,
  fontWeight: 600
}

const priorityPillStyle: React.CSSProperties = {
  height: 16,
  padding: '0 6px',
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  background: 'color-mix(in srgb, var(--bg-elevated) 76%, transparent)',
  fontSize: 10,
  fontWeight: 700,
  flexShrink: 0
}

const taskMetaRowStyle: React.CSSProperties = {
  marginTop: 9,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 18
}

function taskStatusDotStyle(color: string): React.CSSProperties {
  return {
    width: 7,
    height: 7,
    marginTop: 5,
    borderRadius: 999,
    background: color,
    flexShrink: 0
  }
}

const relationBadgeStyle: React.CSSProperties = {
  height: 18,
  padding: '0 6px',
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 4,
  background: 'var(--accent-muted)',
  color: 'var(--accent-text)',
  fontSize: 10,
  fontWeight: 600,
  flexShrink: 0
}

const miniLoadingStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  border: '1.5px solid var(--border-default)',
  borderTopColor: 'var(--accent)',
  animation: 'pulse 800ms ease-in-out infinite'
}

function columnDotStyle(name: string): React.CSSProperties {
  return {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: columnStatusColor(name),
    flexShrink: 0
  }
}

function columnStatusColor(name: string): string {
  if (/完成|done/i.test(name)) return 'oklch(0.7 0.13 155)'
  if (/进行|progress|doing/i.test(name)) return 'oklch(0.74 0.12 85)'
  return 'var(--accent)'
}

function columnLaneHint(name: string, count: number): string {
  if (count === 0) return '等待补充'
  if (/完成|done/i.test(name)) return '已收束'
  if (/进行|progress|doing/i.test(name)) return '正在推进'
  return '待排序'
}

function dueDateTone(dueDate: string): 'neutral' | 'warm' {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return 'neutral'
  return due.getTime() < today.getTime() ? 'warm' : 'neutral'
}

function taskMetaPillStyle(tone: 'neutral' | 'warm' | 'cool'): React.CSSProperties {
  const color = tone === 'warm'
    ? 'oklch(0.73 0.13 65)'
    : tone === 'cool'
      ? 'var(--accent-text)'
      : 'var(--text-tertiary)'
  const background = tone === 'warm'
    ? 'oklch(0.35 0.06 65 / 0.35)'
    : tone === 'cool'
      ? 'color-mix(in srgb, var(--accent-muted) 68%, transparent)'
      : 'color-mix(in srgb, var(--bg-elevated) 72%, transparent)'

  return {
    minWidth: 0,
    height: 18,
    padding: '0 6px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    color,
    background,
    fontSize: 10,
    fontWeight: 620,
    whiteSpace: 'nowrap'
  }
}

function taskStatusPillStyle(color: string): React.CSSProperties {
  return {
    ...taskMetaPillStyle('neutral'),
    color,
    background: `color-mix(in srgb, ${color} 14%, var(--bg-elevated))`
  }
}

function taskAccentBorder(priorityIndex: number): string {
  if (priorityIndex >= 3) return 'oklch(0.65 0.15 25 / 0.56)'
  if (priorityIndex >= 2) return 'oklch(0.75 0.12 85 / 0.52)'
  return 'color-mix(in srgb, var(--accent) 44%, var(--border-subtle))'
}

function taskSelectedBackground(priorityIndex: number): string {
  if (priorityIndex >= 3) return 'oklch(0.25 0.045 25 / 0.82)'
  if (priorityIndex >= 2) return 'oklch(0.26 0.04 85 / 0.82)'
  return 'color-mix(in srgb, var(--accent-muted) 72%, var(--bg-surface))'
}
