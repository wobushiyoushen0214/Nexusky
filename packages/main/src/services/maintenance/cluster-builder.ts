import type {
  KnowledgeMaintenanceItem,
  MaintenanceIssueCluster,
  MaintenanceClusterType,
  MaintenancePriorityLevel,
  MaintenanceScanGroup
} from '@shared/types/ipc'
import { randomUUID } from 'node:crypto'

/**
 * 将原始维护项聚合成用户能理解的问题域
 *
 * 聚合策略：
 * 1. 按笔记路径 - 同一笔记的所有问题聚合
 * 2. 按文件夹路径 - 同一文件夹的问题聚合
 * 3. 按问题类型 - links/tasks/structure 等分组
 * 4. 按影响范围 - high/medium/low impact 分层
 */
export function buildIssueClusters(items: KnowledgeMaintenanceItem[]): MaintenanceIssueCluster[] {
  const clusters: MaintenanceIssueCluster[] = []

  // 1. 按笔记聚合
  const byNote = clusterByNote(items)
  clusters.push(...byNote)

  // 2. 按文件夹聚合
  const byFolder = clusterByFolder(items)
  clusters.push(...byFolder)

  // 3. 按问题类型聚合
  const byCategory = clusterByCategory(items)
  clusters.push(...byCategory)

  // 4. 按影响范围聚合
  const byImpact = clusterByImpact(items)
  clusters.push(...byImpact)

  return clusters
}

/**
 * 按笔记路径聚合
 * 例如：Pipeline 设计与管理.md 有 3 个断链 + 1 个任务
 */
function clusterByNote(items: KnowledgeMaintenanceItem[]): MaintenanceIssueCluster[] {
  const grouped = new Map<string, KnowledgeMaintenanceItem[]>()

  for (const item of items) {
    const path = item.filePath
    if (!grouped.has(path)) {
      grouped.set(path, [])
    }
    grouped.get(path)!.push(item)
  }

  const clusters: MaintenanceIssueCluster[] = []

  for (const [path, noteItems] of grouped.entries()) {
    // 只有多个问题的笔记才创建 cluster
    if (noteItems.length < 2) continue

    const categories = getUniqueCategories(noteItems)
    const avgPriority = noteItems.reduce((sum, item) => sum + item.priority, 0) / noteItems.length
    const title = noteItems[0].title

    clusters.push({
      id: randomUUID(),
      type: 'note',
      title: `${title} 有 ${noteItems.length} 个问题`,
      description: buildNoteClusterDescription(noteItems, categories),
      itemCount: noteItems.length,
      affectedResources: [path],
      priority: scoreToPriority(avgPriority),
      estimatedMinutes: estimateTimeForItems(noteItems),
      impactScore: Math.round(avgPriority),
      items: noteItems,
      categories
    })
  }

  return clusters
}

/**
 * 按文件夹聚合
 * 例如：Projects/ 文件夹有 8 个结构问题
 */
function clusterByFolder(items: KnowledgeMaintenanceItem[]): MaintenanceIssueCluster[] {
  const grouped = new Map<string, KnowledgeMaintenanceItem[]>()

  for (const item of items) {
    const folder = getFolderPath(item.filePath)
    if (!grouped.has(folder)) {
      grouped.set(folder, [])
    }
    grouped.get(folder)!.push(item)
  }

  const clusters: MaintenanceIssueCluster[] = []

  for (const [folder, folderItems] of grouped.entries()) {
    // 至少 3 个问题才创建文件夹 cluster
    if (folderItems.length < 3) continue

    const categories = getUniqueCategories(folderItems)
    const avgPriority = folderItems.reduce((sum, item) => sum + item.priority, 0) / folderItems.length
    const affectedPaths = [...new Set(folderItems.map(item => item.filePath))]

    clusters.push({
      id: randomUUID(),
      type: 'folder',
      title: `${folder || '根目录'} 有 ${folderItems.length} 个问题`,
      description: buildFolderClusterDescription(folderItems, categories, affectedPaths.length),
      itemCount: folderItems.length,
      affectedResources: affectedPaths,
      priority: scoreToPriority(avgPriority),
      estimatedMinutes: estimateTimeForItems(folderItems),
      impactScore: Math.round(avgPriority),
      items: folderItems,
      categories
    })
  }

  return clusters
}
/**
 * 按问题类型聚合
 * 例如：67 个断链问题
 */
function clusterByCategory(items: KnowledgeMaintenanceItem[]): MaintenanceIssueCluster[] {
  const grouped = new Map<MaintenanceScanGroup, KnowledgeMaintenanceItem[]>()

  for (const item of items) {
    const category = typeToCategory(item.type)
    if (!grouped.has(category)) {
      grouped.set(category, [])
    }
    grouped.get(category)!.push(item)
  }

  const clusters: MaintenanceIssueCluster[] = []

  for (const [category, categoryItems] of grouped.entries()) {
    const avgPriority = categoryItems.reduce((sum, item) => sum + item.priority, 0) / categoryItems.length
    const affectedPaths = [...new Set(categoryItems.map(item => item.filePath))]

    clusters.push({
      id: randomUUID(),
      type: 'category',
      title: `${getCategoryLabel(category)} ${categoryItems.length} 项`,
      description: buildCategoryClusterDescription(category, categoryItems, affectedPaths.length),
      itemCount: categoryItems.length,
      affectedResources: affectedPaths,
      priority: scoreToPriority(avgPriority),
      estimatedMinutes: estimateTimeForItems(categoryItems),
      impactScore: Math.round(avgPriority),
      items: categoryItems,
      categories: [category]
    })
  }

  return clusters
}

