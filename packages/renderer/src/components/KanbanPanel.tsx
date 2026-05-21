import { useEffect, useMemo, useRef, useState } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { toast } from '../stores/toast-store'
import { getErrorMessage, isCancellationError } from '../utils/errors'
import { ConfirmModal } from './ConfirmModal'
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

type PendingKanbanAiWrite =
  | { mode: 'breakdown'; plan: KanbanAiPlan; taskId: string; title: string; description?: string; columnId: string }
  | { mode: 'from-note'; plan: KanbanAiPlan; filePath: string; content: string; columnId?: string }
  | { mode: 'indexed'; plan: KanbanAiPlan; columnId?: string }

function formatKanbanAiPreview(plan: KanbanAiPlan): string {
  const titles = plan.tasks.slice(0, 8).map((task, index) => `${index + 1}. ${task.title}`).join('\n')
  const more = plan.tasks.length > 8 ? `\n...另有 ${plan.tasks.length - 8} 个任务` : ''
  const relationText = plan.relations.length > 0 ? `\n\n包含 ${plan.relations.length} 条依赖/关联关系。` : ''
  return `AI 将创建 ${plan.tasks.length} 个任务：\n\n${titles}${more}${relationText}\n\n是否写入看板？`
}

function formatKanbanImportPreview(plan: KanbanAiPlan): string {
  const titles = plan.tasks.slice(0, 10).map((task, index) => `${index + 1}. ${task.title}`).join('\n')
  const more = plan.tasks.length > 10 ? `\n...另有 ${plan.tasks.length - 10} 个待办` : ''
  return `将从已索引的 Markdown checkbox 导入 ${plan.tasks.length} 个未完成待办：\n\n${titles}${more}\n\n是否写入看板？`
}

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
  const [analysis, setAnalysis] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const aiStopRequestedRef = useRef(false)
  const [detailDraft, setDetailDraft] = useState<Partial<KanbanTask>>({})
  const [newRelationTarget, setNewRelationTarget] = useState('')
  const [newRelationType, setNewRelationType] = useState<KanbanRelation['relationType']>('related')
  const [pendingAiWrite, setPendingAiWrite] = useState<PendingKanbanAiWrite | null>(null)

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) || null, [tasks, selectedTaskId])
  const totalTasks = tasks.length

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
    loadBoard()
  }, [vaultPath])

  useEffect(() => {
    setDetailDraft(selectedTask || {})
    setNewRelationTarget('')
    setNewRelationType('related')
  }, [selectedTaskId, selectedTask])

  const loadBoard = async () => {
    if (!vaultPath) return
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
  }

  const tasksByColumn = (columnId: string) => tasks
    .filter((task) => task.columnId === columnId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)

  const handleCreateTask = async (columnId?: string) => {
    if (!vaultPath || !newTitle.trim()) return
    const targetColumnId = columnId || columns[0]?.id
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

  const handleDropTask = async (columnId: string, beforeTaskId?: string) => {
    if (!vaultPath || !draggingTaskId) return
    const moving = tasks.find((task) => task.id === draggingTaskId)
    if (!moving) return

    const remaining = tasks.filter((task) => task.id !== draggingTaskId)
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
      toast(getErrorMessage(e) || '导入 Markdown 待办失败', 'error')
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
      toast(getErrorMessage(e) || 'AI 任务写入失败', 'error')
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
              <div style={boardTitleStyle}>任务画布</div>
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
              <button onClick={handleImportIndexedTasks} disabled={busy === 'import-indexed'} title="导入 Markdown 待办" style={compactButtonStyle}>
                {busy === 'import-indexed' ? <span style={miniLoadingStyle} /> : <Icon name="note" />}
                <span>导入待办</span>
              </button>
              <button onClick={handleGenerateFromNote} disabled={busy === 'from-note'} title="从当前笔记生成任务" style={compactButtonStyle}>
                {busy === 'from-note' ? <span style={miniLoadingStyle} /> : <Icon name="spark" />}
                <span>从笔记生成</span>
              </button>
              <button onClick={handleAnalyze} disabled={busy === 'analyze'} title="AI 分析" style={insightButtonStyle}>
                {busy === 'analyze' ? <span style={miniLoadingStyle} /> : <Icon name="spark" />}
                <span>分析</span>
              </button>
            </div>
          </div>

          <div style={quickCaptureStyle}>
            <Icon name="plus" />
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTask() }}
              placeholder="写下一个任务"
              style={quickCaptureInputStyle}
            />
            <button
              onClick={() => handleCreateTask()}
              disabled={createDisabled}
              title="添加任务"
              style={{ ...primaryButtonStyle, height: 30, opacity: createDisabled ? 0.45 : 1, cursor: createDisabled ? 'default' : 'pointer' }}
            >
              添加
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

        <div style={boardGridStyle}>
          {columns.map((column) => {
            const columnTasks = tasksByColumn(column.id)
            const isDropTarget = dropColumnId === column.id
            return (
              <section
                key={column.id}
                onDragOver={(e) => { e.preventDefault(); setDropColumnId(column.id) }}
                onDragLeave={() => setDropColumnId(null)}
                onDrop={() => handleDropTask(column.id)}
                style={{
                  ...laneStyle,
                  borderColor: isDropTarget ? 'rgba(124, 110, 245, 0.5)' : 'transparent',
                  background: isDropTarget ? 'var(--accent-muted)' : laneStyle.background,
                  outline: isDropTarget ? '1px solid rgba(124, 110, 245, 0.24)' : 'none',
                  overflow: 'hidden',
                  minHeight: 360
                }}
              >
                <div style={laneHeaderStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={columnDotStyle(column.name)} />
                    <span style={laneTitleStyle}>{column.name}</span>
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
                      onDragStart={() => setDraggingTaskId(task.id)}
                      onDropBefore={() => handleDropTask(column.id, task.id)}
                    />
                  ))}
                  {columnTasks.length === 0 && <EmptyColumn />}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {selectedTask && (
        <aside style={detailDrawerStyle}>
          <div style={{ minHeight: 60, padding: '0 18px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ maxWidth: 880, height: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 730, color: 'var(--text-primary)' }}>任务详情</div>
                <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTask.sourceFilePath || '看板任务'}</div>
              </div>
              <button onClick={() => setSelectedTaskId(null)} style={iconButtonStyle} title="关闭">
                <Icon name="x" />
              </button>
            </div>
          </div>

          <div style={{ padding: '18px 18px 28px', overflowY: 'auto' }}>
            <div style={{ maxWidth: 880, margin: '0 auto' }}>
            <Field label="标题">
              <input value={String(detailDraft.title || '')} onChange={(e) => setDetailDraft((draft) => ({ ...draft, title: e.target.value }))} style={{ ...inputStyle, height: 36, fontSize: 13 }} />
            </Field>
            <Field label="说明">
              <textarea value={String(detailDraft.description || '')} onChange={(e) => setDetailDraft((draft) => ({ ...draft, description: e.target.value }))} style={{ ...inputStyle, minHeight: 112, paddingTop: 9, resize: 'vertical', lineHeight: 1.55 }} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
              <Field label="优先级">
                <select value={Number(detailDraft.priority || 0)} onChange={(e) => setDetailDraft((draft) => ({ ...draft, priority: Number(e.target.value) }))} style={inputStyle}>
                  {PRIORITY_LABEL.map((label, index) => <option key={label} value={index}>{label}</option>)}
                </select>
              </Field>
              <Field label="截止日">
                <input type="date" value={String(detailDraft.dueDate || '')} onChange={(e) => setDetailDraft((draft) => ({ ...draft, dueDate: e.target.value || null }))} style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: selectedTask.sourceFilePath ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8, margin: '4px 0 16px' }}>
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

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Icon name="link" />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>关联关系</span>
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
              <select value={newRelationTarget} onChange={(e) => setNewRelationTarget(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }}>
                <option value="">选择关联任务</option>
                {candidateRelationTargets.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
                <select value={newRelationType} onChange={(e) => setNewRelationType(e.target.value as KanbanRelation['relationType'])} style={inputStyle}>
                  <option value="related">关联</option>
                  <option value="blocks">阻塞</option>
                  <option value="depends_on">依赖</option>
                </select>
                <button onClick={handleCreateRelation} style={toolbarButtonStyle}>添加</button>
              </div>
            </div>
            </div>
          </div>
        </aside>
      )}
      <ConfirmModal
        open={!!pendingAiWrite}
        title="确认写入看板"
        message={pendingAiWrite ? pendingAiWrite.mode === 'indexed' ? formatKanbanImportPreview(pendingAiWrite.plan) : formatKanbanAiPreview(pendingAiWrite.plan) : ''}
        confirmText="写入"
        onConfirm={confirmAiWrite}
        onCancel={() => setPendingAiWrite(null)}
      />
    </div>
  )
}

