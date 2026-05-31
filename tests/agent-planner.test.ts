import { describe, expect, it } from 'vitest'
import { parsePlanResponse, buildPlanPrompt } from '../packages/main/src/services/agent/planner'

describe('agent planner', () => {
  describe('parsePlanResponse', () => {
    it('returns empty plan with explanatory rationale for empty input', () => {
      const result = parsePlanResponse('')
      expect(result.plan).toEqual([])
      expect(result.rationale).toMatch(/empty/i)
    })

    it('returns empty plan for non-JSON output', () => {
      const result = parsePlanResponse('Sorry, I cannot plan this right now.')
      expect(result.plan).toEqual([])
      expect(result.rationale).toMatch(/JSON|empty|plan/i)
    })

    it('returns empty plan for a JSON object without a steps array', () => {
      const result = parsePlanResponse('{"rationale":"need more info"}')
      expect(result.plan).toEqual([])
      expect(result.rationale).toBe('need more info')
    })

    it('keeps allowed read-only tool calls', () => {
      const raw = JSON.stringify({
        steps: [{
          index: 0,
          kind: 'tool_call',
          toolName: 'list_orphan_notes',
          args: { limit: 5 },
          description: 'Locate orphan notes',
          expectedEffect: 'List of orphan note paths',
          dependsOn: []
        }],
        rationale: 'simple discovery'
      })
      const { plan, rationale } = parsePlanResponse(raw)
      expect(plan).toHaveLength(1)
      expect(plan[0].toolName).toBe('list_orphan_notes')
      expect(plan[0].kind).toBe('tool_call')
      expect(rationale).toBe('simple discovery')
    })

    it('rejects steps that reference a tool not on the whitelist', () => {
      const raw = JSON.stringify({
        steps: [
          { index: 0, kind: 'tool_call', toolName: 'delete_all_notes', args: {}, description: 'delete everything', expectedEffect: 'gone', dependsOn: [] }
        ]
      })
      const { plan, rationale } = parsePlanResponse(raw)
      expect(plan).toHaveLength(0)
      expect(rationale).toMatch(/whitelist|read-before-write|schema/i)
    })

    it('rejects a write step that has no preceding read step', () => {
      const raw = JSON.stringify({
        steps: [
          { index: 0, kind: 'file_write', args: { filePath: 'A.md', content: 'x' }, description: 'write A', expectedEffect: 'A updated', dependsOn: [] }
        ]
      })
      const { plan } = parsePlanResponse(raw)
      expect(plan).toHaveLength(0)
    })

    it('keeps a write step that is preceded by a tool_call read step', () => {
      const raw = JSON.stringify({
        steps: [
          { index: 0, kind: 'tool_call', toolName: 'read_current_note', args: {}, description: 'read current note', expectedEffect: 'content snapshot', dependsOn: [] },
          { index: 1, kind: 'file_write', args: { filePath: 'A.md', content: 'x' }, description: 'write A', expectedEffect: 'A updated', dependsOn: [0] }
        ]
      })
      const { plan } = parsePlanResponse(raw)
      expect(plan).toHaveLength(2)
      expect(plan[1].kind).toBe('file_write')
      expect(plan[1].dependsOn).toEqual([0])
    })

    it('accepts structured maintenance step kinds after a read step', () => {
      const raw = JSON.stringify({
        steps: [
          { index: 0, kind: 'tool_call', toolName: 'read_current_note', args: { filePath: 'A.md' }, description: 'read A', expectedEffect: 'content snapshot', dependsOn: [] },
          { index: 1, kind: 'apply_tag', args: { filePath: 'A.md', tag: 'project' }, description: 'tag A', expectedEffect: 'A has a project tag', dependsOn: [0] },
          { index: 2, kind: 'create_link', args: { filePath: 'A.md', targetTitle: 'B' }, description: 'link A to B', expectedEffect: 'A links to B', dependsOn: [0] },
          { index: 3, kind: 'update_frontmatter', args: { filePath: 'A.md', properties: { status: 'active' } }, description: 'set status', expectedEffect: 'status is active', dependsOn: [0] }
        ]
      })
      const { plan } = parsePlanResponse(raw)
      expect(plan.map((step) => step.kind)).toEqual(['tool_call', 'apply_tag', 'create_link', 'update_frontmatter'])
    })

    it('caps the plan at 12 steps', () => {
      const steps: unknown[] = []
      steps.push({ index: 0, kind: 'tool_call', toolName: 'search_notes', args: { query: 'x' }, description: 'read', expectedEffect: 'list', dependsOn: [] })
      for (let i = 1; i < 20; i++) {
        steps.push({ index: i, kind: 'tool_call', toolName: 'search_notes', args: { query: 'x' }, description: `read ${i}`, expectedEffect: 'list', dependsOn: [] })
      }
      const { plan } = parsePlanResponse(JSON.stringify({ steps }))
      expect(plan).toHaveLength(12)
    })

    it('renumbers indices to be contiguous and strips invalid dependsOn entries', () => {
      const raw = JSON.stringify({
        steps: [
          { index: 5, kind: 'tool_call', toolName: 'search_notes', args: { query: 'x' }, description: 'first', expectedEffect: 'list', dependsOn: [] },
          { index: 9, kind: 'tool_call', toolName: 'list_orphan_notes', args: {}, description: 'second', expectedEffect: 'list', dependsOn: [99, 0] }
        ]
      })
      const { plan } = parsePlanResponse(raw)
      expect(plan.map((s) => s.index)).toEqual([0, 1])
      expect(plan[1].dependsOn).toEqual([0])
    })

    it('rejects entries missing description', () => {
      const raw = JSON.stringify({
        steps: [
          { index: 0, kind: 'tool_call', toolName: 'search_notes', args: {}, description: '', expectedEffect: '', dependsOn: [] }
        ]
      })
      const { plan } = parsePlanResponse(raw)
      expect(plan).toHaveLength(0)
    })
  })

  describe('buildPlanPrompt', () => {
    it('embeds the goal in the user message', () => {
      const messages = buildPlanPrompt({ goal: 'Index missing memories' })
      const userMsg = messages.find((m) => m.role === 'user')
      expect(userMsg?.content).toContain('Index missing memories')
    })

    it('exposes the whitelist of tools in the system message', () => {
      const messages = buildPlanPrompt({ goal: 'x' })
      const system = messages.find((m) => m.role === 'system')!
      expect(system.content).toContain('list_orphan_notes')
      expect(system.content).toContain('update_frontmatter')
      expect(system.content).toContain('strict JSON')
    })
  })
})
