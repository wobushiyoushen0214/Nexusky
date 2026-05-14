import { useState, useEffect } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'

interface TagInfo {
  name: string
  count: number
}

export function TagsPanel() {
  const [tags, setTags] = useState<TagInfo[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [notes, setNotes] = useState<{ title: string; filePath: string }[]>([])
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const isDirty = useEditorStore((s) => s.isDirty)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (isDirty === false) {
      setRefreshKey((k) => k + 1)
    }
  }, [isDirty])

  useEffect(() => {
    if (!vaultPath) return
    const timer = setTimeout(() => {
      window.api.invoke('db:get-tags', { vaultPath }).then(setTags)
    }, 300)
    return () => clearTimeout(timer)
  }, [vaultPath, refreshKey])

  useEffect(() => {
    if (!selectedTag || !vaultPath) { setNotes([]); return }
    window.api.invoke('db:get-notes-by-tag', { vaultPath, tag: selectedTag }).then(
      (results) => setNotes(results.map((r) => ({ title: r.title, filePath: r.filePath })))
    )
  }, [selectedTag, vaultPath])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '12px 0' }}>
      {tags.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
          暂无标签。在笔记中使用 #tag 语法添加标签。
        </div>
      ) : (
        <>
          <div style={{ padding: '0 12px 8px', overflowY: 'auto', flex: selectedTag ? 'none' : 1, maxHeight: selectedTag ? '40%' : undefined }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                  style={{
                    padding: '4px 10px', fontSize: 11, borderRadius: 9999, cursor: 'pointer', fontWeight: 500,
                    background: selectedTag === tag.name ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: selectedTag === tag.name ? '#fff' : 'var(--text-secondary)',
                    border: selectedTag === tag.name ? 'none' : '1px solid var(--border-subtle)',
                    transition: 'all 100ms',
                  }}
                >
                  #{tag.name} <span style={{ opacity: 0.6, marginLeft: 2 }}>{tag.count}</span>
                </button>
              ))}
            </div>
          </div>
          {selectedTag && notes.length > 0 && (
            <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border-subtle)', padding: '8px 8px 0' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', padding: '4px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                #{selectedTag} ({notes.length})
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
  )
}
