import { getDatabase } from './database'
import { scanVaultHealth } from './vault-health'
import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export interface SampleVault {
  id: string
  name: string
  description: string
  noteCount: number
  scenario: 'research' | 'developer' | 'writer'
  path?: string
}

export interface TransformationFix {
  type: 'resolve-link' | 'connect-island' | 'add-property' | 'organize-folder'
  count: number
  examples: string[]
}

export interface VaultStats {
  noteCount: number
  linkCount: number
  unresolvedLinkCount: number
  orphanCount: number
  duplicateTitleCount: number
  missingPropertyCount: number
  healthScore: number
}

export interface TransformationResult {
  vaultId: string
  status: 'running' | 'completed' | 'failed'
  progress: number
  beforeStats: VaultStats
  afterStats?: VaultStats
  fixes: TransformationFix[]
  durationMs?: number
  error?: string
}

export function getSampleVaults(): SampleVault[] {
  return [
    {
      id: 'research-500',
      name: 'Research Vault',
      description: '500 research papers with severe broken links and isolated notes',
      noteCount: 500,
      scenario: 'research'
    },
    {
      id: 'developer-300',
      name: 'Developer Vault',
      description: '300 technical notes scattered across multiple folders',
      noteCount: 300,
      scenario: 'developer'
    },
    {
      id: 'writer-200',
      name: 'Writer Vault',
      description: '200 drafts and ideas mixed together without clear structure',
      noteCount: 200,
      scenario: 'writer'
    }
  ]
}

