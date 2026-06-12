import { useState, useRef, useEffect } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { parseNoteProperties, updateFrontmatterProperty } from '../../utils/frontmatter'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

function normalizeTag(value: string): string {
  return value.trim().replace(/^#/, '')
}

function normalizeTags(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeTag).filter(Boolean)))
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
    setTags(parseNoteProperties(content).tags)
  }, [content, currentFilePath])

  useEffect(() => {
    if (inputVisible && inputRef.current) {
      inputRef.current.focus()
    }
  }, [inputVisible])

  const updateTags = (newTags: string[]) => {
    const normalizedTags = normalizeTags(newTags)
    const newContent = updateFrontmatterProperty(content, 'tags', normalizedTags)
    setContent(newContent)
    setDirty(true)
    setTags(normalizedTags)
    window.dispatchEvent(new CustomEvent('editor-reload-content', { detail: { content: newContent } }))
  }

  const addTag = () => {
    const tag = normalizeTag(inputValue)
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
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
          </Button>
        </span>
      ))}
      {inputVisible ? (
        <Input
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
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
        </Button>
      )}
    </div>
  )
}
