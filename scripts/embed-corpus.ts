/**
 * Corpus Embedding Script — Supabase pgvector
 *
 * Phase 1: Bulk-upsert all chunks (text only) into Supabase
 * Phase 2: Generate embeddings via Gemini and update each row
 *
 * Usage: npx tsx scripts/embed-corpus.ts [--provider gemini|ollama|openai] [--chunks-only]
 *
 * --chunks-only: Only upload chunk text, skip embedding generation
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  getEmbeddingProvider,
  generateEmbeddings,
  type EmbeddingProvider,
} from "../src/lib/embeddings";

import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// --- Args ---
const args = process.argv.slice(2);
let providerOverride: EmbeddingProvider | undefined;
let chunksOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--provider" && args[i + 1]) {
    providerOverride = args[++i] as EmbeddingProvider;
  }
  if (args[i] === "--chunks-only") {
    chunksOnly = true;
  }
}

if (providerOverride) {
  process.env.EMBEDDING_PROVIDER = providerOverride;
}

// --- Supabase client ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- Types ---
interface Chunk {
  id: string;
  source_url: string;
  filename: string;
  title: string;
  content: string;
  section: string;
  chunk_index: number;
}

// --- Phase 1: Upload chunks ---
async function uploadChunks(): Promise<Chunk[]> {
  console.log("Phase 1: Uploading chunks to Supabase...");

  const dataDir = path.join(process.cwd(), "data");
  const shardFiles = fs.readdirSync(dataDir)
    .filter((f) => f.startsWith("chunks-") && f.endsWith(".jsonl"))
    .sort();

  if (shardFiles.length === 0) {
    console.error("No chunk shards found in data/. Run preprocess-corpus.ts first.");
    process.exit(1);
  }

  // Load all chunks
  const allChunks: Chunk[] = [];
  for (const file of shardFiles) {
    const lines = fs.readFileSync(path.join(dataDir, file), "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        allChunks.push(JSON.parse(line) as Chunk);
      } catch {
        // Skip malformed lines
      }
    }
  }

  console.log(`  Loaded ${allChunks.length} chunks from ${shardFiles.length} shards`);

  // Check how many already exist
  const { count } = await supabase.from("chunks").select("id", { count: "exact", head: true });
  if (count && count >= allChunks.length) {
    console.log(`  All ${count} chunks already in Supabase, skipping upload`);
    return allChunks;
  }

  // Batch upsert 500 at a time
  const batchSize = 500;
  let uploaded = 0;

  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize).map((c) => ({
      id: c.id,
      source_url: c.source_url,
      filename: c.filename,
      title: c.title,
      content: c.content,
      section: c.section,
      chunk_index: c.chunk_index,
    }));

    const { error } = await supabase.from("chunks").upsert(batch, { onConflict: "id" });
    if (error) {
      console.error(`  Error at batch ${i}: ${error.message}`);
      // Retry once
      await new Promise((r) => setTimeout(r, 2000));
      const { error: retryError } = await supabase.from("chunks").upsert(batch, { onConflict: "id" });
      if (retryError) {
        console.error(`  Retry failed: ${retryError.message}`);
        continue;
      }
    }

    uploaded += batch.length;
    process.stdout.write(`\r  Uploaded ${uploaded}/${allChunks.length} chunks`);
  }

  console.log(`\n  Done: ${uploaded} chunks uploaded`);
  return allChunks;
}

// --- Phase 2: Generate and store embeddings ---
async function embedChunks(allChunks: Chunk[]) {
  const config = getEmbeddingProvider();
  if (!config) {
    console.error("No embedding provider configured. Set GOOGLE_API_KEY or EMBEDDING_PROVIDER.");
    process.exit(1);
  }

  console.log(`\nPhase 2: Generating embeddings with ${config.provider} (${config.model}, ${config.dimensions}d)`);

  // Get IDs of chunks that already have embeddings (for resume)
  const existingIds = new Set<string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("chunks")
      .select("id")
      .not("embedding", "is", null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error(`  Error fetching existing embeddings: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      existingIds.add(row.id);
    }
    offset += pageSize;
  }

  console.log(`  ${existingIds.size} chunks already embedded, ${allChunks.length - existingIds.size} remaining`);

  const toEmbed = allChunks.filter((c) => !existingIds.has(c.id));
  if (toEmbed.length === 0) {
    console.log("  All chunks already embedded!");
    return;
  }

  const concurrency = config.provider === "gemini" ? 20 : 1;
  const startTime = Date.now();
  let embedded = existingIds.size;

  for (let i = 0; i < toEmbed.length; i += concurrency) {
    const batch = toEmbed.slice(i, i + concurrency);
    const texts = batch.map((ch) => `${ch.title} — ${ch.section}\n${ch.content}`.slice(0, 6000));

    try {
      const embeddings = await generateEmbeddings(texts, config);

      // Update each row with its embedding
      const updates = batch.map((ch, j) => {
        const truncated = embeddings[j].map((v: number) => Math.round(v * 10000) / 10000);
        return supabase
          .from("chunks")
          .update({ embedding: JSON.stringify(truncated) })
          .eq("id", ch.id);
      });

      await Promise.all(updates);
      embedded += batch.length;

      // Progress
      const total = allChunks.length;
      const pct = ((embedded / total) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = ((embedded - existingIds.size) / ((Date.now() - startTime) / 1000)).toFixed(1);
      process.stdout.write(`\r  ${embedded}/${total} (${pct}%) — ${rate} chunks/s — ${elapsed}s elapsed`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  Error at chunk ${i}: ${msg}`);
      if (msg.includes("429") || msg.includes("rate") || msg.includes("RESOURCE_EXHAUSTED")) {
        console.log("  Rate limited — waiting 10s...");
        await new Promise((r) => setTimeout(r, 10000));
        i -= concurrency; // Retry
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\nDone: ${embedded} total embeddings in ${elapsed}s`);
}

// --- Main ---
async function main() {
  const allChunks = await uploadChunks();

  if (!chunksOnly) {
    await embedChunks(allChunks);
  } else {
    console.log("\n--chunks-only: Skipping embedding generation");
  }
}

main().catch(console.error);
