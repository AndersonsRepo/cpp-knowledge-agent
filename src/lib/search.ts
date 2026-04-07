/**
 * Corpus Search Engine — Hybrid BM25 + Semantic
 *
 * BM25 keyword search always available. Semantic search activates when
 * embeddings are present (data/embeddings-*.jsonl). Hybrid scoring combines
 * both at 70% semantic + 30% BM25 (same ratio as AI Harness).
 *
 * Falls back to BM25-only when no embeddings or embedding provider unavailable.
 */

import fs from "fs";
import path from "path";
import {
  getEmbeddingProvider,
  generateSingleEmbedding,
  cosineSimilarity,
} from "./embeddings";

export interface Chunk {
  id: string;
  source_url: string;
  filename: string;
  title: string;
  content: string;
  section: string;
  chunk_index: number;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  url: string;
  matchType: "bm25" | "semantic" | "hybrid";
}

// BM25 parameters
const K1 = 1.2;
const B = 0.75;

// Hybrid weights (same as AI Harness)
const SEMANTIC_WEIGHT = 0.7;
const BM25_WEIGHT = 0.3;

// In-memory corpus + index
let chunks: Chunk[] = [];
let chunkIdToIdx: Map<string, number> = new Map();
let invertedIndex: Map<string, Map<number, number>> = new Map();
let docLengths: number[] = [];
let avgDocLength = 0;

// Embedding index (loaded if available)
let embeddings: Map<number, number[]> = new Map(); // chunkIdx → vector
let embeddingsLoaded = false;
let hasEmbeddings = false;

let loaded = false;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function loadCorpus() {
  if (loaded) return;

  const dataDir = path.join(process.cwd(), "data");

  // Load chunks
  const shardFiles = fs
    .readdirSync(dataDir)
    .filter((f) => f.startsWith("chunks-") && f.endsWith(".jsonl"))
    .sort();

  for (const file of shardFiles) {
    const lines = fs.readFileSync(path.join(dataDir, file), "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      const chunk = JSON.parse(line) as Chunk;
      chunkIdToIdx.set(chunk.id, chunks.length);
      chunks.push(chunk);
    }
  }

  // Build BM25 inverted index
  for (let i = 0; i < chunks.length; i++) {
    const tokens = tokenize(chunks[i].content + " " + chunks[i].title + " " + chunks[i].section);
    docLengths.push(tokens.length);

    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    for (const [term, count] of tf) {
      if (!invertedIndex.has(term)) {
        invertedIndex.set(term, new Map());
      }
      invertedIndex.get(term)!.set(i, count);
    }
  }

  avgDocLength = docLengths.reduce((a, b) => a + b, 0) / docLengths.length;

  // Load embeddings if available
  const embFiles = fs
    .readdirSync(dataDir)
    .filter((f) => f.startsWith("embeddings-") && f.endsWith(".jsonl"))
    .sort();

  if (embFiles.length > 0) {
    let embCount = 0;
    for (const file of embFiles) {
      const lines = fs.readFileSync(path.join(dataDir, file), "utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line) as { chunk_id: string; embedding: number[] };
        const idx = chunkIdToIdx.get(entry.chunk_id);
        if (idx !== undefined) {
          embeddings.set(idx, entry.embedding);
          embCount++;
        }
      }
    }
    hasEmbeddings = embCount > 0;
    embeddingsLoaded = true;
    console.log(`[search] Loaded ${embCount} embeddings (${((embCount / chunks.length) * 100).toFixed(1)}% coverage)`);
  }

  loaded = true;
  console.log(`[search] Loaded ${chunks.length} chunks, ${invertedIndex.size} unique terms, embeddings: ${hasEmbeddings}`);
}

function bm25Score(queryTokens: string[], docIdx: number): number {
  const N = chunks.length;
  let score = 0;

  for (const term of queryTokens) {
    const postings = invertedIndex.get(term);
    if (!postings) continue;

    const df = postings.size;
    const tf = postings.get(docIdx) || 0;
    if (tf === 0) continue;

    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (docLengths[docIdx] / avgDocLength)));
    score += idf * tfNorm;
  }

  return score;
}

function getChunkUrl(chunk: Chunk): string {
  return chunk.source_url || `https://www.cpp.edu/${chunk.filename.replace(/__/g, "/").replace(/\.md$/, "")}`;
}

