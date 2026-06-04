# Product

## Register

product

## Users

Nexusky is for people who maintain long-lived Markdown knowledge vaults on their own machine and want local-first notes, search, graph navigation, AI assistance, task workflows, and knowledge maintenance in one desktop app. Users are usually writing, reviewing, linking, importing, or cleaning up notes inside an active vault.

## Product Purpose

Nexusky keeps Markdown files as the source of truth while using SQLite indexes, graph views, long-context AI, and maintenance workflows to help users read, connect, edit, and preserve their knowledge over time. Success means the app feels trustworthy, fast, and clear even on real vaults with many files, folders, links, and AI-derived relationships.

## Brand Personality

Calm, capable, local-first. The product should feel like a precise workbench for personal knowledge rather than a cloud dashboard or a decorative AI demo.

## Anti-references

Avoid marketing-page decoration inside task surfaces, one-note dark SaaS styling, over-large cards, novelty controls, hidden critical relationships, and graph visuals that look like static folder diagrams instead of usable network maps.

## Design Principles

- Show real structure: make files, folders, explicit links, inferred links, and cross-directory relationships visible through distinct but restrained signals.
- Keep the workspace task-focused: controls should be familiar, compact, and predictable.
- Preserve local trust: emphasize the user-owned vault and avoid cloud-first visual metaphors.
- Scale down noise before hiding meaning: let users filter low-signal data, but do not conceal important relationships by default.
- Make AI-derived context explainable: distinguish inferred relationships from authored links without making the graph harder to scan.

## Accessibility & Inclusion

Use readable contrast in the dark theme, avoid relying on color alone for edge types, support reduced motion where practical, keep labels legible at normal zoom levels, and prefer standard keyboard and pointer affordances.

## Surface Decisions

Records of weight changes between primary navigation, command-only access, and removed surfaces. Each entry names the affected surface, the new home, and the reason. Keep edits append-only when the rationale is still load-bearing.

### 2026-05-28 — Kanban demoted from default ActivityBar

Kanban moved from `defaultVisible: true` to `defaultVisible: false` in the ActivityBar registry. Reason: most vaults don't run task workflows day-to-day, so the icon was occupying a slot that knowledge-first surfaces should keep. The Kanban view itself, IPC, and `mainView === 'kanban'` route are untouched — the panel is still reachable through the Command Palette (`Open task kanban`), the "Send to kanban" actions from Agent / Chat, and right-click "show item" on the ActivityBar. Existing users who had Kanban pinned keep it.

### 2026-05-28 — Kanban removed from ActivityBar registry

Follow-up to the demotion: existing users whose `activity-bar-store` already pinned `kanban` still saw the icon, so the entry is now removed from `ACTIVITY_BAR_REGISTRY` entirely. The store's `validIds` filter strips stale `'kanban'` ids on next load, both new and existing users get a Kanban-free activity bar. Same shape as the Agent removal: panel, IPC, `mainView === 'kanban'` route, and the Command Palette `Open task kanban` entry stay intact.

### 2026-05-28 — Agent removed from ActivityBar registry

The Agent right-panel entry is no longer enumerated in the ActivityBar registry, removing it from the "More" menu and the right-click customization list. Reason: the panel is a niche, multi-step Plan→Execute→Reflect surface that doesn't justify a primary-navigation slot when ChatPanel's `agentMode` already handles the common conversational case. Reach Agent through the Command Palette (`Open Agent panel`), Kanban's "Send to Agent" action, or Chat's "Send to Agent" reflection. The panel itself, `rightPanel === 'agent'` rendering, IPC, and engine in `packages/main/src/services/agent/*` remain unchanged; only the discovery icon is gone.

### 2026-05-28 — Canvas "space" layer dropped, keep properties + time

The Canvas (知识空间) view used to expose three layers — `space` (free-form spatial board with auto-routed edges), `properties` (group-by-tag), and `time` (group-by-updated-at). The `space` layer overlapped almost entirely with the dedicated knowledge graph view: both rendered nodes + relationship edges in a free-form layout. The graph is now the single canonical surface for that interaction, so the `space` layer is removed.

