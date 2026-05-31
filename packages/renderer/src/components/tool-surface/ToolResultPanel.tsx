import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { ChatSource } from '@shared/types/ipc'
import { useEditorStore } from '../../stores/editor-store'
import { useVaultStore } from '../../stores/vault-store'
import { MARKDOWN_PURIFY_CONFIG } from '../../utils/sanitize-html'
import './tool-result-panel.css'

interface ToolSurfaceResultDetail {
  toolName: string
  labelKey: string
  content: string
  sources: ChatSource[]
}

export function ToolResultPanel() {
  const { t } = useTranslation()
  const [result, setResult] = useState<ToolSurfaceResultDetail | null>(null)
  const [copying, setCopying] = useState(false)
  const vaultPath = useVaultStore((s) => s.vaultPath)

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToolSurfaceResultDetail>).detail
      if (!detail) return
      setResult(detail)
    }
    window.addEventListener('tool-surface-result', handler)
    return () => window.removeEventListener('tool-surface-result', handler)
  }, [])

  const rendered = useMemo(() => {
    if (!result) return ''
    const raw = marked.parse(result.content, { async: false }) as string
    return DOMPurify.sanitize(raw, MARKDOWN_PURIFY_CONFIG)
  }, [result])

  if (!result) return null

  const labelText = t(result.labelKey, { defaultValue: result.toolName })

  return (
    <div className="tool-result-panel" role="dialog" aria-label={labelText}>
      <div className="tool-result-panel__header">
        <div className="tool-result-panel__title">{labelText}</div>
        <div className="tool-result-panel__actions">
          <button
            type="button"
            className="tool-result-panel__btn"
            disabled={copying}
            onClick={async () => {
              setCopying(true)
              try { await navigator.clipboard.writeText(result.content) } finally { setCopying(false) }
            }}
          >
            {t('toolSurface.copy')}
          </button>
          <button
            type="button"
            className="tool-result-panel__btn"
            onClick={() => setResult(null)}
            aria-label={t('common.close')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="tool-result-panel__body">
        <div
          className="tool-result-panel__markdown"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
        {result.sources.length > 0 && (
          <div className="tool-result-panel__sources">
            <div className="tool-result-panel__sources-title">
              {t('toolSurface.sources')}
            </div>
            {result.sources.map((source, idx) => (
              <button
                key={`${source.filePath}-${idx}`}
                type="button"
                className="tool-result-panel__source"
                onClick={() => {
                  if (!vaultPath) return
                  void useEditorStore.getState().openFile(`${vaultPath}/${source.filePath}`)
                }}
                title={source.filePath}
              >
                <span className="tool-result-panel__source-title">{source.title}</span>
                <span className="tool-result-panel__source-path">{source.filePath}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
