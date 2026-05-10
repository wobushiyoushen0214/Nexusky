import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/wiki-link'
import { AICompletion } from './extensions/ai-completion'
import { useEditorStore } from '../../stores/editor-store'
import { EditorToolbar } from './EditorToolbar'

export function Editor() {
  const { content, currentFilePath, setContent, isDirty } = useEditorStore()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: { HTMLAttributes: { class: 'code-block' } }
      }),
      WikiLink,
      AICompletion,
      Placeholder.configure({
        placeholder: '开始写作...'
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true
      })
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'editor-content focus:outline-none min-h-full'
      }
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown()
      setContent(markdown)
    }
  })

  useEffect(() => {
    if (editor && content !== undefined) {
      const currentMarkdown = editor.storage.markdown.getMarkdown()
      if (currentMarkdown !== content) {
        editor.commands.setContent(content)
      }
    }
  }, [currentFilePath])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        useEditorStore.getState().saveFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!currentFilePath) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-[13px] text-[var(--text-tertiary)]">选择文件开始编辑</p>
          <p className="text-[11px] text-[var(--text-tertiary)] opacity-60">或按 Ctrl+N 新建笔记</p>
        </div>
      </div>
    )
  }

  const fileName = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '')

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div style={{ height: 36, padding: '0 16px' }} className="flex items-center gap-2 border-b border-[var(--border-subtle)] shrink-0">
        <span className="text-[12px] text-[var(--text-secondary)] font-medium">{fileName}</span>
        {isDirty && (
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" title="未保存" />
        )}
      </div>

      {/* Toolbar */}
      {editor && <EditorToolbar editor={editor} />}

      {/* Editor area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