What stays: `properties` and `time` layers, including drag overrides, group labels, association suggestions, and the storage keys `:properties` / `:time`. The Canvas main entry (`ActivityBar`, `Ctrl+Shift+C`, Command Palette `Open knowledge space`) now opens the `properties` layer by default; the legacy `mainView === 'canvas'` value still loads (renders as `properties`) so saved workspace layouts don't regress. The `space`-only persisted positions are no longer read — users with legacy data will see notes laid out by the current layer instead of their old free-form spatial drag positions. The `buildArchivePositions` helper stays exported for tests.

Reason: avoid maintaining two view families that visually answer the same question ("how do my notes relate?") with the graph being the more capable one (better-tuned forces, color-by-folder, relation type filters, density controls). Properties / time stay because they answer different questions (group-by-attribute, group-by-recency) that the graph doesn't.

### 2026-05-30 - ActivityBar defaults tightened around the core loop

Canvas, Reader Inbox, Outline, and Tags moved from `defaultVisible: true` to `defaultVisible: false`. Reason: new users should first see the core vault loop: files, search, AI chat, graph, and maintenance. Canvas remains reachable through the More menu and Command Palette; Reader Inbox, Outline, and Tags remain available through customization and context-specific panels. Existing users who already customized their ActivityBar keep their saved `visibleIds`, so this only changes the default for fresh workspaces or reset-to-defaults.

### 2026-05-30 - Agent wording moved behind reviewable execution

Agent remains available through advanced command palette and task hand-off paths, but it is no longer treated as a first-run or marketing headline. Reason: Agent is an execution mechanism, not the product's primary user promise. Default copy now emphasizes cited AI answers, reviewable actions, preview-first workflows, maintenance queues, and execution history instead of asking new users to understand Agent as a standalone surface.

### 2026-05-31 - Kanban standalone surface removed

Kanban is no longer a user-facing main view. The renderer route, command palette entry, standalone panel component, Agent "send to Kanban" hand-off, and Chat auto-Kanban intent path were removed. Legacy saved workspace layouts with `mainView === 'kanban'` now reopen in the editor instead of loading a retired route.

What stays for this pass: `kanban_*` SQLite tables, shared IPC contracts, and main-process handlers. Reason: existing vaults may contain historical task data, and long-context maintenance still reads those rows as supporting signals. The product should not advertise a task-board workflow while the core value is note writing, search, graphing, AI review, and knowledge maintenance.

### 2026-05-31 - Flashcards removed from visible AI commands

Flashcards are no longer exposed through the Command Palette or a renderer review modal. The `AI generate review flashcards` and `Review due flashcards` commands, the `open-flashcard-review` event listener, the review panel component, and related renderer i18n strings were removed.

What stays for this pass: `ai:generate-flashcards`, `flashcards:list-due`, `flashcards:review`, and the Markdown parsing / SRS helpers remain in the main process. Reason: existing notes may already contain flashcard blocks, and the backend helpers are covered by focused tests, but the visible SRS workflow is too niche for the product's current core loop.

### 2026-05-31 - Reader Inbox standalone route removed

Reader Inbox is no longer exposed as an ActivityBar item, Command Palette command, or `mainView` route. Imported Readwise, Pocket, and Notion content remains accessible as normal Markdown notes through Files, Search, Graph, and the Properties view. Legacy saved workspace layouts with `mainView === 'reader'` now reopen in the editor.

What stays for this pass: reader importers, reader metadata helpers, and the existing reader helper tests remain. Reason: import is still useful, but a separate triage surface competes with the core note workflow when imported items are already first-class notes.

### 2026-05-31 - Calendar and Daily Note visible entries removed

Calendar and Daily Note are no longer exposed as ActivityBar items, a Command Palette daily-note command, or a Calendar right-panel surface. They were two variants of the same date-based workflow: open or create notes by date. That workflow overlaps with Files, Search, and Timeline.

What stays for this pass: the `template:daily-note` IPC remains for compatibility with existing template behavior or future explicit automation. Legacy saved `rightPanel === 'calendar'` layouts now reopen with no right panel.

### 2026-05-31 - Generic Knowledge Space entry removed

The product no longer exposes `Knowledge Space` as a standalone surface. The ActivityBar `canvas` item, Command Palette `Open knowledge space` command, `Ctrl+Shift+C` keybinding, and `mainView === 'canvas'` route were removed. Legacy saved `canvas` layouts now reopen in `bases`.

