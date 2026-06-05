import { useEffect, useRef, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { EditorState as ProseMirrorEditorState } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import Mathematics from '@tiptap/extension-mathematics'
import 'katex/dist/katex.min.css'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import { Markdown } from 'tiptap-markdown'
import { WikiLink } from './extensions/wiki-link'
import { AICompletion } from './extensions/ai-completion'
import { ImagePaste } from './extensions/image-paste'
import { SlashCommand } from './extensions/slash-command'
import { SlashCommandMenu } from './SlashCommandMenu'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { toast } from '../../stores/toast-store'
import { useKeyBindingStore } from '../../stores/keybinding-store'
import { EditorToolbar } from './EditorToolbar'
import { AIWritingMenu } from './AIWritingMenu'
import { ContextMenu } from '../ContextMenu'
import { buildEditorToolMenuItems } from '../tool-surface/editor-tool-menu'
import { useSyncStore } from '../../stores/sync-store'
import { getErrorMessage } from '../../utils/errors'
import { FindReplace } from './FindReplace'
import { TagBar } from './TagBar'
import { MermaidRenderer } from './MermaidRenderer'
import { findMarkdownLineForBlockId, findMarkdownLineForHeading, findMarkdownLineForSnippet, normalizeSourceNavigationText } from '../../utils/source-navigation'
import { normalizeObsidianLinkTarget, parseObsidianLinkReference, selectMarkdownReferenceContent, stripMarkdownFrontmatter, type ObsidianLinkReference } from '../../utils/obsidian-link'
import { mergeEditorMarkdownContent } from '../../utils/markdown-roundtrip'
import { matchesShortcut } from '../../utils/shortcuts'
import type { NoteSearchResult } from '@shared/types/ipc'
import type { EditorNavigationTarget } from '../../stores/editor-store'

function stripFrontmatter(content: string): string {
  return stripMarkdownFrontmatter(content)
}

type EditorStateSnapshot = {
  doc?: unknown
  selection?: unknown
  storedMarks?: unknown
  [key: string]: unknown
}

type EmbeddedNote = { title: string; content: string }
type EmbeddedReference = ObsidianLinkReference & { raw: string }

function isEmbeddedNote(note: EmbeddedNote | null): note is EmbeddedNote {
  return note !== null
}

function findExactNoteMatch(results: NoteSearchResult[], title: string): NoteSearchResult | undefined {
  const target = normalizeObsidianLinkTarget(title)
  return results.find((result) => {
    const filePath = normalizeObsidianLinkTarget(result.filePath)
    const fileName = normalizeObsidianLinkTarget(result.filePath.replace(/^.*[\\/]/, ''))
    return result.title === target || result.aliasMatch === target || filePath === target || fileName === target
  })
}

class LRUCache<K, V> {
  private map = new Map<K, V>()
  constructor(private maxSize: number) {}
  get(key: K): V | undefined {
    const val = this.map.get(key)
    if (val !== undefined) {
      this.map.delete(key)
      this.map.set(key, val)
    }
    return val
  }
  set(key: K, value: V): void {
    this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.maxSize) {
      const first = this.map.keys().next().value!
      this.map.delete(first)
    }
  }
}

function isNavigationTargetForFile(target: EditorNavigationTarget | null, filePath: string | null): target is EditorNavigationTarget {
  if (!target || !filePath) return false
  return target.path.replace(/\\/g, '/') === filePath.replace(/\\/g, '/')
}

function getPositionForMarkdownLine(editor: TiptapEditor, line: number): number {
  const targetLine = Math.max(1, Math.floor(line))
  let currentLine = 1
  let targetPos = -1
  let fallbackPos = 1

  editor.state.doc.descendants((node, pos) => {
    if (targetPos >= 0) return false
    if (!node.isTextblock) return true
    const lineCount = Math.max(1, node.textContent.split('\n').length)
    if (currentLine + lineCount - 1 >= targetLine) {
      targetPos = pos + 1
      return false
    }
    currentLine += lineCount
    fallbackPos = pos + node.nodeSize
    return false
  })

  return Math.min(Math.max(targetPos >= 0 ? targetPos : fallbackPos, 1), Math.max(editor.state.doc.content.size, 1))
}

