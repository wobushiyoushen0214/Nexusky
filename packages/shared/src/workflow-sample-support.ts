import type { WorkflowSampleVaultId } from './workflow-samples'

export interface WorkflowSampleSupportFile {
  path: string
  content: string
}

interface WorkflowTemplateDefinition {
  id: string
  name: string
  description: string
  category: string
  content: string
}

interface WorkflowMaintenanceRuleConfig {
  requiredProperties: string[]
  ignorePaths?: string[]
  minCharacters?: number
  upcomingDays?: number
}

function buildTemplatePack(author: string, tags: string[], templates: WorkflowTemplateDefinition[]): string {
  return `${JSON.stringify({ author, tags, templates }, null, 2)}\n`
}

function buildMaintenanceRules(
  title: string,
  healthChecks: string[],
  reviewChecks: string[],
  templateNames: string[],
  config: WorkflowMaintenanceRuleConfig = {
    requiredProperties: ['type', 'status', 'tags'],
    ignorePaths: ['README.md'],
    minCharacters: 8000,
    upcomingDays: 7
  }
): string {
  return [
    '---',
    `title: ${title} Workflow Rules`,
    'type: maintenance-rules',
    'status: active',
    'tags: [workflow, maintenance, review]',
    'maintenance:',
    '  requiredProperties:',
    ...config.requiredProperties.map((property) => `    - ${property}`),
    '  ignorePaths:',
    ...(config.ignorePaths ?? []).map((path) => `    - ${path}`),
    `  minCharacters: ${config.minCharacters ?? 8000}`,
    `  upcomingDays: ${config.upcomingDays ?? 7}`,
    '---',
    `# ${title} Workflow Rules`,
    '',
    '## Required Properties',
    ...config.requiredProperties.map((property) => `- ${property}`),
    '',
    '## Ignore Paths',
    ...(config.ignorePaths ?? []).map((path) => `- ${path}`),
    '',
    '## Health',
    ...healthChecks.map((line) => `- ${line}`),
    '',
    '## Review',
    ...reviewChecks.map((line) => `- ${line}`),
    '',
    '## Templates',
    ...templateNames.map((line) => `- ${line}`),
    ''
  ].join('\n')
}

