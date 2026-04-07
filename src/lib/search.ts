/**
 * Corpus Search Engine
 *
 * BM25-based keyword search over the preprocessed CPP corpus.
 * Loads JSONL shards at startup, builds an inverted index for fast retrieval.
 * Returns chunks with source URLs for citation.
 */

import fs from "fs";
import path from "path";

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
}

// BM25 parameters
const K1 = 1.2;
const B = 0.75;

// In-memory corpus + index
let chunks: Chunk[] = [];
let invertedIndex: Map<string, Map<number, number>> = new Map(); // term → (chunkIdx → tf)
let docLengths: number[] = [];
let avgDocLength = 0;
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
  const shardFiles = fs.readdirSync(dataDir).filter((f) => f.startsWith("chunks-") && f.endsWith(".jsonl")).sort();

  for (const file of shardFiles) {
    const lines = fs.readFileSync(path.join(dataDir, file), "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      chunks.push(JSON.parse(line));
    }
  }

  // Build inverted index
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
  loaded = true;
  console.log(`[search] Loaded ${chunks.length} chunks, ${invertedIndex.size} unique terms`);
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

export function searchCorpus(query: string, limit: number = 8): SearchResult[] {
  loadCorpus();

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Find candidate docs (any doc that contains at least one query term)
  const candidates = new Set<number>();
  for (const token of queryTokens) {
    const postings = invertedIndex.get(token);
    if (postings) {
      for (const docIdx of postings.keys()) {
        candidates.add(docIdx);
      }
    }
  }

  // Score candidates
  const scored: { idx: number; score: number }[] = [];
  for (const idx of candidates) {
    scored.push({ idx, score: bm25Score(queryTokens, idx) });
  }

  // Sort by score, take top results
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by source URL — keep highest-scoring chunk per page
  const seenUrls = new Set<string>();
  const results: SearchResult[] = [];

  for (const { idx, score } of scored) {
    if (results.length >= limit) break;
    const chunk = chunks[idx];
    const url = chunk.source_url || `https://www.cpp.edu/${chunk.filename.replace(/__/g, "/").replace(/\.md$/, "")}`;

    // Allow up to 2 chunks from same URL for more context
    const urlCount = results.filter((r) => r.url === url).length;
    if (urlCount >= 2) continue;

    results.push({ chunk, score, url });
  }

  return results;
}

export function getCorpusStats() {
  loadCorpus();
  return {
    totalChunks: chunks.length,
    uniqueTerms: invertedIndex.size,
    avgChunkLength: Math.round(avgDocLength),
  };
}
