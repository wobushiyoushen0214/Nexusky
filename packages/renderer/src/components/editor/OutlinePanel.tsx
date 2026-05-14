import { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editor-store'

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
      <div style={{ padding: 16, textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>无标题</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 0', overflow: 'auto', height: '100%' }}>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => window.dispatchEvent(new CustomEvent('editor-goto-heading', { detail: { index: item.index } }))}
          style={{
            width: '100%',
            height: 26,
            paddingLeft: 12 + (item.level - 1) * 14,
            paddingRight: 12,
            display: 'flex',
            alignItems: 'center',
            fontSize: item.level === 1 ? 12 : 11,
            fontWeight: item.level <= 2 ? 500 : 400,
            color: item.level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            borderRadius: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title={item.text}
        >
          {item.text}
        </button>
      ))}
    </div>
  )
}
