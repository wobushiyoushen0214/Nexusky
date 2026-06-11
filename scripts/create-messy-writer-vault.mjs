import { mkdir, writeFile, utimes } from 'node:fs/promises'
import { join } from 'node:path'

const NOTE_COUNT = 200
const BROKEN_LINK_RATE = 0.30
const ORPHAN_RATE = 0.20

const GENRES = ['Fiction', 'Non-Fiction', 'Essay', 'Poetry', 'Blog']
const STATUSES = ['draft', 'revision', 'published', 'idea', 'abandoned']

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function noteTitle(index, genre) {
  const themes = ['Journey', 'Memory', 'Hope', 'Change', 'Discovery', 'Loss', 'Growth']
  const theme = themes[index % themes.length]
  return `${theme} ${genre} ${String(index).padStart(3, '0')}`
}

function buildWriterNote(index, totalNotes) {
  const genre = GENRES[index % GENRES.length]
  const title = noteTitle(index, genre)
  const status = STATUSES[index % STATUSES.length]
  const isOrphan = Math.random() < ORPHAN_RATE

  const links = []
  if (!isOrphan) {
    const linkCount = Math.floor(Math.random() * 3)
    for (let i = 0; i < linkCount; i++) {
      if (Math.random() < BROKEN_LINK_RATE) {
        links.push(`[[Missing Inspiration ${index}]]`)
      } else {
        const target = (index + i * 9 + 1) % totalNotes
        const targetGenre = GENRES[target % GENRES.length]
        links.push(`[[${noteTitle(target, targetGenre)}]]`)
      }
    }
  }

  const hasPublishDate = status === 'published'
  const publishDate = hasPublishDate ? `published:: 2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-15` : ''

  const wordCount = Math.floor(Math.random() * 3000) + 500

  return `---
tags:
  - writing
  - ${genre.toLowerCase()}
status: ${status}
wordCount: ${wordCount}
---

# ${title}

${publishDate}

## Draft

This is a ${genre.toLowerCase()} piece exploring themes of ${['transformation', 'identity', 'connection'][index % 3]}.

${links.length > 0 ? `Related work: ${links.join(', ')}` : ''}

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## Ideas

- Develop character arc
- Add sensory details
- Revise ending

## Notes

${status === 'draft' ? 'Needs major revision.' : status === 'published' ? 'Published version.' : 'Work in progress.'}
`
}

export async function createMessyWriterVault(outDir) {
  await mkdir(outDir, { recursive: true })

  const folders = ['Drafts', 'Published', 'Ideas', 'Research', 'Archive', 'Fragments']
  for (const folder of folders) {
    await mkdir(join(outDir, folder), { recursive: true })
  }

  for (let i = 0; i < NOTE_COUNT; i++) {
    const status = STATUSES[i % STATUSES.length]
    const folder = status === 'published' ? 'Published'
      : status === 'idea' ? 'Ideas'
      : status === 'abandoned' ? 'Archive'
      : i % 5 === 0 ? 'Fragments'
      : 'Drafts'

    const genre = GENRES[i % GENRES.length]
    const filePath = join(outDir, folder, `${noteTitle(i, genre)}.md`)
    await writeFile(filePath, buildWriterNote(i, NOTE_COUNT), 'utf8')

    const mtime = i % 6 === 0 ? new Date('2024-03-01') : new Date()
    await utimes(filePath, mtime, mtime)
  }

  const readme = `# Writer Vault

Creative writing vault with ${NOTE_COUNT} pieces.

**Known issues:**
- ~${Math.floor(NOTE_COUNT * BROKEN_LINK_RATE)} broken links
- ~${Math.floor(NOTE_COUNT * ORPHAN_RATE)} orphan notes
- Drafts, published, and ideas mixed together
- Missing status tags on ~${Math.floor(NOTE_COUNT * 0.3)} pieces
- Inspiration sources not traceable
`

  await writeFile(join(outDir, 'README.md'), readme, 'utf8')
  console.log(`Created messy writer vault: ${NOTE_COUNT} notes in ${outDir}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] || '/tmp/nexusky-messy-writer'
  createMessyWriterVault(outDir).catch(console.error)
}
