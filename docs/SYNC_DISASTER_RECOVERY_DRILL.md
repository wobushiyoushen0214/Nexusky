# Sync Disaster Recovery Drill

This runbook verifies that sync failures stay recoverable before Nexusky offers managed backup or paid hosted sync.

## Scope

The drill uses local directories only:

- `vault/` is the local Markdown vault.
- `remote/` is a fake remote provider root.
- `baseline-manifest.json` is the last successful sync baseline.

It covers five recovery cases:

| Case | Expected plan | Recovery expectation |
| --- | --- | --- |
| Remote deleted a file that still exists locally | `deleteLocal` | The local file moves to `.trash` with original-path metadata. |
| Local deleted a file that still exists remotely | `deleteRemote` | The remote copy is removed, not resurrected locally. |
| Remote has an older version | `push` | The newer local copy replaces the stale remote object. |
| Remote has a newer version | `pull` | The local Markdown is overwritten only after a `.history` snapshot is saved. |
| Both sides changed near-simultaneously | `conflict` | No automatic overwrite runs; both versions remain in place. |

## Generate Fixture

```bash
pnpm fixture:sync-disaster-recovery -- --out /tmp/nexusky-sync-drill --force
```

Generated files:

- `/tmp/nexusky-sync-drill/vault`
- `/tmp/nexusky-sync-drill/remote`
- `/tmp/nexusky-sync-drill/baseline-manifest.json`
- `/tmp/nexusky-sync-drill/.nexusky-sync-disaster-fixture.json`

The fixture does not touch real sync credentials, configured providers, or user vaults.

## Automated Drill

```bash
pnpm test -- tests/sync-disaster-recovery.test.ts tests/sync-reconcile.test.ts tests/sync-execute.test.ts tests/version-recovery.test.ts
pnpm typecheck
```

The automated test uses the fixture with a local fake provider, then runs existing `planSync` and `executeSyncPlan` code. Passing criteria:

- `Notes/Remote Deleted.md` is gone from `vault/` and present in `vault/.trash` with `reason: sync_remote_delete`.
- `Notes/Local Deleted.md` is gone from `remote/`.
- `remote/Notes/Remote Older.md` contains the newer local draft.
- `vault/Notes/Remote Overwrite.md` contains the newer remote edit.
- `vault/.history/Notes/Remote Overwrite_*.md` contains the local draft that was overwritten.
- `Notes/Conflict.md` remains different in `vault/` and `remote/`; it appears in `plan.conflicts`.

## Manual Inspection

After generating a fixture, inspect the scenario metadata:

```bash
cat /tmp/nexusky-sync-drill/.nexusky-sync-disaster-fixture.json
```

Use the listed `relPath` values to inspect each local/remote pair. The fixture is intentionally small so a maintainer can compare files directly before or after adding new provider behavior.

## Regression Rule

Do not advance a provider manifest after a sync run with errors. A failed or conflicting run must leave the previous baseline intact so the next run cannot reinterpret unresolved data as a clean deletion or addition.