export function getWorkflowSampleSupportFiles(id: WorkflowSampleVaultId): WorkflowSampleSupportFile[] {
  switch (id) {
    case 'research':
      return [
        {
          path: '.nexusky/templates/research.json',
          content: buildTemplatePack('Nexusky', ['workflow', 'research', 'review'], [
            {
              id: 'research-source-note',
              name: 'Research Source Note',
              description: 'Capture a source, the claims it makes, and the next follow-up question.',
              category: 'Research',
              content: `# {{title}}\n\nsource:: \nstatus:: collected\n\nauthors:: \nyear:: \n\n## Summary\n\n\n\n## Claims\n\n- \n\n## Follow-up\n\n- [ ] \n`
            },
            {
              id: 'research-digest',
              name: 'Research Digest',
              description: 'Summarize one theme and keep unresolved loops visible.',
              category: 'Review',
              content: `# {{title}}\n\ntype:: digest\nstatus:: draft\n\ntags:: #research, #digest\n\n## Theme\n\n\n\n## Evidence\n\n- [[ ]]\n\n## Open loops\n\n- [ ] \n`
            },
            {
              id: 'research-weekly-review',
              name: 'Weekly Research Review',
              description: 'Close the loop on sources, digests, and open questions.',
              category: 'Review',
              content: `# {{title}}\n\ntype:: weekly-review\nstatus:: open\n\ntags:: #research, #review\n\n## What became clearer\n\n- \n\n## Notes to revisit\n\n- [[ ]]\n\n## Next week\n\n- [ ] \n`
            }
          ])
        },
        {
          path: 'Maintenance/Workflow Rules.md',
          content: buildMaintenanceRules(
            'Research',
            [
              'Keep one source note per claim or excerpt.',
              'Move unresolved questions into a digest or weekly review.',
              'Keep the template pack focused on source, digest, and review notes.'
            ],
            [
              'If a research note has no follow-up, add one before collecting more sources.',
              'If a digest no longer points to sources, send it back to review.',
              'Use the weekly review to decide what to read next.'
            ],
            [
              'Research Source Note, for new reading',
              'Research Digest, for synthesis',
              'Weekly Research Review, for closing the loop'
            ]
          )
        }
      ]
    case 'writing':
      return [
        {
          path: '.nexusky/templates/writing.json',
          content: buildTemplatePack('Nexusky', ['workflow', 'writing', 'review'], [
            {
              id: 'writing-source-note',
              name: 'Writing Source Note',
              description: 'Capture interview notes, quotes, and factual support.',
              category: 'Writing',
              content: `# {{title}}\n\ntype:: source-note\nstatus:: processed\n\ntags:: #writing, #source\n\n## Observations\n\n- \n\n## Pull quotes\n\n> \n\n## Follow-up\n\n- [ ] \n`
            },
            {
              id: 'writing-draft',
              name: 'Writing Draft',
              description: 'Draft the thesis, structure, and unresolved claims.',
              category: 'Draft',
              content: `# {{title}}\n\ntype:: draft\nstatus:: rough\n\ntags:: #writing, #draft\n\n## Thesis\n\n\n\n## Source pool\n\n- [[ ]]\n\n## Revision tasks\n\n- [ ] \n`
            },
            {
              id: 'writing-weekly-review',
              name: 'Weekly Writing Review',
              description: 'Track progress, friction, and next revision steps.',
              category: 'Review',
              content: `# {{title}}\n\ntype:: weekly-review\nstatus:: open\n\ntags:: #writing, #review\n\n## Progress\n\n- \n\n## Friction\n\n- \n\n## Next revision\n\n- [ ] \n`
            }
          ])
        },
        {
          path: 'Maintenance/Workflow Rules.md',
          content: buildMaintenanceRules(
            'Writing',
            [
              'Every draft should point back to a source note or interview note.',
              'Promising claims should move into a review note before publishing.',
              'Keep the sample templates aligned with health and review, not decoration.'
            ],
            [
              'If a paragraph lacks evidence, send it back to source notes.',
              'If the draft is too broad, split it into a reviewable next revision.',
              'Treat publish readiness as a health check, not a cosmetic pass.'
            ],
            [
              'Writing Source Note, for evidence capture',
              'Writing Draft, for thesis and structure',
              'Weekly Writing Review, for revision planning'
            ]
          )
        }
      ]
    case 'developer':
      return [
        {
          path: '.nexusky/templates/developer.json',
          content: buildTemplatePack('Nexusky', ['workflow', 'developer', 'review'], [
            {
              id: 'developer-adr',
              name: 'ADR',
              description: 'Record the decision, context, and consequences of a technical choice.',
              category: 'Developer',
              content: `# {{title}}\n\ntype:: adr\nstatus:: proposed\n\ntags:: #developer, #adr\n\ndate:: {{date}}\n\n## Context\n\n\n\n## Decision\n\n\n\n## Consequences\n\n- \n`
            },
            {
              id: 'developer-debug-note',
              name: 'Debug Note',
              description: 'Track a concrete symptom, hypothesis, and next step.',
              category: 'Debug',
              content: `# {{title}}\n\ntype:: debug-note\nstatus:: investigating\n\ntags:: #developer, #debug\n\n## Symptom\n\n\n\n## Hypothesis\n\n\n\n## Next steps\n\n- [ ] \n`
            },
            {
              id: 'developer-review',
              name: 'Engineering Review',
              description: 'Capture what shipped, what stayed risky, and what to follow up.',
              category: 'Review',
              content: `# {{title}}\n\ntype:: weekly-review\nstatus:: open\n\ntags:: #developer, #review\n\n## Shipped\n\n- \n\n## Risks\n\n- \n\n## Follow-up\n\n- [ ] \n`
            }
          ])
        },
        {
          path: 'Maintenance/Workflow Rules.md',
          content: buildMaintenanceRules(
            'Developer',
            [
              'Every debug note should link to an ADR or API note.',
              'Every repeated incident should become a review item or decision note.',
              'Keep the template pack focused on debug, ADR, and review notes.'
            ],
            [
              'If a bug is resolved, move it from investigating to review.',
              'If the same root cause appears twice, promote it into an ADR.',
              'Use the weekly review to decide what to harden next.'
            ],
            [
              'ADR, for decisions',
              'Debug Note, for incidents',
              'Engineering Review, for follow-up and risk'
            ]
          )
        }
      ]
    case 'learning':
      return [
        {
          path: '.nexusky/templates/learning.json',
          content: buildTemplatePack('Nexusky', ['workflow', 'learning', 'review'], [
            {
              id: 'learning-lesson',
              name: 'Lesson Note',
              description: 'Capture the lesson, the core idea, and a quick practice prompt.',
              category: 'Learning',
              content: `# {{title}}\n\ntype:: lesson\nstatus:: learning\n\ntags:: #learning, #lesson\n\n## Goal\n\n\n\n## Notes\n\n- \n\n## Questions\n\n- [ ] \n`
            },
            {
              id: 'learning-practice',
              name: 'Practice Drill',
              description: 'Turn a lesson into an exercise with links and review.',
              category: 'Practice',
              content: `# {{title}}\n\ntype:: practice\nstatus:: open\n\ntags:: #learning, #practice\n\n## Exercise\n\n\n\n## Today\n\n- [[ ]]\n\n## Checklist\n\n- [ ] \n`
            },
            {
              id: 'learning-review',
              name: 'Weekly Learning Review',
              description: 'Track what was learned, what needs reinforcement, and the next drill.',
              category: 'Review',
              content: `# {{title}}\n\ntype:: weekly-review\nstatus:: open\n\ntags:: #learning, #review\n\n## Learned\n\n- \n\n## Notes to strengthen\n\n- [[ ]]\n\n## Next week\n\n- [ ] \n`
            }
          ])
        },
        {
          path: 'Maintenance/Workflow Rules.md',
          content: buildMaintenanceRules(
            'Learning',
            [
              'Every lesson should point to one concept note and one practice note.',
              'Every practice drill should end with a review action.',
              'Keep the template pack focused on lesson, practice, and review notes.'
            ],
            [
              'If a lesson has no practice, add one before collecting more notes.',
              'If a concept has no example, send it into next week’s review.',
              'Use the weekly review to choose the next drill.'
            ],
            [
              'Lesson Note, for capture',
              'Practice Drill, for action',
              'Weekly Learning Review, for reinforcement'
            ]
          )
        }
      ]
  }
}
