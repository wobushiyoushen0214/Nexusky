import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { toast } from '../../stores/toast-store'

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

interface PreviewState {
  actionLabel: string
  originalText: string
  originalRange: { from: number; to: number }
  result: string
  streaming: boolean
}

export function AIWritingMenu({ editor }: AIWritingMenuProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => { if (cleanupRef.current) cleanupRef.current() }
  }, [])

  useEffect(() => {
    if (!visible) return
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return
      const editorEl = (e.target as HTMLElement).closest('.editor-content')
      if (editorEl) return
      setVisible(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [visible])

  useEffect(() => {
    if (!editor) return
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const handleSelectionUpdate = () => {
      if (preview) return
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
  }, [editor, preview])

  const handleAction = useCallback(async (action: typeof ACTIONS[0]) => {
    if (!editor || !selectedText || preview) return
    setVisible(false)

    const { from, to } = editor.state.selection
    setPreview({
      actionLabel: action.label,
      originalText: selectedText,
      originalRange: { from, to },
      result: '',
      streaming: true
    })

    let result = ''
    let done = false

    const cleanup = window.api.onAiStream((event) => {
      if (event.type === 'text') {
        result += event.content
        setPreview((p) => p ? { ...p, result } : null)
      } else if (event.type === 'done') {
        done = true
        setPreview((p) => p ? { ...p, result: result.trim(), streaming: false } : null)
        if (!result) toast('AI 未返回内容，请检查配置', 'error')
        cleanup()
        cleanupRef.current = null
      } else if (event.type === 'error') {
        done = true
        toast(`${action.label}失败: ${event.content}`, 'error')
        setPreview(null)
        cleanup()
        cleanupRef.current = null
      }
    })
    cleanupRef.current = cleanup

    try {
      const messages = [
        { role: 'system', content: '你是一个写作助手。只输出处理后的结果，不要解释。保持原文的语言。' },
        { role: 'user', content: `${action.prompt}\n\n${selectedText}` }
      ]
      await window.api.invoke('ai:chat', { messages } as any)
    } catch (e: any) {
      if (!done) {
        toast(`${action.label}失败: ${e.message || '未知错误'}`, 'error')
        setPreview(null)
        cleanup()
        cleanupRef.current = null
        done = true
      }
    }

    setTimeout(() => {
      if (!done) {
        setPreview((p) => p ? { ...p, streaming: false } : null)
        cleanup()
        cleanupRef.current = null
      }
    }, 500)
  }, [editor, selectedText, preview])

  const handleReplace = () => {
    if (!editor || !preview) return
    const { from, to } = preview.originalRange
    editor.chain().focus().deleteRange({ from, to }).insertContent(preview.result).run()
    toast(`${preview.actionLabel}已应用`, 'success')
    setPreview(null)
  }

  const handleAppend = () => {
    if (!editor || !preview) return
    const { to } = preview.originalRange
    editor.chain().focus().insertContentAt(to, '\n\n' + preview.result).run()
    toast(`${preview.actionLabel}已追加`, 'success')
    setPreview(null)
  }

  const handleCopy = async () => {
    if (!preview) return
    await navigator.clipboard.writeText(preview.result)
    toast('已复制到剪贴板', 'success')
  }

  const handleCancel = () => {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null }
    setPreview(null)
  }

  if (preview) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' } as React.CSSProperties}
        onClick={(e) => { if (e.target === e.currentTarget) handleCancel() }}
      >
        <div style={{ width: 640, maxHeight: '75vh', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>AI {preview.actionLabel}结果</span>
              {preview.streaming && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite', opacity: 0.7 }} />
                  生成中...
                </span>
              )}
            </div>
            <button onClick={handleCancel} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border-subtle)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>原文</span>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{preview.originalText}</div>
            </div>
            <div style={{ padding: '12px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 11, color: 'var(--accent-text)', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{preview.actionLabel}结果</span>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {preview.result || (preview.streaming ? <span style={{ color: 'var(--text-tertiary)' }}>等待 AI 响应...</span> : null)}
              </div>
            </div>
          </div>
          <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <button onClick={handleCancel} style={{ height: 28, padding: '0 12px', fontSize: 12, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 5, cursor: 'pointer' }}>
              取消
            </button>
            <button onClick={handleCopy} disabled={!preview.result} style={{ height: 28, padding: '0 12px', fontSize: 12, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 5, cursor: preview.result ? 'pointer' : 'not-allowed', opacity: preview.result ? 1 : 0.5 }}>
              复制
            </button>
            <button onClick={handleAppend} disabled={!preview.result || preview.streaming} style={{ height: 28, padding: '0 12px', fontSize: 12, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 5, cursor: preview.result && !preview.streaming ? 'pointer' : 'not-allowed', opacity: preview.result && !preview.streaming ? 1 : 0.5 }}>
              追加到下方
            </button>
            <button onClick={handleReplace} disabled={!preview.result || preview.streaming} style={{ height: 28, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5, cursor: preview.result && !preview.streaming ? 'pointer' : 'not-allowed', opacity: preview.result && !preview.streaming ? 1 : 0.5, fontWeight: 500 }}>
              替换原文
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!visible) return null

  return (
    <div
      ref={menuRef}
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
