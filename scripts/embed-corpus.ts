/**
 * Corpus Embedding Script
 *
 * Reads preprocessed chunk shards, generates embeddings via the configured
 * provider, and writes embedding shards alongside the chunk data.
 *
 * Usage: npx tsx scripts/embed-corpus.ts [--provider ollama|openai|openrouter] [--batch-size 50]
 *
 * Env vars:
 *   EMBEDDING_PROVIDER   — ollama (default), openai, openrouter
 *   OLLAMA_URL           — default http://localhost:11434
 *   OLLAMA_EMBED_MODEL   — default nomic-embed-text
 *   OPENAI_API_KEY       — for OpenAI provider
 *   OPENAI_EMBED_MODEL   — default text-embedding-3-small
 *   OPENROUTER_API_KEY   — for OpenRouter provider
 *   OPENROUTER_EMBED_MODEL — default openai/text-embedding-3-small
 *
 * Output: data/embeddings-{shard}.jsonl (one embedding per line, matching chunk IDs)
 */

import fs from "fs";
import path from "path";
import {
  getEmbeddingProvider,
  generateEmbeddings,
  type EmbeddingProvider,
} from "../src/lib/embeddings";

// --- Args ---
const args = process.argv.slice(2);
let providerOverride: EmbeddingProvider | undefined;
let batchSize = 50; // Ollama does 1-at-a-time anyway; OpenAI/OpenRouter can batch

let firstPerPage = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--provider" && args[i + 1]) {
    providerOverride = args[++i] as EmbeddingProvider;
  }
  if (args[i] === "--batch-size" && args[i + 1]) {
    batchSize = parseInt(args[++i], 10);
  }
  if (args[i] === "--first-per-page") {
    firstPerPage = true;
  }
}

if (providerOverride) {
  process.env.EMBEDDING_PROVIDER = providerOverride;
}

// --- Main ---

interface Chunk {
  id: string;
  content: string;
  title: string;
  section: string;
  source_url: string;
  chunk_index: number;
}

async function main() {
  const config = getEmbeddingProvider();
  if (!config) {
    console.error("No embedding provider configured. Set EMBEDDING_PROVIDER or an API key.");
    process.exit(1);
  }

  console.log(`Provider: ${config.provider} (${config.model}, ${config.dimensions}d)`);
  console.log(`Batch size: ${config.provider === "ollama" ? 1 : batchSize}`);

  const dataDir = path.join(process.cwd(), "data");
  const shardFiles = fs.readdirSync(dataDir)
    .filter((f) => f.startsWith("chunks-") && f.endsWith(".jsonl"))
    .sort();

  if (shardFiles.length === 0) {
    console.error("No chunk shards found in data/. Run preprocess-corpus.ts first.");
    process.exit(1);
  }

  // Check for existing embeddings to support resume
  const existingIds = new Set<string>();
  const embFiles = fs.readdirSync(dataDir).filter((f) => f.startsWith("embeddings-") && f.endsWith(".jsonl"));
  for (const ef of embFiles) {
    const lines = fs.readFileSync(path.join(dataDir, ef), "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      const entry = JSON.parse(line);
      existingIds.add(entry.chunk_id);
    }
  }
  if (existingIds.size > 0) {
    console.log(`Resuming: ${existingIds.size} chunks already embedded`);
  }

  let totalEmbedded = existingIds.size;
  let totalChunks = 0;
  const startTime = Date.now();

  for (const shardFile of shardFiles) {
    const shardIdx = shardFile.match(/chunks-(\d+)\.jsonl/)?.[1] || "0";
    const embPath = path.join(dataDir, `embeddings-${shardIdx}.jsonl`);

    // Load chunks from this shard
    const lines = fs.readFileSync(path.join(dataDir, shardFile), "utf-8").split("\n").filter(Boolean);
    let chunks: Chunk[] = lines.map((l) => JSON.parse(l));

    // If --first-per-page, only embed chunk_index 0 for each URL
    if (firstPerPage) {
      chunks = chunks.filter((c) => c.chunk_index === 0);
    }

    totalChunks += chunks.length;

    // Filter out already-embedded chunks
    const toEmbed = chunks.filter((c) => !existingIds.has(c.id));
    if (toEmbed.length === 0) {
      console.log(`  Shard ${shardIdx}: all ${chunks.length} chunks already embedded, skipping`);
      continue;
    }

    console.log(`  Shard ${shardIdx}: embedding ${toEmbed.length}/${chunks.length} chunks...`);

    // Open append stream for this shard
    const fd = fs.openSync(embPath, "a");

    // Process with concurrency for Gemini (1-at-a-time API but parallel requests)
    const concurrency = config.provider === "gemini" ? 20 : (config.provider === "ollama" ? 1 : 1);
    const effectiveBatch = config.provider === "ollama" ? 1 : batchSize;

    for (let i = 0; i < toEmbed.length; i += concurrency * effectiveBatch) {
      const concurrentBatches = [];
      for (let c = 0; c < concurrency && i + c * effectiveBatch < toEmbed.length; c++) {
        const start = i + c * effectiveBatch;
        const batch = toEmbed.slice(start, start + effectiveBatch);
        const texts = batch.map((ch) => `${ch.title} — ${ch.section}\n${ch.content}`.slice(0, 6000));
        concurrentBatches.push({ batch, texts });
      }

      try {
        const results = await Promise.all(
          concurrentBatches.map(async ({ batch, texts }) => {
            const embeddings = await generateEmbeddings(texts, config);
            return batch.map((ch, j) => ({ chunk_id: ch.id, embedding: embeddings[j] }));
          })
        );

        for (const entries of results) {
          for (const entry of entries) {
            // Truncate to 4 decimal places to reduce file size (~40% smaller)
            entry.embedding = entry.embedding.map((v: number) => Math.round(v * 10000) / 10000);
            fs.writeSync(fd, JSON.stringify(entry) + "\n");
            totalEmbedded++;
          }
        }

        // Progress
        const pct = ((totalEmbedded / totalChunks) * 100).toFixed(1);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (totalEmbedded / ((Date.now() - startTime) / 1000)).toFixed(1);
        process.stdout.write(`\r    ${totalEmbedded}/${totalChunks} (${pct}%) — ${rate} chunks/s — ${elapsed}s elapsed`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n    Error at batch ${i}: ${msg}`);
        if (msg.includes("429") || msg.includes("rate") || msg.includes("RESOURCE_EXHAUSTED")) {
          console.log("    Rate limited — waiting 10s...");
          await new Promise((r) => setTimeout(r, 10000));
          i -= concurrency * effectiveBatch; // Retry
        }
      }
    }

    fs.closeSync(fd);
    console.log(); // newline after progress
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone: ${totalEmbedded} embeddings in ${elapsed}s`);
  console.log(`Stored in: ${dataDir}/embeddings-*.jsonl`);
}

main().catch(console.error);