What stays: the underlying `CanvasView` layout engine still powers the explicit `Properties View` and `Timeline` surfaces. Reason: Graph is now the only relationship-map surface. Properties View answers "what metadata do my notes have?", and Timeline answers "what changed when?", so the generic spatial metaphor is unnecessary and confusing.

### 2026-05-31 - Agent execution enters the maintenance loop

Agent remains out of primary navigation, but it now has a concrete product role inside Knowledge Maintenance: the queue can hand off the highest-priority items as a reviewable Agent run. Reason: Agent should be discovered when execution is useful, not as a standalone promise. The workflow is maintenance item -> plan -> preview -> execute -> rollback, with structured step kinds for links, tags, frontmatter, file moves, trash, and merges.

Weekly Cognitive Review also lives in the maintenance surface. Reason: the weekly return habit belongs near maintenance and context quality, not in a separate calendar or dashboard surface.

### 2026-06-03 - Website leads with vault health, not abstract AI

The public homepage now starts with a vault health demo: open a Markdown vault, see the health score, handle three prioritized maintenance actions, and ask with sources. Reason: the product promise should be the trust loop from the development plan, not a generic AI knowledge-base headline.

Workflow packs are framed as activation aids, not paid gates. Research, Writing, Developer, and Learning samples should help users understand a healthy vault quickly. Local vaults, sample vaults, search, graph, Vault Health, Maintenance, bring-your-own AI providers, and bring-your-own sync remain the default path. Managed sync, hosted backup, and hosted publish remain future paid add-on candidates only after recovery and trust boundaries are strong.

### 2026-06-04 - Sourced chat separated from Vault tools

Chat opens in normal cited-answer mode by default. Vault Health Ask AI, the Command Palette sourced-question command, the first chat hint, and legacy Reader digest drafts now explicitly use ordinary RAG chat instead of Agent tool calling. Reason: `ai:chat` already performs local retrieval, source citation, and long-context injection; defaulting these prompts to Agent made the product feel like an automation agent instead of a trustworthy personal Markdown vault assistant.

Agent/tool calling remains available as an opt-in `Vault tools` control inside Chat and as the reviewable Maintenance -> Agent execution path. Local bundled plugin/template packs are described as bundled local packs, not as a marketplace.

### 2026-06-04 - No-AI boundaries name Vault tools, not Agent actions

No-AI copy now says local Files, Search, Graph, Vault Health, and Maintenance remain available without a provider. Provider-required work is described as AI chat, AI edit, Vault tools, Memory generation, or reviewable execution. Reason: the product boundary should explain capability requirements without re-promoting Agent as the default mental model.

Vault Health's Ask AI prompt now asks for local search plus Context Pack, not local search/tools, because the action uses ordinary cited chat.

### 2026-06-04 - Vault tools are provider-capability driven

The Chat `Vault tools` control now follows the active provider's `capabilities.toolCalling`. If no provider is enabled, no vault is open, or the active provider cannot call tools, the control stays disabled and stored tool mode is cleared only after provider capability has been checked. Reason: users should not discover provider limits only after sending a request, and unsupported providers should keep the default cited-answer path.

### 2026-06-04 - Properties and command surfaces stay under Markdown boundaries

Properties View remains a Markdown/frontmatter view, not an object database surface. The command palette now finds it through properties, frontmatter, metadata, and Obsidian terms instead of `database`. The public website also names direct non-chat actions as Command Palette checks, not a top-level Tool Surface. Reason: Properties and direct commands should support the vault workflow without making users learn a database or tool-platform mental model.

### 2026-06-04 - Default search copy names local relevance, not semantic search

The public website now describes the default search path as full-text search plus local relevance ranking. True embedding or hybrid semantic retrieval remains an evaluation/opt-in direction, not a default user promise. Reason: default search should match the actual local FTS and lexical-ranking behavior without implying hidden embedding or provider-backed semantic search.

### 2026-06-04 - Public metadata follows the vault workbench story

Website metadata and the root package description now name Nexusky as a local Markdown vault workbench rather than an AI-powered knowledge base. Reason: public snippets should match the product's first promise: open a real vault, inspect health, ask with sources, and preview writes before AI changes files.