function deduplicateResults(scored: Array<{ idx: number; score: number; matchType: "bm25" | "semantic" | "hybrid" }>, limit: number): SearchResult[] {
  scored.sort((a, b) => b.score - a.score);

  const results: SearchResult[] = [];
  for (const { idx, score, matchType } of scored) {
    if (results.length >= limit) break;
    const chunk = chunks[idx];
    const url = getChunkUrl(chunk);

    // Allow up to 2 chunks from same URL for more context
    const urlCount = results.filter((r) => r.url === url).length;
    if (urlCount >= 2) continue;

    results.push({ chunk, score, url, matchType });
  }

  return results;
}

// --- BM25-only search ---

function searchBM25(query: string, limit: number): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const candidates = new Set<number>();
  for (const token of queryTokens) {
    const postings = invertedIndex.get(token);
    if (postings) {
      for (const docIdx of postings.keys()) {
        candidates.add(docIdx);
      }
    }
  }

  const scored = Array.from(candidates).map((idx) => ({
    idx,
    score: bm25Score(queryTokens, idx),
    matchType: "bm25" as const,
  }));

  return deduplicateResults(scored, limit);
}

// --- Semantic-only search ---

function searchSemantic(queryEmbedding: number[], limit: number): Array<{ idx: number; score: number }> {
  const scored: Array<{ idx: number; score: number }> = [];

  for (const [idx, embedding] of embeddings) {
    const score = cosineSimilarity(queryEmbedding, embedding);
    scored.push({ idx, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit * 3); // Return more candidates for hybrid merging
}

// --- Hybrid search ---

async function searchHybrid(query: string, queryEmbedding: number[], limit: number): Promise<SearchResult[]> {
  const queryTokens = tokenize(query);

  // Get BM25 scores for all candidates
  const bm25Candidates = new Set<number>();
  for (const token of queryTokens) {
    const postings = invertedIndex.get(token);
    if (postings) {
      for (const docIdx of postings.keys()) bm25Candidates.add(docIdx);
    }
  }

  // Get semantic candidates
  const semanticResults = searchSemantic(queryEmbedding, limit);
  const allCandidates = new Set([...bm25Candidates, ...semanticResults.map((r) => r.idx)]);

  // Compute BM25 scores and normalize
  const bm25Scores = new Map<number, number>();
  let maxBM25 = 0;
  for (const idx of allCandidates) {
    const score = bm25Score(queryTokens, idx);
    bm25Scores.set(idx, score);
    if (score > maxBM25) maxBM25 = score;
  }

  // Semantic scores (already 0-1 from cosine similarity)
  const semanticScores = new Map(semanticResults.map((r) => [r.idx, r.score]));

  // Combine with hybrid weights
  const scored: Array<{ idx: number; score: number; matchType: "hybrid" | "bm25" | "semantic" }> = [];
  for (const idx of allCandidates) {
    const bm25Norm = maxBM25 > 0 ? (bm25Scores.get(idx) || 0) / maxBM25 : 0;
    const semanticScore = semanticScores.get(idx) || 0;

    const hybridScore = SEMANTIC_WEIGHT * semanticScore + BM25_WEIGHT * bm25Norm;
    const matchType = semanticScore > 0 && bm25Norm > 0 ? "hybrid" : semanticScore > 0 ? "semantic" : "bm25";

    scored.push({ idx, score: hybridScore, matchType });
  }

  return deduplicateResults(scored, limit);
}

// --- Public API ---

export async function searchCorpus(query: string, limit: number = 8): Promise<SearchResult[]> {
  loadCorpus();

  if (!hasEmbeddings) {
    return searchBM25(query, limit);
  }

  // Try to embed the query for hybrid search
  const config = getEmbeddingProvider();
  if (!config) {
    return searchBM25(query, limit);
  }

  try {
    const queryEmbedding = await generateSingleEmbedding(query, config);
    return searchHybrid(query, queryEmbedding, limit);
  } catch (err) {
    console.warn(`[search] Embedding failed, falling back to BM25: ${err}`);
    return searchBM25(query, limit);
  }
}

// Sync version for cases where we can't await (falls back to BM25)
export function searchCorpusSync(query: string, limit: number = 8): SearchResult[] {
  loadCorpus();
  return searchBM25(query, limit);
}

export function getCorpusStats() {
  loadCorpus();
  return {
    totalChunks: chunks.length,
    uniqueTerms: invertedIndex.size,
    avgChunkLength: Math.round(avgDocLength),
    hasEmbeddings,
    embeddingCount: embeddings.size,
    embeddingCoverage: chunks.length > 0 ? ((embeddings.size / chunks.length) * 100).toFixed(1) + "%" : "0%",
  };
}