function findTextBlockPositionForSnippet(editor: TiptapEditor, snippet: string): number {
  const normalizedSnippet = normalizeSourceNavigationText(snippet)
  if (normalizedSnippet.length < 8) return -1
  const needles = Array.from(new Set([
    normalizedSnippet,
    normalizedSnippet.slice(0, 180),
    normalizedSnippet.split(' ').slice(0, 28).join(' ')
  ])).filter((item) => item.length >= 8)

  let targetPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (targetPos >= 0) return false
    if (!node.isTextblock) return true
    const text = normalizeSourceNavigationText(node.textContent)
    if (text.length < 8) return true
    if (needles.some((needle) => text.includes(needle) || (needle.includes(text) && text.length >= 16))) {
      targetPos = pos + 1
      return false
    }
    return true
  })
  return targetPos
}

function scrollEditorPositionIntoView(editor: TiptapEditor, container: HTMLElement | null, pos: number): void {
  const safePos = Math.min(Math.max(pos, 1), Math.max(editor.state.doc.content.size, 1))
  editor.commands.focus()
  editor.commands.setTextSelection(safePos)

  window.setTimeout(() => {
    try {
      const domAtPos = editor.view.domAtPos(safePos)
      const el = domAtPos.node instanceof HTMLElement
        ? domAtPos.node
        : domAtPos.node.parentElement
      if (!el) return
      if (!container) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      const elRect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const targetScroll = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height / 2 + elRect.height / 2
      container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
    } catch {}
  }, 50)
}

function navigateToSourceTarget(editor: TiptapEditor, container: HTMLElement | null, target: EditorNavigationTarget, markdownContent: string): boolean {
  let line = target.line || target.endLine
  if (!line && target.blockId) line = findMarkdownLineForBlockId(markdownContent, target.blockId) || undefined
  if (!line && target.heading) line = findMarkdownLineForHeading(markdownContent, target.heading) || undefined

  let targetPos = line ? getPositionForMarkdownLine(editor, line) : -1
  if (targetPos < 0 && target.snippet) {
    targetPos = findTextBlockPositionForSnippet(editor, target.snippet)
  }
  if (targetPos < 0 && target.snippet) {
    const snippetLine = findMarkdownLineForSnippet(markdownContent, target.snippet)
    if (snippetLine) targetPos = getPositionForMarkdownLine(editor, snippetLine)
  }
  if (targetPos < 0 && target.heading) {
    targetPos = findTextBlockPositionForSnippet(editor, target.heading)
  }
  if (targetPos < 0) return false
  scrollEditorPositionIntoView(editor, container, targetPos)
  return true
}

