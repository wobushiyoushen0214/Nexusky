import { useState, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { useVaultStore } from '../../stores/vault-store'

interface AIWritingMenuProps {
  editor: Editor | null
}

const ACTIONS = [
  { id: 'summarize', label: '总结', icon: '📝', prompt: '请将以下内容总结为简洁的要点：' },
  { id: 'expand', label: '扩展', icon: '📖', prompt: '请扩展以下内容，添加更多细节和解释：' },
  { id: 'rewrite', label: '改写', icon: '✏️', prompt: '请改写以下内容，使其更加清晰流畅：' },
  { id: 'translate', label: '翻译', icon: '🌐', prompt: '请将以下内容翻译为英文（如果是英文则翻译为中文）：' },
  { id: 'simplify', label: '简化', icon: '💡', prompt: '请简化以下内容，使其更容易理解：' },
]

export function AIWritingMenu({ editor }: AIWritingMenuProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [loading, setLoading] = useState(false)
  const [selectedText, setSelectedText] = useState('')

  useEffect(() => {
    if (!editor) return
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const handleSelectionUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const { from, to } = editor.state.selection
        const text = editor.state.doc.textBetween(from, to)

        if (text.length > 5) {
          const coords = editor.view.coordsAtPos(from)
          setSelectedText(text)
          setPosition({ x: coords.left, y: coords.top - 44 })
          setVisible(true)
        } else {
          setVisible(false)
        }
      }, 200)
    }

    editor.on('selectionUpdate', handleSelectionUpdate)
    return () => { editor.off('selectionUpdate', handleSelectionUpdate); if (debounceTimer) clearTimeout(debounceTimer) }
  }, [editor])

  const handleAction = useCallback(async (action: typeof ACTIONS[0]) => {
    if (!editor || !selectedText || loading) return
    setLoading(true)
    setVisible(false)

    try {
      const messages = [
        { role: 'system', content: '你是一个写作助手。只输出处理后的结果，不要解释。保持原文的语言。' },
        { role: 'user', content: `${action.prompt}\n\n${selectedText}` }
      ]

      await window.api.invoke('ai:chat', { messages } as any)

      let result = ''
      const cleanup = window.api.onAiStream((event) => {
        if (event.type === 'text') {
          result += event.content
        } else if (event.type === 'done') {
          if (result) {
            const { from, to } = editor.state.selection
            editor.chain().focus().deleteRange({ from, to }).insertContent(result).run()
          }
          setLoading(false)
          cleanup()
        } else if (event.type === 'error') {
          setLoading(false)
          cleanup()
        }
      })
    } catch {
      setLoading(false)
    }
  }, [editor, selectedText, loading])

  if (!visible || loading) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: Math.max(8, position.x),
        top: Math.max(8, position.y),
        zIndex: 100,
        display: 'flex',
        gap: 2,
        padding: 4,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      {ACTIONS.map((action) => (
        <button
          key={action.id}
          onClick={() => handleAction(action)}
          style={{
            height: 28,
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          title={action.label}
        >
          <span>{action.icon}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  )
}
