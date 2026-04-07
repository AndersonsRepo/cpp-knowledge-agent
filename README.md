# CPP Campus Knowledge Agent

AI-powered assistant that answers questions about Cal Poly Pomona using official university website content. Built for the MISSA ITC 2026 competition.

## Features

- **Conversational Chat** — Natural language Q&A about admissions, financial aid, academics, campus services, and more
- **Hybrid Search** — BM25 keyword search + optional semantic vector search (70/30 weighting) across 72K+ chunks from 8,000+ CPP web pages
- **Grounded Responses** — Answers derived exclusively from the CPP corpus; explicitly states when information isn't available
- **Source Attribution** — Every response cites the original CPP web pages used
- **Multi-turn Conversation** — Maintains context across follow-up questions
- **Starter Questions** — Suggested queries to help users get started
- **Provider-Agnostic** — Works with Anthropic (Claude), OpenAI (GPT-4o), or OpenRouter (any model)
- **Flexible Embeddings** — Ollama (local/free), OpenAI, or OpenRouter for semantic search

## Architecture

```
User Question → Chat UI (React)
                    ↓
              /api/chat (Next.js API route)
                    ↓
              LLM (Claude / GPT-4o / OpenRouter) with tool-calling
                    ↓
              search_corpus tool → Hybrid Search Engine
                    ├─ BM25 inverted index (always on)
                    └─ Semantic cosine similarity (when embeddings present)
                    ↓
              Top-k results with source URLs
                    ↓
              LLM generates grounded response with citations
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Frontend**: React, Tailwind CSS, react-markdown
- **LLM**: Anthropic Claude Sonnet, OpenAI GPT-4o, or any OpenRouter model (auto-detected)
- **Search**: Hybrid BM25 + semantic vector search (in-memory, ~72K chunks)
- **Embeddings**: Ollama nomic-embed-text (local), OpenAI text-embedding-3-small, or OpenRouter
- **Corpus**: 8,000+ markdown files from cpp.edu, preprocessed and chunked

## Setup

### 1. Clone and install

```bash
git clone https://github.com/AndersonsRepo/cpp-knowledge-agent.git
cd cpp-knowledge-agent
npm install
```

### 2. Preprocess the corpus

Download the ITC corpus and place it somewhere on your machine, then run:

```bash
npx tsx scripts/preprocess-corpus.ts /path/to/itc2026_ai_corpus
```

This generates `data/chunks-*.jsonl` files (~72K chunks).

### 3. Configure API key

Copy `.env.example` to `.env.local` and set **one** LLM API key:

```bash
cp .env.example .env.local
```

```env
# Set ONE of these (app auto-detects which provider to use):
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
```

### 4. (Optional) Generate embeddings for semantic search

Without embeddings, the app uses BM25 keyword search (works great). With embeddings, you get hybrid semantic + keyword search for better results.

**Option A: Ollama (free, local)**
```bash
# Install Ollama and pull the embedding model
ollama pull nomic-embed-text

# Generate embeddings (takes ~30 min for 72K chunks)
npx tsx scripts/embed-corpus.ts --provider ollama
```

**Option B: OpenAI (fast, ~$0.02)**
```bash
OPENAI_API_KEY=sk-... npx tsx scripts/embed-corpus.ts --provider openai
```

**Option C: OpenRouter**
```bash
OPENROUTER_API_KEY=sk-or-... npx tsx scripts/embed-corpus.ts --provider openrouter
```

The script supports resume — if interrupted, rerun and it picks up where it left off.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/
    page.tsx              — Chat UI (CPP green/gold theme)
    api/chat/route.ts     — LLM API route with tool-calling (3 providers)
  lib/
    search.ts             — Hybrid BM25 + semantic search engine
    embeddings.ts         — Multi-provider embedding pipeline
scripts/
  preprocess-corpus.ts    — Corpus preprocessor (strip boilerplate, chunk)
  embed-corpus.ts         — Batch embedding generator (resumable)
data/                     — Generated chunk + embedding files (not in git)
```

## How It Works

1. **Preprocessing**: Raw markdown files from cpp.edu are stripped of navigation boilerplate (header, footer, sidebar nav), split into ~800-char chunks by section, and stored as JSONL shards.

2. **Search**:
   - **BM25** (always on): Inverted index with TF-IDF scoring and length normalization. Fast keyword matching.
   - **Semantic** (when embeddings present): Cosine similarity between query embedding and precomputed chunk embeddings.
   - **Hybrid**: Combines both — `0.7 * semantic + 0.3 * BM25_normalized`. Falls back to BM25-only if no embeddings.

3. **LLM Integration**: The chat API defines a `search_corpus` tool. The LLM calls this tool before answering factual questions. Tool results (top-8 chunks with source URLs) are returned to the LLM, which generates a grounded response with citations.

## Supported Providers

| Provider | LLM | Embeddings | Env Var |
|----------|-----|------------|---------|
| Anthropic | Claude Sonnet 4.6 | — | `ANTHROPIC_API_KEY` |
| OpenAI | GPT-4o | text-embedding-3-small | `OPENAI_API_KEY` |
| OpenRouter | Any model | Any model | `OPENROUTER_API_KEY` |
| Ollama | — | nomic-embed-text (local) | `OLLAMA_URL` (default localhost) |

## Team

Built for MISSA ITC 2026 — Cal Poly Pomona
