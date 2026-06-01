import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import { getErrorMessage } from '../utils/errors'
import type { FileEntry, PropertyTableRow, PublishScope } from '@shared/types/ipc'

type PublishScopeType = PublishScope['type']

interface PublishScopeDialogProps {
  open: boolean
  onClose: () => void
}

export function PublishScopeDialog({ open, onClose }: PublishScopeDialogProps) {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const files = useVaultStore((s) => s.files)
  const [scopeType, setScopeType] = useState<PublishScopeType>('all')
  const [folderPath, setFolderPath] = useState('')
  const [tag, setTag] = useState('')
  const [propertyKey, setPropertyKey] = useState('')
  const [propertyValue, setPropertyValue] = useState('')
  const [tags, setTags] = useState<{ name: string; count: number }[]>([])
  const [propertyRows, setPropertyRows] = useState<PropertyTableRow[]>([])
  const [publishing, setPublishing] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlayPointerDownRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setScopeType('all')
    setFolderPath('')
    setTag('')
    setPropertyKey('')
    setPropertyValue('')
    setPublishing(false)
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLButtonElement>('button[data-primary="true"]')?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open || !vaultPath) return
    window.api.invoke('db:get-tags', { vaultPath }).then(setTags).catch(() => setTags([]))
    window.api.invoke('db:get-property-rows', { vaultPath }).then(setPropertyRows).catch(() => setPropertyRows([]))
  }, [open, vaultPath])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const folders = useMemo(() => collectVaultFolders(files, vaultPath), [files, vaultPath])
  const propertyKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const row of propertyRows) {
      for (const key of Object.keys(row.properties)) keys.add(key)
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b))
  }, [propertyRows])
  const propertyValues = useMemo(() => {
    if (!propertyKey.trim()) return []
    const values = new Set<string>()
    for (const row of propertyRows) {
      const matchedKey = Object.keys(row.properties).find((key) => key.toLowerCase() === propertyKey.trim().toLowerCase())
      if (!matchedKey) continue
      for (const value of flattenPropertyValues(row.properties[matchedKey])) values.add(value)
    }
    return Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 60)
  }, [propertyKey, propertyRows])

  const canPublish = !publishing && !!vaultPath && (
    scopeType === 'all'
    || (scopeType === 'folder' && folderPath.trim().length > 0)
    || (scopeType === 'tag' && tag.trim().length > 0)
    || (scopeType === 'property' && propertyKey.trim().length > 0)
  )

  const handlePublish = async () => {
    if (!vaultPath || !canPublish) return
    const scope = buildPublishScope(scopeType, folderPath, tag, propertyKey, propertyValue)
    setPublishing(true)
    try {
      const result = await window.api.invoke('export:publish-vault', { vaultPath, scope })
      if (result.ok) {
        toast(t('commandPalette.toasts.publishDone', { count: result.files }), 'success')
        onClose()
      }
    } catch (error) {
      toast(getErrorMessage(error, t('commandPalette.toasts.publishFailed')), 'error')
    } finally {
      setPublishing(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="animate-overlay-in"
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
      onPointerDown={(event) => {
        overlayPointerDownRef.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (overlayPointerDownRef.current && event.target === event.currentTarget) onClose()
        overlayPointerDownRef.current = false
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-scope-dialog-title"
        className="animate-scale-in"
        style={{ width: 460, maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 id="publish-scope-dialog-title" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{t('commandPalette.publishScope.title')}</h3>
          <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>{t('commandPalette.publishScope.description')}</p>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['all', 'folder', 'tag', 'property'] as PublishScopeType[]).map((type) => {
              const selected = scopeType === type
              return (
                <button
                  key={type}
                  type="button"
                  data-primary={type === 'all' ? 'true' : undefined}
                  onClick={() => setScopeType(type)}
                  style={{
                    minHeight: 46,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: selected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                    background: selected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                    color: selected ? 'var(--accent-text)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{t(`commandPalette.publishScope.types.${type}.label`)}</span>
                  <span style={{ display: 'block', marginTop: 3, fontSize: 11, lineHeight: 1.35, color: selected ? 'var(--accent-text)' : 'var(--text-tertiary)' }}>{t(`commandPalette.publishScope.types.${type}.hint`)}</span>
                </button>
              )
            })}
          </div>

          {scopeType === 'folder' && (
            <Field label={t('commandPalette.publishScope.folderLabel')}>
              <input list="publish-folder-options" value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder={t('commandPalette.publishScope.folderPlaceholder')} style={inputStyle} />
              <datalist id="publish-folder-options">
                {folders.map((folder) => <option key={folder} value={folder} />)}
              </datalist>
            </Field>
          )}

          {scopeType === 'tag' && (
            <Field label={t('commandPalette.publishScope.tagLabel')}>
              <input list="publish-tag-options" value={tag} onChange={(event) => setTag(event.target.value)} placeholder={t('commandPalette.publishScope.tagPlaceholder')} style={inputStyle} />
              <datalist id="publish-tag-options">
                {tags.map((item) => <option key={item.name} value={item.name}>{item.count}</option>)}
              </datalist>
            </Field>
          )}

          {scopeType === 'property' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label={t('commandPalette.publishScope.propertyKeyLabel')}>
                <input list="publish-property-key-options" value={propertyKey} onChange={(event) => setPropertyKey(event.target.value)} placeholder={t('commandPalette.publishScope.propertyKeyPlaceholder')} style={inputStyle} />
                <datalist id="publish-property-key-options">
                  {propertyKeys.map((key) => <option key={key} value={key} />)}
                </datalist>
              </Field>
              <Field label={t('commandPalette.publishScope.propertyValueLabel')}>
                <input list="publish-property-value-options" value={propertyValue} onChange={(event) => setPropertyValue(event.target.value)} placeholder={t('commandPalette.publishScope.propertyValuePlaceholder')} style={inputStyle} />
                <datalist id="publish-property-value-options">
                  {propertyValues.map((value) => <option key={value} value={value} />)}
                </datalist>
              </Field>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={publishing} style={secondaryButtonStyle}>{t('commandPalette.publishScope.cancel')}</button>
          <button type="button" onClick={handlePublish} disabled={!canPublish} style={{ ...primaryButtonStyle, opacity: canPublish ? 1 : 0.55, cursor: canPublish ? 'pointer' : 'not-allowed' }}>
            {publishing ? t('commandPalette.publishScope.publishing') : t('commandPalette.publishScope.publish')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function buildPublishScope(type: PublishScopeType, folderPath: string, tag: string, propertyKey: string, propertyValue: string): PublishScope {
  if (type === 'folder') return { type, folderPath: folderPath.trim() }
  if (type === 'tag') return { type, tag: tag.trim().replace(/^#/, '') }
  if (type === 'property') {
    const value = propertyValue.trim()
    return value ? { type, key: propertyKey.trim(), value } : { type, key: propertyKey.trim() }
  }
  return { type: 'all' }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </label>
  )
}

function collectVaultFolders(entries: FileEntry[], vaultPath: string | null): string[] {
  if (!vaultPath) return []
  const root = vaultPath.replace(/\\/g, '/').replace(/\/+$/g, '')
  const folders: string[] = []
  const walk = (items: FileEntry[]) => {
    for (const item of items) {
      if (!item.isDirectory) continue
      const relPath = item.path.replace(/\\/g, '/').slice(root.length).replace(/^\/+/, '')
      if (relPath && !relPath.startsWith('.')) folders.push(relPath)
      if (item.children) walk(item.children)
    }
  }
  walk(entries)
  return folders.sort((a, b) => a.localeCompare(b))
}

function flattenPropertyValues(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap(flattenPropertyValues)
  return [String(value)]
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none'
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer'
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--accent)',
  color: 'white',
  fontSize: 12,
  fontWeight: 600
}
