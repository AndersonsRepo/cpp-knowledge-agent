# CPP Campus Knowledge Agent

AI-powered assistant that answers questions about Cal Poly Pomona using official university website content. Built for the MISSA ITC 2026 competition.

## Features

- **Conversational Chat** — Natural language Q&A about admissions, financial aid, academics, campus services, and more
- **Corpus Search Tool** — BM25 keyword search across 72K+ chunks from 8,000+ CPP web pages via LLM tool-calling
- **Grounded Responses** — Answers derived exclusively from the CPP corpus; explicitly states when information isn't available
- **Source Attribution** — Every response cites the original CPP web pages used
- **Multi-turn Conversation** — Maintains context across follow-up questions
- **Starter Questions** — Suggested queries to help users get started
- **Provider-Agnostic** — Works with Anthropic (Claude) or OpenAI (GPT-4o) API keys

## Architecture

```
User Question → Chat UI (React)
                    ↓
              /api/chat (Next.js API route)
                    ↓
              LLM (Claude or GPT-4o) with tool-calling
                    ↓
              search_corpus tool → BM25 inverted index (72K chunks)
                    ↓
              Top-k results with source URLs
                    ↓
              LLM generates grounded response with citations
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Frontend**: React, Tailwind CSS, react-markdown
- **LLM**: Anthropic Claude Sonnet or OpenAI GPT-4o (auto-detected from API key)
- **Search**: BM25 inverted index (in-memory, ~72K chunks)
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

Copy `.env.example` to `.env.local` and set one API key:

```bash
cp .env.example .env.local
```

```env
# Set ONE of these:
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/
    page.tsx              — Chat UI (CPP green/gold theme)
    api/chat/route.ts     — LLM API route with tool-calling
  lib/
    search.ts             — BM25 search engine
scripts/
  preprocess-corpus.ts    — Corpus preprocessor
data/                     — Generated chunk files (not in git)
```

## How It Works

1. **Preprocessing**: Raw markdown files from cpp.edu are stripped of navigation boilerplate, split into ~800-char chunks by section, and stored as JSONL shards.

2. **Search**: On startup, all chunks are loaded into memory and a BM25 inverted index is built. Queries are tokenized and scored using BM25 (TF-IDF variant with length normalization). Results are deduplicated by source URL.

3. **LLM Integration**: The chat API defines a `search_corpus` tool. The LLM is instructed to call this tool before answering factual questions. Tool results (top-8 chunks with source URLs) are returned to the LLM, which generates a grounded response with citations.

## Team

Built for MISSA ITC 2026 — Cal Poly Pomona