export function Editor() {
  const { t } = useTranslation()
  const content = useEditorStore((s) => s.content)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const setContent = useEditorStore((s) => s.setContent)
  const isDirty = useEditorStore((s) => s.isDirty)
  const pendingNavigationTarget = useEditorStore((s) => s.pendingNavigationTarget)
  const consumeNavigationTarget = useEditorStore((s) => s.consumeNavigationTarget)
  const editorVaultPath = useVaultStore((s) => s.vaultPath)
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabIndex = useEditorStore((s) => s.activeTabIndex)
  const closeTab = useEditorStore((s) => s.closeTab)
  const switchTab = useEditorStore((s) => s.switchTab)
  const reorderTab = useEditorStore((s) => s.reorderTab)
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useEditorStore((s) => s.closeTabsToRight)
  const splitPath = useEditorStore((s) => s.splitPath)
  const splitContent = useEditorStore((s) => s.splitContent)
  const closeSplit = useEditorStore((s) => s.closeSplit)
  const focusMode = useUIStore((s) => s.focusMode)
  const previewMode = useUIStore((s) => s.previewMode)
  const language = useUIStore((s) => s.language)
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const [editorContextMenu, setEditorContextMenu] = useState<{ x: number; y: number } | null>(null)
  const dragTabRef = useRef<number | null>(null)
  const tabButtonRefs = useRef<Array<HTMLDivElement | null>>([])
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)
  const [linkPreview, setLinkPreview] = useState<{ x: number; y: number; content: string } | null>(null)
  const linkPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const markdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serializedBodyRef = useRef('')
  const editorStateCache = useRef(new LRUCache<string, EditorStateSnapshot>(20))
  const linkPreviewCache = useRef<Map<string, string>>(new Map())

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false
      }),
      CodeBlockLowlight.configure({
        lowlight: createLowlight(common),
        HTMLAttributes: { class: 'code-block' }
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      WikiLink,
      AICompletion,
      SlashCommand,
      Mathematics,
      ImagePaste,
      Placeholder.configure({
        placeholder: t('common.editorPlaceholder')
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        transformPastedText: true,
        transformCopiedText: true
      })
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'editor-content focus:outline-none min-h-full',
        spellcheck: 'true',
        autocorrect: 'on',
        autocapitalize: 'sentences',
        lang: language
      }
    },
    onUpdate: ({ editor }) => {
      if (markdownTimer.current) clearTimeout(markdownTimer.current)
      const { isDirty } = useEditorStore.getState()
      if (!isDirty) useEditorStore.getState().setDirty(true)
      const text = editor.state.doc.textContent
      const chars = text.length
      const words = text.trim().split(/\s+/).filter(Boolean).length
      setLiveStats({ chars, words, readTime: Math.max(1, Math.ceil(words / 200)) })
      markdownTimer.current = setTimeout(() => {
        const markdown = editor.storage.markdown.getMarkdown()
        const fullContent = useEditorStore.getState().content
        const previousSerialized = serializedBodyRef.current || stripFrontmatter(fullContent)
        setContent(mergeEditorMarkdownContent(fullContent, previousSerialized, markdown))
        serializedBodyRef.current = markdown
      }, 1000)
    }
  })

  const activeTabPath = tabs[activeTabIndex]?.path

  useEffect(() => {
    const activeTab = tabButtonRefs.current[activeTabIndex]
    if (!activeTab) return
    requestAnimationFrame(() => {
      activeTab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    })
  }, [activeTabIndex, activeTabPath])

  const editorAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return
    editor.view.dom.setAttribute('lang', language)
  }, [editor, language])

  // Scroll to cursor after selection changes
  useEffect(() => {
    if (!editor) return
    let scrollTimer: ReturnType<typeof setTimeout> | null = null
    const scrollToCursor = () => {
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        const { node } = editor.view.domAtPos(editor.state.selection.from)
        const el = node instanceof HTMLElement ? node : node.parentElement
        if (el && editorAreaRef.current) {
          const container = editorAreaRef.current
          const elRect = el.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          if (elRect.bottom > containerRect.bottom || elRect.top < containerRect.top) {
            el.scrollIntoView({ behavior: 'auto', block: 'nearest' })
          }
        }
      }, 80)
    }
    editor.on('selectionUpdate', scrollToCursor)
    return () => {
      editor.off('selectionUpdate', scrollToCursor)
      if (scrollTimer) clearTimeout(scrollTimer)
    }
  }, [editor])

  useEffect(() => {
    if (editor) editor.setEditable(!previewMode)
  }, [editor, previewMode])

  const prevFileRef = useRef<string | null>(null)

  useEffect(() => {
    if (!editor) return

    if (prevFileRef.current && prevFileRef.current !== currentFilePath) {
      editorStateCache.current.set(prevFileRef.current, editor.state.toJSON())
    }
    prevFileRef.current = currentFilePath

    const storeContent = useEditorStore.getState().content
    const effectiveContent = storeContent !== undefined ? storeContent : content
    if (effectiveContent !== undefined) {
      const cached = currentFilePath ? editorStateCache.current.get(currentFilePath) : null
      if (cached) {
        try {
          const state = ProseMirrorEditorState.fromJSON(
            { schema: editor.state.schema, plugins: editor.state.plugins },
            cached
          )
          editor.view.updateState(state)
          serializedBodyRef.current = editor.storage.markdown.getMarkdown()
          return
        } catch {}
      }
      const bodyContent = stripFrontmatter(effectiveContent)
      const currentMarkdown = editor.storage.markdown.getMarkdown()
      if (currentMarkdown !== bodyContent) {
        editor.commands.setContent(bodyContent)
      }
      serializedBodyRef.current = editor.storage.markdown.getMarkdown()
    }
  }, [currentFilePath])

  useEffect(() => {
    const activePath = currentFilePath
    if (!editor || !activePath || !isNavigationTargetForFile(pendingNavigationTarget, activePath)) return
    const target = consumeNavigationTarget(activePath)
    if (!target) return

    const timer = window.setTimeout(() => {
      navigateToSourceTarget(editor, editorAreaRef.current, target, useEditorStore.getState().content)
    }, 90)

    return () => window.clearTimeout(timer)
  }, [editor, currentFilePath, pendingNavigationTarget?.id, consumeNavigationTarget])

  useEffect(() => {
    if (!editor) return
    const handleReload = (e: Event) => {
      const newContent = (e as CustomEvent).detail?.content
      if (newContent !== undefined) {
        editor.commands.setContent(stripFrontmatter(newContent))
        serializedBodyRef.current = editor.storage.markdown.getMarkdown()
      }
    }
    const handleApply = (e: Event) => {
      const newContent = (e as CustomEvent).detail?.content
      if (newContent !== undefined) {
        editor.chain().selectAll().insertContent(newContent).run()
      }
    }
    window.addEventListener('editor-reload-content', handleReload)
    window.addEventListener('editor-apply-content', handleApply)
    return () => {
      window.removeEventListener('editor-reload-content', handleReload)
      window.removeEventListener('editor-apply-content', handleApply)
    }
  }, [editor])

  // External file change detection
  useEffect(() => {
    if (!editor) return
    const cleanup = window.api.onFileChanged(async (changedPath: string) => {
      linkPreviewCache.current.clear()
      const normalizedChanged = changedPath.replace(/\\/g, '/')
      const normalizedCurrent = currentFilePath?.replace(/\\/g, '/')
      if (!normalizedCurrent || normalizedChanged !== normalizedCurrent) return
      const { isDirty } = useEditorStore.getState()
      if (isDirty) {
        toast('文件已被外部修改，当前有未保存更改', 'info')
        return
      }
      try {
        const newContent = await window.api.invoke('file:read', { path: changedPath })
        const bodyContent = stripFrontmatter(newContent)
        const currentMarkdown = editor.storage.markdown.getMarkdown()
        if (bodyContent !== currentMarkdown) {
          editor.commands.setContent(bodyContent)
          serializedBodyRef.current = editor.storage.markdown.getMarkdown()
          useEditorStore.setState((state) => {
            const tabs = [...state.tabs]
            if (state.activeTabIndex >= 0 && state.activeTabIndex < tabs.length) {
              tabs[state.activeTabIndex] = { ...tabs[state.activeTabIndex], content: newContent, isDirty: false }
            }
            return { tabs, content: newContent, isDirty: false }
          })
        }
      } catch {}
    })
    return () => cleanup()
  }, [editor, currentFilePath])

  // Unified auto-save: debounced 3s idle + window blur, with dedup guard
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSaving = useRef(false)
  const scheduleSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = null
    if (isSaving.current) return
    const { isDirty, currentFilePath: fp } = useEditorStore.getState()
    if (!isDirty || !fp) return
    isSaving.current = true
    useEditorStore.getState().saveFile().finally(() => { isSaving.current = false })
  }

  useEffect(() => {
    if (!isDirty || !currentFilePath) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(scheduleSave, 3000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [isDirty, content])

  useEffect(() => {
    const handleBlur = () => scheduleSave()
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [])

  // Word count
  const [liveStats, setLiveStats] = useState({ chars: 0, words: 0, readTime: 0 })

  const stats = useMemo(() => {
    if (liveStats.chars > 0) return liveStats
    if (!content) return { chars: 0, words: 0, readTime: 0 }
    const chars = content.length
    const words = content.trim().split(/\s+/).filter(Boolean).length
    const readTime = Math.max(1, Math.ceil(words / 200))
    return { chars, words, readTime }
  }, [content, liveStats])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const getKey = useKeyBindingStore.getState().getKey
      if (matchesShortcut(e, getKey('save'))) {
        e.preventDefault()
        useEditorStore.getState().saveFile()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        const { activeTabIndex } = useEditorStore.getState()
        if (activeTabIndex >= 0) useEditorStore.getState().closeTab(activeTabIndex)
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const { tabs, activeTabIndex, switchTab: sw } = useEditorStore.getState()
        if (tabs.length > 1) sw((activeTabIndex + 1) % tabs.length)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault()
        if (editor) editor.commands.deleteNode('paragraph')
      }
      if (matchesShortcut(e, getKey('find-replace'))) {
        e.preventDefault()
        setFindReplaceOpen((v) => !v)
      }
    }
    const handleWikilink = async (e: Event) => {
      const title = normalizeObsidianLinkTarget((e as CustomEvent).detail?.title || '')
      if (!title) return
      const vaultPath = (await window.api.invoke('vault:get', undefined))
      if (!vaultPath) return
      const results = await window.api.invoke('db:search-notes', { vaultPath, query: title })
      const exact = findExactNoteMatch(results, title)
      if (exact) {
        useEditorStore.getState().openFile(`${vaultPath}/${exact.filePath}`)
        return
      }
      const byFileName = results.find((r) => r.filePath.replace(/^.*[\\/]/, '').replace(/\.md$/, '') === title)
      if (byFileName) {
        useEditorStore.getState().openFile(`${vaultPath}/${byFileName.filePath}`)
      } else {
        const path = `${vaultPath}/${title}.md`
        await window.api.invoke('file:create', { path, content: `# ${title}\n\n`, vaultPath })
        useEditorStore.getState().openFile(path)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('navigate-wikilink', handleWikilink)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('navigate-wikilink', handleWikilink)
    }
  }, [])

  useEffect(() => {
    const handleGotoHeading = (e: Event) => {
      const index = (e as CustomEvent).detail?.index
      if (!editor || index == null) return
      const doc = editor.state.doc
      let headingCount = 0
      let targetPos = -1

      doc.descendants((node, pos) => {
        if (targetPos >= 0) return false
        if (node.type.name === 'heading') {
          if (headingCount === index) {
            targetPos = pos
            return false
          }
          headingCount++
        }
      })

      if (targetPos < 0) return

      editor.commands.focus()
      editor.commands.setTextSelection(targetPos + 1)
      setTimeout(() => {
        try {
          const domAtPos = editor.view.domAtPos(targetPos + 1)
          const el = domAtPos.node instanceof HTMLElement
            ? domAtPos.node
            : domAtPos.node.parentElement
          if (!el || !editorAreaRef.current) return
          const container = editorAreaRef.current
          const elRect = el.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          const targetScroll = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height / 2 + elRect.height / 2
          const startScroll = container.scrollTop
          const distance = targetScroll - startScroll
          if (Math.abs(distance) < 1) return
          const duration = Math.min(500, Math.max(200, Math.abs(distance) * 0.5))
          const startTime = performance.now()
          const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
          const animate = (now: number) => {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            container.scrollTop = startScroll + distance * easeInOutCubic(progress)
            if (progress < 1) requestAnimationFrame(animate)
          }
          requestAnimationFrame(animate)
        } catch {}
      }, 50)
    }
    window.addEventListener('editor-goto-heading', handleGotoHeading)
    return () => window.removeEventListener('editor-goto-heading', handleGotoHeading)
  }, [editor])

  useEffect(() => {
    const handleGotoLine = (e: Event) => {
      const line = (e as CustomEvent).detail?.line
      if (!editor || line == null) return
      const doc = editor.state.doc
      let targetPos = -1
      let headingCount = 0
      let sourceLineCount = 0

      doc.forEach((node, offset) => {
        if (targetPos >= 0) return
        if (node.type.name === 'heading') {
          if (sourceLineCount === line) {
            targetPos = offset + 1
          }
        }
        const lines = node.textContent.split('\n').length
        sourceLineCount += lines
      })

      if (targetPos < 0) {
        let pos = 0
        doc.forEach((node, offset) => {
          if (targetPos >= 0) return
          pos += 1
          if (pos > line) {
            targetPos = offset + 1
          }
        })
      }

      if (targetPos < 0) targetPos = 1

      editor.commands.focus()
      editor.commands.setTextSelection(Math.min(targetPos, doc.content.size))
      setTimeout(() => {
        const resolvedPos = Math.min(targetPos, doc.content.size)
        try {
          const domAtPos = editor.view.domAtPos(resolvedPos)
          const el = domAtPos.node instanceof HTMLElement
            ? domAtPos.node
            : domAtPos.node.parentElement
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } catch {}
      }, 50)
    }
    window.addEventListener('editor-goto-line', handleGotoLine)
    return () => window.removeEventListener('editor-goto-line', handleGotoLine)
  }, [editor])

  // Code block folding
  useEffect(() => {
    if (!editor || !editorAreaRef.current) return
    const scan = () => {
      const blocks = editorAreaRef.current?.querySelectorAll('.code-block') || []
      blocks.forEach((block) => {
        if (block.querySelector('.code-fold-btn')) return
        const code = block.querySelector('code')
        if (!code) return
        const lines = (code.textContent || '').split('\n').length
        if (lines <= 5) return
        const btn = document.createElement('button')
        btn.className = 'code-fold-btn'
        btn.textContent = '折叠'
        btn.onclick = (e) => {
          e.stopPropagation()
          block.classList.toggle('collapsed')
          btn.textContent = block.classList.contains('collapsed') ? '展开' : '折叠'
        }
        block.prepend(btn)
        block.classList.add('collapsed')
        btn.textContent = '展开'
      })
    }
    let scanTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedScan = () => {
      if (scanTimer) clearTimeout(scanTimer)
      scanTimer = setTimeout(scan, 300)
    }
    scan()
    editor.on('update', debouncedScan)
    return () => {
      editor.off('update', debouncedScan)
      if (scanTimer) clearTimeout(scanTimer)
    }
  }, [editor, currentFilePath])

  // Wikilink hover preview
  useEffect(() => {
    const container = editorAreaRef.current
    if (!container) return
    let cancelled = false
    const handleMouseOver = async (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('.wiki-link-inline') as HTMLElement | null
      if (!el) { if (linkPreviewTimer.current) clearTimeout(linkPreviewTimer.current); setLinkPreview(null); return }
      const title = el.getAttribute('data-title') || el.textContent?.replace(/^\[\[|\]\]$/g, '') || ''
      const reference = parseObsidianLinkReference(title)
      if (!reference.target) return
      const cacheKey = title.trim()
      linkPreviewTimer.current = setTimeout(async () => {
        if (cancelled) return
        const cached = linkPreviewCache.current.get(cacheKey)
        if (cached) {
          const rect = el.getBoundingClientRect()
          setLinkPreview({ x: rect.left, y: rect.bottom + 4, content: cached })
          return
        }
        const vault = useVaultStore.getState().vaultPath
        if (!vault) return
        try {
          const results = await window.api.invoke('db:search-notes', { vaultPath: vault, query: reference.target })
          if (cancelled) return
          const exact = findExactNoteMatch(results, reference.target)
          if (exact) {
            const text = await window.api.invoke('file:read', { path: `${vault}/${exact.filePath}` })
            if (cancelled) return
            const preview = selectMarkdownReferenceContent(text, reference).slice(0, 500)
            linkPreviewCache.current.set(cacheKey, preview)
            const rect = el.getBoundingClientRect()
            setLinkPreview({ x: rect.left, y: rect.bottom + 4, content: preview })
          }
        } catch {}
      }, 400)
    }
    const handleMouseOut = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('.wiki-link-inline')
      if (el) { if (linkPreviewTimer.current) clearTimeout(linkPreviewTimer.current); setLinkPreview(null) }
    }
    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)
    return () => { cancelled = true; if (linkPreviewTimer.current) clearTimeout(linkPreviewTimer.current); setLinkPreview(null); container.removeEventListener('mouseover', handleMouseOver); container.removeEventListener('mouseout', handleMouseOut) }
  }, [currentFilePath])

  if (!currentFilePath) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'linear-gradient(180deg, var(--panel-bg) 0%, color-mix(in srgb, var(--panel-bg) 88%, var(--panel-bg-soft)) 100%)' }}>
        <div style={{ textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)', background: 'var(--panel-bg-soft)', color: 'var(--text-tertiary)', boxShadow: 'var(--shadow-sm)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>选择文件开始编辑</p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Ctrl+O 快速切换</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => useUIStore.getState().setQuickSwitcherOpen(true)}
              style={{ height: 30, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--control-bg)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
            >
              快速切换
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('create-new-note'))}
              style={{ height: 30, padding: '0 11px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--border-subtle))', background: 'var(--accent-muted)', color: 'var(--accent-text)', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
            >
              新建笔记
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      {!focusMode && (
        <div
          className="hide-scrollbar"
          style={{ height: 44, padding: '7px 10px 0', display: 'flex', alignItems: 'flex-start', gap: 3, flexShrink: 0, overflowX: 'auto', overflowY: 'hidden', background: 'linear-gradient(180deg, color-mix(in srgb, var(--panel-bg-soft) 86%, transparent), color-mix(in srgb, var(--panel-bg-soft) 56%, transparent))', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 70%, transparent), inset 0 -1px 0 var(--border-faint)' }}
          onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY }}
        >
          {tabs.map((tab, i) => {
            const tabName = tab.path.split(/[\\/]/).pop()?.replace(/\.md$/, '')
            const isActive = i === activeTabIndex
            return (
              <div
                key={tab.path}
                ref={(node) => { tabButtonRefs.current[i] = node }}
                draggable
                onDragStart={() => { dragTabRef.current = i }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={() => { if (dragTabRef.current !== null && dragTabRef.current !== i) { reorderTab(dragTabRef.current, i) }; dragTabRef.current = null }}
                onDragEnd={() => { dragTabRef.current = null }}
                onClick={() => switchTab(i)}
                onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(i) } }}
                onContextMenu={(e) => { e.preventDefault(); setTabContextMenu({ x: e.clientX, y: e.clientY, index: i }) }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--control-bg)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text-tertiary)'
                  }
                }}
                style={{
                  height: 34,
                  minWidth: 0,
                  maxWidth: 210,
                  padding: '0 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12,
                  cursor: 'pointer',
                  borderRadius: isActive ? '14px 14px 0 0' : 12,
                  background: isActive ? 'color-mix(in srgb, var(--bg-glass-dense, var(--panel-bg)) 88%, var(--control-bg))' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: isActive ? '1px solid var(--glass-border)' : '1px solid transparent',
                  borderBottomColor: isActive ? 'transparent' : 'transparent',
                  boxShadow: isActive ? '0 1px 0 var(--glass-highlight) inset, 0 12px 26px color-mix(in srgb, var(--accent-glow) 64%, transparent)' : 'none',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                  transition: 'background 140ms ease-out, border-color 140ms ease-out, box-shadow 140ms ease-out, color 140ms ease-out',
                }}
              >
                <span style={{ width: 20, height: 20, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isActive ? 'var(--accent-muted)' : 'var(--control-bg)', color: isActive ? 'var(--accent-text)' : 'var(--text-tertiary)', boxShadow: 'inset 0 1px 0 var(--glass-highlight)' }}>
                  {tab.isDirty ? (
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 36 }}>{tabName}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(i) }}
                  style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', opacity: isActive ? 1 : 0, flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
      {tabContextMenu && (
        <ContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          items={[
            { label: tabs[tabContextMenu.index]?.pinned ? '取消固定' : '固定标签', onClick: () => { const t = tabs[tabContextMenu.index]; if (t?.pinned) useEditorStore.getState().unpinTab(tabContextMenu.index); else useEditorStore.getState().pinTab(tabContextMenu.index) } },
            { label: '关闭', onClick: () => closeTab(tabContextMenu.index) },
            { label: '关闭其他', onClick: () => closeOtherTabs(tabContextMenu.index) },
            { label: '关闭右侧', onClick: () => closeTabsToRight(tabContextMenu.index) },
            { label: '关闭已保存', onClick: () => useEditorStore.getState().closeSavedTabs() },
            { label: '复制路径', onClick: () => { navigator.clipboard.writeText(tabs[tabContextMenu.index]?.path || '') } },
            { label: '在右侧打开', onClick: () => { const p = tabs[tabContextMenu.index]?.path; if (p) useEditorStore.getState().openSplit(p) } },
          ]}
          onClose={() => setTabContextMenu(null)}
        />
      )}

      {editorContextMenu && (
        <ContextMenu
          x={editorContextMenu.x}
          y={editorContextMenu.y}
          items={buildEditorToolMenuItems({
            t,
            vaultPath: editorVaultPath,
            currentFilePath
          })}
          onClose={() => setEditorContextMenu(null)}
        />
      )}

      {/* Toolbar */}
      {!focusMode && editor && <EditorToolbar editor={editor} />}

      {/* Editor area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'linear-gradient(180deg, color-mix(in srgb, var(--panel-bg) 86%, transparent) 0%, transparent 28%)' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <FindReplace editor={editor} open={findReplaceOpen} onClose={() => setFindReplaceOpen(false)} />
          {linkPreview && (
            <div style={{
              position: 'fixed',
              left: Math.min(linkPreview.x, window.innerWidth - 380),
              top: linkPreview.y + 200 > window.innerHeight ? linkPreview.y - 210 : linkPreview.y,
              zIndex: 50,
              maxWidth: 360, maxHeight: 200, padding: '10px 14px',
              background: 'var(--bg-glass-dense, var(--bg-glass-solid))', border: '1px solid var(--glass-border)',
              borderRadius: 10, boxShadow: 'var(--shadow-popover)', backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)', WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
              fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
              overflowY: 'auto', whiteSpace: 'pre-wrap', pointerEvents: 'none',
            }}>
              {linkPreview.content}
            </div>
          )}
          <div
            ref={editorAreaRef}
            className="editor-scroll file-tree-scroll"
            style={{ height: '100%', overflowY: 'auto', padding: focusMode ? '48px min(8vw, 80px)' : '30px min(7vw, 72px) 40px' }}
            onContextMenu={(e) => {
              if (e.shiftKey) return
              e.preventDefault()
              setEditorContextMenu({ x: e.clientX, y: e.clientY })
            }}
          >
            <EditorContent editor={editor} />
            <TransclusionBlocks content={content} />
            <MermaidBlocks content={content} />
          </div>
        </div>
        {splitPath && splitContent !== null && (
            <div style={{ width: '50%', boxShadow: 'inset 1px 0 0 color-mix(in srgb, var(--border-subtle) 34%, transparent)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ height: 30, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: 'inset 0 -1px 0 color-mix(in srgb, var(--border-subtle) 32%, transparent)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{splitPath.split(/[\\/]/).pop()?.replace(/\.md$/, '')}</span>
              <button onClick={closeSplit} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="editor-content" style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', fontSize: 15, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
              {splitContent}
            </div>
          </div>
        )}
      </div>

      {/* AI Writing Menu */}
      <AIWritingMenu editor={editor} />

      {/* Slash Command Menu */}
      <SlashCommandMenu editor={editor} />

      {/* Status bar */}
      {!focusMode && (
        <div style={{ height: 30, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontSize: 11, color: 'var(--text-tertiary)', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--border-subtle) 34%, transparent)', background: 'color-mix(in srgb, var(--panel-bg-soft) 78%, transparent)' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <span>{stats.words} 词</span>
            <span>{stats.chars} 字符</span>
            <span>~{stats.readTime} 分钟阅读</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {isDirty ? <span style={{ color: 'var(--accent)' }}>未保存</span> : <span>已保存</span>}
            <span>Markdown</span>
            <SyncIndicator />
          </div>
        </div>
      )}
    </div>
  )
}

