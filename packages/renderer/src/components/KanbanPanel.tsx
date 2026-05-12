import { useState, useEffect } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'

interface TaskItem {
  text: string
  done: boolean
  filePath: string
  noteTitle: string
}

export function KanbanPanel() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)

  useEffect(() => {
    if (!vaultPath) return
    loadTasks()
  }, [vaultPath])

  const loadTasks = async () => {
    if (!vaultPath) return
    const allTasks = await window.api.invoke('db:get-tasks', { vaultPath }) as TaskItem[]
    setTasks(allTasks)
  }

  const todo = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  const columnStyle: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }
  const headerStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px 6px' }

  return (
    <div style={{ height: '100%', padding: '12px', display: 'flex', gap: 12, overflow: 'hidden' }}>
      {/* Todo column */}
      <div style={columnStyle}>
        <div style={headerStyle}>待办 ({todo.length})</div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {todo.map((task, i) => (
            <TaskCard key={`todo-${i}`} task={task} onClick={() => openFile(`${vaultPath}/${task.filePath}`)} />
          ))}
          {todo.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: '16px 0' }}>无待办任务</p>}
        </div>
      </div>
      {/* Done column */}
      <div style={columnStyle}>
        <div style={headerStyle}>已完成 ({done.length})</div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {done.slice(0, 30).map((task, i) => (
            <TaskCard key={`done-${i}`} task={task} onClick={() => openFile(`${vaultPath}/${task.filePath}`)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TaskCard({ task, onClick }: { task: TaskItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 10px', borderRadius: 6, textAlign: 'left',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        cursor: 'pointer', display: 'block', width: '100%',
        transition: 'border-color 100ms',
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
    >
      <p style={{ fontSize: 12, color: task.done ? 'var(--text-tertiary)' : 'var(--text-primary)', margin: 0, textDecoration: task.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.text}
      </p>
      <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.noteTitle}
      </p>
    </button>
  )
}
