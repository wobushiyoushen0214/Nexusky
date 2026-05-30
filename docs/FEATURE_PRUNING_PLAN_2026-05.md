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
| P1 | Kanban standalone board | Remove user-facing route, command, and hand-off entry points; keep database and IPC compatibility. | Task boards are not part of the everyday knowledge-vault loop, and the panel was already demoted from primary navigation. | Completed |
| P2 | Flashcards | Remove visible command palette and review modal entry points; keep backend handlers initially. | SRS is a niche workflow that adds product weight without supporting the main read-link-maintain loop for most users. | Completed |
| P3 | Reader Inbox | Remove standalone route, ActivityBar item, and Command Palette entry; keep importers and metadata helpers. | Imported reading content is already Markdown note content, so a separate triage surface should not compete with Files, Search, Graph, and Properties View. | Completed |
| P4 | Generic Knowledge Space / Canvas entry | Remove generic `canvas` entry, shortcut, command, and main-view route; keep explicit Properties View and Timeline. | Graph is the only relationship-map surface; properties and time are structured browsing modes, not another "space". | Completed |
| P5 | Calendar / Daily Note | Remove ActivityBar entries, Calendar right panel, and Daily Note command; keep `template:daily-note` IPC compatibility. | Both are date-based note entry points and overlap with Files, Search, and Timeline. | Completed |

## Execution Log

### 2026-05-31

- Opened pruning pass after the ActivityBar cleanup. First item is P1 because Kanban already lost default navigation weight and can be removed from visible product flow without deleting historical task data.
- Completed P1 implementation: removed the renderer `kanban` main view, deleted the standalone Kanban panel component, removed the Command Palette entry, removed Agent and Chat hand-off paths, and mapped stale saved `kanban` layouts back to `editor`. Backend tables and IPC remain for compatibility.
- Completed P2 implementation: removed flashcard generation and review commands from the Command Palette, removed the review modal entry event and component, and removed renderer flashcard i18n. Backend handlers and Markdown/SRS helpers remain for compatibility with existing note content.
- Completed P3 implementation: removed the `reader` main view, ActivityBar registry entry, Command Palette entry, App route, and active-state handling. Existing `reader` workspace layouts map to `editor`; importers and reader helper code stay available for imported Markdown compatibility.
- Completed P5 implementation: removed Calendar and Daily Note ActivityBar entries, the Calendar right-panel route/component, the daily-note Command Palette entry, and related renderer i18n. Existing `calendar` right-panel layouts map to `none`; `template:daily-note` IPC remains for compatibility.
- Completed P4 implementation: removed the generic `canvas` ActivityBar item, Command Palette entry, keybinding, and `mainView` route. Existing `canvas` workspace layouts map to `bases`; remaining user-facing surfaces are Graph, Properties View, and Timeline.