function SyncIndicator() {
  const { status, lastSyncTime, lastError, setSyncing, setSuccess, setError } = useSyncStore()
  const vaultPath = useVaultStore((s) => s.vaultPath)

  const handleClick = async () => {
    if (!vaultPath || status === 'syncing') return
    setSyncing()
    try {
      const result = await window.api.invoke('cloud:sync', { vaultPath })
      if (result.errors.length === 0) setSuccess()
      else setError(result.errors[0])
    } catch (e: unknown) {
      setError(getErrorMessage(e, '同步失败'))
    }
  }

  const colors: Record<string, string> = {
    idle: 'var(--text-tertiary)',
    syncing: 'var(--accent)',
    success: 'var(--success)',
    error: 'var(--danger)',
  }

  const titles: Record<string, string> = {
    idle: '点击同步',
    syncing: '同步中...',
    success: lastSyncTime ? `上次同步: ${new Date(lastSyncTime).toLocaleTimeString()}` : '同步成功',
    error: lastError || '同步出错',
  }

  return (
    <button
      onClick={handleClick}
      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: colors[status], padding: 0, fontSize: 11 }}
      title={titles[status]}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: status === 'syncing' ? 'spin 1s linear infinite' : 'none' }}>
        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
      {status === 'syncing' && <span>同步中</span>}
    </button>
  )
}

