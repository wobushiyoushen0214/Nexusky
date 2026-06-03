import { mkdir, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const DEFAULT_NOTES = 10_000
const DEFAULT_FOLDERS = 80
const DEFAULT_LINKS_PER_NOTE = 3
const STALE_MTIME = new Date('2025-01-01T00:00:00.000Z')
const CURRENT_MTIME = new Date('2026-06-01T00:00:00.000Z')

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

function toPositiveInteger(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function noteTitle(index) {
  return `Fixture Note ${String(index).padStart(5, '0')}`
}

function folderName(index, folderCount) {
  return `Area ${String(index % folderCount).padStart(2, '0')}`
}

function dateForIndex(index) {
  const day = (index % 28) + 1
  return `2026-06-${String(day).padStart(2, '0')}`
}

export function buildFixtureNote(index, options = {}) {
  const totalNotes = toPositiveInteger(options.notes, DEFAULT_NOTES)
  const linksPerNote = toPositiveInteger(options.linksPerNote, DEFAULT_LINKS_PER_NOTE)
  const folderCount = toPositiveInteger(options.folders, DEFAULT_FOLDERS)
  const title = noteTitle(index)
  const links = []
  for (let offset = 1; offset <= linksPerNote; offset += 1) {
    const target = ((index + offset * 17 - 1) % totalNotes) + 1
    links.push(`[[${noteTitle(target)}]]`)
  }
  if (index % 37 === 0) links.push(`[[Missing Fixture Target ${index}]]`)

  const area = folderName(index, folderCount).replace(' ', '-').toLowerCase()
  const project = `project-${String(index % 25).padStart(2, '0')}`
  const dueDate = dateForIndex(index)
  const task = index % 5 === 0
    ? `- [ ] Review source cluster ${index} due ${dueDate} #task/priority`
    : `- [x] Indexed fixture note ${index}`
  const longBlock = index % 41 === 0
    ? '\n## Deep Context\n\n' + Array.from({ length: 28 }, (_, paragraph) => `Paragraph ${paragraph + 1} tracks retrieval strategy, source quality, graph density and maintenance regression for fixture note ${index}.`).join('\n\n')
    : ''

  return `---\n` +
    `tags:\n` +
    `  - nexusky-fixture\n` +
    `  - ${area}\n` +
    `project: ${project}\n` +
    `status: ${index % 11 === 0 ? 'stale' : 'active'}\n` +
    `priority: ${index % 4}\n` +
    `---\n\n` +
    `# ${title}\n\n` +
    `area:: ${area}\n` +
    `project:: ${project}\n` +
    `reviewed:: ${dueDate}\n\n` +
    `This note is part of the Nexusky 10k vault performance regression fixture. It contains retrieval strategy language, graph links, task signals and metadata for repeatable large-vault checks.\n\n` +
    `Related notes: ${links.join(', ')}\n\n` +
    `${task}\n\n` +
    `## Source Check\n\n` +
    `Use this section for Chat source preparation and search queries. Query terms: retrieval strategy, source quality, maintenance regression, graph density.\n` +
    longBlock +
    `\n`
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

export async function createLargeVaultFixture(options) {
  const outDir = resolve(options.out)
  const notes = toPositiveInteger(options.notes, DEFAULT_NOTES)
  const folders = toPositiveInteger(options.folders, DEFAULT_FOLDERS)
  const linksPerNote = toPositiveInteger(options.linksPerNote, DEFAULT_LINKS_PER_NOTE)
  const startedAt = performance.now()
  await assertWritableTarget(outDir, options.force === true)

  const createdFolders = new Set()
  for (let index = 1; index <= notes; index += 1) {
    const folder = join(outDir, folderName(index, folders))
    if (!createdFolders.has(folder)) {
      await mkdir(folder, { recursive: true })
      createdFolders.add(folder)
    }
    const filePath = join(folder, `${noteTitle(index)}.md`)
    await writeFile(filePath, buildFixtureNote(index, { notes, folders, linksPerNote }), 'utf8')
    await utimes(filePath, index % 11 === 0 ? STALE_MTIME : CURRENT_MTIME, index % 11 === 0 ? STALE_MTIME : CURRENT_MTIME)
  }

  const attachmentDir = join(outDir, '.attachments')
  await mkdir(attachmentDir, { recursive: true })
  for (let index = 1; index <= Math.min(100, Math.ceil(notes / 100)); index += 1) {
    await writeFile(join(attachmentDir, `fixture-asset-${String(index).padStart(3, '0')}.txt`), `Fixture attachment ${index}\n`, 'utf8')
  }

  await writeFile(join(outDir, '.nexusky-fixture.json'), JSON.stringify({
    kind: 'nexusky-large-vault-fixture',
    notes,
    folders,
    linksPerNote,
    generatedAt: new Date().toISOString()
  }, null, 2), 'utf8')

  return {
    outDir,
    notes,
    folders,
    linksPerNote,
    durationMs: Math.round(performance.now() - startedAt)
  }
}

function printHelp() {
  console.log(`Create a deterministic large Markdown vault for Nexusky performance regression.

Usage:
  node scripts/create-large-vault-fixture.mjs --out /tmp/nexusky-10k-vault [--notes 10000] [--folders 80] [--links-per-note 3] [--force]
`)
}

export async function run(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv)
  if (flags.help || !flags.out || flags.out === true) {
    printHelp()
    return flags.help ? 0 : 1
  }
  const result = await createLargeVaultFixture({
    out: flags.out,
    notes: flags.notes,
    folders: flags.folders,
    linksPerNote: flags['links-per-note'],
    force: flags.force === true
  })
  console.log(`Created ${result.notes} notes in ${result.outDir}`)
  console.log(`Folders: ${result.folders}; links per note: ${result.linksPerNote}; duration: ${result.durationMs}ms`)
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
