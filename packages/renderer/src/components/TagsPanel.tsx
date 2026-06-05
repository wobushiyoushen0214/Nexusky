import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { parseNoteProperties, updateFrontmatterProperty } from '../utils/frontmatter'

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag() }
    else if (e.key === 'Escape') { setInputValue(''); setInputVisible(false) }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent' }}>
      {/* Current file tags */}
      {currentFilePath && (
        <div style={{ padding: '12px 12px 10px', boxShadow: 'inset 0 -1px 0 var(--border-faint)', flexShrink: 0, background: 'color-mix(in srgb, var(--panel-bg-soft) 54%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              当前文件标签
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {currentTags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  fontSize: 11,
                  borderRadius: 9999,
                  background: 'var(--accent-muted)',
                  color: 'var(--accent-text)',
                  border: '1px solid color-mix(in srgb, var(--accent) 28%, var(--border-subtle))',
                  fontWeight: 500,
                  boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
                }}
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  style={{
                    width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%', border: 'none', background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    color: 'var(--accent-text)', cursor: 'pointer', padding: 0,
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </span>
            ))}
            {inputVisible ? (
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addTag}
                placeholder="标签名..."
                style={{
                  width: 80, height: 22, padding: '0 6px', fontSize: 11, borderRadius: 9999,
                  border: '1px solid var(--control-border)', background: 'var(--control-bg)',
                  color: 'var(--text-primary)', outline: 'none',
                  boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
                }}
              />
            ) : (
              <button
                onClick={() => setInputVisible(true)}
                style={{
                  width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', border: '1px dashed var(--border-default)',
                  background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer',
                  padding: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
                title="添加标签"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* All tags */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 6px', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            所有标签
          </span>
        </div>
        {allTags.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
            暂无标签
          </div>
        ) : (
          <>
            <div className="file-tree-scroll" style={{ padding: '0 12px 8px', overflowY: 'auto', flex: selectedTag ? 'none' : 1, maxHeight: selectedTag ? '40%' : undefined }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allTags.map((tag) => (
                  <button
                    key={tag.name}
                    onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                    onDoubleClick={() => addExistingTag(tag.name)}
                    title="单击筛选笔记，双击添加到当前文件"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', fontSize: 11, borderRadius: 9999, cursor: 'pointer', fontWeight: 500,
                      background: selectedTag === tag.name ? 'var(--accent)' : currentTags.includes(tag.name) ? 'var(--accent-muted)' : 'var(--control-bg)',
                      color: selectedTag === tag.name ? 'var(--text-on-accent)' : currentTags.includes(tag.name) ? 'var(--accent-text)' : 'var(--text-secondary)',
                      border: selectedTag === tag.name ? '1px solid color-mix(in srgb, var(--accent) 70%, var(--glass-border))' : currentTags.includes(tag.name) ? '1px solid color-mix(in srgb, var(--accent) 28%, var(--border-subtle))' : '1px solid var(--control-border)',
                      boxShadow: 'inset 0 1px 0 var(--glass-highlight)',
                      transition: 'all 100ms',
                    }}
                  >
                    {tag.name} <span style={{ opacity: 0.6 }}>{tag.count}</span>
                  </button>
                ))}
              </div>
            </div>
            {selectedTag && notes.length > 0 && (
              <div className="file-tree-scroll" style={{ flex: 1, overflowY: 'auto', boxShadow: 'inset 0 1px 0 var(--border-faint)', padding: '8px 8px 0' }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {selectedTag} ({notes.length})
                </p>
                {notes.map((note) => (
                  <button
                    key={note.filePath}
                    onClick={() => openFile(`${vaultPath}/${note.filePath}`)}
                    style={{
                      width: '100%', height: 28, padding: '0 8px', display: 'flex', alignItems: 'center',
                      fontSize: 12, color: 'var(--text-secondary)', background: 'transparent',
                      border: 'none', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {note.title}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
