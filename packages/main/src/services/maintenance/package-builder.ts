import type {
  MaintenanceIssueCluster,
  MaintenanceWorkPackage,
  MaintenancePackageMode,
  MaintenanceConfidenceLevel
} from '@shared/types/ipc'
import { randomUUID } from 'node:crypto'

/**
 * 从问题聚合生成可执行的维护批次
 *
 * 策略：
 * - Quick: 3-5 项高置信度高优先级，预计 5 分钟
 * - Focused: 单个最大影响的 cluster，预计 15 分钟
 * - Deep: 所有 clusters，用户自定义范围，预计 30+ 分钟
 */
export function buildWorkPackages(clusters: MaintenanceIssueCluster[]): MaintenanceWorkPackage[] {
  const packages: MaintenanceWorkPackage[] = []

  // 1. Quick Package - 快速清理
  const quickPackage = buildQuickPackage(clusters)
  if (quickPackage) {
    packages.push(quickPackage)
  }

  // 2. Focused Package - 专注维护
  const focusedPackage = buildFocusedPackage(clusters)
  if (focusedPackage) {
    packages.push(focusedPackage)
  }

  // 3. Deep Package - 深度清理
  const deepPackage = buildDeepPackage(clusters)
  if (deepPackage) {
    packages.push(deepPackage)
  }

  return packages
}

/**
 * Quick Package: 3-5 项高置信度高优先级
 */
function buildQuickPackage(clusters: MaintenanceIssueCluster[]): MaintenanceWorkPackage | null {
  // 筛选高优先级、高影响、项目数少的 clusters
  const quickCandidates = clusters
    .filter(c => c.priority === 'high' && c.impactScore >= 85)
    .sort((a, b) => b.impactScore - a.impactScore)

  if (quickCandidates.length === 0) return null

  // 收集前 3-5 项最高优先级的维护项
  const selectedItems = []
  for (const cluster of quickCandidates) {
    const highPriorityItems = cluster.items
      .filter(item => item.priority >= 85)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 2) // 每个 cluster 最多取 2 项

    selectedItems.push(...highPriorityItems)
    if (selectedItems.length >= 5) break
  }

  if (selectedItems.length === 0) return null

  const finalItems = selectedItems.slice(0, 5)
  const totalMinutes = Math.ceil(finalItems.reduce((sum, item) => {
    return sum + (item.priority >= 90 ? 1.5 : 1)
  }, 0))

  // 将选中的项重新组织成 mini clusters
  const miniClusters: MaintenanceIssueCluster[] = [{
    id: randomUUID(),
    type: 'impact',
    title: `${finalItems.length} 个高影响问题`,
    description: '这些问题会阻塞核心功能',
    itemCount: finalItems.length,
    affectedResources: [...new Set(finalItems.map(item => item.filePath))],
    priority: 'high',
    estimatedMinutes: totalMinutes,
    impactScore: 90,
    items: finalItems,
    categories: []
  }]

  return {
    id: randomUUID(),
    title: '快速清理',
    description: `${totalMinutes} 分钟 · ${finalItems.length} 项 · 仅高置信度`,
    mode: 'quick',
    estimatedMinutes: totalMinutes,
    confidence: 'high',
    clusters: miniClusters,
    totalItems: finalItems.length
  }
}

/**
 * Focused Package: 选择最大影响的单个 cluster
 */
function buildFocusedPackage(clusters: MaintenanceIssueCluster[]): MaintenanceWorkPackage | null {
  if (clusters.length === 0) return null

  // 选择 impactScore 最高且项目数合理（3-20项）的 cluster
  const focusCandidates = clusters
    .filter(c => c.itemCount >= 3 && c.itemCount <= 20)
    .sort((a, b) => b.impactScore - a.impactScore)

  if (focusCandidates.length === 0) {
    // 如果没有合适的，选择影响最大的 cluster
    const topCluster = [...clusters].sort((a, b) => b.impactScore - a.impactScore)[0]
    if (!topCluster) return null

    return {
      id: randomUUID(),
      title: '专注维护',
      description: `${topCluster.estimatedMinutes} 分钟 · ${topCluster.title}`,
      mode: 'focused',
      estimatedMinutes: topCluster.estimatedMinutes,
      confidence: getConfidence(topCluster.priority),
      clusters: [topCluster],
      totalItems: topCluster.itemCount
    }
  }

  const targetCluster = focusCandidates[0]

  return {
    id: randomUUID(),
    title: '专注维护',
    description: `${targetCluster.estimatedMinutes} 分钟 · ${targetCluster.title} · 推荐`,
    mode: 'focused',
    estimatedMinutes: targetCluster.estimatedMinutes,
    confidence: getConfidence(targetCluster.priority),
    clusters: [targetCluster],
    totalItems: targetCluster.itemCount
  }
}

/**
 * Deep Package: 所有 clusters，用户自定义范围
 */
function buildDeepPackage(clusters: MaintenanceIssueCluster[]): MaintenanceWorkPackage | null {
  if (clusters.length === 0) return null

  const totalItems = clusters.reduce((sum, c) => sum + c.itemCount, 0)
  const totalMinutes = clusters.reduce((sum, c) => sum + c.estimatedMinutes, 0)

  return {
    id: randomUUID(),
    title: '深度清理',
    description: `${totalMinutes}+ 分钟 · ${totalItems} 项 · 自定义范围`,
    mode: 'deep',
    estimatedMinutes: totalMinutes,
    confidence: 'medium',
    clusters: clusters,
    totalItems: totalItems,
    scope: {
      timeLimit: totalMinutes,
      riskLevel: 'medium'
    }
  }
}

/**
 * 将优先级转换为置信度
 */
function getConfidence(priority: 'high' | 'medium' | 'low'): MaintenanceConfidenceLevel {
  if (priority === 'high') return 'high'
  if (priority === 'medium') return 'medium'
  return 'low'
}
