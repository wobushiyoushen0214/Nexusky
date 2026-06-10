import type {
  MaintenanceSession,
  MaintenanceWorkPackage,
  MaintenanceSessionSummary,
  KnowledgeMaintenanceItem,
  MaintenanceFeedbackStatus
} from '@shared/types/ipc'
import { randomUUID } from 'node:crypto'

/**
 * 维护会话管理器
 * 管理用户正在进行的维护工作
 */

// 内存中的活跃会话
const activeSessions = new Map<string, MaintenanceSession>()

/**
 * 开始一个新的维护会话
 */
export function startSession(
  vaultPath: string,
  workPackage: MaintenanceWorkPackage
): MaintenanceSession {
  const sessionId = randomUUID()

  // 从 clusters 中提取所有维护项
  const allItems: KnowledgeMaintenanceItem[] = []
  for (const cluster of workPackage.clusters) {
    allItems.push(...cluster.items)
  }

  // 按优先级排序
  const sortedItems = allItems.sort((a, b) => b.priority - a.priority)

  const session: MaintenanceSession = {
    id: sessionId,
    vaultPath,
    package: workPackage,
    startedAt: Date.now(),
    currentIndex: 0,
    completed: [],
    skipped: [],
    remaining: sortedItems,
    stats: {
      resolved: 0,
      healthImprovement: 0,
      affectedNotes: []
    }
  }

  activeSessions.set(sessionId, session)
  return session
}

/**
 * 获取会话
 */
export function getSession(sessionId: string): MaintenanceSession | null {
  return activeSessions.get(sessionId) || null
}

/**
 * 获取下一个待处理的维护项
 */
export function getNextItem(sessionId: string): KnowledgeMaintenanceItem | null {
  const session = activeSessions.get(sessionId)
  if (!session) return null

  if (session.currentIndex >= session.remaining.length) {
    return null // 所有项目已处理完
  }

  return session.remaining[session.currentIndex]
}

/**
 * 记录用户对当前项的操作
 */
export function recordSessionAction(
  sessionId: string,
  item: KnowledgeMaintenanceItem,
  action: MaintenanceFeedbackStatus
): boolean {
  const session = activeSessions.get(sessionId)
  if (!session) return false

  // 验证是否是当前项
  const currentItem = session.remaining[session.currentIndex]
  if (!currentItem || currentItem.filePath !== item.filePath || currentItem.type !== item.type) {
    return false
  }

  // 根据操作类型更新统计
  if (action === 'done') {
    session.completed.push(item)
    session.stats.resolved++

    // 记录受影响的笔记
    if (!session.stats.affectedNotes.includes(item.filePath)) {
      session.stats.affectedNotes.push(item.filePath)
    }

    // 粗略估算健康分提升（每解决一个高优先级问题 +0.5 分）
    if (item.priority >= 80) {
      session.stats.healthImprovement += 0.5
    } else if (item.priority >= 60) {
      session.stats.healthImprovement += 0.3
    } else {
      session.stats.healthImprovement += 0.1
    }
  } else if (action === 'skipped' || action === 'snoozed' || action === 'not_relevant') {
    session.skipped.push(item)
  }

  // 移动到下一项
  session.currentIndex++

  return true
}

/**
 * 完成会话，生成摘要
 */
export function completeSession(
  sessionId: string,
  healthBefore: number,
  healthAfter: number
): MaintenanceSessionSummary | null {
  const session = activeSessions.get(sessionId)
  if (!session) return null

  const duration = Math.round((Date.now() - session.startedAt) / 1000)
  const itemsProcessed = session.completed.length + session.skipped.length

  const summary: MaintenanceSessionSummary = {
    sessionId,
    duration,
    itemsProcessed,
    itemsResolved: session.completed.length,
    healthBefore,
    healthAfter,
    improvements: [],
    nextRecommendation: undefined // TODO: 实现推荐逻辑
  }

  // 清理会话
  activeSessions.delete(sessionId)

  return summary
}

/**
 * 取消会话
 */
export function cancelSession(sessionId: string): boolean {
  return activeSessions.delete(sessionId)
}

/**
 * 获取所有活跃会话（用于调试）
 */
export function getActiveSessions(): MaintenanceSession[] {
  return Array.from(activeSessions.values())
}
