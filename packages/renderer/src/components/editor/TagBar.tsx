import { useState, useRef, useEffect } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { useVaultStore } from '../../stores/vault-store'

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
    // Remove existing tags line(s)
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

export function TagBar() {
  const content = useEditorStore((s) => s.content)
  const setContent = useEditorStore((s) => s.setContent)
  const setDirty = useEditorStore((s) => s.setDirty)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const [tags, setTags] = useState<string[]>([])
  const [inputVisible, setInputVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTags(parseFrontmatterTags(content))
  }, [content, currentFilePath])

  useEffect(() => {
    if (inputVisible && inputRef.current) {
      inputRef.current.focus()
    }
  }, [inputVisible])

  const updateTags = (newTags: string[]) => {
    const newContent = setFrontmatterTags(content, newTags)
    setContent(newContent)
    setDirty(true)
    setTags(newTags)
    window.dispatchEvent(new CustomEvent('editor-reload-content', { detail: { content: newContent } }))
  }

  const addTag = () => {
    const tag = inputValue.trim()
    if (tag && !tags.includes(tag)) {
      updateTags([...tags, tag])
    }
    setInputValue('')
    setInputVisible(false)
  }

  const removeTag = (tag: string) => {
    updateTags(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Escape') {
      setInputValue('')
      setInputVisible(false)
    }
  }

  if (!currentFilePath) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      padding: '4px 52px',
      minHeight: 28,
    }}>
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            fontSize: 11,
            borderRadius: 9999,
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          #{tag}
          <button
            onClick={() => removeTag(tag)}
            style={{
              width: 14,
              height: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 12,
              lineHeight: 1,
              padding: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
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
          placeholder="输入标签..."
          style={{
            width: 80,
            height: 22,
            padding: '0 6px',
            fontSize: 11,
            borderRadius: 9999,
            border: '1px solid var(--border-default)',
            background: 'var(--bg-base)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
      ) : (
        <button
          onClick={() => setInputVisible(true)}
          style={{
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            border: '1px dashed var(--border-default)',
            background: 'transparent',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            fontSize: 13,
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--text-secondary)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-default)'
            e.currentTarget.style.color = 'var(--text-tertiary)'
          }}
          title="添加标签"
        >
          +
        </button>
      )}
    </div>
  )
}
