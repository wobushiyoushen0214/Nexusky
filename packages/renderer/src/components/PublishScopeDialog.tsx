import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import { getErrorMessage } from '../utils/errors'
import { ConfirmModal } from './ConfirmModal'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty'
import { Input } from './ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import { Spinner } from './ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import type { FileEntry, PropertyTableRow, PublishAccessMode, PublishPreviewResult, PublishScope, PublishTarget } from '@shared/types/ipc'

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
  const [preview, setPreview] = useState<PublishPreviewResult | null>(null)
  const [access, setAccess] = useState<PublishAccessMode>('public')
  const [target, setTarget] = useState<PublishTarget | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)

  useEffect(() => {
    if (!open) return
    setScopeType('all')
    setFolderPath('')
    setTag('')
    setPropertyKey('')
    setPropertyValue('')
    setPreview(null)
    setAccess('public')
    setPreviewing(false)
    setPublishing(false)
    setUnpublishing(false)
    setConfirmUnpublish(false)
  }, [open])

  useEffect(() => {
    if (!open || !vaultPath) return
    window.api.invoke('db:get-tags', { vaultPath }).then(setTags).catch(() => setTags([]))
    window.api.invoke('db:get-property-rows', { vaultPath }).then(setPropertyRows).catch(() => setPropertyRows([]))
    window.api.invoke('export:get-publish-target', { vaultPath }).then((storedTarget) => {
      setTarget(storedTarget)
      if (storedTarget?.access) setAccess(storedTarget.access)
    }).catch(() => setTarget(null))
  }, [open, vaultPath])

  useEffect(() => {
    setPreview(null)
  }, [scopeType, folderPath, tag, propertyKey, propertyValue])

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

  const scopeReady = !!vaultPath && (
    scopeType === 'all'
    || (scopeType === 'folder' && folderPath.trim().length > 0)
    || (scopeType === 'tag' && tag.trim().length > 0)
    || (scopeType === 'property' && propertyKey.trim().length > 0)
  )
  const canPreview = scopeReady && !previewing && !publishing && !unpublishing
  const canPublish = scopeReady && !!preview && preview.notes.length > 0 && !previewing && !publishing && !unpublishing
  const canUnpublish = !!vaultPath && !!target && !previewing && !publishing && !unpublishing
  const hasIssues = (preview?.missingLinks.length || 0) > 0 || (preview?.missingAssets.length || 0) > 0

  const handlePreview = async () => {
    if (!vaultPath || !canPreview) return
    const scope = buildPublishScope(scopeType, folderPath, tag, propertyKey, propertyValue)
    setPreviewing(true)
    try {
      setPreview(await window.api.invoke('export:preview-publish-vault', { vaultPath, scope }))
    } catch (error) {
      toast(getErrorMessage(error, t('commandPalette.toasts.publishPreviewFailed')), 'error')
    } finally {
      setPreviewing(false)
    }
  }

  const handlePublish = async () => {
    if (!vaultPath || !canPublish) return
    const scope = buildPublishScope(scopeType, folderPath, tag, propertyKey, propertyValue)
    setPublishing(true)
    try {
      const result = await window.api.invoke('export:publish-vault', { vaultPath, scope, access })
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

  const handleUnpublish = async () => {
    if (!vaultPath || !target || !canUnpublish) return
    setConfirmUnpublish(false)
    setUnpublishing(true)
    try {
      const result = await window.api.invoke('export:unpublish-vault', { vaultPath })
      if (result.ok) {
        setTarget(null)
        toast(t('commandPalette.toasts.unpublishDone', { count: result.removedFiles }), 'success')
      }
    } catch (error) {
      toast(getErrorMessage(error, t('commandPalette.toasts.unpublishFailed')), 'error')
    } finally {
      setUnpublishing(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="animate-scale-in glass-popover"
          style={{ width: 760, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 40px)', background: 'var(--bg-glass-dense, var(--bg-glass-solid))', border: '1px solid var(--glass-panel-border)', borderRadius: 14, boxShadow: 'var(--shadow-popover), var(--glass-panel-edge-shadow)', overflow: 'hidden', display: 'flex', flexDirection: 'column', backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)', WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)' }}
        >
          <DialogHeader className="glass-divider-bottom" style={{ padding: '16px 18px 14px', borderBottom: '0', background: 'var(--panel-bg-soft)', boxShadow: 'inset 0 1px 0 var(--glass-highlight), var(--glass-divider-shadow-bottom)' }}>
            <DialogTitle style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{t('commandPalette.publishScope.title')}</DialogTitle>
            <DialogDescription style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>{t('commandPalette.publishScope.description')}</DialogDescription>
          </DialogHeader>

          <ScrollArea style={{ flex: 1, minHeight: 0 }}>
            <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'minmax(260px, 0.82fr) minmax(320px, 1fr)', gap: 16 }}>
              <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {target && (
                  <PublishTargetPanel target={target} disabled={!canUnpublish} onUnpublish={() => setConfirmUnpublish(true)} />
                )}

                <ToggleGroup
                  type="single"
                  value={scopeType}
                  onValueChange={(nextValue) => {
                    if (nextValue) setScopeType(nextValue as PublishScopeType)
                  }}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
                >
                  {(['all', 'folder', 'tag', 'property'] as PublishScopeType[]).map((type) => {
                    const selected = scopeType === type
                    return (
                      <ToggleGroupItem
                        key={type}
                        value={type}
                        aria-label={t(`commandPalette.publishScope.types.${type}.label`)}
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
                      </ToggleGroupItem>
                    )
                  })}
                </ToggleGroup>

            {scopeType === 'folder' && (
              <Field label={t('commandPalette.publishScope.folderLabel')}>
                <Input list="publish-folder-options" value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder={t('commandPalette.publishScope.folderPlaceholder')} style={inputStyle} />
                <datalist id="publish-folder-options">
                  {folders.map((folder) => <option key={folder} value={folder} />)}
                </datalist>
              </Field>
            )}

            {scopeType === 'tag' && (
              <Field label={t('commandPalette.publishScope.tagLabel')}>
                <Input list="publish-tag-options" value={tag} onChange={(event) => setTag(event.target.value)} placeholder={t('commandPalette.publishScope.tagPlaceholder')} style={inputStyle} />
                <datalist id="publish-tag-options">
                  {tags.map((item) => <option key={item.name} value={item.name}>{item.count}</option>)}
                </datalist>
              </Field>
            )}

            {scopeType === 'property' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label={t('commandPalette.publishScope.propertyKeyLabel')}>
                  <Input list="publish-property-key-options" value={propertyKey} onChange={(event) => setPropertyKey(event.target.value)} placeholder={t('commandPalette.publishScope.propertyKeyPlaceholder')} style={inputStyle} />
                  <datalist id="publish-property-key-options">
                    {propertyKeys.map((key) => <option key={key} value={key} />)}
                  </datalist>
                </Field>
                <Field label={t('commandPalette.publishScope.propertyValueLabel')}>
                  <Input list="publish-property-value-options" value={propertyValue} onChange={(event) => setPropertyValue(event.target.value)} placeholder={t('commandPalette.publishScope.propertyValuePlaceholder')} style={inputStyle} />
                  <datalist id="publish-property-value-options">
                    {propertyValues.map((value) => <option key={value} value={value} />)}
                  </datalist>
                </Field>
              </div>
            )}

            <AccessModeControl value={access} onChange={setAccess} />

                <Button type="button" size="sm" onClick={handlePreview} disabled={!canPreview} style={{ width: 'fit-content' }}>
                  {previewing ? t('commandPalette.publishScope.previewing') : t('commandPalette.publishScope.preview')}
                </Button>
              </section>

              <PublishPreviewPanel preview={preview} loading={previewing} hasIssues={hasIssues} />
            </div>
          </ScrollArea>

          <div className="glass-divider-top" style={{ padding: '12px 18px 16px', borderTop: '0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, boxShadow: 'var(--glass-divider-shadow-top)' }}>
            <span style={{ fontSize: 11, color: hasIssues ? 'var(--warning, #d97706)' : 'var(--text-tertiary)' }}>
              {preview ? (hasIssues ? t('commandPalette.publishScope.issueHint') : t('commandPalette.publishScope.readyHint')) : t('commandPalette.publishScope.previewRequired')}
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={publishing || previewing || unpublishing}>{t('commandPalette.publishScope.cancel')}</Button>
              <Button type="button" size="sm" onClick={handlePublish} disabled={!canPublish}>
                {publishing ? t('commandPalette.publishScope.publishing') : t('commandPalette.publishScope.publish')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmModal
        open={confirmUnpublish}
        title={t('commandPalette.publishScope.unpublishConfirmTitle')}
        message={t('commandPalette.publishScope.unpublishConfirmMessage', { path: target?.outputPath || '' })}
        confirmText={t('commandPalette.publishScope.unpublishConfirm')}
        cancelText={t('commandPalette.publishScope.cancel')}
        danger
        onConfirm={handleUnpublish}
        onCancel={() => setConfirmUnpublish(false)}
      />
    </>
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

export function summarizePublishPreview(preview: PublishPreviewResult | null): { notes: number; assets: number; links: number; issues: number } {
  return {
    notes: preview?.notes.length ?? 0,
    assets: preview?.assets.length ?? 0,
    links: preview?.linkCount ?? 0,
    issues: (preview?.missingLinks.length ?? 0) + (preview?.missingAssets.length ?? 0)
  }
}

function PublishPreviewPanel({ preview, loading, hasIssues }: { preview: PublishPreviewResult | null; loading: boolean; hasIssues: boolean }) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <div style={previewPanelStyle}>
        <Empty style={emptyPreviewStyle}>
          <Spinner aria-hidden="true" />
          <EmptyHeader>
            <EmptyTitle>{t('commandPalette.publishScope.previewLoading')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }
  if (!preview) {
    return (
      <div style={previewPanelStyle}>
        <Empty style={emptyPreviewStyle}>
          <EmptyHeader>
            <EmptyTitle>{t('commandPalette.publishScope.previewEmpty')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const summary = summarizePublishPreview(preview)
  const issueItems = [
    ...preview.missingLinks.slice(0, 8).map((item) => ({
      key: `link:${item.sourcePath}:${item.line}:${item.target}`,
      title: item.target,
      meta: `${item.sourceTitle} · ${item.sourcePath}:${item.line}`,
      context: item.context
    })),
    ...preview.missingAssets.slice(0, 8).map((item) => ({
      key: `asset:${item.sourcePath}:${item.line}:${item.target}`,
      title: item.target,
      meta: `${item.sourceTitle} · ${item.sourcePath}:${item.line}`,
      context: item.context
    }))
  ].slice(0, 8)

  return (
    <section style={previewPanelStyle} aria-label={t('commandPalette.publishScope.previewAriaLabel')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{preview.scopeLabel}</div>
            <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-tertiary)' }}>{t('commandPalette.publishScope.previewSummary', summary)}</div>
          </div>
          <Badge
            variant="outline"
            style={{
              flex: '0 0 auto',
              color: hasIssues ? 'var(--warning, #d97706)' : 'var(--success, #16a34a)'
            }}
          >
            {hasIssues ? t('commandPalette.publishScope.hasIssues') : t('commandPalette.publishScope.noIssues')}
          </Badge>
        </div>

        <div style={metricGridStyle}>
          <PreviewMetric label={t('commandPalette.publishScope.metrics.notes')} value={summary.notes} />
          <PreviewMetric label={t('commandPalette.publishScope.metrics.assets')} value={summary.assets} />
          <PreviewMetric label={t('commandPalette.publishScope.metrics.links')} value={summary.links} />
          <PreviewMetric label={t('commandPalette.publishScope.metrics.issues')} value={summary.issues} tone={summary.issues > 0 ? 'warn' : 'ok'} />
        </div>
      </div>

      <div style={previewListsGridStyle}>
        <PreviewList title={t('commandPalette.publishScope.navigation')} empty={t('commandPalette.publishScope.noNotes')} count={preview.notes.length}>
          {preview.notes.slice(0, 12).map((note) => (
            <div key={note.relPath} style={rowStyle}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{note.title}</span>
              <span style={{ color: note.missingLinkCount > 0 ? 'var(--warning, #d97706)' : 'var(--text-tertiary)', flex: '0 0 auto' }}>{note.linkCount}</span>
            </div>
          ))}
        </PreviewList>
        <PreviewList title={t('commandPalette.publishScope.issues')} empty={t('commandPalette.publishScope.noIssueRows')} count={issueItems.length}>
          {issueItems.map((item) => (
            <div key={item.key} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 3 }}>
              <span style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{item.title}</span>
              <span style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-tertiary)' }}>{item.meta}</span>
            </div>
          ))}
        </PreviewList>
      </div>
    </section>
  )
}

function PublishTargetPanel({ target, disabled, onUnpublish }: { target: PublishTarget; disabled: boolean; onUnpublish: () => void }) {
  const { t } = useTranslation()
  return (
    <section style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{t('commandPalette.publishScope.currentTarget')}</div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{target.outputPath}</div>
            </TooltipTrigger>
            <TooltipContent>{target.outputPath}</TooltipContent>
          </Tooltip>
        </div>
        <Button type="button" variant="destructive" size="xs" onClick={onUnpublish} disabled={disabled}>
          {t('commandPalette.publishScope.unpublish')}
        </Button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span style={pillStyle}>{t(`commandPalette.publishScope.access.${target.access}.label`)}</span>
        <span style={pillStyle}>{t('commandPalette.publishScope.targetSummary', { count: target.files, scope: target.scopeLabel })}</span>
      </div>
    </section>
  )
}

function AccessModeControl({ value, onChange }: { value: PublishAccessMode; onChange: (value: PublishAccessMode) => void }) {
  const { t } = useTranslation()
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{t('commandPalette.publishScope.accessLabel')}</div>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) onChange(nextValue as PublishAccessMode)
        }}
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
      >
        {(['public', 'private'] as PublishAccessMode[]).map((mode) => {
          const selected = value === mode
          return (
            <ToggleGroupItem
              key={mode}
              value={mode}
              aria-label={t(`commandPalette.publishScope.access.${mode}.label`)}
              style={{
                minHeight: 54,
                padding: '8px 10px',
                borderRadius: 8,
                border: selected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                background: selected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                color: selected ? 'var(--accent-text)' : 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{t(`commandPalette.publishScope.access.${mode}.label`)}</span>
              <span style={{ display: 'block', marginTop: 3, fontSize: 11, lineHeight: 1.35, color: selected ? 'var(--accent-text)' : 'var(--text-tertiary)' }}>{t(`commandPalette.publishScope.access.${mode}.hint`)}</span>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      <div style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--text-tertiary)' }}>{t('commandPalette.publishScope.accessBoundary')}</div>
    </section>
  )
}

function PreviewMetric({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  return (
    <div style={{ padding: 9, borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone === 'warn' ? 'var(--warning, #d97706)' : tone === 'ok' ? 'var(--success, #16a34a)' : 'var(--text-primary)' }}>{value}</div>
      <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-tertiary)' }}>{label}</div>
    </div>
  )
}

function PreviewList({ title, empty, count, children }: { title: string; empty: string; count: number; children: ReactNode }) {
  const listHeight = count > 0 ? Math.min(180, Math.max(44, Math.min(count, 12) * 32 + 12)) : undefined

  return (
    <div style={{ minHeight: 0, border: '1px solid var(--glass-divider-line)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-surface)', boxShadow: 'var(--glass-panel-edge-shadow)' }}>
      <div className="glass-divider-bottom" style={{ padding: '8px 10px', borderBottom: '0', boxShadow: 'var(--glass-divider-shadow-bottom)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
      {count > 0 ? (
        <ScrollArea style={{ height: listHeight }}>
          <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {children}
          </div>
        </ScrollArea>
      ) : (
        <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Empty style={compactListEmptyStyle}>
            <EmptyDescription>{empty}</EmptyDescription>
          </Empty>
        </div>
      )}
    </div>
  )
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
  height: 32,
  borderRadius: 6,
  fontSize: 12
}

const previewPanelStyle: React.CSSProperties = {
  minHeight: 340,
  minWidth: 0,
  padding: 12,
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  background: 'var(--bg-primary)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12
}

const emptyPreviewStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  color: 'var(--text-tertiary)',
  fontSize: 12,
  lineHeight: 1.6
}

const compactListEmptyStyle: React.CSSProperties = {
  minHeight: 'auto',
  padding: 8,
  flex: '0 0 auto',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 0,
  border: '0',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  textAlign: 'left'
}

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 8
}

const previewListsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 10,
  minHeight: 0
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  padding: '6px 7px',
  borderRadius: 6,
  fontSize: 11,
  background: 'var(--bg-elevated)'
}

const pillStyle: React.CSSProperties = {
  padding: '3px 7px',
  borderRadius: 999,
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-tertiary)',
  fontSize: 10.5,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}
