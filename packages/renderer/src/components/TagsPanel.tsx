import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { parseNoteProperties, updateFrontmatterProperty } from '../utils/frontmatter'
import { cn } from '../lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import './tags-panel.css'

interface TagInfo {
  name: string
  count: number
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#/, '')
}

function normalizeTags(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeTag).filter(Boolean)))
}

export function TagsPanel() {
  const [allTags, setAllTags] = useState<TagInfo[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [notes, setNotes] = useState<{ title: string; filePath: string }[]>([])
  const [inputVisible, setInputVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const content = useEditorStore((s) => s.content)
  const setContent = useEditorStore((s) => s.setContent)
  const setDirty = useEditorStore((s) => s.setDirty)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const isDirty = useEditorStore((s) => s.isDirty)
  const [refreshKey, setRefreshKey] = useState(0)

  const currentTags = parseNoteProperties(content).tags

  useEffect(() => {
    if (isDirty === false) {
      setRefreshKey((k) => k + 1)
    }
  }, [isDirty])

  useEffect(() => {
    if (!vaultPath) return
    const timer = setTimeout(() => {
      window.api.invoke('db:get-tags', { vaultPath }).then(setAllTags)
    }, 300)
    return () => clearTimeout(timer)
  }, [vaultPath, refreshKey])

  useEffect(() => {
    if (!selectedTag || !vaultPath) { setNotes([]); return }
    window.api.invoke('db:get-notes-by-tag', { vaultPath, tag: selectedTag }).then(
      (results) => setNotes(results.map((r) => ({ title: r.title, filePath: r.filePath })))
    )
  }, [selectedTag, vaultPath])

  useEffect(() => {
    if (inputVisible && inputRef.current) inputRef.current.focus()
  }, [inputVisible])

  const updateTags = (newTags: string[]) => {
    const newContent = updateFrontmatterProperty(content, 'tags', normalizeTags(newTags))
    setContent(newContent)
    setDirty(true)
    window.dispatchEvent(new CustomEvent('editor-reload-content', { detail: { content: newContent } }))
  }

  const addTag = () => {
    const tag = normalizeTag(inputValue)
    if (tag && !currentTags.includes(tag)) {
      updateTags([...currentTags, tag])
    }
    setInputValue('')
    setInputVisible(false)
  }

  const removeTag = (tag: string) => {
    updateTags(currentTags.filter((t) => t !== tag))
  }

  const addExistingTag = (tagName: string) => {
    if (!currentTags.includes(tagName)) {
      updateTags([...currentTags, tagName])
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag() }
    else if (e.key === 'Escape') { setInputValue(''); setInputVisible(false) }
  }

  return (
    <div className="tags-panel">
      {currentFilePath && (
        <div className="tags-panel__current glass-divider-bottom">
          <PanelHeading>当前文件标签</PanelHeading>
          <div className="tags-panel__cloud">
            {currentTags.map((tag) => (
              <Badge key={tag} variant="default" className="tags-panel__current-tag">
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="tags-panel__remove-tag"
                  onClick={() => removeTag(tag)}
                  aria-label={`移除标签 ${tag}`}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </Button>
              </Badge>
            ))}
            {inputVisible ? (
              <Input
                className="tags-panel__input"
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addTag}
                placeholder="标签名..."
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="tags-panel__add-tag"
                onClick={() => setInputVisible(true)}
                title="添加标签"
                aria-label="添加标签"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="tags-panel__all">
        <PanelHeading className="tags-panel__all-heading">所有标签</PanelHeading>
        {allTags.length === 0 ? (
          <div className="tags-panel__empty">暂无标签</div>
        ) : (
          <>
            <ScrollArea className={cn('tags-panel__tag-scroll', selectedTag && 'is-filtered')}>
              <div className="tags-panel__cloud">
                {allTags.map((tag) => (
                  <Button
                    key={tag.name}
                    type="button"
                    variant={selectedTag === tag.name ? 'default' : currentTags.includes(tag.name) ? 'secondary' : 'outline'}
                    size="xs"
                    className={cn(
                      'tags-panel__tag-chip',
                      selectedTag === tag.name && 'is-selected',
                      currentTags.includes(tag.name) && 'is-current'
                    )}
                    onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                    onDoubleClick={() => addExistingTag(tag.name)}
                    title="单击筛选笔记，双击添加到当前文件"
                  >
                    <span>{tag.name}</span>
                    <span className="tags-panel__tag-count">{tag.count}</span>
                  </Button>
                ))}
              </div>
            </ScrollArea>
            {selectedTag && notes.length > 0 && (
              <ScrollArea className="tags-panel__notes">
                <p className="tags-panel__notes-title">
                  {selectedTag} ({notes.length})
                </p>
                {notes.map((note) => (
                  <Button
                    key={note.filePath}
                    type="button"
                    variant="ghost"
                    className="tags-panel__note"
                    onClick={() => openFile(`${vaultPath}/${note.filePath}`)}
                  >
                    {note.title}
                  </Button>
                ))}
              </ScrollArea>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PanelHeading({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('tags-panel__heading', className)}>
      <svg className="tags-panel__heading-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
      <span>{children}</span>
    </div>
  )
}
