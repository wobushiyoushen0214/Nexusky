import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { toast } from '../../stores/toast-store'
import { Button } from '../ui/button'
import { calculateMarkdownTableFormulas } from '@shared/markdown/table-formulas'

interface ToolbarProps {
  editor: Editor
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取录音失败'))
    reader.readAsDataURL(blob)
  })
}

function pickAudioMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

function frontmatterPrefix(content: string): string {
  const match = content.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/)
  return match?.[1] || ''
}

export const EditorToolbar = memo(function EditorToolbar({ editor }: ToolbarProps) {
  const { t } = useTranslation()
  const { previewMode, rightPanel, togglePreviewMode, toggleRightPanel } = useUIStore()
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 30,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    border: 0,
    cursor: 'pointer',
    background: active ? 'color-mix(in srgb, var(--accent-muted) 78%, var(--control-bg))' : 'transparent',
    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
    transition: 'background 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out',
  })

  const stopVoiceInput = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [])

  const startVoiceInput = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('当前环境不支持麦克风录音', 'error')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickAudioMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const chunks = chunksRef.current
        const type = recorder.mimeType || mimeType || 'audio/webm'
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        setRecording(false)

        if (chunks.length === 0) {
          toast('没有录到声音，请重新尝试', 'info')
          return
        }

        setTranscribing(true)
        try {
          const audioData = await blobToDataUrl(new Blob(chunks, { type }))
          const result = await window.api.invoke('ai:transcribe', { audioData, mimeType: type })
          if (!result.success || !result.text) {
            toast(result.error || '语音转写失败', 'error')
            return
          }
          editor.chain().focus().insertContent(result.text).run()
          toast('语音已转写并插入', 'success')
        } catch (error) {
          const message = error instanceof Error ? error.message : '语音转写失败'
          toast(message, 'error')
        } finally {
          setTranscribing(false)
        }
      }
      recorder.start()
      setRecording(true)
      toast('正在录音，再次点击麦克风结束并转写', 'info')
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recorderRef.current = null
      setRecording(false)
      const message = error instanceof Error ? error.message : '无法访问麦克风'
      toast(message, 'error')
    }
  }, [editor])

  const toggleVoiceInput = useCallback(() => {
    if (transcribing) return
    if (recording) stopVoiceInput()
    else startVoiceInput()
  }, [recording, startVoiceInput, stopVoiceInput, transcribing])

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const calculateTableFormulas = useCallback(() => {
    const markdown = editor.storage.markdown.getMarkdown()
    const result = calculateMarkdownTableFormulas(markdown)
    if (!result.changed) {
      toast('未找到可计算的表格公式', 'info')
      return
    }
    const currentContent = useEditorStore.getState().content
    const nextContent = `${frontmatterPrefix(currentContent)}${result.markdown}`
    useEditorStore.getState().setContent(nextContent)
    editor.commands.setContent(result.markdown)
    toast(`已计算 ${result.formulas} 个表格公式`, 'success')
  }, [editor])

  const sepStyle: React.CSSProperties = {
    width: 10,
    height: 1,
    margin: '0 3px',
    flexShrink: 0,
  }

  return (
    <div className="editor-toolbar" style={{ width: '100%', height: 40, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, boxShadow: 'none', background: 'linear-gradient(180deg, var(--editor-tab-toolbar-surface, color-mix(in srgb, var(--panel-bg-soft) 86%, transparent)), color-mix(in srgb, var(--panel-bg-soft) 62%, transparent))' }}>
      {/* Headings */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('heading', { level: 1 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="标题 1"
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>H1</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="标题 2"
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>H2</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="标题 3"
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>H3</span>
      </Button>

      <div style={sepStyle} />

      {/* Bold */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="粗体 (Ctrl+B)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
        </svg>
      </Button>

      {/* Italic */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="斜体 (Ctrl+I)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
        </svg>
      </Button>

      {/* Strikethrough */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('strike'))}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="删除线 (Ctrl+Shift+X)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4H9a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h6" /><path d="M8 20h7a3 3 0 0 0 3-3v0a3 3 0 0 0-3-3H4" /><line x1="4" y1="12" x2="20" y2="12" />
        </svg>
      </Button>

      {/* Code */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('code'))}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="行内代码 (Ctrl+E)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
        </svg>
      </Button>

      <div style={sepStyle} />

      {/* Bullet list */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="无序列表"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      </Button>

      {/* Ordered list */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="有序列表"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
          <text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
          <text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
          <text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
        </svg>
      </Button>

      {/* Blockquote */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('blockquote'))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="引用"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 8c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h2v-2H10v-2h2V8h-2zm6 0c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h2v-2h-2v-2h2V8h-2z" />
        </svg>
      </Button>

      {/* Code block */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('codeBlock'))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="代码块"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><polyline points="9 8 5 12 9 16" /><polyline points="15 8 19 12 15 16" />
        </svg>
      </Button>

      <div style={sepStyle} />

      {/* Task list */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('taskList'))}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        title="任务列表"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="6" height="6" rx="1" /><line x1="13" y1="8" x2="21" y2="8" /><rect x="3" y="13" width="6" height="6" rx="1" /><line x1="13" y1="16" x2="21" y2="16" />
        </svg>
      </Button>

      {/* Table */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(false)}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="插入表格"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      </Button>

      {/* Table formulas */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(false)}
        onClick={calculateTableFormulas}
        title="计算表格公式"
      >
        <span style={{ fontSize: 12, fontStyle: 'italic', fontWeight: 700 }}>fx</span>
      </Button>

      {/* Highlight */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(editor.isActive('highlight'))}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        title="高亮"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </Button>

      <div style={sepStyle} />

      {/* Horizontal rule */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(false)}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="分割线"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      </Button>

      <div style={{ flex: 1 }} />

      {/* Voice input */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={{
          ...btnStyle(recording),
          opacity: transcribing ? 0.55 : 1,
          cursor: transcribing ? 'wait' : 'pointer',
          color: recording ? 'var(--danger)' : btnStyle(false).color,
          background: recording ? 'var(--danger-muted)' : btnStyle(false).background,
        }}
        onClick={toggleVoiceInput}
        disabled={transcribing}
        title={recording ? '停止录音并转写' : transcribing ? '正在转写语音' : '语音输入'}
      >
        {transcribing ? (
          <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        )}
      </Button>

      {/* Preview toggle */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(previewMode)}
        onClick={togglePreviewMode}
        title="预览模式 (Ctrl+Shift+V)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
        </svg>
      </Button>

      {/* Outline */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(rightPanel === 'outline')}
        onClick={() => toggleRightPanel('outline')}
        title={t('panels.outline')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </Button>

      {/* Tags */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(rightPanel === 'tags')}
        onClick={() => toggleRightPanel('tags')}
        title={t('panels.tags')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      </Button>

      {/* History */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(false)}
        onClick={() => useUIStore.getState().toggleRightPanel('history')}
        title="版本历史"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      </Button>

      {/* Export */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        style={btnStyle(false)}
        onClick={async () => {
          const { content, currentFilePath } = useEditorStore.getState()
          if (!content || !currentFilePath) return
          const title = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
          await window.api.invoke('export:pdf', { content, title })
        }}
        title="导出 PDF"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 18 15 15" />
        </svg>
      </Button>
    </div>
  )
})
