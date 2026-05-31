import { TOOL_SURFACE_REGISTRY } from '../tool-surface/registry'

export const AGENT_STEP_KINDS = [
  'tool_call',
  'file_write',
  'file_create',
  'task_update',
  'note_edit',
  'move_file',
  'rename_file',
  'delete_file',
  'apply_tag',
  'update_frontmatter',
  'create_link',
  'merge_notes'
] as const
export type AgentStepKind = typeof AGENT_STEP_KINDS[number]

const WRITE_KINDS = new Set<AgentStepKind>([
  'file_write',
  'file_create',
  'task_update',
  'note_edit',
  'move_file',
  'rename_file',
  'delete_file',
  'apply_tag',
  'update_frontmatter',
  'create_link',
  'merge_notes'
])
const ALLOWED_STEP_KINDS = new Set<string>(AGENT_STEP_KINDS)

export const ALLOWED_AGENT_TOOLS: ReadonlySet<string> = new Set(TOOL_SURFACE_REGISTRY.map((entry) => entry.name))

export function isWriteStepKind(kind: AgentStepKind): boolean {
  return WRITE_KINDS.has(kind)
}

export function isAllowedStepKind(value: unknown): value is AgentStepKind {
  return typeof value === 'string' && ALLOWED_STEP_KINDS.has(value)
}

export function isAllowedAgentTool(name: string | undefined | null): boolean {
  return typeof name === 'string' && ALLOWED_AGENT_TOOLS.has(name)
}
