import { describe, expect, it } from 'vitest'
import {
  buildEmbeddingRequestPreview,
  evaluateSemanticRetrieval,
  fuseEmbeddingAndLexicalResults,
  rankCandidatesByEmbeddings,
  type EmbeddingProvider,
  type EmbeddingTextInput,
  type SemanticSearchCandidate
} from '../packages/main/src/services/semantic-search'

const candidates: SemanticSearchCandidate[] = [
  {
    id: 'recovery',
    noteId: 'n1',
    title: 'Sync Recovery',
    filePath: 'Ops/Sync Recovery.md',
    headingContext: 'Recovery',
    chunk: 'Recover overwritten sync notes from history snapshots and trash metadata.'
  },
  {
    id: 'privacy',
    noteId: 'n2',
    title: 'Embedding Privacy',
    filePath: 'AI/Embedding Privacy.md',
    headingContext: 'Privacy',
    chunk: 'Remote embedding sends selected note chunks to the configured provider only after explicit consent.'
  },
  {
    id: 'decoy',
    noteId: 'n3',
    title: 'Remote Work Lunch',
    filePath: 'Personal/Remote Work Lunch.md',
    headingContext: 'Food',
    chunk: 'A grocery list and lunch notes for working away from the office.'
  }
]

function conceptVector(text: string): number[] {
  const lower = text.toLowerCase()
  const recovery = /(recover|recovery|restore|overwrite|history|trash|snapshot|sync)/.test(lower) ? 1 : 0
  const privacy = /(privacy|provider|consent|remote embedding|outside|chunks)/.test(lower) ? 1 : 0
  const food = /(lunch|grocery|food)/.test(lower) ? 1 : 0
  return [recovery, privacy, food]
}

const provider: EmbeddingProvider = {
  id: 'test-embedding',
  displayName: 'Test Embedding',
  locality: 'remote',
  dimensions: 3,
  async embedTexts(input: EmbeddingTextInput[]) {
    return input.map((item) => ({ id: item.id, vector: conceptVector(item.text) }))
  }
}

describe('semantic search evaluation harness', () => {
  it('builds a privacy preview before remote embedding text leaves the device', () => {
    const preview = buildEmbeddingRequestPreview({
      provider,
      query: 'restore overwritten sync note',
      candidates,
      storesVectors: true,
      sampleLimit: 2
    })

    expect(preview).toMatchObject({
      providerId: 'test-embedding',
      providerName: 'Test Embedding',
      locality: 'remote',
      sendsNoteTextOutsideDevice: true,
      storesVectors: true,
      itemCount: 4
    })
    expect(preview.characterCount).toBeGreaterThan('restore overwritten sync note'.length)
    expect(preview.estimatedTokens).toBeGreaterThan(0)
    expect(preview.sampleTexts).toEqual([
      expect.objectContaining({ id: '__query__' }),
      expect.objectContaining({ id: 'recovery', title: 'Sync Recovery' })
    ])
  })

  it('ranks candidates with provider-returned embedding vectors', async () => {
    const results = await rankCandidatesByEmbeddings({
      provider,
      query: 'restore overwritten sync note',
      candidates,
      topK: 3
    })

    expect(results.map((result) => result.id)).toEqual(['recovery', 'privacy', 'decoy'])
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })

  it('fuses lexical and embedding routes with reciprocal rank fusion', async () => {
    const embeddingResults = await rankCandidatesByEmbeddings({
      provider,
      query: 'restore overwritten sync note',
      candidates,
      topK: 3
    })
    const hybrid = fuseEmbeddingAndLexicalResults({
      lexicalResults: [candidates[2], candidates[0]],
      embeddingResults,
      topK: 3
    })

    expect(hybrid[0]).toMatchObject({ id: 'recovery', route: 'hybrid' })
    expect(hybrid.map((result) => result.id)).toContain('decoy')
  })

  it('evaluates embedding and hybrid routes together without changing default search', async () => {
    const result = await evaluateSemanticRetrieval({
      provider,
      query: 'which notes explain remote embedding consent',
      candidates,
      lexicalResults: [candidates[2], candidates[1]],
      topK: 2,
      storesVectors: false
    })

    expect(result.preview.sendsNoteTextOutsideDevice).toBe(true)
    expect(result.preview.storesVectors).toBe(false)
    expect(result.embeddingResults[0].id).toBe('privacy')
    expect(result.hybridResults[0].id).toBe('privacy')
  })

  it('rejects providers that return vectors with the wrong dimensions', async () => {
    const brokenProvider: EmbeddingProvider = {
      ...provider,
      dimensions: 4
    }

    await expect(rankCandidatesByEmbeddings({
      provider: brokenProvider,
      query: 'restore overwritten sync note',
      candidates
    })).rejects.toThrow('expected 4')
  })
})
