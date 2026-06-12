import { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { Button } from '../ui/button'

interface TocItem {
  level: number
  text: string
  index: number
}

export function OutlinePanel() {
  const content = useEditorStore((s) => s.content)
  const [items, setItems] = useState<TocItem[]>([])

  useEffect(() => {
    if (!content) { setItems([]); return }
    const headings: TocItem[] = []
    const lines = content.split('\n')
    let headingIndex = 0
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        headings.push({ level: match[1].length, text: match[2].trim(), index: headingIndex })
        headingIndex++
      }
    }
    setItems(headings)
  }, [content])

  if (items.length === 0) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 18, textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>无标题</p>
      </div>
    )
  }

  return (
    <div className="file-tree-scroll" style={{ padding: '10px 8px', overflow: 'auto', height: '100%', background: 'transparent' }}>
      {items.map((item, i) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          key={i}
          onClick={() => window.dispatchEvent(new CustomEvent('editor-goto-heading', { detail: { index: item.index } }))}
          style={{
            width: '100%',
            minHeight: 28,
            paddingLeft: 10 + (item.level - 1) * 14,
            paddingRight: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: item.level === 1 ? 12 : 11,
            fontWeight: item.level <= 2 ? 600 : 450,
            color: item.level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: 'transparent',
            border: '1px solid transparent',
            cursor: 'pointer',
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            borderRadius: 8,
            transition: 'background 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--control-bg)'
            e.currentTarget.style.borderColor = 'var(--control-border)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
          title={item.text}
        >
          <span style={{ width: item.level <= 2 ? 5 : 3, height: item.level <= 2 ? 5 : 3, borderRadius: 999, background: item.level === 1 ? 'var(--accent)' : 'var(--border-default)', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</span>
        </Button>
      ))}
    </div>
  )
}
