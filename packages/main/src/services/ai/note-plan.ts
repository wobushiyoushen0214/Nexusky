export interface GeneratedNotePlanItem {
  title: string
  brief: string
}

interface NormalizeGeneratedNotePlanOptions {
  dirName?: string
  isNameTaken?: (title: string) => boolean
}

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g

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
