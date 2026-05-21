export interface GeneratedNotePlanItem {
  title: string
  brief: string
}

export interface GeneratedNoteBatchPlanItem {
  dir: string
  topic: string
  count: number
}

interface NormalizeGeneratedNotePlanOptions {
  dirName?: string
  isNameTaken?: (title: string) => boolean
}

interface NormalizeGeneratedNoteBatchPlanOptions {
  defaultCount?: number
  maxBatches?: number
  maxCount?: number
}

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g
const INVALID_PATH_SEGMENT_CHARS = /[<>:"|?*]/g

function stripDirectoryPrefix(title: string, dirName?: string): string {
  if (!dirName || dirName === '根目录') return title

  const prefix = dirName.trim()
  if (!prefix) return title

  const titleLower = title.toLowerCase()
  const prefixLower = prefix.toLowerCase()
  if (!titleLower.startsWith(prefixLower) || title.length <= prefix.length) return title

  const rest = title.slice(prefix.length)
  return /^[\s_\\/-]+/.test(rest) ? rest.replace(/^[\s_\\/-]+/, '') : title
}

function sanitizeGeneratedNoteTitle(title: string): string {
  return title.replace(INVALID_FILENAME_CHARS, ' ').replace(/\s+/g, ' ').trim()
}

function sanitizeGeneratedDirectory(dir: string): string {
  const segments = dir
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.replace(INVALID_PATH_SEGMENT_CHARS, ' ').replace(/\s+/g, ' ').trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')

  return segments.join('/')
}

function normalizeBatchCount(value: unknown, defaultCount: number, maxCount: number): number {
  const count = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(count)) return defaultCount
  return Math.min(maxCount, Math.max(1, Math.floor(count)))
}

export function normalizeGeneratedNotePlan(
  plan: GeneratedNotePlanItem[],
  options: NormalizeGeneratedNotePlanOptions = {}
): GeneratedNotePlanItem[] {
  const used = new Set<string>()
  const isNameTaken = options.isNameTaken || (() => false)

  return plan.map((item, index) => {
    const rawTitle = typeof item.title === 'string' ? item.title : ''
    const baseTitle = sanitizeGeneratedNoteTitle(stripDirectoryPrefix(rawTitle, options.dirName)) || `Untitled ${index + 1}`
    let title = baseTitle
    let suffix = 2

    while (used.has(title.toLowerCase()) || isNameTaken(title)) {
      title = `${baseTitle} ${suffix}`
      suffix++
    }

    used.add(title.toLowerCase())
    return {
      title,
      brief: typeof item.brief === 'string' ? item.brief : ''
    }
  })
}

export function normalizeGeneratedNoteBatchPlan(
  plan: GeneratedNoteBatchPlanItem[],
  options: NormalizeGeneratedNoteBatchPlanOptions = {}
): GeneratedNoteBatchPlanItem[] {
  const maxBatches = options.maxBatches || 20
  const defaultCount = options.defaultCount || 5
  const maxCount = options.maxCount || 20
  const used = new Set<string>()

  return plan.slice(0, maxBatches).map((item, index) => {
    const rawDir = typeof item.dir === 'string' ? item.dir : ''
    const topic = typeof item.topic === 'string' && item.topic.trim() ? item.topic.trim() : rawDir.trim()
    const fallbackDir = topic || `Topic ${index + 1}`
    const baseDir = sanitizeGeneratedDirectory(rawDir || fallbackDir) || `Topic ${index + 1}`
    let dir = baseDir
    let suffix = 2

    while (used.has(dir.toLowerCase())) {
      dir = `${baseDir} ${suffix}`
      suffix++
    }

    used.add(dir.toLowerCase())
    return {
      dir,
      topic: topic || dir,
      count: normalizeBatchCount(item.count, defaultCount, maxCount)
    }
  }).filter((item) => item.dir.length > 0)
}
