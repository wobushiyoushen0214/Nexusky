import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'

interface TagInfo {
  name: string
  count: number
}

function parseFrontmatterTags(content: string): string[] {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return []
  const yaml = match[1]
  const tagsLine = yaml.match(/^tags:\s*\[([^\]]*)\]/m)
  if (tagsLine) {
    return tagsLine[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  const tagsBlock = yaml.match(/^tags:\s*\n((?:\s+-\s+.+\n?)*)/m)
  if (tagsBlock) {
    return tagsBlock[1].match(/^\s+-\s+(.+)/gm)?.map((l) => l.replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, '')) || []
  }
  const tagsSingle = yaml.match(/^tags:\s+(.+)$/m)
  if (tagsSingle) {
    return tagsSingle[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  return []
}

function setFrontmatterTags(content: string, tags: string[]): string {
  const tagsStr = tags.length > 0 ? `tags: [${tags.join(', ')}]` : ''
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/)
  if (fmMatch) {
    let yaml = fmMatch[2]
    yaml = yaml.replace(/^tags:.*(?:\n(?:\s+-\s+.*)*)?$/m, '').replace(/^\n+/gm, (m) => m.length > 1 ? '\n' : m)
    yaml = yaml.replace(/\n{2,}/g, '\n').trim()
    if (tagsStr) {
      yaml = yaml ? `${yaml}\n${tagsStr}` : tagsStr
    }
    if (!yaml) {
      return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    }
    return content.replace(/^---\r?\n[\s\S]*?\r?\n---/, `---\n${yaml}\n---`)
  }
  if (!tagsStr) return content
  return `---\n${tagsStr}\n---\n${content}`
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

  const currentTags = parseFrontmatterTags(content)

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
      (results) => setNotes(results.map((r: any) => ({ title: r.title, filePath: r.filePath })))
    )
  }, [selectedTag, vaultPath])

  useEffect(() => {
    if (inputVisible && inputRef.current) inputRef.current.focus()
  }, [inputVisible])

  const updateTags = (newTags: string[]) => {
    const newContent = setFrontmatterTags(content, newTags)
    setContent(newContent)
    setDirty(true)
    window.dispatchEvent(new CustomEvent('editor-reload-content', { detail: { content: newContent } }))
  }

  const addTag = () => {
    const tag = inputValue.trim()
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Current file tags */}
      {currentFilePath && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>
              当前文件标签
            </span>
            {currentTags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '2px 7px',
                  fontSize: 11,
                  borderRadius: 9999,
                  background: 'var(--accent)',
                  color: '#fff',
                  fontWeight: 500,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  style={{
                    width: 12, height: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.25)',
                    color: '#fff', cursor: 'pointer', fontSize: 10, lineHeight: 1, padding: 0,
                  }}
                >
                  ×
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
                  width: 72, height: 20, padding: '0 6px', fontSize: 11, borderRadius: 9999,
                  border: '1px solid var(--border-default)', background: 'var(--bg-base)',
                  color: 'var(--text-primary)', outline: 'none',
                }}
              />
            ) : (
              <button
                onClick={() => setInputVisible(true)}
                style={{
                  width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
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
        <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', padding: '8px 12px 6px', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
          所有标签
        </p>
        {allTags.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
            暂无标签
          </div>
        ) : (
          <>
            <div style={{ padding: '0 12px 8px', overflowY: 'auto', flex: selectedTag ? 'none' : 1, maxHeight: selectedTag ? '40%' : undefined }}>
              {allTags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                  onDoubleClick={() => addExistingTag(tag.name)}
                  title="单击筛选笔记，双击添加到当前文件"
                  style={{
                    width: '100%', height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, borderRadius: 5, cursor: 'pointer', fontWeight: 400,
                    background: selectedTag === tag.name ? 'var(--accent)' : 'transparent',
                    color: selectedTag === tag.name ? '#fff' : 'var(--text-secondary)',
                    border: 'none',
                    transition: 'all 80ms',
                  }}
                  onMouseEnter={(e) => { if (selectedTag !== tag.name) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { if (selectedTag !== tag.name) e.currentTarget.style.background = 'transparent' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{tag.name}</span>
                  <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0 }}>{tag.count}</span>
                  {currentTags.includes(tag.name) && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                  )}
                </button>
              ))}
            </div>
            {selectedTag && notes.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border-subtle)', padding: '8px 8px 0' }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {selectedTag} ({notes.length})
                </p>
                {notes.map((note) => (
                  <button
                    key={note.filePath}
                    onClick={() => openFile(`${vaultPath}/${note.filePath}`)}
                    style={{
                      width: '100%', height: 26, padding: '0 8px', display: 'flex', alignItems: 'center',
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
