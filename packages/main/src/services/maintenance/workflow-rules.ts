import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

export interface MaintenanceWorkflowRules {
  requiredProperties: string[]
  ignorePaths: string[]
  minCharacters?: number
  upcomingDays?: number
  sourceFiles: string[]
  signature: string
}

const WORKFLOW_RULE_FILE_PATHS = [
  'Maintenance/Workflow Rules.md',
  '.nexusky/workflow-rules.md',
  '.nexusky/maintenance-rules.md'
] as const

const EMPTY_RULES: MaintenanceWorkflowRules = {
  requiredProperties: [],
  ignorePaths: [],
  sourceFiles: [],
  signature: '0:none'
}

type RuleData = Record<string, unknown>

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function asObject(value: unknown): RuleData | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RuleData
    : undefined
}

function splitLooseList(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, '')
    .split(/[,\n]/)
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeStringList(item))
  if (typeof value === 'string') return splitLooseList(value)
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  return []
}

function uniqueNormalizedStrings(values: string[], limit = 50): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const value = raw.trim().replace(/^[-*]\s+/, '').replace(/^['"]|['"]$/g, '')
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
    if (result.length >= limit) break
  }
  return result
}

function getFirstValue(data: RuleData, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) return data[key]
  }
  return undefined
}

function getRuleObjects(data: RuleData): RuleData[] {
  return [
    data,
    asObject(data.maintenance),
    asObject(data.workflowRules),
    asObject(data.workflow_rules)
  ].filter((value): value is RuleData => Boolean(value))
}

function getFirstNumber(ruleObjects: RuleData[], keys: string[]): number | undefined {
  for (const object of ruleObjects) {
    const raw = getFirstValue(object, keys)
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
    if (Number.isFinite(value) && value > 0) return Math.floor(value)
  }
  return undefined
}

function getStringListFromRules(ruleObjects: RuleData[], keys: string[]): string[] {
  return ruleObjects.flatMap((object) => normalizeStringList(getFirstValue(object, keys)))
}

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase().replace(/[:：]+$/g, '')
}

function collectSectionItems(content: string, headings: string[]): string[] {
  const wanted = new Set(headings.map(normalizeHeading))
  const lines = content.split(/\r?\n/)
  const items: string[] = []
  let active = false

  for (const line of lines) {
    const heading = line.match(/^#{2,6}\s+(.+?)\s*$/)
    if (heading) {
      active = wanted.has(normalizeHeading(heading[1]))
      continue
    }
    if (!active) continue

    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/)
    if (bullet) items.push(...splitLooseList(bullet[1]))
  }

  return items
}

function collectBodyNumber(content: string, keys: string[]): number | undefined {
  const wanted = keys.map((key) => key.toLowerCase())
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s+)?([A-Za-z][A-Za-z0-9 _-]+)\s*[:=]\s*(\d+)\s*$/)
    if (!match) continue
    const key = match[1].trim().toLowerCase().replace(/[\s_-]+/g, '')
    if (!wanted.some((item) => item.replace(/[\s_-]+/g, '') === key)) continue
    const value = Number(match[2])
    if (Number.isFinite(value) && value > 0) return Math.floor(value)
  }
  return undefined
}

function parseWorkflowRuleContent(content: string): Omit<MaintenanceWorkflowRules, 'sourceFiles' | 'signature'> {
  const parsed = matter(content)
  const data = asObject(parsed.data) || {}
  const ruleObjects = getRuleObjects(data)
  const requiredProperties = uniqueNormalizedStrings([
    ...getStringListFromRules(ruleObjects, ['requiredProperties', 'required_properties', 'requiredFrontmatter', 'required_frontmatter']),
    ...collectSectionItems(parsed.content, ['Required Properties', 'Required Frontmatter', '必填属性', '必填字段'])
  ])
  const ignorePaths = uniqueNormalizedStrings([
    ...getStringListFromRules(ruleObjects, ['ignorePaths', 'ignore_paths', 'ignoredPaths', 'ignored_paths']),
    ...collectSectionItems(parsed.content, ['Ignore Paths', 'Ignored Paths', '忽略路径', '忽略文件'])
  ])
  const minCharacters = getFirstNumber(ruleObjects, ['minCharacters', 'min_characters', 'largeNoteCharacters', 'large_note_characters', 'longNoteCharacters', 'long_note_characters'])
    ?? collectBodyNumber(parsed.content, ['minCharacters', 'min characters', 'largeNoteCharacters', 'long note characters'])
  const upcomingDays = getFirstNumber(ruleObjects, ['upcomingDays', 'upcoming_days'])
    ?? collectBodyNumber(parsed.content, ['upcomingDays', 'upcoming days'])

  return {
    requiredProperties,
    ignorePaths,
    minCharacters,
    upcomingDays
  }
}

function normalizeRulePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
}

function globToRegExp(pattern: string): RegExp {
  let source = ''
  const normalized = normalizeRulePath(pattern)
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i]
    const next = normalized[i + 1]
    if (char === '*' && next === '*') {
      source += '.*'
      i += 1
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    }
  }
  return new RegExp(`^${source}$`, 'i')
}

export function isPathIgnoredByWorkflowRules(filePath: string, ignorePaths: string[]): boolean {
  const normalizedPath = normalizeRulePath(filePath)
  if (!normalizedPath) return false

  for (const rawPattern of ignorePaths) {
    const pattern = normalizeRulePath(rawPattern)
    if (!pattern) continue
    if (!/[*?]/.test(pattern)) {
      const normalizedPattern = pattern.replace(/\/+$/g, '')
      if (normalizedPath.toLowerCase() === normalizedPattern.toLowerCase()) return true
      if (normalizedPath.toLowerCase().startsWith(`${normalizedPattern.toLowerCase()}/`)) return true
      continue
    }
    if (globToRegExp(pattern).test(normalizedPath)) return true
  }

  return false
}

export function readMaintenanceWorkflowRules(vaultPath: string): MaintenanceWorkflowRules {
  const parsedRules: Omit<MaintenanceWorkflowRules, 'sourceFiles' | 'signature'>[] = []
  const signatureParts: Array<readonly [string, string]> = []
  const sourceFiles: string[] = []

  for (const relPath of WORKFLOW_RULE_FILE_PATHS) {
    const absPath = join(vaultPath, relPath)
    if (!existsSync(absPath)) continue
    try {
      const content = readFileSync(absPath, 'utf-8')
      parsedRules.push(parseWorkflowRuleContent(content))
      signatureParts.push([relPath, hashText(content)] as const)
      sourceFiles.push(relPath)
    } catch {
      // Ignore transient read errors; the maintenance queue can still run with
      // the remaining rule files or built-in defaults.
    }
  }

  if (parsedRules.length === 0) return { ...EMPTY_RULES }

  return {
    requiredProperties: uniqueNormalizedStrings(parsedRules.flatMap((rule) => rule.requiredProperties)),
    ignorePaths: uniqueNormalizedStrings(parsedRules.flatMap((rule) => rule.ignorePaths)),
    minCharacters: parsedRules.find((rule) => typeof rule.minCharacters === 'number')?.minCharacters,
    upcomingDays: parsedRules.find((rule) => typeof rule.upcomingDays === 'number')?.upcomingDays,
    sourceFiles,
    signature: `${signatureParts.length}:${hashText(JSON.stringify(signatureParts))}`
  }
}
