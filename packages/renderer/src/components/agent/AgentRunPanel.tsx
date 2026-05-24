import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AgentPlanStep,
  AgentReflectResult,
  AgentRunSummary,
  AgentStepStatus,
  AgentStepSummary,
  AgentStepUpdateEvent
} from '@shared/types/ipc'
import { useVaultStore } from '../../stores/vault-store'
import { useUIStore } from '../../stores/ui-store'
import { toast } from '../../stores/toast-store'
import './agent.css'

interface RunDetail {
  run: AgentRunSummary
  steps: AgentStepSummary[]
}

type Stage = 'idle' | 'goal' | 'plan' | 'execute'

export function AgentRunPanel() {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const consumePendingAgentGoal = useUIStore((s) => s.consumePendingAgentGoal)
  const sendToKanban = useUIStore((s) => s.sendToKanban)
  const [stage, setStage] = useState<Stage>('idle')
  const [goal, setGoal] = useState('')
  const [description, setDescription] = useState('')
  const [dryRun, setDryRun] = useState(true)
  const [planning, setPlanning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<AgentRunSummary[]>([])
  const [reflectResult, setReflectResult] = useState<AgentReflectResult | null>(null)

  const refreshDetail = useCallback(async (id: string) => {
    if (!vaultPath) return
    const result = await window.api.invoke('agent:get-run', { vaultPath, runId: id })
    if (result) setDetail(result)
  }, [vaultPath])

  const refreshHistory = useCallback(async () => {
    if (!vaultPath) return
    const list = await window.api.invoke('agent:list-runs', { vaultPath, limit: 30 })
    setHistory(list)
  }, [vaultPath])

  useEffect(() => {
    if (!vaultPath) return
    void refreshHistory()
  }, [vaultPath, refreshHistory])

  useEffect(() => {
    if (stage !== 'idle') return
    const pending = consumePendingAgentGoal()
    if (!pending) return
    setGoal(pending.goal)
    setDescription(pending.description || '')
    setStage('goal')
  }, [stage, consumePendingAgentGoal])

  useEffect(() => {
    if (!runId) return
    const cleanup = window.api.onAgentStepUpdate((event: AgentStepUpdateEvent) => {
      if (event.runId !== runId) return
      void refreshDetail(runId)
    })
    return cleanup
  }, [runId, refreshDetail])

  const startPlan = useCallback(async () => {
    if (!vaultPath) return
    if (!goal.trim()) {
      toast(t('agent.errors.goalRequired'), 'error')
      return
    }
    setPlanning(true)
    try {
      const result = await window.api.invoke('agent:plan', {
        vaultPath,
        goal: goal.trim(),
        description: description.trim() || undefined,
        dryRun
      })
      setRunId(result.runId)
      await refreshDetail(result.runId)
      setStage('plan')
      void refreshHistory()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setPlanning(false)
    }
  }, [vaultPath, goal, description, dryRun, refreshDetail, refreshHistory, t])

  const updatePlanStep = useCallback((idx: number, patch: Partial<AgentPlanStep>) => {
    setDetail((prev) => {
      if (!prev) return prev
      const nextPlan = prev.run.plan.map((step) => step.index === idx ? { ...step, ...patch } : step)
      return { ...prev, run: { ...prev.run, plan: nextPlan } }
    })
  }, [])

  const deletePlanStep = useCallback((idx: number) => {
    setDetail((prev) => {
      if (!prev) return prev
      const filtered = prev.run.plan.filter((step) => step.index !== idx)
      const renumbered = filtered.map((step, newIdx) => ({
        ...step,
        index: newIdx,
        dependsOn: step.dependsOn.filter((d) => d < newIdx)
      }))
      return {
        ...prev,
        run: {
          ...prev.run,
          plan: renumbered,
          totalSteps: renumbered.length
        }
      }
    })
  }, [])

  const movePlanStep = useCallback((idx: number, direction: -1 | 1) => {
    setDetail((prev) => {
      if (!prev) return prev
      const plan = [...prev.run.plan]
      const target = idx + direction
      if (target < 0 || target >= plan.length) return prev
      const [moved] = plan.splice(idx, 1)
      plan.splice(target, 0, moved)
      const renumbered = plan.map((step, newIdx) => ({ ...step, index: newIdx, dependsOn: step.dependsOn.filter((d) => d < newIdx) }))
      return { ...prev, run: { ...prev.run, plan: renumbered } }
    })
  }, [])

  const savePlan = useCallback(async () => {
    if (!vaultPath || !runId || !detail) return
    try {
      await window.api.invoke('agent:update-plan', { vaultPath, runId, plan: detail.run.plan })
      await refreshDetail(runId)
      toast(t('agent.plan.saved'), 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [vaultPath, runId, detail, refreshDetail, t])

  const executePlan = useCallback(async () => {
    if (!vaultPath || !runId) return
    try {
      await window.api.invoke('agent:update-plan', { vaultPath, runId, plan: detail?.run.plan || [] })
      await window.api.invoke('agent:start', { vaultPath, runId, dryRun })
      setStage('execute')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [vaultPath, runId, dryRun, detail])

  const pauseRun = useCallback(async () => {
    if (!vaultPath || !runId) return
    await window.api.invoke('agent:pause', { vaultPath, runId })
    await refreshDetail(runId)
  }, [vaultPath, runId, refreshDetail])

  const cancelRun = useCallback(async () => {
    if (!vaultPath || !runId) return
    await window.api.invoke('agent:cancel', { vaultPath, runId })
    await refreshDetail(runId)
  }, [vaultPath, runId, refreshDetail])

  const resumeRun = useCallback(async () => {
    if (!vaultPath || !runId) return
    await window.api.invoke('agent:resume', { vaultPath, runId })
  }, [vaultPath, runId])

  const retryStep = useCallback(async (stepIndex: number) => {
    if (!vaultPath || !runId) return
    await window.api.invoke('agent:retry-step', { vaultPath, runId, stepIndex })
    await refreshDetail(runId)
  }, [vaultPath, runId, refreshDetail])

  const skipStep = useCallback(async (stepIndex: number) => {
    if (!vaultPath || !runId) return
    await window.api.invoke('agent:skip-step', { vaultPath, runId, stepIndex })
    await refreshDetail(runId)
  }, [vaultPath, runId, refreshDetail])

  const rollbackStep = useCallback(async (stepIndex: number) => {
    if (!vaultPath || !runId) return
    const result = await window.api.invoke('agent:rollback-step', { vaultPath, runId, stepIndex })
    if (!result.ok) toast(result.error || 'rollback failed', 'error')
    await refreshDetail(runId)
  }, [vaultPath, runId, refreshDetail])

  const rollbackRun = useCallback(async () => {
    if (!vaultPath || !runId) return
    const result = await window.api.invoke('agent:rollback-run', { vaultPath, runId })
    toast(t('agent.execute.rolledBack', { count: result.rolledBack }), result.errors.length === 0 ? 'success' : 'error')
    await refreshDetail(runId)
  }, [vaultPath, runId, refreshDetail, t])

  const reflect = useCallback(async () => {
    if (!vaultPath || !runId) return
    const result = await window.api.invoke('agent:reflect', { vaultPath, runId })
    setReflectResult(result)
    toast(result.goalAchieved ? t('agent.reflect.achieved') : t('agent.reflect.partial', { succeeded: result.succeededSteps, failed: result.failedSteps }), result.goalAchieved ? 'success' : 'info')
  }, [vaultPath, runId, t])

  const openHistoryRun = useCallback(async (id: string) => {
    setRunId(id)
    await refreshDetail(id)
    const target = history.find((h) => h.id === id)
    setStage(target?.status === 'awaiting_user' ? 'plan' : 'execute')
    setHistoryOpen(false)
  }, [history, refreshDetail])

  const restart = useCallback(() => {
    setRunId(null)
    setDetail(null)
    setReflectResult(null)
    setStage('goal')
    setGoal('')
    setDescription('')
  }, [])

  const status = detail?.run.status
  const isRunning = status === 'running'
  const isFinal = status === 'completed' || status === 'failed' || status === 'cancelled'

  const stepRows = useMemo(() => detail?.steps || [], [detail])

  if (!vaultPath) {
    return <div className="agent-run-panel__empty">{t('agent.noVault')}</div>
  }

  return (
    <div className="agent-run-panel">
      <div className="agent-run-panel__header">
        <span className="agent-run-panel__title">{t('agent.title')}</span>
        <button type="button" className="agent-run-panel__history-btn" onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) void refreshHistory() }}>
          {historyOpen ? t('agent.history.close') : t('agent.history.open')}
        </button>
      </div>

      {historyOpen && (
        <div className="agent-run-panel__history">
          {history.length === 0 ? (
            <div className="agent-run-panel__empty">{t('agent.history.empty')}</div>
          ) : (
            history.map((run) => (
              <div key={run.id} className="agent-run-panel__history-row" onClick={() => void openHistoryRun(run.id)}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{run.goal}</span>
                <span className={`agent-run-panel__step-status agent-run-panel__step-status--${run.status === 'awaiting_user' ? 'pending' : run.status === 'running' ? 'running' : run.status === 'completed' ? 'completed' : run.status === 'failed' || run.status === 'cancelled' ? 'failed' : 'pending'}`}>
                  {run.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="agent-run-panel__body">
        {stage === 'idle' && (
          <div>
            <button type="button" className="agent-run-panel__btn" onClick={() => setStage('goal')}>
              {t('agent.idle.start')}
            </button>
            <div className="agent-run-panel__empty">{t('agent.idle.hint')}</div>
          </div>
        )}

        {(stage === 'goal' || (stage === 'plan' && !detail)) && (
          <div>
            <div className="agent-run-panel__field">
              <label className="agent-run-panel__label">{t('agent.fields.goal')}</label>
              <textarea
                className="agent-run-panel__textarea"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t('agent.fields.goalPlaceholder')}
              />
            </div>
            <div className="agent-run-panel__field">
              <label className="agent-run-panel__label">{t('agent.fields.description')}</label>
              <textarea
                className="agent-run-panel__textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('agent.fields.descriptionPlaceholder')}
              />
            </div>
            <label className="agent-run-panel__toggle">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              {t('agent.fields.dryRun')}
            </label>
            <div className="agent-run-panel__actions">
              <button type="button" className="agent-run-panel__btn" onClick={() => void startPlan()} disabled={planning || !goal.trim()}>
                {planning ? t('agent.plan.generating') : t('agent.plan.generate')}
              </button>
            </div>
          </div>
        )}

        {stage === 'plan' && detail && (
          <PlanEditor
            detail={detail}
            onUpdate={updatePlanStep}
            onDelete={deletePlanStep}
            onMove={movePlanStep}
            onSave={savePlan}
            onExecute={executePlan}
            onCancel={restart}
            t={t}
          />
        )}

        {stage === 'execute' && detail && (
          <ExecuteView
            detail={detail}
            stepRows={stepRows}
            onRetry={retryStep}
            onSkip={skipStep}
            onRollback={rollbackStep}
            reflectResult={reflectResult}
            onSendToKanban={() => {
              const summary = reflectResult
                ? `${reflectResult.goalAchieved
                    ? t('agent.reflect.kanbanSummaryAchieved')
                    : t('agent.reflect.kanbanSummaryPartial', { succeeded: reflectResult.succeededSteps, failed: reflectResult.failedSteps })}${reflectResult.suggestions.length > 0 ? `\n\n${t('agent.reflect.kanbanSummarySuggestions')}:\n- ${reflectResult.suggestions.join('\n- ')}` : ''}`
                : t('agent.reflect.kanbanFallback', { runId: detail.run.id })
              sendToKanban({ title: detail.run.goal, description: summary })
              toast(t('agent.reflect.sendToKanbanSuccess'), 'success')
            }}
            t={t}
          />
        )}
      </div>

      {(stage === 'plan' || stage === 'execute') && detail && (
        <div className="agent-run-panel__status-bar">
          <span>{t('agent.statusBar.status', { status })}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {isRunning && (
              <button type="button" className="agent-run-panel__btn agent-run-panel__btn--ghost" onClick={() => void pauseRun()}>
                {t('agent.execute.pause')}
              </button>
            )}
            {status === 'paused' && (
              <button type="button" className="agent-run-panel__btn" onClick={() => void resumeRun()}>
                {t('agent.execute.resume')}
              </button>
            )}
            {isRunning && (
              <button type="button" className="agent-run-panel__btn agent-run-panel__btn--danger" onClick={() => void cancelRun()}>
                {t('agent.execute.cancel')}
              </button>
            )}
            {isFinal && (
              <>
                <button type="button" className="agent-run-panel__btn agent-run-panel__btn--ghost" onClick={() => void reflect()}>
                  {t('agent.execute.reflect')}
                </button>
                <button type="button" className="agent-run-panel__btn agent-run-panel__btn--ghost" onClick={() => void rollbackRun()}>
                  {t('agent.execute.rollbackAll')}
                </button>
                <button type="button" className="agent-run-panel__btn" onClick={restart}>
                  {t('agent.execute.newRun')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface PlanEditorProps {
  detail: RunDetail
  onUpdate: (idx: number, patch: Partial<AgentPlanStep>) => void
  onDelete: (idx: number) => void
  onMove: (idx: number, direction: -1 | 1) => void
  onSave: () => void
  onExecute: () => void
  onCancel: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function PlanEditor({ detail, onUpdate, onDelete, onMove, onSave, onExecute, onCancel, t }: PlanEditorProps) {
  if (detail.run.plan.length === 0) {
    return (
      <div>
        <div className="agent-run-panel__empty">{t('agent.plan.empty')}</div>
        {detail.run.rationale && <div className="agent-run-panel__rationale">{detail.run.rationale}</div>}
        <div className="agent-run-panel__actions">
          <button type="button" className="agent-run-panel__btn agent-run-panel__btn--ghost" onClick={onCancel}>{t('agent.plan.retry')}</button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="agent-run-panel__label">{t('agent.plan.title', { count: detail.run.plan.length })}</span>
      </div>
      {detail.run.rationale && <div className="agent-run-panel__rationale">{detail.run.rationale}</div>}
      <div style={{ marginTop: 8 }}>
        {detail.run.plan.map((step, idx) => (
          <div key={step.index} className="agent-run-panel__plan-step">
            <div className="agent-run-panel__step-head">
              <span className="agent-run-panel__step-kind">{step.kind}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="agent-run-panel__step-btn" disabled={idx === 0} onClick={() => onMove(idx, -1)}>↑</button>
                <button type="button" className="agent-run-panel__step-btn" disabled={idx === detail.run.plan.length - 1} onClick={() => onMove(idx, 1)}>↓</button>
                <button type="button" className="agent-run-panel__step-btn" onClick={() => onDelete(step.index)}>{t('agent.plan.delete')}</button>
              </div>
            </div>
            <input
              className="agent-run-panel__input"
              value={step.description}
              onChange={(e) => onUpdate(step.index, { description: e.target.value })}
            />
            <div style={{ marginTop: 4 }}>
              <input
                className="agent-run-panel__input"
                value={step.expectedEffect}
                placeholder={t('agent.plan.expectedPlaceholder')}
                onChange={(e) => onUpdate(step.index, { expectedEffect: e.target.value })}
              />
            </div>
            {step.toolName && <div className="agent-run-panel__step-tool" style={{ marginTop: 4 }}>tool: {step.toolName}</div>}
            {Object.keys(step.args || {}).length > 0 && (
              <pre className="agent-run-panel__preview" style={{ marginTop: 4 }}>{JSON.stringify(step.args, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
      <div className="agent-run-panel__actions">
        <button type="button" className="agent-run-panel__btn" onClick={onExecute}>{t('agent.plan.execute')}</button>
        <button type="button" className="agent-run-panel__btn agent-run-panel__btn--ghost" onClick={onSave}>{t('agent.plan.save')}</button>
        <button type="button" className="agent-run-panel__btn agent-run-panel__btn--ghost" onClick={onCancel}>{t('agent.plan.discard')}</button>
      </div>
    </div>
  )
}

interface ExecuteViewProps {
  detail: RunDetail
  stepRows: AgentStepSummary[]
  onRetry: (stepIndex: number) => void
  onSkip: (stepIndex: number) => void
  onRollback: (stepIndex: number) => void
  reflectResult: AgentReflectResult | null
  onSendToKanban: () => void
  t: ReturnType<typeof useTranslation>['t']
}

function ExecuteView({ detail, stepRows, onRetry, onSkip, onRollback, reflectResult, onSendToKanban, t }: ExecuteViewProps) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <span className="agent-run-panel__label">{t('agent.execute.title', { current: detail.run.currentStepIndex + 1, total: detail.run.totalSteps })}</span>
      </div>
      {reflectResult && (
        <div className="agent-run-panel__rationale" style={{ borderLeftColor: reflectResult.goalAchieved ? 'rgb(85,193,107)' : 'rgb(220,180,80)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {reflectResult.goalAchieved ? t('agent.reflect.achieved') : t('agent.reflect.partial', { succeeded: reflectResult.succeededSteps, failed: reflectResult.failedSteps })}
          </div>
          {reflectResult.unmetExpectations.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginTop: 4 }}>{t('agent.reflect.unmet')}</div>
              <ul style={{ margin: '2px 0 0 16px', padding: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                {reflectResult.unmetExpectations.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          {reflectResult.suggestions.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginTop: 6 }}>{t('agent.reflect.suggestions')}</div>
              <ul style={{ margin: '2px 0 0 16px', padding: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                {reflectResult.suggestions.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="agent-run-panel__step-btn"
              onClick={onSendToKanban}
              title={t('agent.reflect.sendToKanbanTitle')}
            >
              {t('agent.reflect.sendToKanban')}
            </button>
          </div>
        </div>
      )}
      {stepRows.map((step) => (
        <div key={step.id} className="agent-run-panel__exec-step">
          <div className="agent-run-panel__step-head">
            <span className="agent-run-panel__step-kind">{step.kind}</span>
            <span className={`agent-run-panel__step-status agent-run-panel__step-status--${step.status}`}>
              {step.status}
            </span>
          </div>
          <div className="agent-run-panel__step-desc">{step.description}</div>
          {step.expectedEffect && <div className="agent-run-panel__step-expected">{step.expectedEffect}</div>}
          {step.toolName && <div className="agent-run-panel__step-tool">tool: {step.toolName}</div>}
          {step.preview && <pre className="agent-run-panel__preview">{step.preview}</pre>}
          {step.error && <pre className="agent-run-panel__preview" style={{ color: 'rgb(255,120,120)' }}>{step.error}</pre>}
          <div className="agent-run-panel__step-actions">
            <button type="button" className="agent-run-panel__step-btn" onClick={() => onRetry(step.stepIndex)} disabled={step.status === 'running'}>{t('agent.execute.retry')}</button>
            <button type="button" className="agent-run-panel__step-btn" onClick={() => onSkip(step.stepIndex)} disabled={step.status === 'completed' || step.status === 'skipped'}>{t('agent.execute.skip')}</button>
            {step.hasRollback && (
              <button type="button" className="agent-run-panel__step-btn" onClick={() => onRollback(step.stepIndex)} disabled={step.status === 'rolled_back'}>{t('agent.execute.rollback')}</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export type { AgentStepStatus }
