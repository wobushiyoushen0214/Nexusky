import { memo, useMemo } from 'react'
import { diffLines } from 'diff'

interface DiffViewProps {
  original: string
  modified: string
}

export const DiffView = memo(function DiffView({ original, modified }: DiffViewProps) {
  const hunks = useMemo(() => {
    const changes = diffLines(original, modified)
    const lines: { type: 'add' | 'remove' | 'context'; content: string }[] = []

    for (const change of changes) {
      const rawLines = change.value.replace(/\n$/, '').split('\n')
      const type = change.added ? 'add' : change.removed ? 'remove' : 'context'
      for (const line of rawLines) {
        lines.push({ type, content: line })
      }
    }

    // Collapse long unchanged sections, keep 2 lines of context around changes
    const CONTEXT = 2
    const visible = new Set<number>()
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].type !== 'context') {
        for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) {
          visible.add(j)
        }
      }
    }

    const result: ({ type: 'add' | 'remove' | 'context'; content: string } | { type: 'separator' })[] = []
    let lastIndex = -1
    for (let i = 0; i < lines.length; i++) {
      if (!visible.has(i)) continue
      if (lastIndex !== -1 && i - lastIndex > 1) {
        result.push({ type: 'separator' })
      }
      result.push(lines[i])
      lastIndex = i
    }

    return result
  }, [original, modified])

  const stats = useMemo(() => {
    let added = 0, removed = 0
    for (const h of hunks) {
      if (h.type === 'add') added++
      else if (h.type === 'remove') removed++
    }
    return { added, removed }
  }, [hunks])

  return (
    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono, "JetBrains Mono", "Fira Code", monospace)', lineHeight: 1.6, overflow: 'auto' }}>
      <div className="glass-divider-bottom" style={{ padding: '4px 12px', display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-tertiary)', borderBottom: '0', boxShadow: 'var(--glass-divider-shadow-bottom)' }}>
        {stats.added > 0 && <span style={{ color: 'var(--success)' }}>+{stats.added}</span>}
        {stats.removed > 0 && <span style={{ color: 'var(--danger)' }}>-{stats.removed}</span>}
      </div>
      <div style={{ padding: '4px 0' }}>
        {hunks.map((line, i) => {
          if (line.type === 'separator') {
            return (
              <div key={i} style={{ padding: '2px 12px', fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-surface)', textAlign: 'center' }}>
                ···
              </div>
            )
          }
          const bg = line.type === 'add'
            ? 'var(--success-muted)'
            : line.type === 'remove'
              ? 'var(--danger-muted)'
              : 'transparent'
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
          const color = line.type === 'add'
            ? 'var(--success)'
            : line.type === 'remove'
              ? 'var(--danger)'
              : 'var(--text-secondary)'
          return (
            <div key={i} style={{ padding: '0 12px', background: bg, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <span style={{ color: 'var(--text-tertiary)', display: 'inline-block', width: 16, userSelect: 'none' }}>{prefix}</span>
              <span style={{ color }}>{line.content}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
})