function TaskCard({
  task,
  relationCount,
  highlighted,
  selected,
  onSelect,
  onHover,
  onDragStart,
  onDropBefore
}: {
  task: KanbanTask
  relationCount: number
  highlighted: boolean
  selected: boolean
  onSelect: () => void
  onHover: (hover: boolean) => void
  onDragStart: () => void
  onDropBefore: () => void
}) {
  return (
    <button
      draggable
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.stopPropagation(); onDropBefore() }}
      style={{
        width: '100%',
        minHeight: 72,
        padding: '10px 11px',
        textAlign: 'left',
        borderRadius: 8,
        border: `1px solid ${selected || highlighted ? 'rgba(124, 110, 245, 0.46)' : 'color-mix(in srgb, var(--border-subtle) 78%, transparent)'}`,
        background: selected ? 'var(--accent-muted)' : highlighted ? 'color-mix(in srgb, var(--accent-muted) 64%, transparent)' : 'color-mix(in srgb, var(--bg-surface) 82%, var(--editor-bg))',
        color: 'var(--text-primary)',
        cursor: 'grab',
        transition: 'background 150ms ease, border-color 150ms ease, transform 150ms ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 610, lineHeight: 1.42, overflowWrap: 'anywhere' }}>{task.title}</span>
        {relationCount > 0 && (
          <span title="有关联任务" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--accent-text)', fontSize: 10, flexShrink: 0, paddingTop: 2 }}>
            <Icon name="link" />
            {relationCount}
          </span>
        )}
      </div>
      {task.description && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.48, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.description}</div>}
      <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 6, minHeight: 16 }}>
        <span style={{ ...priorityPillStyle, color: PRIORITY_COLOR[Math.max(0, Math.min(3, task.priority))] }}>{PRIORITY_LABEL[Math.max(0, Math.min(3, task.priority))]}</span>
        {task.dueDate && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{task.dueDate}</span>}
        {task.sourceFilePath && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)' }}>笔记</span>}
      </div>
    </button>
  )
}