/**
 * 按影响范围聚合
 * 例如：5 个高影响问题（阻塞导航）
 */
function clusterByImpact(items: KnowledgeMaintenanceItem[]): MaintenanceIssueCluster[] {
  const highImpact = items.filter(item => item.priority >= 80)
  const mediumImpact = items.filter(item => item.priority >= 60 && item.priority < 80)
  const lowImpact = items.filter(item => item.priority < 60)

  const clusters: MaintenanceIssueCluster[] = []

  if (highImpact.length > 0) {
    const categories = getUniqueCategories(highImpact)
    const affectedPaths = [...new Set(highImpact.map(item => item.filePath))]

    clusters.push({
      id: randomUUID(),
      type: 'impact',
      title: `${highImpact.length} 个高影响问题`,
      description: `这些问题会阻塞导航或影响核心功能，涉及 ${affectedPaths.length} 篇笔记`,
      itemCount: highImpact.length,
      affectedResources: affectedPaths,
      priority: 'high',
      estimatedMinutes: estimateTimeForItems(highImpact),
      impactScore: 90,
      items: highImpact,
      categories
    })
  }

  if (mediumImpact.length > 0) {
    const categories = getUniqueCategories(mediumImpact)
    const affectedPaths = [...new Set(mediumImpact.map(item => item.filePath))]

    clusters.push({
      id: randomUUID(),
      type: 'impact',
      title: `${mediumImpact.length} 个中影响问题`,
      description: `这些问题会影响使用体验，涉及 ${affectedPaths.length} 篇笔记`,
      itemCount: mediumImpact.length,
      affectedResources: affectedPaths,
      priority: 'medium',
      estimatedMinutes: estimateTimeForItems(mediumImpact),
      impactScore: 70,
      items: mediumImpact,
      categories
    })
  }

  if (lowImpact.length > 0) {
    const categories = getUniqueCategories(lowImpact)
    const affectedPaths = [...new Set(lowImpact.map(item => item.filePath))]

    clusters.push({
      id: randomUUID(),
      type: 'impact',
      title: `${lowImpact.length} 个低影响问题`,
      description: `这些问题可批量处理，涉及 ${affectedPaths.length} 篇笔记`,
      itemCount: lowImpact.length,
      affectedResources: affectedPaths,
      priority: 'low',
      estimatedMinutes: estimateTimeForItems(lowImpact),
      impactScore: 50,
      items: lowImpact,
      categories
    })
  }

  return clusters
}

// ============================================================================
// Helper functions
// ============================================================================

function getUniqueCategories(items: KnowledgeMaintenanceItem[]): MaintenanceScanGroup[] {
  const categories = new Set<MaintenanceScanGroup>()
  for (const item of items) {
    categories.add(typeToCategory(item.type))
  }
  return Array.from(categories)
}

function getFolderPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/')
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : ''
}

function scoreToPriority(score: number): MaintenancePriorityLevel {
  if (score >= 80) return 'high'
  if (score >= 60) return 'medium'
  return 'low'
}

function estimateTimeForItems(items: KnowledgeMaintenanceItem[]): number {
  let total = 0
  for (const item of items) {
    if (item.priority >= 80) total += 3
    else if (item.priority >= 60) total += 2
    else total += 1
  }
  return Math.max(1, Math.round(total))
}

/**
 * 将维护项类型映射到扫描分组
 */
function typeToCategory(type: string): MaintenanceScanGroup {
  if (type.includes('link') || type.includes('orphan')) return 'links'
  if (type.includes('task')) return 'tasks'
  if (type.includes('property') || type.includes('alias')) return 'properties'
  if (type.includes('memory')) return 'memory'
  if (type.includes('bridge')) return 'bridge'
  return 'structure'
}

/**
 * 获取分类标签
 */
function getCategoryLabel(category: MaintenanceScanGroup): string {
  const labels: Record<MaintenanceScanGroup, string> = {
    links: '链接问题',
    tasks: '任务',
    properties: '属性问题',
    memory: '记忆维护',
    structure: '结构问题',
    bridge: '桥接笔记'
  }
  return labels[category] || category
}

/**
 * 构建笔记 cluster 的描述
 */
function buildNoteClusterDescription(
  items: KnowledgeMaintenanceItem[],
  categories: MaintenanceScanGroup[]
): string {
  const categoryLabels = categories.map(c => getCategoryLabel(c)).join('、')
  return `包含 ${categoryLabels}，建议逐项审查`
}

/**
 * 构建文件夹 cluster 的描述
 */
function buildFolderClusterDescription(
  items: KnowledgeMaintenanceItem[],
  categories: MaintenanceScanGroup[],
  noteCount: number
): string {
  const categoryLabels = categories.map(c => getCategoryLabel(c)).join('、')
  return `${noteCount} 篇笔记有 ${categoryLabels}，可批量处理`
}

/**
 * 构建分类 cluster 的描述
 */
function buildCategoryClusterDescription(
  category: MaintenanceScanGroup,
  items: KnowledgeMaintenanceItem[],
  noteCount: number
): string {
  const label = getCategoryLabel(category)
  return `${label}分布在 ${noteCount} 篇笔记中`
}