export async function runTransformation(vaultPath: string, vaultId: string): Promise<TransformationResult> {
  const startTime = Date.now()

  try {
    const beforeStats = await getVaultStats(vaultPath)

    const fixes: TransformationFix[] = []

    // Fix 1: Resolve broken links by creating stub notes
    const resolvedCount = await resolveBrokenLinks(vaultPath)
    if (resolvedCount > 0) {
      fixes.push({
        type: 'resolve-link',
        count: resolvedCount,
        examples: [`Created ${resolvedCount} stub notes for broken links`]
      })
    }

    // Fix 2: Connect orphan notes by adding strategic links
    const connectedCount = await connectOrphanNotes(vaultPath)
    if (connectedCount > 0) {
      fixes.push({
        type: 'connect-island',
        count: connectedCount,
        examples: [`Connected ${connectedCount} isolated notes to the knowledge graph`]
      })
    }

    // Fix 3: Add missing properties
    const propertiesAdded = await addMissingProperties(vaultPath, vaultId)
    if (propertiesAdded > 0) {
      fixes.push({
        type: 'add-property',
        count: propertiesAdded,
        examples: [`Added missing metadata to ${propertiesAdded} notes`]
      })
    }

    const afterStats = await getVaultStats(vaultPath)

    return {
      vaultId,
      status: 'completed',
      progress: 100,
      beforeStats,
      afterStats,
      fixes,
      durationMs: Date.now() - startTime
    }
  } catch (error) {
    return {
      vaultId,
      status: 'failed',
      progress: 0,
      beforeStats: await getVaultStats(vaultPath),
      fixes: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function getVaultStats(vaultPath: string): Promise<VaultStats> {
  const db = getDatabase(vaultPath)
  const healthSummary = scanVaultHealth(vaultPath)

  const propertyRow = db.prepare(`
    SELECT COUNT(DISTINCT note_id) as withProps FROM note_properties
  `).get() as { withProps: number }

  const missingPropertyCount = Math.max(0, healthSummary.noteCount - propertyRow.withProps)

  return {
    noteCount: healthSummary.noteCount,
    linkCount: healthSummary.linkCount,
    unresolvedLinkCount: healthSummary.unresolvedLinkCount,
    orphanCount: healthSummary.orphanCount,
    duplicateTitleCount: healthSummary.duplicateTitleCount,
    missingPropertyCount,
    healthScore: healthSummary.score
  }
}

async function resolveBrokenLinks(vaultPath: string): Promise<number> {
  const db = getDatabase(vaultPath)

  const brokenLinks = db.prepare(`
    SELECT DISTINCT target FROM links
    WHERE target_note_id IS NULL AND target NOT LIKE '%/%'
    LIMIT 50
  `).all() as { target: string }[]

  let resolved = 0
  for (const { target } of brokenLinks) {
    const stubPath = join(vaultPath, `${target}.md`)
    const stubContent = `---
tags:
  - stub
  - needs-content
---

# ${target}

This note was automatically created to resolve a broken link.

## TODO

- Add content
- Link to related notes
`
    try {
      await writeFile(stubPath, stubContent, 'utf8')
      resolved++
    } catch {
      // Skip if file creation fails
    }
  }

  return resolved
}

async function connectOrphanNotes(vaultPath: string): Promise<number> {
  const db = getDatabase(vaultPath)

  const orphans = db.prepare(`
    SELECT id, title, file_path FROM notes
    WHERE id NOT IN (SELECT source_note_id FROM links WHERE target_note_id IS NOT NULL)
      AND id NOT IN (SELECT target_note_id FROM links WHERE target_note_id IS NOT NULL)
    LIMIT 40
  `).all() as { id: string; title: string; file_path: string }[]

  const hubNotes = db.prepare(`
    SELECT n.id, n.title, n.file_path, COUNT(l.id) as linkCount
    FROM notes n
    JOIN links l ON n.id = l.source_note_id OR n.id = l.target_note_id
    GROUP BY n.id
    ORDER BY linkCount DESC
    LIMIT 5
  `).all() as { id: string; title: string; file_path: string; linkCount: number }[]

  if (hubNotes.length === 0) return 0

  let connected = 0
  for (const orphan of orphans) {
    const hub = hubNotes[connected % hubNotes.length]
    try {
      const fullPath = join(vaultPath, orphan.file_path)
      let content = await readFile(fullPath, 'utf8')

      if (!content.includes('## See Also')) {
        content += `\n\n## See Also\n\n- [[${hub.title}]]\n`
        await writeFile(fullPath, content, 'utf8')
        connected++
      }
    } catch {
      // Skip on error
    }
  }

  return connected
}

async function addMissingProperties(vaultPath: string, vaultId: string): Promise<number> {
  const db = getDatabase(vaultPath)

  const notesWithoutProps = db.prepare(`
    SELECT id, title, file_path FROM notes
    WHERE id NOT IN (SELECT DISTINCT note_id FROM note_properties)
    LIMIT 100
  `).all() as { id: string; title: string; file_path: string }[]

  const scenario = vaultId.startsWith('research') ? 'research'
    : vaultId.startsWith('developer') ? 'developer'
    : 'writer'

  let added = 0
  for (const note of notesWithoutProps) {
    try {
      const fullPath = join(vaultPath, note.file_path)
      let content = await readFile(fullPath, 'utf8')

      if (content.startsWith('---\n')) {
        const endIndex = content.indexOf('---\n', 4)
        if (endIndex > 0) {
          const frontmatter = content.slice(0, endIndex + 4)
          const body = content.slice(endIndex + 4)

          let newFrontmatter = frontmatter.slice(0, -4)
          if (scenario === 'research' && !frontmatter.includes('reviewed:')) {
            newFrontmatter += `reviewed: ${new Date().toISOString().slice(0, 10)}\n`
          } else if (scenario === 'developer' && !frontmatter.includes('reviewed:')) {
            newFrontmatter += `reviewed: ${new Date().toISOString().slice(0, 10)}\n`
          } else if (scenario === 'writer' && !frontmatter.includes('reviewed:')) {
            newFrontmatter += `reviewed: ${new Date().toISOString().slice(0, 10)}\n`
          }
          newFrontmatter += '---\n'

          if (newFrontmatter !== frontmatter) {
            await writeFile(fullPath, newFrontmatter + body, 'utf8')
            added++
          }
        }
      }
    } catch {
      // Skip on error
    }
  }

  return added
}
