# Feature Pruning Plan, 2026-05

This document records product surfaces that can be removed or reduced because they distract from the core vault loop: write, search, link, review, and maintain notes.

## Deletion Policy

- Remove visible routes, commands, and hand-off buttons before deleting storage or IPC.
- Keep existing SQLite tables and backend handlers during the first pruning pass when they may contain user data or are read by maintenance workflows.
- Update `PRODUCT.md` for every surface decision that changes user-facing navigation.
- Verify each pruning item with focused checks and `pnpm typecheck`. Do not run ESLint for this pass.
- Commit each completed pruning item separately.

## Candidates

| ID | Surface | Decision | Rationale | Status |
| --- | --- | --- | --- | --- |
| P1 | Kanban standalone board | Remove user-facing route, command, and hand-off entry points; keep database and IPC compatibility. | Task boards are not part of the everyday knowledge-vault loop, and the panel was already demoted from primary navigation. | Planned |
| P2 | Flashcards | Remove visible command palette and review modal entry points; keep backend handlers initially. | SRS is a niche workflow that adds product weight without supporting the main read-link-maintain loop for most users. | Candidate |
| P3 | Reader Inbox | Keep for now, but make it conditional or secondary if imported reading is not configured. | Useful for some vaults, but it should not compete with core note work by default. | Candidate |
| P4 | Canvas / Timeline overlap | Revisit after P1-P2. | Some views answer adjacent questions; deletion needs stronger migration analysis. | Candidate |

## Execution Log

### 2026-05-31

- Opened pruning pass after the ActivityBar cleanup. First item is P1 because Kanban already lost default navigation weight and can be removed from visible product flow without deleting historical task data.
