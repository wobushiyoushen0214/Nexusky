import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatSource, LongContextSuggestion, LongTermTheme } from '@shared/types/ipc'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { toast } from '../../stores/toast-store'
import { buildChatSourceNavigationTarget, resolveVaultSourcePath } from '../../utils/source-navigation'
import { getRelationTypeLabel } from '../long-context/LongContextBadge'
import { getChatSourceProvenance } from './chat-source-provenance'

interface ChatSourceRowProps {
  index: number
  source: ChatSource
}

export function ChatSourceRow({ index, source }: ChatSourceRowProps) {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const setMainView = useUIStore((s) => s.setMainView)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ relations: LongContextSuggestion[]; themes: LongTermTheme[]; found: boolean } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const provenance = getChatSourceProvenance(source)

  const openSourceFile = useCallback(() => {
    const full = resolveVaultSourcePath(vaultPath, source.filePath)
    if (!full) return
    const target = buildChatSourceNavigationTarget(source)
    setMainView('editor')
    const editorStore = useEditorStore.getState()
    if (target) void editorStore.openFileAt(full, target)
    else void editorStore.openFile(full)
  }, [source, setMainView, vaultPath])

  const fetchLookup = useCallback(async () => {
    if (!vaultPath || !source.filePath) return
    setLoading(true)
    try {
      const res = await window.api.invoke('long-context:lookup-citation', {
        vaultPath,
        sourceFilePath: source.filePath,
        sourceTitle: source.title
      })
      setResult(res)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
      setResult({ relations: [], themes: [], found: false })
    } finally {
      setLoading(false)
    }
  }, [vaultPath, source.filePath, source.title])

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      if (next && !result && !loading) void fetchLookup()
      return next
    })
  }, [result, loading, fetchLookup])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{
        padding: '3px 8px',
        borderRadius: 4,
        background: 'var(--accent-muted)',
        fontSize: 10,
        color: 'var(--accent-text)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: source.filePath ? 'pointer' : 'default'
      }}>
        <button
          type="button"
          onClick={openSourceFile}
          disabled={!source.filePath}
          title={t('citationLookup.openSource')}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            textAlign: 'left',
            padding: 0,
            font: 'inherit',
            cursor: source.filePath ? 'pointer' : 'default',
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            [{index + 1}] {source.title}
          </span>
          {(provenance.originLabelKey || provenance.explanation) && (
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-tertiary)', fontSize: 9.5 }}>
              {provenance.originLabelKey ? t(provenance.originLabelKey) : t('citationLookup.origin.source')}
              {source.relationType ? ` · ${getRelationTypeLabel(source.relationType, t)}` : ''}
              {source.memoryTier ? ` · ${t(`citationLookup.memoryTier.${source.memoryTier}`)}` : ''}
              {provenance.explanation ? `: ${provenance.explanation}` : ''}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleToggle() }}
          title={t('citationLookup.why')}
          style={{
            width: 14,
            height: 14,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid currentColor',
            borderRadius: '50%',
            background: 'transparent',
            color: 'inherit',
            fontSize: 9,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1
          }}
        >?</button>
      </div>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          padding: 10,
          borderRadius: 6,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-soft, rgba(255,255,255,0.08))',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          zIndex: 20,
          fontSize: 11,
          color: 'var(--text-secondary)',
          maxHeight: 280,
          overflowY: 'auto'
        }}>
          {provenance.hasContextPack && (
            <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {t('citationLookup.contextPackReason')}
              </div>
              {provenance.explanation && <div>{provenance.explanation}</div>}
              {provenance.evidence.length > 0 && (
                <div style={{ marginTop: 4, color: 'var(--text-tertiary)', fontSize: 10 }}>
                  {provenance.evidence.join(' · ')}
                </div>
              )}
            </div>
          )}
          {loading && <div>{t('citationLookup.loading')}</div>}
          {!loading && result && !result.found && (
            <div style={{ color: 'var(--text-tertiary)' }}>
              {provenance.hasContextPack ? t('citationLookup.noExtraRelations') : t('citationLookup.empty')}
            </div>
          )}
          {!loading && result?.relations.length ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {t('citationLookup.relations')}
              </div>
              {result.relations.slice(0, 8).map((r) => (
                <div key={r.relationId} style={{ marginBottom: 6 }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {getRelationTypeLabel(r.relationType, t)} → {r.targetTitle}
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                    {t('citationLookup.score')}={r.score.toFixed(2)}, {t('citationLookup.confidence')}={Math.round(r.confidence * 100)}%
                  </div>
                  {r.reason && <div style={{ marginTop: 2 }}>{r.reason}</div>}
                  {r.targetPath && (
                    <button
                      type="button"
                      onClick={() => {
                        const full = resolveVaultSourcePath(vaultPath, r.targetPath!)
                        if (!full) return
                        setMainView('editor')
                        void useEditorStore.getState().openFile(full)
                      }}
                      style={{ marginTop: 2, fontSize: 10, color: 'var(--accent-text)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      {t('citationLookup.openTarget')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {!loading && result?.themes.length ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {t('citationLookup.themes')}
              </div>
              {result.themes.slice(0, 5).map((th) => (
                <div key={th.id} style={{ marginBottom: 6 }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{th.title}</div>
                  {th.summary && <div style={{ marginTop: 2 }}>{th.summary}</div>}
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                    strength={th.strength.toFixed(2)}, evidence={th.evidenceCount}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
