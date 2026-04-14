/**
 * Ingest pipeline — upsert chunks to Supabase and generate embeddings.
 * Shared by CLI scripts and admin API routes.
 */

import { createAdminClient } from "./supabase";
import { getEmbeddingProvider, generateEmbeddings } from "./embeddings";
import type { Chunk } from "./chunker";

export interface IngestResult {
  chunksUpserted: number;
  chunksEmbedded: number;
  errors: string[];
}

export async function ingestChunks(
  chunks: Chunk[],
  source: string = "admin_text"
): Promise<IngestResult> {
  const supabase = createAdminClient();
  const result: IngestResult = { chunksUpserted: 0, chunksEmbedded: 0, errors: [] };

  if (chunks.length === 0) return result;

  // Phase 1: Upsert chunks to Supabase
  const batchSize = 500;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize).map((c) => ({
      id: c.id,
      source_url: c.source_url,
      filename: c.filename,
      title: c.title,
      content: c.content,
      section: c.section,
      chunk_index: c.chunk_index,
      ingested_by: source,
      ingested_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("chunks")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      result.errors.push(`Upsert batch ${i}: ${error.message}`);
    } else {
      result.chunksUpserted += batch.length;
    }
  }

  // Phase 2: Generate and store embeddings
  const config = getEmbeddingProvider();
  if (!config) {
    result.errors.push("No embedding provider configured");
    return result;
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const text = `${chunk.title} — ${chunk.section}\n${chunk.content}`.slice(
      0,
      6000
    );

    try {
      const [embedding] = await generateEmbeddings([text], config);
      const truncated = embedding.map(
        (v: number) => Math.round(v * 10000) / 10000
      );

      const { error } = await supabase
        .from("chunks")
        .update({ embedding: JSON.stringify(truncated) })
        .eq("id", chunk.id);

      if (error) {
        result.errors.push(`Embed ${chunk.id}: ${error.message}`);
      } else {
        result.chunksEmbedded++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Embed ${chunk.id}: ${msg}`);

      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  return result;
}

export async function deleteChunksBySource(sourceUrl: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chunks")
    .delete()
    .eq("source_url", sourceUrl)
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function getCorpusStats(): Promise<{
  totalChunks: number;
  totalEmbedded: number;
  sources: Array<{ source_url: string; count: number; ingested_by: string }>;
}> {
  const supabase = createAdminClient();

  const { count: totalChunks } = await supabase
    .from("chunks")
    .select("id", { count: "exact", head: true });

  const { count: totalEmbedded } = await supabase
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .not("embedding", "is", null);

  const { data: sourceData } = await supabase.rpc("get_corpus_sources");

  return {
    totalChunks: totalChunks ?? 0,
    totalEmbedded: totalEmbedded ?? 0,
    sources: sourceData ?? [],
  };
}