function MermaidBlocks({ content }: { content: string }) {
  const [blocks, setBlocks] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const regex = /```mermaid\n([\s\S]*?)```/g
      const matches: string[] = []
      let match
      while ((match = regex.exec(content)) !== null) {
        matches.push(match[1])
      }
      setBlocks(matches)
    }, 800)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [content])

  if (blocks.length === 0) return null

  return (
    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {blocks.map((code, i) => (
        <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '4px 12px', fontSize: 10, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>Mermaid</div>
          <MermaidRenderer code={code} />
        </div>
      ))}
    </div>
  )
}

function TransclusionBlocks({ content }: { content: string }) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [embeds, setEmbeds] = useState<EmbeddedNote[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const regex = /!\[\[([^\]]+)\]\]/g
      const references: EmbeddedReference[] = []
      let match
      while ((match = regex.exec(content)) !== null) {
        const reference = parseObsidianLinkReference(match[1])
        if (reference.target) references.push({ ...reference, raw: match[1] })
      }
      if (references.length === 0 || !vaultPath) { setEmbeds([]); return }

      Promise.all(references.map(async (reference) => {
        try {
          const results = await window.api.invoke('db:search-notes', { vaultPath, query: reference.target })
          const exact = findExactNoteMatch(results, reference.target)
          if (exact) {
            const text = await window.api.invoke('file:read', { path: `${vaultPath}/${exact.filePath}` })
            return { title: reference.label || reference.raw, content: selectMarkdownReferenceContent(text, reference) }
          }
        } catch {}
        return null
      })).then((results) => setEmbeds(results.filter(isEmbeddedNote)))
    }, 800)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [content, vaultPath])

  if (embeds.length === 0) return null

  return (
    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {embeds.map((embed, i) => (
        <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--accent-text)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--accent-muted)', fontWeight: 500 }}>
            嵌入: {embed.title}
          </div>
          <div style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
            {embed.content}
          </div>
        </div>
      ))}
    </div>
  )
}
