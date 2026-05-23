import { aiManager } from '../ai'
import type { ChatMessage, ChatOptions, ChatStreamEvent } from '../ai'
import { extractJsonFromText } from '../ai/json'
import { ALLOWED_AGENT_TOOLS, isAllowedStepKind, isWriteStepKind, type AgentStepKind } from './step-kinds'
import type { AgentPlanStep } from './agent-store'

const MAX_STEPS = 12
const MAX_DESCRIPTION = 280
const MAX_EXPECTED = 280

export interface PlanAgentRunParams {
  goal: string
  description?: string
  context?: Record<string, unknown>
  signal?: AbortSignal
  provider?: AgentPlannerProvider
}

export interface PlanAgentRunResult {
  plan: AgentPlanStep[]
  rationale: string
}

export interface AgentPlannerProvider {
  chatStream(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent>
}

export async function planAgentRun(params: PlanAgentRunParams): Promise<PlanAgentRunResult> {
  const provider = params.provider || getActiveProvider()
  if (!provider) {
    return { plan: [], rationale: 'No active AI provider configured. Unable to generate a plan.' }
  }

  const prompt = buildPlanPrompt(params)
  let response = ''
  try {
    for await (const event of provider.chatStream(prompt, params.signal, { temperature: 0 })) {
      if (event.type === 'text') response += event.content
      if (event.type === 'error') {
        return { plan: [], rationale: 'AI provider returned an error before completing the plan.' }
      }
    }
  } catch {
    return { plan: [], rationale: 'AI provider failed while generating the plan.' }
  }

  return parsePlanResponse(response)
}

export function parsePlanResponse(text: string): PlanAgentRunResult {
  if (!text || !text.trim()) {
    return { plan: [], rationale: 'AI returned an empty response. Unable to generate a plan.' }
  }
  let parsed: { steps?: unknown; rationale?: unknown } | null = null
  try {
    parsed = extractJsonFromText<{ steps?: unknown; rationale?: unknown }>(text, 'object')
  } catch {
    return { plan: [], rationale: 'AI returned non-JSON content. Unable to generate a plan.' }
  }
  const rationaleRaw = typeof parsed?.rationale === 'string' ? parsed.rationale.trim() : ''
  if (!parsed || !Array.isArray(parsed.steps)) {
    return { plan: [], rationale: rationaleRaw || 'AI did not return a steps array.' }
  }
  const normalized = normalizePlanSteps(parsed.steps)
  return { plan: normalized.steps, rationale: rationaleRaw || normalized.fallbackRationale }
}

interface NormalizeResult {
  steps: AgentPlanStep[]
  fallbackRationale: string
}

function normalizePlanSteps(raw: unknown[]): NormalizeResult {
  const accepted: AgentPlanStep[] = []
  const readIndices = new Set<number>()
  let rejections = 0
  for (const item of raw) {
    if (accepted.length >= MAX_STEPS) break
    const step = coerceStep(item, accepted.length)
    if (!step) {
      rejections++
      continue
    }
    if (step.kind === 'tool_call' && !isAllowedToolName(step.toolName)) {
      rejections++
      continue
    }
    const sanitizedDeps = step.dependsOn.filter((dep) => dep >= 0 && dep < accepted.length)
    step.dependsOn = sanitizedDeps
    if (isWriteStepKind(step.kind) && readIndices.size === 0) {
      rejections++
      continue
    }
    accepted.push(step)
    if (step.kind === 'tool_call') readIndices.add(step.index)
  }
  const fallback = rejections > 0
    ? `Rejected ${rejections} step(s) due to schema, whitelist, or read-before-write violations.`
    : ''
  return { steps: accepted, fallbackRationale: fallback }
}

function coerceStep(raw: unknown, expectedIndex: number): AgentPlanStep | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const kindCandidate = typeof obj.kind === 'string' ? obj.kind : null
  if (!kindCandidate || !isAllowedStepKind(kindCandidate)) return null
  const kind = kindCandidate as AgentStepKind
  const toolName = typeof obj.toolName === 'string' ? obj.toolName.trim() : undefined
  if (kind === 'tool_call' && !toolName) return null
  const description = typeof obj.description === 'string' ? obj.description.trim().slice(0, MAX_DESCRIPTION) : ''
  if (!description) return null
  const expectedEffect = typeof obj.expectedEffect === 'string' ? obj.expectedEffect.trim().slice(0, MAX_EXPECTED) : ''
  const args = obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args)
    ? sanitizeRecord(obj.args as Record<string, unknown>)
    : {}
  const dependsOn = Array.isArray(obj.dependsOn)
    ? obj.dependsOn
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0)
    : []
  return {
    index: expectedIndex,
    kind,
    toolName: kind === 'tool_call' ? toolName : undefined,
    args,
    description,
    expectedEffect,
    dependsOn
  }
}

function isAllowedToolName(name: string | undefined): boolean {
  return typeof name === 'string' && ALLOWED_AGENT_TOOLS.has(name)
}

function sanitizeRecord(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(input).slice(0, 16)) {
    const value = input[key]
    if (value === undefined) continue
    if (typeof value === 'string' && value.length > 4000) {
      out[key] = value.slice(0, 4000)
    } else {
      out[key] = value
    }
  }
  return out
}

export function buildPlanPrompt(params: PlanAgentRunParams): ChatMessage[] {
  const tools = Array.from(ALLOWED_AGENT_TOOLS).join(', ')
  const goal = String(params.goal || '').trim().slice(0, 600)
  const description = params.description ? String(params.description).trim().slice(0, 600) : ''
  const context = params.context ? JSON.stringify(params.context).slice(0, 1500) : ''

  return [
    {
      role: 'system',
      content: [
        'You are designing a step-by-step plan to achieve a user goal in a personal knowledge base.',
        '',
        'Allowed step kinds: tool_call | file_write | file_create | task_update | note_edit.',
        'Allowed tools for tool_call (whitelist):',
        tools,
        '',
        'Return strict JSON only, no markdown, no explanation:',
        '{"steps":[{"index":0,"kind":"tool_call","toolName":"...","args":{},"description":"...","expectedEffect":"...","dependsOn":[]}],"rationale":"..."}',
        '',
        'Hard rules (the response is rejected silently if any rule is violated):',
        `- At most ${MAX_STEPS} steps.`,
        '- Every write step (file_write|file_create|task_update|note_edit) must be preceded by at least one tool_call read step.',
        '- dependsOn must only reference earlier step indices.',
        '- Never include destructive operations (delete file, drop table, force-push, mass deletion).',
        '- Never invent tool names outside the whitelist.',
        '- description and expectedEffect must be concrete and non-empty.',
        '- If the goal is ambiguous, return fewer steps and put the missing information in rationale.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `Goal: ${goal || '(empty)'}`,
        description ? `User notes: ${description}` : '',
        context ? `Context: ${context}` : ''
      ].filter(Boolean).join('\n')
    }
  ]
}

function getActiveProvider(): AgentPlannerProvider | null {
  const config = aiManager.getActiveConfig()
  if (!config) return null
  if (aiManager.validateConfig(config)) return null
  return aiManager.getProvider(config)
}
