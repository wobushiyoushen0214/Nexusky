# 10k+ Vault Performance Regression

This runbook keeps large-vault checks repeatable before release. It covers the core loop from opening a real Markdown vault through Health, Search, Graph, Maintenance, and Chat source preparation.

## Fixture

Generate a deterministic Markdown vault outside the repository:

```bash
pnpm fixture:large-vault -- --out /tmp/nexusky-10k-vault --notes 10000 --folders 80 --links-per-note 3 --force
```

The fixture contains:

- 10,000 Markdown notes distributed across 80 folders.
- Wikilinks, occasional unresolved links, frontmatter, Dataview-style inline fields, tags, and task lines.
- Long notes for split-note maintenance checks.
- Stale mtimes on a subset of notes for Health freshness checks.
- `.attachments/` sample files and `.nexusky-fixture.json` metadata.

Do not commit the generated vault.

## Optional Service Smoke

Run this before the manual UI pass to record baseline service timings:

```bash
NEXUSKY_PERF_VAULT=/tmp/nexusky-10k-vault pnpm test -- tests/large-vault-performance-smoke.test.ts
```

This indexes the vault and records core timings for:

- `indexVault`
- `scanVaultHealth`
- `lexicalSearch`

The smoke test is skipped unless `NEXUSKY_PERF_VAULT` is set.

For heavier service-level checks, include Graph and Maintenance:

```bash
NEXUSKY_PERF_VAULT=/tmp/nexusky-10k-vault NEXUSKY_PERF_INCLUDE_HEAVY=1 pnpm test -- tests/large-vault-performance-smoke.test.ts
```

The heavy mode records `getGraphData` and `gatherMaintenanceItems.links`. Use it when diagnosing a suspected regression rather than as the default pre-release smoke.

## Manual UI Pass

Record the environment first:

| Field | Value |
| --- | --- |
| Date |  |
| Commit |  |
| Nexusky version |  |
| OS / CPU / RAM |  |
| Fixture command |  |
| App mode | dev / packaged |

### 1. Open and Index

1. Start Nexusky.
2. Open `/tmp/nexusky-10k-vault`.
3. Record time until the file tree is usable.
4. Record time until indexing stops making visible progress.
5. Confirm the editor can open a note while indexing or shortly after indexing.

Pass signal:

- UI stays responsive.
- Index progress is visible or the app remains usable.
- No crash, blocked window, or silent indexing failure.

### 2. Vault Health

1. Open Vault Health.
2. Record time until Health Score and counts appear.
3. Confirm the score explanation shows concrete factors.
4. Confirm no AI Provider setup is required.

Pass signal:

- Health appears without forcing Chat or Provider setup.
- Counts are plausible for 10k+ notes.
- Score factors are understandable and stable after a second scan.

### 3. Search

Run these searches and record first-result latency:

| Query | Expected signal |
| --- | --- |
| `retrieval strategy` | Many fixture notes with source-check sections |
| `Fixture Note 04200` | Exact title match |
| `maintenance regression` | Broad full-text match |
| `Missing Fixture Target` | Unresolved-link fixture content |

Pass signal:

- Results appear without blocking typing.
- Exact title search returns the intended note near the top.
- Broad searches return varied files, not a blank state.

### 4. Graph

1. Open Graph.
2. Record first render time.
3. Switch through folder, semantic, group, and connection modes if available.
4. Pan and zoom for 30 seconds.

Pass signal:

- First render completes.
- Interaction remains usable after the graph worker settles.
- Mode changes do not freeze the shell.

### 5. Maintenance

1. Open Maintenance.
2. Record time until the first partial results appear.
3. Record time until all scan groups complete.
4. Switch to the links and tasks filters.
5. Preview one fix without applying it.

Pass signal:

- Partial results appear before the full scan completes.
- Queue items are sorted and actionable.
- Preview opens without writing files.

### 6. Chat Sources

1. Open Chat.
2. Ask: `Which notes discuss retrieval strategy and maintenance regression?`
3. Use outbound preview before sending.
4. Record source preparation time and preview contents.
5. If a Provider is configured, send once and confirm sources can be inspected.

Pass signal:

- Preview lists retrieved snippets and token estimate before any Provider call.
- Source preparation does not require scanning every file from scratch.
- Source rows point back to notes in the fixture.

## Result Template

| Area | Metric | Result | Pass / Follow-up |
| --- | --- | --- | --- |
| Open | File tree usable |  |  |
| Open | Index complete |  |  |
| Health | Score visible |  |  |
| Search | First result latency |  |  |
| Graph | First render |  |  |
| Maintenance | First partial result |  |  |
| Maintenance | Scan complete |  |  |
| Chat | Outbound preview ready |  |  |

Notes:

- Record follow-up issues with exact fixture command, commit, app mode, and screenshot or log excerpts.
- If a path is slow but visibly progresses and remains responsive, mark it as follow-up rather than failed.
- If the shell freezes, a view blocks unrelated navigation, or a scan silently fails, mark it failed.
