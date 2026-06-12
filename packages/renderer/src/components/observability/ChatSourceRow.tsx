import { forwardRef, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatSource, LongContextSuggestion, LongTermTheme } from '@shared/types/ipc'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { toast } from '../../stores/toast-store'
import { buildChatSourceNavigationTarget, resolveVaultSourcePath } from '../../utils/source-navigation'
import { getRelationTypeLabel } from '../long-context/LongContextBadge'
import { Button, type ButtonProps } from '../ui/button'
import { Empty, EmptyDescription } from '../ui/empty'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { ScrollArea } from '../ui/scroll-area'
import { Spinner } from '../ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { getChatSourceProvenance } from './chat-source-provenance'
import './chat-source-row.css'

interface ChatSourceRowProps {
  index: number
  source: ChatSource
}

const PopoverTooltipButton = forwardRef<HTMLButtonElement, ButtonProps>(function PopoverTooltipButton(props, ref) {
  return (
    <TooltipTrigger asChild>
      <Button ref={ref} {...props} />
    </TooltipTrigger>
  )
})

export function ChatSourceRow({ index, source }: ChatSourceRowProps) {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const setMainView = useUIStore((s) => s.setMainView)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ relations: LongContextSuggestion[]; themes: LongTermTheme[]; found: boolean } | null>(null)
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

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (next && !result && !loading) void fetchLookup()
  }, [result, loading, fetchLookup])

  const openSourceLabel = t('citationLookup.openSource')
  const whyLabel = t('citationLookup.why')

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className="chat-source-row">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              onClick={openSourceFile}
              disabled={!source.filePath}
              aria-label={openSourceLabel}
              className="chat-source-row__source"
            >
              <span className="chat-source-row__title">
                [{index + 1}] {source.title}
              </span>
              {(provenance.originLabelKey || provenance.explanation) && (
                <span className="chat-source-row__meta">
                  {provenance.originLabelKey ? t(provenance.originLabelKey) : t('citationLookup.origin.source')}
                  {source.relationType ? ` · ${getRelationTypeLabel(source.relationType, t)}` : ''}
                  {source.memoryTier ? ` · ${t(`citationLookup.memoryTier.${source.memoryTier}`)}` : ''}
                  {provenance.explanation ? `: ${provenance.explanation}` : ''}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{openSourceLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <PopoverTrigger asChild>
            <PopoverTooltipButton
              type="button"
              variant="ghost"
              size="icon"
              aria-label={whyLabel}
              className="chat-source-row__why"
            >
              ?
            </PopoverTooltipButton>
          </PopoverTrigger>
          <TooltipContent>{whyLabel}</TooltipContent>
        </Tooltip>
      </div>
      <PopoverContent align="start" side="bottom" className="chat-source-row__popover">
        <ScrollArea className="chat-source-row__popover-scroll">
          {provenance.hasContextPack && (
            <div className="chat-source-row__section glass-divider-bottom">
              <div className="chat-source-row__section-title">
                {t('citationLookup.contextPackReason')}
              </div>
              {provenance.explanation && <div>{provenance.explanation}</div>}
              {provenance.evidence.length > 0 && (
                <div className="chat-source-row__muted">
                  {provenance.evidence.join(' · ')}
                </div>
              )}
            </div>
          )}
          {loading && (
            <div className="chat-source-row__loading">
              <Spinner aria-hidden="true" />
              <span>{t('citationLookup.loading')}</span>
            </div>
          )}
          {!loading && result && !result.found && (
            <Empty className="chat-source-row__empty">
              <EmptyDescription>
                {provenance.hasContextPack ? t('citationLookup.noExtraRelations') : t('citationLookup.empty')}
              </EmptyDescription>
            </Empty>
          )}
          {!loading && result?.relations.length ? (
            <div>
              <div className="chat-source-row__section-title">
                {t('citationLookup.relations')}
              </div>
              {result.relations.slice(0, 8).map((r) => (
                <div key={r.relationId} className="chat-source-row__lookup-item">
                  <div className="chat-source-row__lookup-title">
                    {getRelationTypeLabel(r.relationType, t)} → {r.targetTitle}
                  </div>
                  <div className="chat-source-row__lookup-meta">
                    {t('citationLookup.score')}={r.score.toFixed(2)}, {t('citationLookup.confidence')}={Math.round(r.confidence * 100)}%
                  </div>
                  {r.reason && <div className="chat-source-row__lookup-reason">{r.reason}</div>}
                  {r.targetPath && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="chat-source-row__open-target"
                      onClick={() => {
                        const full = resolveVaultSourcePath(vaultPath, r.targetPath!)
                        if (!full) return
                        setMainView('editor')
                        void useEditorStore.getState().openFile(full)
                      }}
                    >
                      {t('citationLookup.openTarget')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {!loading && result?.themes.length ? (
            <div className="chat-source-row__themes">
              <div className="chat-source-row__section-title">
                {t('citationLookup.themes')}
              </div>
              {result.themes.slice(0, 5).map((th) => (
                <div key={th.id} className="chat-source-row__lookup-item">
                  <div className="chat-source-row__lookup-title">{th.title}</div>
                  {th.summary && <div className="chat-source-row__lookup-reason">{th.summary}</div>}
                  <div className="chat-source-row__lookup-meta">
                    strength={th.strength.toFixed(2)}, evidence={th.evidenceCount}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
