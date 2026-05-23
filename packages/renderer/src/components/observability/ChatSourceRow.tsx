import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatSource, LongContextSuggestion, LongTermTheme } from '@shared/types/ipc'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'

interface ChatSourceRowProps {
  index: number
  source: ChatSource
}

export function ChatSourceRow({ index, source }: ChatSourceRowProps) {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ relations: LongContextSuggestion[]; themes: LongTermTheme[]; found: boolean } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const openSourceFile = useCallback(() => {
    if (!source.filePath || !vaultPath) return
    const full = source.filePath.startsWith(vaultPath) ? source.filePath : `${vaultPath}/${source.filePath}`
    void useEditorStore.getState().openFile(full)
  }, [source.filePath, vaultPath])

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
        <span onClick={openSourceFile} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          [{index + 1}] {source.title}
        </span>
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
          {loading && <div>{t('citationLookup.loading')}</div>}
          {!loading && result && !result.found && (
            <div style={{ color: 'var(--text-tertiary)' }}>{t('citationLookup.empty')}</div>
          )}
          {!loading && result?.relations.length ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {t('citationLookup.relations')}
              </div>
              {result.relations.slice(0, 8).map((r) => (
                <div key={r.relationId} style={{ marginBottom: 6 }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {r.relationType} → {r.targetTitle}
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                    score={r.score.toFixed(2)}, confidence={Math.round(r.confidence * 100)}%
                  </div>
                  {r.reason && <div style={{ marginTop: 2 }}>{r.reason}</div>}
                  {r.targetPath && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!vaultPath) return
                        const full = r.targetPath!.startsWith(vaultPath) ? r.targetPath! : `${vaultPath}/${r.targetPath}`
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
