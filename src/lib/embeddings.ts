/**
 * Multi-Provider Embedding Pipeline
 *
 * Supports:
 *   - Ollama (local, free) — nomic-embed-text (768d)
 *   - OpenAI — text-embedding-3-small (1536d)
 *   - OpenRouter — any embedding model via OpenAI-compatible API
 *   - Gemini — text-embedding-004 (768d, free tier)
 *
 * Provider is auto-detected from env vars. Embeddings are stored as JSONL
 * shards alongside the chunk data for fast loading.
 */

// --- Types ---

export interface EmbeddingEntry {
  chunk_id: string;
  embedding: number[];
}

export type EmbeddingProvider = "ollama" | "openai" | "openrouter" | "gemini";

interface ProviderConfig {
  provider: EmbeddingProvider;
  apiKey?: string;
  baseUrl: string;
  model: string;
  dimensions: number;
}

// --- Provider Detection ---

export function getEmbeddingProvider(): ProviderConfig | null {
  const ollamaModel = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  // Check env vars in priority order
  if (process.env.EMBEDDING_PROVIDER === "ollama" || (!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.EMBEDDING_PROVIDER)) {
    return {
      provider: "ollama",
      baseUrl: ollamaUrl,
      model: ollamaModel,
      dimensions: ollamaModel === "nomic-embed-text" ? 768 : 768,
    };
  }

  if (process.env.EMBEDDING_PROVIDER === "gemini" || (process.env.GOOGLE_API_KEY && !process.env.EMBEDDING_PROVIDER)) {
    return {
      provider: "gemini",
      apiKey: process.env.GOOGLE_API_KEY,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
      dimensions: 768,
    };
  }

  if (process.env.EMBEDDING_PROVIDER === "openai" || process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: "https://api.openai.com/v1",
      model: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
      dimensions: 1536,
    };
  }

  if (process.env.EMBEDDING_PROVIDER === "openrouter" || process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: "https://openrouter.ai/api/v1",
      model: process.env.OPENROUTER_EMBED_MODEL || "openai/text-embedding-3-small",
      dimensions: 1536,
    };
  }

  return null;
}

// --- Embedding Generation ---

async function embedOllama(texts: string[], config: ProviderConfig): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    const res = await fetch(`${config.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, prompt: text }),
    });

    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { embedding: number[] };
    results.push(normalizeVector(data.embedding));
  }
  return results;
}

async function embedOpenAICompatible(texts: string[], config: ProviderConfig): Promise<number[][]> {
  // Works for both OpenAI and OpenRouter (OpenAI-compatible API)
  const batchSize = 100;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, input: batch }),
    });

    if (!res.ok) throw new Error(`${config.provider} error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    results.push(...data.data.map((d) => normalizeVector(d.embedding)));
  }

  return results;
}

async function embedGemini(texts: string[], config: ProviderConfig): Promise<number[][]> {
  // Gemini embedding one-at-a-time (batch endpoint is async, not suitable for sync use)
  const results: number[][] = [];

  for (const text of texts) {
    const res = await fetch(
      `${config.baseUrl}/models/${config.model}:embedContent?key=${config.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${config.model}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: config.dimensions,
        }),
      }
    );

    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { embedding: { values: number[] } };
    results.push(normalizeVector(data.embedding.values));
  }

  return results;
}

async function embedGeminiQuery(text: string, config: ProviderConfig): Promise<number[]> {
  // Single query embedding with RETRIEVAL_QUERY task type for better search
  const res = await fetch(
    `${config.baseUrl}/models/${config.model}:embedContent?key=${config.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${config.model}`,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: config.dimensions,
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { embedding: { values: number[] } };
  return normalizeVector(data.embedding.values);
}

export async function generateEmbeddings(texts: string[], config: ProviderConfig): Promise<number[][]> {
  switch (config.provider) {
    case "ollama":
      return embedOllama(texts, config);
    case "gemini":
      return embedGemini(texts, config);
    case "openai":
    case "openrouter":
      return embedOpenAICompatible(texts, config);
  }
}

export async function generateSingleEmbedding(text: string, config: ProviderConfig): Promise<number[]> {
  // Gemini has a dedicated query endpoint with RETRIEVAL_QUERY task type
  if (config.provider === "gemini") {
    return embedGeminiQuery(text, config);
  }
  const [embedding] = await generateEmbeddings([text], config);
  return embedding;
}

// --- Vector Math ---

export function normalizeVector(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  // Vectors are already normalized, so dot product = cosine similarity
  return dotProduct(a, b);
}