function EmptyColumn() {
  return (
    <div style={{ minHeight: 104, display: 'grid', placeItems: 'center', padding: '12px 10px', borderRadius: 8, border: '1px dashed color-mix(in srgb, var(--border-subtle) 78%, transparent)', fontSize: 11, lineHeight: 1.5, color: 'var(--text-tertiary)', textAlign: 'center' }}>
      拖入任务或从顶部添加
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

const insightButtonStyle: React.CSSProperties = {
  ...compactButtonStyle,
  color: 'var(--accent-text)',
  borderColor: 'rgba(124, 110, 245, 0.28)',
  background: 'color-mix(in srgb, var(--accent-muted) 82%, transparent)'
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
  background: 'var(--editor-bg)',
  overflow: 'hidden'
}

const boardHeaderStyle: React.CSSProperties = {
  padding: '20px 22px 16px',
  borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent)',
  background: 'color-mix(in srgb, var(--editor-bg) 92%, var(--bg-base))'
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
  fontSize: 24,
  fontWeight: 760,
  lineHeight: 1.18,
  letterSpacing: 0
}

const boardActionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 6,
  flexShrink: 0,
  flexWrap: 'wrap'
}

const quickCaptureStyle: React.CSSProperties = {
  height: 42,
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 8,
  padding: '0 7px 0 12px',
  borderRadius: 8,
  border: '1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent)',
  background: 'color-mix(in srgb, var(--bg-surface) 70%, var(--editor-bg))',
  color: 'var(--text-tertiary)'
}

const quickCaptureInputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  minWidth: 0
}

const boardContentStyle: React.CSSProperties = {
  minHeight: 0,
  overflow: 'auto',
  padding: '18px 22px 24px'
}

const boardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(272px, 1fr))',
  alignItems: 'start',
  gap: 16,
  minWidth: 880
}

const laneStyle: React.CSSProperties = {
  borderRadius: 10,
  border: '1px solid transparent',
  background: 'color-mix(in srgb, var(--bg-base) 72%, transparent)'
}

const laneHeaderStyle: React.CSSProperties = {
  height: 42,
  padding: '0 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
}

const laneTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 690,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

function laneStackStyle(hasTasks: boolean): React.CSSProperties {
  return {
    padding: hasTasks ? '0 8px 10px' : '0 8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  }
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

const detailDrawerStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  zIndex: 8,
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  background: 'var(--editor-bg)',
  overflow: 'hidden'
}

const countPillStyle: React.CSSProperties = {
  minWidth: 22,
  height: 18,
  padding: '0 6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
  color: 'var(--text-tertiary)',
  fontSize: 10,
  fontWeight: 600
}

const priorityPillStyle: React.CSSProperties = {
  height: 16,
  padding: '0 5px',
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 4,
  background: 'color-mix(in srgb, var(--bg-elevated) 76%, transparent)',
  fontSize: 10,
  fontWeight: 600
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
  const color = name.includes('完成')
    ? 'oklch(0.7 0.13 155)'
    : name.includes('进行')
      ? 'oklch(0.74 0.12 85)'
      : 'var(--accent)'
  return {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: color,
    flexShrink: 0
  }
}
