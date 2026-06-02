export const WORKFLOW_SAMPLE_VAULT_IDS = ['research', 'writing', 'developer', 'learning'] as const

export type WorkflowSampleVaultId = typeof WORKFLOW_SAMPLE_VAULT_IDS[number]

export interface WorkflowSampleFile {
  path: string
  content: string
}

export interface WorkflowSampleVault {
  id: WorkflowSampleVaultId
  defaultVaultName: string
  files: readonly WorkflowSampleFile[]
}

export const SAMPLE_WORKFLOW_VAULTS: readonly WorkflowSampleVault[] = [
  {
    id: 'research',
    defaultVaultName: 'Nexusky Research Sample',
    files: [
      {
        path: 'README.md',
        content: `---
title: Research Workflow Sample
workflow: research
status: active
tags: [workflow, sample, research]
---
# Research Workflow Sample

Use this vault to test literature notes, source notes, digest writing, and weekly review.

## Start here

- Read [[Literature/CRDTs for Offline Knowledge Work]].
- Compare it with [[Sources/Local-first Software Notes]].
- Turn the open questions in [[Digests/2026-06-01 Research Digest]] into follow-up searches.
- Close the loop in [[Reviews/2026-W22 Weekly Research Review]].

## Maintenance signals to inspect

- [ ] Add a stable citation key to each literature note.
- [ ] Resolve the draft question about peer-to-peer sync costs.
- [ ] Decide whether this topic belongs in a public publish folder.
`
      },
      {
        path: 'Literature/CRDTs for Offline Knowledge Work.md',
        content: `---
title: CRDTs for Offline Knowledge Work
type: literature-note
status: reading
tags: [research, local-first, sync]
source: https://www.inkandswitch.com/local-first/
authors: Ink and Switch
year: 2019
---
# CRDTs for Offline Knowledge Work

## Why this matters

Local-first knowledge tools need collaboration and recovery without making the cloud the source of truth. CRDTs are one candidate for keeping edits mergeable while users keep files on their machine.

## Claims

- The user should be able to keep working while offline.
- Sync should preserve intent instead of choosing the newest timestamp blindly.
- Conflict recovery needs visible context, not a hidden merge result.

## Useful excerpts

> Users should own their data and software should continue to work offline.

## Connections

- [[Sources/Local-first Software Notes]] collects related principles.
- [[Digests/2026-06-01 Research Digest]] groups this with publish and backup questions.
- [[Reviews/2026-W22 Weekly Research Review]] tracks next reading tasks.

## Questions

- [ ] What conflict details should be visible to non-technical users?
- [ ] Which CRDT concepts are too heavy for a Markdown vault?
`
      },
      {
        path: 'Sources/Local-first Software Notes.md',
        content: `---
title: Local-first Software Notes
type: source-note
status: collected
tags: [research, local-first, product]
---
# Local-first Software Notes

## Source summary

Local-first software treats local data as primary, then syncs when useful. For Nexusky, that means Markdown files remain readable outside the app, and optional sync should not turn into account lock-in.

## Signals for product decisions

- Settings copy must separate local vaults, bring-your-own sync, managed backup, and hosted publish.
- Recovery matters more than real-time collaboration for individual knowledge work.
- Publish can be valuable without becoming a full website builder.

## Links

- [[Literature/CRDTs for Offline Knowledge Work]]
- [[Digests/2026-06-01 Research Digest]]

## Follow-up

- [ ] Find one source on end-user mental models for sync conflicts.
- [ ] Compare local-first notes with traditional cloud document tools.
`
      },
      {
        path: 'Digests/2026-06-01 Research Digest.md',
        content: `---
title: 2026-06-01 Research Digest
type: digest
status: draft
tags: [research, digest]
---
# 2026-06-01 Research Digest

## Theme

Local-first knowledge work depends on clear recovery, restrained sync promises, and visible data boundaries.

## Evidence

- [[Literature/CRDTs for Offline Knowledge Work]] explains why offline edits need merge semantics.
- [[Sources/Local-first Software Notes]] translates that into product boundaries.

## Draft synthesis

The strongest product promise is not "cloud collaboration." It is "your files remain yours, and the app helps you repair and understand them." Managed sync should come after conflict recovery and history are obvious.

## Open loops

- [ ] Find a small public example of conflict copy that users understand.
- [ ] Add a publish/private-link section after testing static export access.
`
      },
      {
        path: 'Reviews/2026-W22 Weekly Research Review.md',
        content: `---
title: 2026-W22 Weekly Research Review
type: weekly-review
status: open
tags: [research, review]
---
# 2026-W22 Weekly Research Review

## What became clearer

- Local ownership is a product boundary, not only a technical architecture.
- Sync confidence depends on recovery copy and visible history.
- Publish should start with scoped static export before hosted features.

## Notes to revisit

- [[Literature/CRDTs for Offline Knowledge Work]]
- [[Sources/Local-first Software Notes]]
- [[Digests/2026-06-01 Research Digest]]

## Next week

- [ ] Read one paper or essay on conflict resolution UX.
- [ ] Turn the digest into a short publishable note.
- [ ] Ask AI for a sourced tour of the research folder and inspect citations.
`
      }
    ]
  },
  {
    id: 'writing',
    defaultVaultName: 'Nexusky Writing Sample',
    files: [
      {
        path: 'README.md',
        content: `---
title: Writing Workflow Sample
workflow: writing
status: active
tags: [workflow, sample, writing]
---
# Writing Workflow Sample

This vault models a small essay project: brief, source notes, draft fragments, and a weekly writing review.

## Start here

- Open [[Projects/Essay - Local-first AI Workbench]] to see the brief.
- Reuse evidence from [[Sources/Interview Notes - Knowledge Workers]].
- Continue [[Drafts/Opening Draft]].
- Plan the next revision in [[Reviews/2026-W22 Writing Review]].

## Maintenance signals to inspect

- [ ] Decide which notes should be tagged publish.
- [ ] Link each source note to at least one draft section.
- [ ] Move unresolved claims into a fact-check list before publishing.
`
      },
      {
        path: 'Projects/Essay - Local-first AI Workbench.md',
        content: `---
title: Essay - Local-first AI Workbench
type: writing-project
status: drafting
tags: [writing, essay, publish]
publish: true
---
# Essay - Local-first AI Workbench

## Thesis

The best AI writing tool for a long-lived Markdown vault should behave like a local workbench: it reads the user's structure, cites sources, and proposes reviewable edits instead of hiding work in a cloud document.

## Audience

- Markdown and Obsidian users with more than 500 notes.
- Researchers and developers who want AI assistance without losing file ownership.

## Structure

1. The problem with growing vaults.
2. Why local-first still matters.
3. How sourced AI changes trust.
4. What a weekly maintenance loop can replace.

## Source pool

- [[Sources/Interview Notes - Knowledge Workers]]
- [[Drafts/Opening Draft]]

## Open questions

- [ ] Add one concrete before and after maintenance example.
- [ ] Decide whether the word "AI" should appear in the title.
`
      },
      {
        path: 'Sources/Interview Notes - Knowledge Workers.md',
        content: `---
title: Interview Notes - Knowledge Workers
type: source-note
status: processed
tags: [writing, interview, source]
---
# Interview Notes - Knowledge Workers

## Observations

- People trust Markdown because it stays usable outside a single app.
- Search works until the vault grows, then review and structure matter more.
- Users want AI to cite notes and admit when it did not find evidence.

## Pull quotes

> I do not need another inbox. I need help deciding what is worth cleaning up.

> If AI changes files, I want a preview and a way back.

## Links

- [[Projects/Essay - Local-first AI Workbench]]
- [[Drafts/Opening Draft]]

## Follow-up

- [ ] Extract one anecdote about broken links.
- [ ] Ask a second user about publish workflows.
`
      },
      {
        path: 'Drafts/Opening Draft.md',
        content: `---
title: Opening Draft
type: draft
status: rough
tags: [writing, draft]
---
# Opening Draft

A knowledge vault does not fail all at once. It slowly becomes harder to trust. Links point to missing notes, imported articles pile up without summaries, and the graph turns into a decoration instead of a working map.

Nexusky starts from a different assumption: the Markdown folder is already the product. AI should help maintain that folder, not replace it.

## Needed evidence

- [[Sources/Interview Notes - Knowledge Workers]] has the clearest quote about maintenance fatigue.
- [[Projects/Essay - Local-first AI Workbench]] holds the current thesis.

## Revision tasks

- [ ] Replace the first sentence if it sounds too abstract.
- [ ] Add one concrete maintenance action.
- [ ] Keep the draft under 900 words for the first publish pass.
`
      },
      {
        path: 'Reviews/2026-W22 Writing Review.md',
        content: `---
title: 2026-W22 Writing Review
type: weekly-review
status: open
tags: [writing, review]
---
# 2026-W22 Writing Review

## Progress

- The essay thesis is clear enough to draft.
- The interview source has two useful quotes.
- The opening now connects vault health with trust.

## Friction

- The publish angle is still too broad.
- The draft needs one sharper example from a real workflow.

## Next revision

- [ ] Turn [[Drafts/Opening Draft]] into a complete first section.
- [ ] Add a publish checklist to [[Projects/Essay - Local-first AI Workbench]].
- [ ] Ask AI to find unsupported claims before exporting.
`
      }
    ]
  },
  {
    id: 'developer',
    defaultVaultName: 'Nexusky Developer Sample',
    files: [
      {
        path: 'README.md',
        content: `---
title: Developer Knowledge Base Sample
workflow: developer
status: active
tags: [workflow, sample, developer]
---
# Developer Knowledge Base Sample

This vault demonstrates ADRs, debug notes, API notes, and weekly engineering review.

## Start here

- Read [[ADR/ADR-0001 Local SQLite Index]].
- Trace an incident in [[Debug/2026-06-01 Search Index Timeout]].
- Compare the publish contract in [[API/Publish Export Contract]].
- Review follow-ups in [[Reviews/2026-W22 Engineering Review]].

## Maintenance signals to inspect

- [ ] Link every debug note to an ADR or API note.
- [ ] Mark resolved incidents with status done.
- [ ] Promote repeated debug findings into an ADR update.
`
      },
      {
        path: 'ADR/ADR-0001 Local SQLite Index.md',
        content: `---
title: ADR-0001 Local SQLite Index
type: adr
status: accepted
tags: [developer, adr, index]
date: 2026-06-01
---
# ADR-0001 Local SQLite Index

## Context

Markdown files stay as source of truth, but graph, search, properties, maintenance, and AI retrieval need fast structured access.

## Decision

Use a local SQLite index under the vault metadata directory. Rebuild or repair it from Markdown files when needed.

## Consequences

- Queries are fast enough for graph and maintenance surfaces.
- The vault remains portable because the index is derived data.
- Watcher invalidation must be careful, or one file edit can trigger too much work.

## Related notes

- [[Debug/2026-06-01 Search Index Timeout]]
- [[API/Publish Export Contract]]
`
      },
      {
        path: 'Debug/2026-06-01 Search Index Timeout.md',
        content: `---
title: 2026-06-01 Search Index Timeout
type: debug-note
status: investigating
tags: [developer, debug, search]
severity: medium
---
# 2026-06-01 Search Index Timeout

## Symptom

Search status stayed pending after importing a large folder. The editor remained usable, but the search panel did not show a clear failure state.

## Hypothesis

The index rebuild work continued after the vault changed, and the UI accepted an older progress event.

## Evidence

- [[ADR/ADR-0001 Local SQLite Index]] says derived indexes can be rebuilt.
- The search panel needs a request boundary similar to file refresh.

## Next steps

- [ ] Add request ids to search progress updates.
- [ ] Show last successful indexed file count.
- [ ] Link this finding from the index ADR after resolution.
`
      },
      {
        path: 'API/Publish Export Contract.md',
        content: `---
title: Publish Export Contract
type: api-note
status: draft
tags: [developer, api, publish]
---
# Publish Export Contract

## Purpose

Static export turns selected Markdown notes into HTML, assets, search data, and access metadata.

## Contract

- Input: vault path, publish scope, access mode.
- Output: index page, note pages, assets, site data, manifest, access files.
- Safety: output paths must be normalized and cannot escape the chosen directory.

## Links

- [[ADR/ADR-0001 Local SQLite Index]]
- [[Reviews/2026-W22 Engineering Review]]

## Open tasks

- [ ] Add one test for deleting stale manifest files.
- [ ] Document private export limitations near hosted publish settings.
`
      },
      {
        path: 'Reviews/2026-W22 Engineering Review.md',
        content: `---
title: 2026-W22 Engineering Review
type: weekly-review
status: open
tags: [developer, review]
---
# 2026-W22 Engineering Review

## Shipped

- Local index ADR drafted.
- Publish contract notes captured.
- One search timeout investigation opened.

## Risks

- Watcher invalidation can become too broad.
- Derived data should never be treated as user-authored content.
- Export access mode needs clear copy because static hosting still controls real access.

## Follow-up

- [ ] Resolve [[Debug/2026-06-01 Search Index Timeout]].
- [ ] Update [[API/Publish Export Contract]] after the next export test.
- [ ] Ask AI for repeated risk themes across ADR and debug notes.
`
      }
    ]
  },
  {
    id: 'learning',
    defaultVaultName: 'Nexusky Learning Sample',
    files: [
      {
        path: 'README.md',
        content: `---
title: Learning Workflow Sample
workflow: learning
status: active
tags: [workflow, sample, learning]
---
# Learning Workflow Sample

This vault demonstrates course notes, concept notes, practice tasks, and weekly learning review.

## Start here

- Study [[Courses/Systems Thinking/01 Feedback Loops]].
- Connect it to [[Concepts/Spaced Repetition]].
- Try [[Practice/Linking Drill]].
- Reflect in [[Reviews/2026-W22 Learning Review]].

## Maintenance signals to inspect

- [ ] Add links from every lesson to one concept note.
- [ ] Move questions from lessons into practice notes.
- [ ] Review open tasks at the end of the week.
`
      },
      {
        path: 'Courses/Systems Thinking/01 Feedback Loops.md',
        content: `---
title: Feedback Loops
type: lesson
status: learning
tags: [learning, systems-thinking]
course: Systems Thinking
---
# Feedback Loops

## Goal

Understand how reinforcing and balancing loops shape long-term behavior.

## Notes

- A reinforcing loop amplifies change.
- A balancing loop pushes a system back toward a target.
- Knowledge maintenance can be seen as a balancing loop: review catches decay before search and trust get worse.

## Connections

- [[Concepts/Spaced Repetition]] uses review intervals as a balancing mechanism.
- [[Practice/Linking Drill]] turns the idea into a vault exercise.

## Questions

- [ ] Find one example of a reinforcing loop in personal knowledge work.
- [ ] Draw a simple loop for weekly review.
`
      },
      {
        path: 'Concepts/Spaced Repetition.md',
        content: `---
title: Spaced Repetition
type: concept
status: seed
tags: [learning, memory]
---
# Spaced Repetition

## Definition

Spaced repetition schedules review before forgetting becomes likely. In a knowledge vault, the same idea can apply to notes, links, and unresolved questions.

## Why it connects

- [[Courses/Systems Thinking/01 Feedback Loops]] describes balancing loops.
- Weekly review can use maintenance signals to decide what to revisit.
- Practice notes make the review concrete.

## Examples

- Revisit a concept after using it in a project.
- Turn a missed recall into a clearer note.
- Link a lesson to a source, a project, and a review.

## Follow-up

- [ ] Add one example from current work.
- [ ] Compare with flashcards without making flashcards the main workflow.
`
      },
      {
        path: 'Practice/Linking Drill.md',
        content: `---
title: Linking Drill
type: practice
status: open
tags: [learning, practice]
---
# Linking Drill

## Exercise

Pick one lesson note and add three useful links: one concept, one source or example, and one review note.

## Today

- Lesson: [[Courses/Systems Thinking/01 Feedback Loops]]
- Concept: [[Concepts/Spaced Repetition]]
- Review: [[Reviews/2026-W22 Learning Review]]

## Checklist

- [ ] Each link explains why it exists.
- [ ] At least one link crosses folders.
- [ ] The review note names what changed after the exercise.
`
      },
      {
        path: 'Reviews/2026-W22 Learning Review.md',
        content: `---
title: 2026-W22 Learning Review
type: weekly-review
status: open
tags: [learning, review]
---
# 2026-W22 Learning Review

## Learned

- Feedback loops are a useful way to describe vault maintenance.
- Spaced repetition can apply to concepts and links, not only cards.
- Practice notes help turn abstract ideas into behavior.

## Notes to strengthen

- [[Courses/Systems Thinking/01 Feedback Loops]]
- [[Concepts/Spaced Repetition]]
- [[Practice/Linking Drill]]

## Next week

- [ ] Add one source note about systems thinking.
- [ ] Ask AI to find concepts that lack examples.
- [ ] Convert one open question into a short practice drill.
`
      }
    ]
  }
]

export function getWorkflowSampleVault(id: WorkflowSampleVaultId): WorkflowSampleVault | null {
  return SAMPLE_WORKFLOW_VAULTS.find((sample) => sample.id === id) || null
}
