import { mkdir, writeFile, utimes } from 'node:fs/promises'
import { join } from 'node:path'

const NOTE_COUNT = 300
const BROKEN_LINK_RATE = 0.40
const ORPHAN_RATE = 0.20

const LANGUAGES = ['JavaScript', 'Python', 'Go', 'Rust', 'TypeScript']
const CATEGORIES = ['API', 'Database', 'Framework', 'Tool', 'Pattern', 'Snippet']
const PROJECTS = ['web-app', 'cli-tool', 'data-pipeline', 'mobile-app', 'ml-service']

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function noteTitle(index) {
  const lang = LANGUAGES[index % LANGUAGES.length]
  const cat = CATEGORIES[index % CATEGORIES.length]
  return `${lang} ${cat} ${String(index).padStart(3, '0')}`
}

function buildDeveloperNote(index, totalNotes) {
  const title = noteTitle(index)
  const lang = LANGUAGES[index % LANGUAGES.length]
  const project = PROJECTS[index % PROJECTS.length]
  const isOrphan = Math.random() < ORPHAN_RATE

  const links = []
  if (!isOrphan) {
    const linkCount = Math.floor(Math.random() * 3) + 1
    for (let i = 0; i < linkCount; i++) {
      if (Math.random() < BROKEN_LINK_RATE) {
        links.push(`[[Missing ${lang} Docs ${index}]]`)
      } else {
        const target = (index + i * 11 + 1) % totalNotes
        links.push(`[[${noteTitle(target)}]]`)
      }
    }
  }

  const hasVersion = Math.random() > 0.5
  const version = hasVersion ? `version:: ${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 10)}` : ''

  const codeBlock = index % 3 === 0 ? `
\`\`\`${lang.toLowerCase()}
function example() {
  // Code snippet for ${title}
  return 'placeholder'
}
\`\`\`
` : ''

  return `---
tags:
  - dev
  - ${lang.toLowerCase()}
project: ${project}
status: ${hasVersion ? 'documented' : 'draft'}
---

# ${title}

${version}

## Overview

Technical notes for ${lang} ${CATEGORIES[index % CATEGORIES.length]}. ${links.length > 0 ? `See also: ${links.join(', ')}` : ''}

${codeBlock}

## Notes

- Point 1
- Point 2

## TODO

- [ ] Add more examples
- [ ] Update docs
`
}

export async function createMessyDeveloperVault(outDir) {
  await mkdir(outDir, { recursive: true })

  const folders = ['Learning', 'Projects', 'Snippets', 'APIs', 'Quick-Notes', 'Archive']
  for (const folder of folders) {
    await mkdir(join(outDir, folder), { recursive: true })
  }

  for (let i = 0; i < NOTE_COUNT; i++) {
    const folder = i < 50 ? 'Learning'
      : i < 150 ? 'Quick-Notes'
      : i < 200 ? 'Projects'
      : i < 250 ? 'Snippets'
      : 'Archive'

    const filePath = join(outDir, folder, `${noteTitle(i)}.md`)
    await writeFile(filePath, buildDeveloperNote(i, NOTE_COUNT), 'utf8')

    const mtime = i % 7 === 0 ? new Date('2024-02-01') : new Date()
    await utimes(filePath, mtime, mtime)
  }

  const readme = `# Developer Vault

Technical notes scattered across ${NOTE_COUNT} files.

**Known issues:**
- ~${Math.floor(NOTE_COUNT * BROKEN_LINK_RATE)} broken links
- ~${Math.floor(NOTE_COUNT * ORPHAN_RATE)} orphan notes
- Code snippets mixed with project notes
- Missing version tags on ~${Math.floor(NOTE_COUNT * 0.5)} notes
- No clear separation between learning vs. production notes
`

  await writeFile(join(outDir, 'README.md'), readme, 'utf8')
  console.log(`Created messy developer vault: ${NOTE_COUNT} notes in ${outDir}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] || '/tmp/nexusky-messy-developer'
  createMessyDeveloperVault(outDir).catch(console.error)
}
