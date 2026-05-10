import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { useEditorStore } from '../../stores/editor-store'

export function Editor() {
  const { content, currentFilePath, setContent } = useEditorStore()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: { HTMLAttributes: { class: 'code-block' } }
      }),
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
        class: 'prose prose-invert max-w-none focus:outline-none min-h-full px-12 py-8'
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
      <div className="flex-1 flex items-center justify-center h-full text-[var(--muted-foreground)]">
        <p>选择一个文件开始编辑</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <EditorContent editor={editor} className="h-full" />
    </div>
  )
}
