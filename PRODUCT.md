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



