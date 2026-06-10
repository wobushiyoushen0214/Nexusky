import { ipcMain } from 'electron'
import { gatherMaintenanceItems } from '../services/maintenance/queue-builder'
import { applyMaintenanceFix, type ApplyFixAction } from '../services/maintenance/apply-fix'
import { getMaintenanceFeedbackSummary, isMaintenanceFeedbackStatus, recordMaintenanceFeedback } from '../services/maintenance/feedback'
import { buildIssueClusters } from '../services/maintenance/cluster-builder'
import { buildWorkPackages } from '../services/maintenance/package-builder'
import {
  startSession,
  getSession,
  getNextItem,
  recordSessionAction,
  completeSession
} from '../services/maintenance/session-manager'
import type {
  AppLanguage,
  MaintenanceFeedbackStatus,
  KnowledgeMaintenanceItem,
  KnowledgeMaintenanceType,
  MaintenanceApplyAction,
  MaintenanceApplyMode,
  MaintenanceScanGroup,
  MaintenanceOverview,
  MaintenanceIssueCluster
} from '@shared/types/ipc'
import { resolveAppLanguage } from '../services/app-language'
import { scanVaultHealth } from '../services/vault-health'

export function registerMaintenanceIPC(): void {
  ipcMain.handle('maintenance:get-queue', async (_event, params: {
    vaultPath: string
    type?: KnowledgeMaintenanceType
    query?: string
    limit?: number
    minCharacters?: number
    upcomingDays?: number
    requiredProperties?: string[]
    scanGroups?: MaintenanceScanGroup[]
    language?: AppLanguage
  }) => {
    return gatherMaintenanceItems({
      vaultPath: params.vaultPath,
      type: params.type,
      query: params.query,
      limit: params.limit,
      minCharacters: params.minCharacters,
      upcomingDays: params.upcomingDays,
      requiredProperties: params.requiredProperties,
      scanGroups: params.scanGroups,
      language: resolveAppLanguage(params.language)
    })
  })

  ipcMain.handle('maintenance:apply-fix', async (_event, params: {
    vaultPath: string
    item: KnowledgeMaintenanceItem
    action: MaintenanceApplyAction
    mode?: MaintenanceApplyMode
    payload?: Record<string, unknown>
    language?: AppLanguage
  }) => {
    return applyMaintenanceFix({
      vaultPath: params.vaultPath,
      item: params.item,
      action: params.action as ApplyFixAction,
      mode: params.mode,
      payload: params.payload,
      language: resolveAppLanguage(params.language)
    })
  })

  ipcMain.handle('maintenance:record-feedback', async (_event, params: {
    vaultPath: string
    item: KnowledgeMaintenanceItem
    status: MaintenanceFeedbackStatus
    snoozeUntil?: number | null
  }) => {
    if (!isMaintenanceFeedbackStatus(params.status)) {
      throw new Error('Invalid IPC payload: maintenance:record-feedback.status is invalid')
    }
    return recordMaintenanceFeedback({
      vaultPath: params.vaultPath,
      item: params.item,
      status: params.status,
      snoozeUntil: params.snoozeUntil
    })
  })

  ipcMain.handle('maintenance:get-feedback-summary', async (_event, params: { vaultPath: string }) => {
    return getMaintenanceFeedbackSummary(params.vaultPath)
  })

  // ============================================================================
  // 新增：维护队列重构 - Overview, Session, Clusters
  // ============================================================================

  ipcMain.handle('maintenance:get-overview', async (_event, params: {
    vaultPath: string
    language?: AppLanguage
  }) => {
    const language = resolveAppLanguage(params.language)

    // 1. 获取所有维护项
    const queueResult = await gatherMaintenanceItems({
      vaultPath: params.vaultPath,
      language
    })

    // 2. 聚合成 issue clusters
    const clusters = buildIssueClusters(queueResult.items)

    // 3. 生成 work packages
    const packages = buildWorkPackages(clusters)

    // 4. 获取健康分数
    const health = await scanVaultHealth(params.vaultPath)

    // 5. 构建概览
    const overview: MaintenanceOverview = {
      summary: {
        totalItems: queueResult.total,
        problemAreas: buildProblemAreas(clusters),
        healthScore: health.score,
        mainIssue: buildMainIssueDescription(clusters)
      },
      packages,
      clusters,
      scan: queueResult.scan
    }

    return overview
  })

  ipcMain.handle('maintenance:start-session', async (_event, params: {
    vaultPath: string
    packageId: string
    language?: AppLanguage
  }) => {
    const language = resolveAppLanguage(params.language)

    // 1. 获取所有维护项
    const queueResult = await gatherMaintenanceItems({
      vaultPath: params.vaultPath,
      language
    })

    // 2. 聚合成 issue clusters
    const clusters = buildIssueClusters(queueResult.items)

    // 3. 生成 work packages
    const packages = buildWorkPackages(clusters)

    // 4. 找到对应的 package
    const workPackage = packages.find((p: { id: string }) => p.id === params.packageId)
    if (!workPackage) {
      throw new Error(`Work package not found: ${params.packageId}`)
    }

    return startSession(params.vaultPath, workPackage)
  })

  ipcMain.handle('maintenance:get-session', async (_event, params: {
    vaultPath: string
    sessionId: string
  }) => {
    return getSession(params.sessionId)
  })

  ipcMain.handle('maintenance:session-next-item', async (_event, params: {
    vaultPath: string
    sessionId: string
  }) => {
    return getNextItem(params.sessionId)
  })

  ipcMain.handle('maintenance:session-record-action', async (_event, params: {
    vaultPath: string
    sessionId: string
    item: KnowledgeMaintenanceItem
    action: MaintenanceFeedbackStatus
  }) => {
    const success = recordSessionAction(params.sessionId, params.item, params.action)
    return { ok: success }
  })

  ipcMain.handle('maintenance:complete-session', async (_event, params: {
    vaultPath: string
    sessionId: string
  }) => {
    // 获取会话前后的健康分数
    const healthBefore = await scanVaultHealth(params.vaultPath)
    // TODO: 这里应该在会话开始时保存 healthBefore，现在简化处理
    const healthAfter = await scanVaultHealth(params.vaultPath)

    return completeSession(params.sessionId, healthBefore.score, healthAfter.score)
  })
}

// ============================================================================
// Helper functions for overview building
// ============================================================================

function buildProblemAreas(clusters: MaintenanceIssueCluster[]) {
  const areaMap = new Map<MaintenanceScanGroup, {
    count: number
    impact: 'high' | 'medium' | 'low'
    description: string
  }>()

  for (const cluster of clusters) {
    if (cluster.type !== 'category') continue

    const category = cluster.categories[0]
    if (!category) continue

    areaMap.set(category, {
      count: cluster.itemCount,
      impact: cluster.priority,
      description: cluster.description
    })
  }

  return Array.from(areaMap.entries()).map(([category, data]) => ({
    category,
    count: data.count,
    impact: data.impact,
    description: data.description
  }))
}

function buildMainIssueDescription(clusters: MaintenanceIssueCluster[]): string {
  if (clusters.length === 0) {
    return 'Vault 状态良好，没有需要维护的问题'
  }

  // 找到影响最大的分类
  const categoryCluster = clusters
    .filter(c => c.type === 'category')
    .sort((a, b) => b.impactScore - a.impactScore)[0]

  if (!categoryCluster) {
    return `发现 ${clusters[0].itemCount} 个维护问题`
  }

  return `${categoryCluster.title}是主要问题：${categoryCluster.description}`
}
