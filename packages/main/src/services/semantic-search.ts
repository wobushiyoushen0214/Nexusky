export type EmbeddingProviderLocality = 'local' | 'remote'

export interface EmbeddingTextInput {
  id: string
  text: string
  title?: string
  filePath?: string
}

export interface EmbeddingVector {
  id: string
  vector: number[]
}

export interface EmbeddingProvider {
  id: string
  displayName: string
  locality: EmbeddingProviderLocality
  dimensions: number
  embedTexts(input: EmbeddingTextInput[]): Promise<EmbeddingVector[]>
}

export interface SemanticSearchCandidate {
  id: string
  noteId: string
  title: string
  filePath: string
  chunk: string
  headingContext?: string
  lexicalRank?: number
  lexicalScore?: number
}

export interface SemanticSearchResult extends SemanticSearchCandidate {
  score: number
  route: 'embedding' | 'hybrid'
}

export interface EmbeddingRequestPreview {
  providerId: string
  providerName: string
  locality: EmbeddingProviderLocality
  sendsNoteTextOutsideDevice: boolean
  storesVectors: boolean
  itemCount: number
  characterCount: number
  estimatedTokens: number
  sampleTexts: { id: string; title?: string; filePath?: string; characters: number }[]
}

const QUERY_INPUT_ID = '__query__'

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function dot(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let value = 0
  for (let index = 0; index < len; index += 1) value += a[index] * b[index]
  return value
}

function norm(vector: number[]): number {
  return Math.sqrt(dot(vector, vector))
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const denominator = norm(a) * norm(b)
  if (denominator === 0) return 0
  return dot(a, b) / denominator
}

function assertVectorDimensions(provider: EmbeddingProvider, vectors: EmbeddingVector[]): void {
  for (const item of vectors) {
    if (item.vector.length !== provider.dimensions) {
      throw new Error(`Embedding provider ${provider.id} returned ${item.vector.length} dimensions for ${item.id}; expected ${provider.dimensions}`)
    }
  }
}

function toEmbeddingInputs(query: string, candidates: SemanticSearchCandidate[]): EmbeddingTextInput[] {
  return [
    { id: QUERY_INPUT_ID, text: query },
    ...candidates.map((candidate) => ({
      id: candidate.id,
      text: [candidate.title, candidate.headingContext, candidate.chunk].filter(Boolean).join('\n\n'),
      title: candidate.title,
      filePath: candidate.filePath
    }))
  ]
}

export function buildEmbeddingRequestPreview(input: {
  provider: Pick<EmbeddingProvider, 'id' | 'displayName' | 'locality'>
  query: string
  candidates: SemanticSearchCandidate[]
  storesVectors?: boolean
  sampleLimit?: number
}): EmbeddingRequestPreview {
  const texts = toEmbeddingInputs(input.query, input.candidates)
  const sampleLimit = Math.max(1, input.sampleLimit ?? 5)
  const characterCount = texts.reduce((sum, item) => sum + item.text.length, 0)
  return {
    providerId: input.provider.id,
    providerName: input.provider.displayName,
    locality: input.provider.locality,
    sendsNoteTextOutsideDevice: input.provider.locality === 'remote',
    storesVectors: input.storesVectors === true,
    itemCount: texts.length,
    characterCount,
    estimatedTokens: texts.reduce((sum, item) => sum + estimateTokens(item.text), 0),
    sampleTexts: texts.slice(0, sampleLimit).map((item) => ({
      id: item.id,
      title: item.title,
      filePath: item.filePath,
      characters: item.text.length
    }))
  }
}

export async function rankCandidatesByEmbeddings(input: {
  provider: EmbeddingProvider
  query: string
  candidates: SemanticSearchCandidate[]
  topK?: number
}): Promise<SemanticSearchResult[]> {
  const topK = Math.max(1, input.topK ?? 10)
  if (!input.query.trim() || input.candidates.length === 0) return []

  const vectors = await input.provider.embedTexts(toEmbeddingInputs(input.query, input.candidates))
  assertVectorDimensions(input.provider, vectors)
  const byId = new Map(vectors.map((item) => [item.id, item.vector]))
  const queryVector = byId.get(QUERY_INPUT_ID)
  if (!queryVector) throw new Error(`Embedding provider ${input.provider.id} did not return a query vector`)

  const scored: SemanticSearchResult[] = []
  for (const candidate of input.candidates) {
    const vector = byId.get(candidate.id)
    if (!vector) continue
    scored.push({
      ...candidate,
      score: cosineSimilarity(queryVector, vector),
      route: 'embedding'
    })
  }

  return scored
    .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
    .slice(0, topK)
}

function rankMap(candidates: { id: string }[]): Map<string, number> {
  return new Map(candidates.map((candidate, index) => [candidate.id, index + 1]))
}

export function fuseEmbeddingAndLexicalResults(input: {
  lexicalResults: SemanticSearchCandidate[]
  embeddingResults: SemanticSearchResult[]
  topK?: number
  rrfK?: number
}): SemanticSearchResult[] {
  const topK = Math.max(1, input.topK ?? 10)
  const rrfK = Math.max(1, input.rrfK ?? 60)
  const lexicalRanks = rankMap(input.lexicalResults)
  const embeddingRanks = rankMap(input.embeddingResults)
  const byId = new Map<string, SemanticSearchCandidate>()
  for (const candidate of [...input.lexicalResults, ...input.embeddingResults]) {
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate)
  }

  return Array.from(byId.values())
    .map((candidate) => {
      const lexicalRank = lexicalRanks.get(candidate.id)
      const embeddingRank = embeddingRanks.get(candidate.id)
      const score = (lexicalRank ? 1 / (rrfK + lexicalRank) : 0) + (embeddingRank ? 1 / (rrfK + embeddingRank) : 0)
      return {
        ...candidate,
        score,
        route: 'hybrid' as const
      }
    })
    .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
    .slice(0, topK)
}

export async function evaluateSemanticRetrieval(input: {
  provider: EmbeddingProvider
  query: string
  candidates: SemanticSearchCandidate[]
  lexicalResults?: SemanticSearchCandidate[]
  topK?: number
  storesVectors?: boolean
}): Promise<{
  preview: EmbeddingRequestPreview
  embeddingResults: SemanticSearchResult[]
  hybridResults: SemanticSearchResult[]
}> {
  const embeddingResults = await rankCandidatesByEmbeddings({
    provider: input.provider,
    query: input.query,
    candidates: input.candidates,
    topK: input.topK
  })
  const lexicalResults = input.lexicalResults ?? []
  return {
    preview: buildEmbeddingRequestPreview({
      provider: input.provider,
      query: input.query,
      candidates: input.candidates,
      storesVectors: input.storesVectors
    }),
    embeddingResults,
    hybridResults: lexicalResults.length > 0
      ? fuseEmbeddingAndLexicalResults({ lexicalResults, embeddingResults, topK: input.topK })
      : embeddingResults.map((result) => ({ ...result, route: 'hybrid' as const }))
  }
}
