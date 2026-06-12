import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { ChatSource } from '@shared/types/ipc'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { MARKDOWN_PURIFY_CONFIG } from '../../utils/sanitize-html'
import { buildChatSourceNavigationTarget, resolveVaultSourcePath } from '../../utils/source-navigation'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet'
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
  const setMainView = useUIStore((s) => s.setMainView)

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
    <Sheet open modal={false} onOpenChange={(open) => { if (!open) setResult(null) }}>
      <SheetContent
        side="right"
        className="tool-result-panel"
        showOverlay={false}
        showCloseButton={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetTitle className="ui-sr-only">{labelText}</SheetTitle>
        <div className="tool-result-panel__header">
          <div className="tool-result-panel__title">{labelText}</div>
          <div className="tool-result-panel__actions">
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="tool-result-panel__btn"
              disabled={copying}
              onClick={async () => {
                setCopying(true)
                try { await navigator.clipboard.writeText(result.content) } finally { setCopying(false) }
              }}
            >
              {t('toolSurface.copy')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="tool-result-panel__btn tool-result-panel__btn--icon"
              onClick={() => setResult(null)}
              aria-label={t('common.close')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Button>
          </div>
        </div>
        <ScrollArea className="tool-result-panel__body">
          <div className="tool-result-panel__body-content">
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
                  <Button
                    key={`${source.filePath}-${idx}`}
                    type="button"
                    variant="ghost"
                    className="tool-result-panel__source"
                    onClick={() => {
                      const fullPath = resolveVaultSourcePath(vaultPath, source.filePath)
                      if (!fullPath) return
                      const target = buildChatSourceNavigationTarget(source)
                      setMainView('editor')
                      const editorStore = useEditorStore.getState()
                      if (target) void editorStore.openFileAt(fullPath, target)
                      else void editorStore.openFile(fullPath)
                    }}
                    title={source.filePath}
                  >
                    <span className="tool-result-panel__source-title">{source.title}</span>
                    <span className="tool-result-panel__source-path">{source.filePath}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
