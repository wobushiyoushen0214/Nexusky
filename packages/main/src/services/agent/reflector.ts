import { aiManager } from '../ai'
import type { ChatMessage, ChatOptions, ChatStreamEvent } from '../ai'
import { extractJsonFromText } from '../ai/json'
import { getAgentRun } from './agent-store'

export interface AgentReflectResult {
  goalAchieved: boolean
  succeededSteps: number
  failedSteps: number
  unmetExpectations: string[]
  suggestions: string[]
}

export interface ReflectAgentRunParams {
  vaultPath: string
  runId: string
  signal?: AbortSignal
  provider?: AgentReflectorProvider
}

export interface AgentReflectorProvider {
  chatStream(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent>
}

export async function reflectAgentRun(params: ReflectAgentRunParams): Promise<AgentReflectResult> {
  const snapshot = getAgentRun(params.vaultPath, params.runId)
  const fallback = baselineReflect(snapshot)
  if (!snapshot) return fallback
  const provider = params.provider || getActiveProvider()
  if (!provider) return fallback

  const prompt = buildReflectPrompt(snapshot)
  let response = ''
  try {
    for await (const event of provider.chatStream(prompt, params.signal, { temperature: 0 })) {
      if (event.type === 'text') response += event.content
      if (event.type === 'error') return fallback
    }
  } catch {
    return fallback
  }

  return mergeReflectResult(fallback, parseReflectResponse(response))
}

function buildReflectPrompt(snapshot: NonNullable<ReturnType<typeof getAgentRun>>): ChatMessage[] {
  const stepsForPrompt = snapshot.steps.slice(0, 20).map((step) => ({
    index: step.stepIndex,
    kind: step.kind,
    toolName: step.toolName,
    description: step.description,
    expectedEffect: step.expectedEffect,
    status: step.status,
    error: step.error || undefined,
    preview: step.preview ? step.preview.slice(0, 400) : undefined
  }))

  const payload = {
    goal: snapshot.run.goal,
    description: snapshot.run.description,
    rationale: snapshot.run.rationale,
    steps: stepsForPrompt
  }

  return [
    {
      role: 'system',
      content: [
        'You are evaluating whether an autonomous knowledge-base agent run achieved the user goal.',
        '',
        'Return strict JSON only:',
        '{"goalAchieved":true|false,"unmetExpectations":["..."],"suggestions":["..."]}',
        '',
        'Rules:',
        '- goalAchieved must be true only if every essential expectation is met.',
        '- unmetExpectations lists what is still missing, citing the specific expectedEffect that did not happen.',
        '- suggestions are short, concrete next actions the user could take.',
        '- Output at most 5 entries in each array.',
        '- Do not wrap the JSON in Markdown fences.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify(payload, null, 2)
    }
  ]
}

function parseReflectResponse(text: string): Partial<AgentReflectResult> {
  if (!text || !text.trim()) return {}
  try {
    const parsed = extractJsonFromText<{
      goalAchieved?: unknown
      unmetExpectations?: unknown
      suggestions?: unknown
    }>(text, 'object')
    return {
      goalAchieved: typeof parsed?.goalAchieved === 'boolean' ? parsed.goalAchieved : undefined,
      unmetExpectations: normalizeStringArray(parsed?.unmetExpectations),
      suggestions: normalizeStringArray(parsed?.suggestions)
    }
  } catch {
    return {}
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 5)
}

function mergeReflectResult(fallback: AgentReflectResult, aiResult: Partial<AgentReflectResult>): AgentReflectResult {
  return {
    goalAchieved: typeof aiResult.goalAchieved === 'boolean' ? aiResult.goalAchieved : fallback.goalAchieved,
    succeededSteps: fallback.succeededSteps,
    failedSteps: fallback.failedSteps,
    unmetExpectations: aiResult.unmetExpectations && aiResult.unmetExpectations.length > 0
      ? aiResult.unmetExpectations
      : fallback.unmetExpectations,
    suggestions: aiResult.suggestions && aiResult.suggestions.length > 0
      ? aiResult.suggestions
      : fallback.suggestions
  }
}

export function baselineReflect(snapshot: ReturnType<typeof getAgentRun> | null): AgentReflectResult {
  if (!snapshot) {
    return {
      goalAchieved: false,
      succeededSteps: 0,
      failedSteps: 0,
      unmetExpectations: [],
      suggestions: []
    }
  }
  const succeededSteps = snapshot.steps.filter((s) => s.status === 'completed').length
  const failedSteps = snapshot.steps.filter((s) => s.status === 'failed').length
  const unmetExpectations = snapshot.steps
    .filter((s) => s.status !== 'completed' && (s.expectedEffect || s.description))
    .map((s) => s.expectedEffect || s.description)
  const suggestions: string[] = []
  if (failedSteps > 0) suggestions.push('Retry failed steps with revised arguments or run them as dry-run first.')
  if (succeededSteps === 0) suggestions.push('Refine the goal so the planner can produce a more concrete first step.')
  return {
    goalAchieved: failedSteps === 0 && succeededSteps === snapshot.steps.length && snapshot.steps.length > 0,
    succeededSteps,
    failedSteps,
    unmetExpectations,
    suggestions
  }
}

function getActiveProvider(): AgentReflectorProvider | null {
  const config = aiManager.getActiveConfig()
  if (!config) return null
  if (aiManager.validateConfig(config)) return null
  return aiManager.getProvider(config)
}
