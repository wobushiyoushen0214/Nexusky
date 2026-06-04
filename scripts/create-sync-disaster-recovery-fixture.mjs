import { createHash } from 'node:crypto'
import { mkdir, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const BASE_TIME = new Date('2026-06-01T10:00:00.000Z')
const OLDER_TIME = new Date('2026-06-01T09:00:00.000Z')
const LOCAL_NEWER_TIME = new Date('2026-06-01T12:00:00.000Z')
const REMOTE_NEWER_TIME = new Date('2026-06-01T13:00:00.000Z')
const CONFLICT_LOCAL_TIME = new Date('2026-06-01T14:00:00.000Z')
const CONFLICT_REMOTE_TIME = new Date('2026-06-01T14:00:03.000Z')

export function parseArgs(argv) {
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      index += 1
    }
  }
  return flags
}

function md(title, body) {
  return `---\ntitle: ${title}\nstatus: active\n---\n\n# ${title}\n\n${body}\n`
}

function md5(content) {
  return createHash('md5').update(content).digest('hex')
}

export function buildSyncDisasterRecoveryScenarios() {
  return [
    {
      id: 'remote-delete',
      relPath: 'Notes/Remote Deleted.md',
      label: 'Remote deletion should move local copy to .trash',
      baseline: md('Remote Deleted', 'Baseline copy before another device deleted it remotely.'),
      local: md('Remote Deleted', 'Baseline copy before another device deleted it remotely.'),
      remote: null,
      localMtime: BASE_TIME,
      remoteMtime: null,
      expectedPlan: 'deleteLocal'
    },
    {
      id: 'local-delete',
      relPath: 'Notes/Local Deleted.md',
      label: 'Local deletion should delete the remote copy',
      baseline: md('Local Deleted', 'Baseline copy before this device deleted it locally.'),
      local: null,
      remote: md('Local Deleted', 'Baseline copy before this device deleted it locally.'),
      localMtime: null,
      remoteMtime: BASE_TIME,
      expectedPlan: 'deleteRemote'
    },
    {
      id: 'remote-older',
      relPath: 'Notes/Remote Older.md',
      label: 'A stale remote object should be replaced by the newer local copy',
      baseline: md('Remote Older', 'Baseline before the local device kept writing.'),
      local: md('Remote Older', 'Newer local draft that must not be overwritten by stale remote content.'),
      remote: md('Remote Older', 'Older remote content that should be replaced.'),
      localMtime: LOCAL_NEWER_TIME,
      remoteMtime: OLDER_TIME,
      expectedPlan: 'push'
    },
    {
      id: 'remote-overwrite',
      relPath: 'Notes/Remote Overwrite.md',
      label: 'A newer remote object may overwrite local content only after history snapshot',
      baseline: md('Remote Overwrite', 'Baseline before another device edited the note.'),
      local: md('Remote Overwrite', 'Local draft that should be recoverable from .history.'),
      remote: md('Remote Overwrite', 'Newer remote edit that should land in the vault.'),
      localMtime: OLDER_TIME,
      remoteMtime: REMOTE_NEWER_TIME,
      expectedPlan: 'pull'
    },
    {
      id: 'conflict',
      relPath: 'Notes/Conflict.md',
      label: 'Near-simultaneous edits should stop as a conflict',
      baseline: md('Conflict', 'Baseline before both devices edited.'),
      local: md('Conflict', 'Local concurrent edit that must not be overwritten.'),
      remote: md('Conflict', 'Remote concurrent edit that must not overwrite local content automatically.'),
      localMtime: CONFLICT_LOCAL_TIME,
      remoteMtime: CONFLICT_REMOTE_TIME,
      expectedPlan: 'conflict'
    }
  ]
}

async function assertWritableTarget(outDir, force) {
  try {
    const info = await stat(outDir)
    if (!info.isDirectory()) throw new Error(`Target exists and is not a directory: ${outDir}`)
    const entries = await readdir(outDir)
    if (entries.length > 0 && !force) {
      throw new Error(`Target directory is not empty. Re-run with --force to replace it: ${outDir}`)
    }
    if (entries.length > 0) await rm(outDir, { recursive: true, force: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await mkdir(outDir, { recursive: true })
}

async function writeFixtureFile(baseDir, relPath, content, mtime) {
  const fullPath = join(baseDir, relPath)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, 'utf8')
  await utimes(fullPath, mtime, mtime)
}

export async function createSyncDisasterRecoveryFixture(options) {
  const outDir = resolve(options.out)
  const startedAt = performance.now()
  await assertWritableTarget(outDir, options.force === true)

  const vaultPath = join(outDir, 'vault')
  const remotePath = join(outDir, 'remote')
  await mkdir(vaultPath, { recursive: true })
  await mkdir(remotePath, { recursive: true })

  const scenarios = buildSyncDisasterRecoveryScenarios()
  const manifest = {}
  for (const scenario of scenarios) {
    manifest[scenario.relPath] = { hash: md5(scenario.baseline) }
    if (scenario.local) await writeFixtureFile(vaultPath, scenario.relPath, scenario.local, scenario.localMtime)
    if (scenario.remote) await writeFixtureFile(remotePath, scenario.relPath, scenario.remote, scenario.remoteMtime)
  }

  const metadata = {
    kind: 'nexusky-sync-disaster-recovery-fixture',
    generatedAt: new Date().toISOString(),
    vaultPath,
    remotePath,
    manifest,
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      relPath: scenario.relPath,
      label: scenario.label,
      expectedPlan: scenario.expectedPlan
    }))
  }

  await writeFile(join(outDir, 'baseline-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(join(outDir, 'README.md'), [
    '# Nexusky Sync Disaster Recovery Fixture',
    '',
    'This fixture uses local directories only. `vault/` represents the local vault and `remote/` represents a remote provider root.',
    '',
    'Expected recovery checks:',
    ...metadata.scenarios.map((scenario) => `- ${scenario.relPath}: ${scenario.label}`),
    '',
    'Use `baseline-manifest.json` as the last successful sync baseline when running the drill.'
  ].join('\n'), 'utf8')
  await writeFile(join(outDir, '.nexusky-sync-disaster-fixture.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

  return {
    outDir,
    vaultPath,
    remotePath,
    manifest,
    scenarios: metadata.scenarios,
    durationMs: Math.round(performance.now() - startedAt)
  }
}

function printHelp() {
  console.log(`Create a local sync disaster recovery fixture.

Usage:
  node scripts/create-sync-disaster-recovery-fixture.mjs --out /tmp/nexusky-sync-drill [--force]
`)
}

export async function run(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv)
  if (flags.help || !flags.out || flags.out === true) {
    printHelp()
    return flags.help ? 0 : 1
  }
  const result = await createSyncDisasterRecoveryFixture({
    out: flags.out,
    force: flags.force === true
  })
  console.log(`Created sync disaster recovery fixture in ${result.outDir}`)
  console.log(`Vault: ${result.vaultPath}`)
  console.log(`Remote: ${result.remotePath}`)
  console.log(`Scenarios: ${result.scenarios.length}; duration: ${result.durationMs}ms`)
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((code) => {
    process.exit(code)
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
