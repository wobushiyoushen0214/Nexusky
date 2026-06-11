import { mkdir, writeFile, utimes } from 'node:fs/promises'
import { join } from 'node:path'

const PAPER_COUNT = 500
const BROKEN_LINK_RATE = 0.35
const ORPHAN_RATE = 0.16
const DUPLICATE_TITLES = 25

const TOPICS = ['machine-learning', 'nlp', 'computer-vision', 'robotics', 'quantum-computing', 'bioinformatics', 'climate-modeling', 'network-security']
const AUTHORS = ['Smith', 'Johnson', 'Wang', 'Zhang', 'Kumar', 'Lee', 'Garcia', 'Mueller']

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function paperTitle(index, isDuplicate = false) {
  const topic = TOPICS[index % TOPICS.length]
  const author = AUTHORS[index % AUTHORS.length]
  const year = 2020 + (index % 7)
  const suffix = isDuplicate ? ' (Copy)' : ''
  return `${topic.charAt(0).toUpperCase() + topic.slice(1)} Study by ${author} ${year}${suffix}`
}

function generateBrokenLink(index) {
  return `[[Missing Paper ${index}]]`
}

function generateValidLink(targetIndex) {
  return `[[${paperTitle(targetIndex)}]]`
}

function buildResearchNote(index, totalPapers) {
  const title = paperTitle(index, index < DUPLICATE_TITLES)
  const topic = TOPICS[index % TOPICS.length]
  const hasCitation = Math.random() > 0.3
  const isOrphan = Math.random() < ORPHAN_RATE

  const links = []
  if (!isOrphan) {
    const linkCount = Math.floor(Math.random() * 4) + 1
    for (let i = 0; i < linkCount; i++) {
      if (Math.random() < BROKEN_LINK_RATE) {
        links.push(generateBrokenLink(index * 7 + i))
      } else {
        const target = (index + i * 13 + 1) % totalPapers
        links.push(generateValidLink(target))
      }
    }
  }

  const citation = hasCitation
    ? `citation:: ${AUTHORS[index % AUTHORS.length]} et al. (${2020 + (index % 7)})`
    : ''

  const abstract = `This paper explores ${topic} using advanced methodologies. ${links.length > 0 ? `Related work: ${links.join(', ')}` : 'This note is isolated.'}`

  return `---
tags:
  - research
  - ${topic}
venue: ${randomChoice(['ICML', 'NeurIPS', 'CVPR', 'ACL', 'SIGCOMM', 'Nature'])}
year: ${2020 + (index % 7)}
status: ${hasCitation ? 'reviewed' : 'to-read'}
---

# ${title}

${citation}

## Abstract

${abstract}

## Key Findings

- Finding 1
- Finding 2

## Notes

${index % 3 === 0 ? 'Important contribution to the field.' : 'Needs further review.'}
`
}

export async function createMessyResearchVault(outDir) {
  await mkdir(outDir, { recursive: true })

  const folders = ['Papers', 'Reviews', 'Notes', 'Drafts', 'Archive/2023', 'Archive/2024', 'Unsorted']
  for (const folder of folders) {
    await mkdir(join(outDir, folder), { recursive: true })
  }

  for (let i = 0; i < PAPER_COUNT; i++) {
    const folder = i < 100 ? 'Papers'
      : i < 200 ? 'Notes'
      : i < 300 ? 'Unsorted'
      : i < 400 ? 'Archive/2023'
      : 'Archive/2024'

    const filePath = join(outDir, folder, `${paperTitle(i, i < DUPLICATE_TITLES)}.md`)
    await writeFile(filePath, buildResearchNote(i, PAPER_COUNT), 'utf8')

    const mtime = i % 5 === 0 ? new Date('2024-01-01') : new Date()
    await utimes(filePath, mtime, mtime)
  }

  const readme = `# Research Vault

This is a messy research vault with ${PAPER_COUNT} papers.

**Known issues:**
- ~${Math.floor(PAPER_COUNT * BROKEN_LINK_RATE)} broken links
- ~${Math.floor(PAPER_COUNT * ORPHAN_RATE)} orphan notes
- ${DUPLICATE_TITLES} duplicate titles
- Missing citation properties on ~${Math.floor(PAPER_COUNT * 0.3)} papers
- Inconsistent folder structure
`

  await writeFile(join(outDir, 'README.md'), readme, 'utf8')
  console.log(`Created messy research vault: ${PAPER_COUNT} papers in ${outDir}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] || '/tmp/nexusky-messy-research'
  createMessyResearchVault(outDir).catch(console.error)
}
