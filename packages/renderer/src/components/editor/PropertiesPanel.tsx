import { useEffect, useMemo, useState } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { parseNoteProperties, updateNoteProperties, type NoteProperties } from '../../utils/frontmatter'
import { toast } from '../../stores/toast-store'

function listToText(values: string[]): string {
  return values.join('\n')
}

function textToList(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function PropertiesPanel() {
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const content = useEditorStore((s) => s.content)
  const setContent = useEditorStore((s) => s.setContent)
  const [title, setTitle] = useState('')
  const [aliases, setAliases] = useState('')
  const [tags, setTags] = useState('')
  const [cssclasses, setCssclasses] = useState('')
  const [saving, setSaving] = useState(false)

  const parsed = useMemo(() => parseNoteProperties(content), [content])

  useEffect(() => {
    setTitle(parsed.title)
    setAliases(listToText(parsed.aliases))
    setTags(listToText(parsed.tags))
    setCssclasses(listToText(parsed.cssclasses))
  }, [currentFilePath, parsed.title, parsed.aliases.join('\n'), parsed.tags.join('\n'), parsed.cssclasses.join('\n')])

  const nextProperties: NoteProperties = {
    title,
    aliases: textToList(aliases),
    tags: textToList(tags).map((tag) => tag.replace(/^#/, '')),
    cssclasses: textToList(cssclasses)
  }

  const dirty = JSON.stringify(nextProperties) !== JSON.stringify(parsed)

  const handleSave = async () => {
    if (!currentFilePath || !dirty || saving) return
    setSaving(true)
    try {
      const nextContent = updateNoteProperties(content, nextProperties)
      setContent(nextContent)
      await useEditorStore.getState().saveFile()
      toast('属性已保存', 'success')
    } catch {
      toast('属性保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!currentFilePath) {
    return (
      <div style={{ padding: 16, color: 'var(--text-tertiary)', fontSize: 12 }}>
        打开一篇笔记后编辑属性。
      </div>
    )
  }

  const fileName = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || ''

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '12px 14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>当前笔记</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
      </div>

      <PropertyField label="标题" hint="覆盖文件内首个 H1 作为展示标题">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="未设置" style={inputStyle} />
      </PropertyField>

      <PropertyField label="别名" hint="每行一个别名，支持 [[别名]] 解析">
        <textarea value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="别名一&#10;别名二" rows={4} style={textareaStyle} />
      </PropertyField>

      <PropertyField label="标签" hint="每行一个标签，可省略 #">
        <textarea value={tags} onChange={(e) => setTags(e.target.value)} placeholder="项目&#10;进行中" rows={4} style={textareaStyle} />
      </PropertyField>

      <PropertyField label="CSS 类" hint="兼容 Obsidian cssclasses">
        <textarea value={cssclasses} onChange={(e) => setCssclasses(e.target.value)} placeholder="宽页面" rows={3} style={textareaStyle} />
      </PropertyField>

      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 6,
            border: 'none',
            background: dirty ? 'var(--accent)' : 'var(--bg-elevated)',
            color: dirty ? '#fff' : 'var(--text-tertiary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: dirty ? 'pointer' : 'default'
          }}
        >
          {saving ? '保存中...' : '保存属性'}
        </button>
        {dirty && (
          <button
            onClick={() => {
              setTitle(parsed.title)
              setAliases(listToText(parsed.aliases))
              setTags(listToText(parsed.tags))
              setCssclasses(listToText(parsed.cssclasses))
            }}
            style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
          >
            重置
          </button>
        )}
      </div>
    </div>
  )
}

function PropertyField({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'right' }}>{hint}</span>
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none'
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: 'auto',
  minHeight: 72,
  padding: '8px 10px',
  resize: 'vertical',
  lineHeight: 1.45,
  fontFamily: 'inherit'
}
