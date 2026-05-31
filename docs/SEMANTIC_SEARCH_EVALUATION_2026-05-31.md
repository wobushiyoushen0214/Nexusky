# Semantic Search Evaluation - 2026-05-31

> Scope: Phase 3 / v0.8 Cognitive Partner MVP. This document decides how Nexusky evaluates semantic retrieval before shipping any always-on embedding dependency.

## Decision

Semantic retrieval is not enabled by default in v0.8.

The product keeps keyword search, SQLite FTS, graph relations, Context Pack ranking, and Memory Ledger signals as the default retrieval stack. Embeddings can enter the product only behind an explicit provider setting and after fixture evaluation shows a clear quality gain that justifies privacy, cost, storage, and latency tradeoffs.

## Candidate Routes

| Route | Privacy | Cost | Performance | Fit |
| --- | --- | --- | --- | --- |
| Keyword + FTS | Local only | None | Fast and predictable | Default baseline |
| Local embedding | Local text stays local | Model download/storage | Depends on device | Candidate for opt-in advanced search |
| Remote embedding | Note text leaves device | Provider billing | Network latency and rate limits | Only acceptable with explicit provider consent |
| Hybrid | Depends on embedding route | Mixed | More complex ranking | Candidate if it beats FTS on fixtures |

## Evaluation Fixture

Use the existing tiny / medium / large vault fixture strategy and add retrieval queries that cover:

- exact title lookup
- paraphrased concept lookup
- cross-folder topic lookup
- stale context resurfacing
- repeated question retrieval
- wrong-neighbor rejection

Each query records top 5 results for keyword, FTS, embedding, and hybrid routes. A route passes only when it improves relevant top 5 results without increasing wrong-neighbor results in the regression fixture.

## Provider Abstraction Draft

Embedding providers should follow a small interface:

```ts
interface EmbeddingProvider {
  id: string
  displayName: string
  locality: 'local' | 'remote'
  dimensions: number
  embedTexts(input: { id: string; text: string }[]): Promise<{ id: string; vector: number[] }[]>
}
```

Provider selection must stay independent from chat provider selection. Remote embedding providers must expose request preview text counts before first use.

## Privacy Boundary

Local embedding sends no note text outside the vault.

Remote embedding sends selected note chunks, titles, and limited metadata to the configured provider. It must never run as a hidden default. The UI must state which snippets are sent, the provider name, and whether vectors are stored locally.

## Phase 3 Outcome

For v0.8, the accepted outcome is an evaluation path and privacy contract, not a shipped semantic search surface. This keeps the cognitive partner loop focused on explainable maintenance, review, feedback-driven ranking, and safe execution.
