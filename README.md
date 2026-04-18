# BroncoBot — Cal Poly Pomona Campus Knowledge Agent

An AI-powered assistant that answers questions about Cal Poly Pomona using tool-calling, hybrid search, and structured data extracted from 8,000+ official CPP web pages. Built for the MISSA ITC 2026 Hackathon.

**Live Demo**: [itc-hackathon-nine.vercel.app](https://itc-hackathon-nine.vercel.app)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Search Pipeline](#search-pipeline)
- [Retrieval Evaluation](#retrieval-evaluation)
- [Structured Data Extraction](#structured-data-extraction)
- [Analytics & Feedback](#analytics--feedback)
- [Admin Portal & Scraper](#admin-portal--scraper)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
- [Deployment](#deployment)
- [Corpus Statistics](#corpus-statistics)
- [Team](#team)

---

## Features

- **Agentic Tool-Calling** — Claude Sonnet autonomously decides when to search, formulates queries, and chains up to 3 tool-call rounds per conversation turn
- **Hybrid Search** — BM25 keyword matching (in-memory) + Gemini semantic embeddings via Supabase pgvector (768d, HNSW index) with 70/30 weighting
- **Validated Retrieval** — Blind A/B evaluation achieving 0.95 MRR with correct answers in top-3 for 9/10 test queries
- **Source Attribution** — Every answer cites the official CPP web pages it drew from as clickable links
- **Analytics Dashboard** — Real-time query volume, search quality scores, response times, and tool usage (Supabase-backed)
- **User Feedback** — Thumbs up/down on every response, stored in Supabase for quality tracking
- **Follow-Up Suggestions** — AI-generated follow-up questions after each answer
- **Search Transparency** — Expandable "Search Details" on each response showing result count, relevance score, search mode, and source URLs
- **Multi-Conversation Tabs** — Multiple chat sessions with localStorage persistence, rename support, and tab management
- **Confidence Signals** — Each search result tagged HIGH/MEDIUM/LOW confidence based on retrieval score
- **Admin Portal** — Password-protected content management at `/admin` with corpus browser, content upload, and scraper dashboard
- **Auto-Scraper** — Scheduled web scrapers with progress tracking, mock-ready for production deployment
- **Live Content Ingestion** — Upload text or markdown via the admin portal; auto-chunked and embedded, immediately searchable
- **Rate Limiting** — Per-IP rate limiting (30 requests/hour) to prevent abuse
- **Responsive Design** — Full mobile support with collapsible sidebar

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User Interface                               │
│  Landing Page (/)              Chat Interface (/chat)               │
│  - Feature showcase            - Multi-tab conversations            │
│  - Tech stack overview         - Category cards with examples       │
│  - Corpus statistics           - Markdown rendering + link handling │
│  - "Try BroncoBot" CTA         - Feedback buttons + search details  │
│                                                                     │
│  Architecture (/architecture)  Analytics (/analytics)               │
│  - Pipeline visualization      - Query volume + response times      │
│  - Technical decisions table   - Retrieval quality scores           │
│  - Retrieval evaluation        - Tool usage + search modes          │
│  - Corpus statistics           - Recent query log                   │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ POST /api/chat
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API Route (/api/chat)                           │
│  - Rate limiting (30 req/hr per IP)                                 │
│  - Provider detection (Anthropic / OpenAI / OpenRouter)             │
│  - System prompt with tool description + confidence signals         │
│  - Tool-calling loop (max 3 rounds)                                 │
│  - Follow-up suggestion generation                                  │
│  - Analytics logging to Supabase                                    │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ Tool call: search_corpus
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Hybrid Search Engine                           │
│                                                                     │
│  BM25 Keyword Search ──► In-memory inverted index (72K chunks)     │
│           +                                                         │
│  Gemini Semantic Search ──► Supabase pgvector (72K embeddings)     │
│           ↓                                                         │
│  Hybrid Merge: 0.7 × semantic + 0.3 × BM25 → Top 8 results       │
│  Each result tagged: HIGH / MEDIUM / LOW confidence                 │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ Ranked results with sources
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Claude Sonnet Response                            │
│  - Synthesizes results into natural language                        │
│  - Includes source citations as clickable links                     │
│  - Can request additional searches if answer is incomplete          │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**Single Tool over Multi-Tool**

We initially built a 5-tool system (search_corpus, lookup_faculty, academic_program_guide, financial_aid_guide, get_source_documents) with dedicated structured data for each. After testing, we found that the LLM frequently routed queries to sparse structured datasets when the full corpus had better answers. The single `search_corpus` tool with hybrid search consistently outperformed the multi-tool approach on answer quality.

**Embedding Migration: Local Ollama to Cloud Gemini**

Our initial embedding pipeline used **Ollama `nomic-embed-text`** running locally — a free, open-source model producing 768-dimensional vectors at ~35 chunks/second. Embeddings were stored as local JSONL shard files alongside the chunk data and loaded into serverless memory at runtime.

This worked for development, but created a problem: the embeddings lived in local files bundled into the Vercel deployment. When we migrated semantic search to **Supabase pgvector** (for faster HNSW-indexed queries and to reduce the serverless memory footprint), we needed an embedding provider that could be called from Vercel's serverless functions at query time — Ollama runs on `localhost:11434`, which doesn't exist in the cloud.

We switched to **Gemini `gemini-embedding-001`**, which matched Ollama's 768 dimensions (so the hybrid scoring weights didn't need retuning), is free-tier, and is accessible via API from any environment. As a bonus, Gemini supports asymmetric task types (`RETRIEVAL_DOCUMENT` for corpus indexing, `RETRIEVAL_QUERY` for search queries), which improved search relevance over Ollama's single-mode embeddings.

The embedding script (`scripts/embed-corpus.ts`) still supports both providers — set `EMBEDDING_PROVIDER=ollama` for local development or `EMBEDDING_PROVIDER=gemini` for cloud/production.

---

## Search Pipeline

### Hybrid Search (search_corpus)

The search tool combines two complementary retrieval methods:

**BM25 Keyword Search** (in-memory, always active)
- Full inverted index over 72,499 text chunks loaded into serverless memory
- TF-IDF scoring with document length normalization
- Parameters: k1=1.2, b=0.75
- Handles exact matches: course codes, faculty names, dates, building numbers

**Semantic Vector Search** (Supabase pgvector)
- 72,499 chunk embeddings stored in Supabase with HNSW index (~10-50ms query time)
- Gemini `gemini-embedding-001` model at 768 dimensions (migrated from local Ollama nomic-embed-text — see above)
- Corpus embedded with `RETRIEVAL_DOCUMENT` task type; queries embedded with `RETRIEVAL_QUERY` task type (Gemini's asymmetric embedding improves search relevance)
- Vectors pre-normalized for fast dot-product similarity

**Hybrid Scoring**
```
final_score = 0.7 × semantic_score + 0.3 × normalized_bm25_score
```

Falls back to BM25-only if Supabase or the embedding provider is unavailable.

**Result Deduplication**: Maximum 2 chunks per URL to prevent a single page from dominating results.

**Confidence Levels**: Each result is tagged based on its hybrid score:
- **HIGH** (>= 0.75): Strong match, used directly
- **MEDIUM** (0.55–0.74): Used with caution, cross-referenced when possible
- **LOW** (< 0.55): Only used if no better results exist, with uncertainty noted

---

## Retrieval Evaluation

We validated the search pipeline with a blind A/B test across 10 representative queries:

| Metric | limit=8 | limit=15 |
|--------|---------|----------|
| Mean Top-1 Score | 0.7388 | 0.7472 |
| **Mean Reciprocal Rank (MRR)** | **0.9500** | 0.8833 |
| Queries with correct answer in top-3 | **9/10** | 8/10 |

**Key finding**: Expanding the semantic candidate pool from 24 to 45 (via `match_count: limit * 3`) pulled in tangentially related chunks that distorted hybrid score normalization. 6/10 queries returned different top-3 rankings. We chose `limit=8` for higher MRR — correct ranking matters more than marginal relevance gains.

---

## Structured Data Extraction

Raw corpus chunks were processed through `scripts/extract-structured-data.ts` to generate structured JSON files. These are used for the landing page statistics and were used in the earlier multi-tool architecture. The extraction pipeline is entirely deterministic (regex-based, no LLM).

### Faculty Directory (`data/faculty.json`)
- **1,546 entries** extracted from corpus
- Fields: name, email, phone, office location, office hours, department, title, source URL
- Extraction method: scan for `@cpp.edu` email patterns, look backwards for name headers, parse contact blocks
- Two-pass enrichment: first pass extracts contacts, second pass enriches from dedicated office hours pages

### Financial Aid (`data/financial-aid.json`)
- **461 entries** (60 with specific dollar amounts)
- Fields: name, type (scholarship/grant/loan/fellowship), amount, description, eligibility, deadline, department, source URL
- Three extraction patterns: bold+amount, header+description paragraph, bullet lists

### Academic Programs (`data/programs.json`)
- **760 courses** with code, title, and units; 56 include full descriptions, 14 include prerequisites (most entries are extracted from department pages and table rows — detailed catalog descriptions were not in the original corpus)
- **387 degree programs** with name, degree type, college, and required course codes where available
- Four course patterns matched (en-dash, no-dash, bold, table row)
- **Note**: The ITC-provided corpus did not include `catalog.cpp.edu` pages, so detailed course descriptions are sparse. The admin portal's scraper is designed to fill this gap.

### Source Pages (`data/source-pages.json`)
- **8,042 unique pages** from cpp.edu
- Fields: URL, title, section, description

---

## Analytics & Feedback

### Analytics Dashboard (`/analytics`)

Server-rendered page querying Supabase `analytics` table. Tracks:
- **Query volume** and **average response time**
- **Success rate** and **no-answer rate** (detected via empty results or hedging language)
- **Retrieval quality**: average top search score, result count, search mode distribution (BM25/hybrid/semantic)
- **Tool usage** patterns
- **Recent query log** with per-query detail (time, query text, status, scores, tools, sources)

### User Feedback (`/api/feedback`)

Thumbs up/down buttons on every assistant response. Stored in Supabase `feedback` table with session ID and the user query that prompted the response. Helpful rate displayed on the analytics dashboard.

### Search Metadata

Each assistant response includes an expandable "Search Details" panel showing:
- Number of chunks retrieved
- Top relevance score
- Search mode used (BM25, semantic, or hybrid)
- The actual query the LLM sent to the search tool
- Source pages that were searched

---

## Admin Portal & Scraper

### Admin Portal (`/admin`)

A password-protected content management portal for maintaining BroncoBot's knowledge base. Accessible at `/admin` with a simple token auth gate (configurable via `ADMIN_PASSWORD` env var).

**Three tabs:**

**Scraper Dashboard** — View and manage automated web scrapers. Each scraper card shows:
- Status indicator (active, disabled, or requires auth)
- Target URL and glob pattern
- Schedule (weekly, monthly, quarterly, per-semester)
- Last run date, pages crawled, chunks synced
- "Run Now" button with animated progress bar and live crawl log

Pre-configured scrapers: CPP Course Catalog (weekly), Faculty Directory (monthly), Financial Aid (quarterly), and BroncoDirect Course Schedule (grayed out — requires authentication credentials).

**Content Upload** — Manually add content the scraper can't reach (instructor assignments, internal announcements, FAQ updates). Supports plain text and markdown input. Enter a title, optional source URL, and content. The backend automatically chunks it (800 chars, 100 char overlap) and generates Gemini embeddings. Content is immediately searchable in BroncoBot after upload.

**Corpus Browser** — Search and paginate all chunks in Supabase. Each chunk shows its title, section, source URL, content preview, and an ingestion badge (corpus/scraper/admin). Admin-uploaded and scraped content can be deleted by source URL.

### Mock Scraper for Production Readiness

The scraper API (`/api/scraper`) demonstrates the production architecture. When "Run Now" is clicked:

1. The progress modal simulates a live crawl with page-by-page log entries
2. Under the hood, pre-prepared course catalog entries (CS 2400, CS 1400, CS 3310, CS 2640, CS 3560) are chunked and ingested into Supabase with real embeddings
3. The chunks become immediately searchable — ask BroncoBot "What's CS 2400?" after running the scraper and get a real answer

In production, the mock would be replaced with a real crawler (using libraries like `crawlee` or `firecrawl`) triggered by Vercel Cron Jobs or GitHub Actions on a weekly/monthly schedule. The ingestion pipeline (`src/lib/chunker.ts` + `src/lib/ingest.ts`) is the same code path used by both the scraper and admin upload.

### Content Ingestion Pipeline

The chunking and embedding logic was extracted from the CLI scripts into reusable library functions:

- `src/lib/chunker.ts` — `chunkText()` and `chunkPlainText()` split content into ~800-char chunks with 100-char overlap, preserving markdown section boundaries
- `src/lib/ingest.ts` — `ingestChunks()` upserts chunks to Supabase and generates Gemini embeddings. Handles rate limiting (5s backoff on 429) and tracks ingestion source (`corpus`, `scraper`, `admin_text`, `admin_url`)

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | Next.js 16 (App Router) | Full-stack React with serverless API routes |
| Frontend | React 19 + Tailwind CSS v4 | Responsive chat UI with CPP branding |
| LLM | Claude Sonnet 4.6 (Anthropic) | Tool-calling chat with multi-step reasoning |
| Embeddings | Gemini `gemini-embedding-001` | 768-dimensional semantic vectors |
| Vector DB | Supabase pgvector (HNSW index) | Semantic search (~10-50ms query time) |
| BM25 Search | Custom in-memory implementation | Keyword search over 72K chunks |
| Analytics | Supabase (PostgreSQL) | Query logging, feedback, dashboard data |
| Markdown | react-markdown + remark-gfm | Rich response rendering with tables |
| Deployment | Vercel | Serverless hosting with auto-deploy from GitHub |
| Language | TypeScript | End-to-end type safety |

### Why These Choices?

- **Claude Sonnet** — Best-in-class tool-calling accuracy; reliably formulates effective search queries
- **Single tool over 5 tools** — Tested both; multi-tool routing degraded answers by sending queries to sparse structured data
- **Gemini Embeddings** — High-quality 768d vectors with free tier; asymmetric `RETRIEVAL_QUERY` / `RETRIEVAL_DOCUMENT` task types improve search relevance
- **Supabase pgvector** — 72K vectors with HNSW index; fast query time without loading embeddings into serverless memory
- **In-memory BM25** — 70MB of chunk data fits in Vercel's serverless memory limit; no DB round-trip for keyword search
- **Hybrid 70/30** — Validated via blind A/B evaluation (0.95 MRR)
- **limit=8 over limit=15** — Higher MRR despite marginally lower top-1 scores; correct ranking matters more

---

## Project Structure

```
broncobot/
├── src/
│   ├── app/
│   │   ├── page.tsx                # Landing page — features, stats, tech stack
│   │   ├── chat/
│   │   │   └── page.tsx            # Chat UI — tabs, feedback, search details, suggestions
│   │   ├── admin/
│   │   │   └── page.tsx            # Admin portal — scraper dashboard, upload, corpus browser
│   │   ├── architecture/
│   │   │   └── page.tsx            # Architecture docs — pipeline, decisions, evaluation
│   │   ├── analytics/
│   │   │   └── page.tsx            # Analytics dashboard — Supabase-backed metrics
│   │   ├── api/
│   │   │   ├── chat/
│   │   │   │   └── route.ts        # Chat API — tool-calling loop, rate limiting, analytics
│   │   │   ├── admin/
│   │   │   │   ├── auth/route.ts   # Admin login
│   │   │   │   ├── upload/route.ts # Content upload + auto-chunk + embed
│   │   │   │   └── corpus/route.ts # Corpus browser (list, search, delete)
│   │   │   ├── scraper/
│   │   │   │   └── route.ts        # Scraper schedules + mock scrape execution
│   │   │   ├── analytics/
│   │   │   │   └── route.ts        # Analytics data endpoint
│   │   │   └── feedback/
│   │   │       └── route.ts        # User feedback collection
│   │   ├── layout.tsx              # Root layout with Geist fonts
│   │   └── globals.css             # Tailwind CSS v4 setup
│   └── lib/
│       ├── search.ts               # Hybrid BM25 + Supabase pgvector search engine
│       ├── embeddings.ts           # Multi-provider embedding pipeline (Gemini, Ollama, OpenAI)
│       ├── chunker.ts              # Reusable chunking library (shared by scripts + admin API)
│       ├── ingest.ts               # Chunk upsert + embedding generation pipeline
│       ├── admin-auth.ts           # Admin token auth check
│       ├── analytics.ts            # Analytics CRUD (Supabase)
│       └── supabase.ts             # Supabase admin client
├── scripts/
│   ├── preprocess-corpus.ts        # Corpus preprocessor (strip boilerplate, chunk, shard)
│   ├── embed-corpus.ts             # Batch embedding generator (resumable, Supabase upload)
│   └── extract-structured-data.ts  # Faculty/aid/program/source page extractor
├── supabase/
│   └── migrations/                  # Versioned SQL: chunks, analytics, feedback, admin schema
├── data/
│   ├── chunks-{0-14}.jsonl         # 72,499 text chunks (15 shards)
│   ├── faculty.json                # 1,546 faculty entries
│   ├── financial-aid.json          # 461 financial aid entries
│   ├── programs.json               # 760 courses + 387 programs
│   └── source-pages.json           # 8,042 indexed CPP pages
├── .env.example                    # Environment variable template
├── next.config.ts                  # Vercel serverless bundling config
└── package.json
```

---

## Local Setup

### Prerequisites

- Node.js 18+ (tested with 23.x)
- npm
- An Anthropic API key (recommended) or OpenAI/OpenRouter key
- A Supabase project with pgvector extension enabled

### 1. Clone and install

```bash
git clone https://github.com/AndersonsRepo/cpp-knowledge-agent.git
cd cpp-knowledge-agent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and set your keys:

```env
# Required — LLM for chat (set ONE):
ANTHROPIC_API_KEY=sk-ant-...      # Recommended
# OPENAI_API_KEY=sk-...
# OPENROUTER_API_KEY=sk-or-...

# Required — Supabase for vector search + analytics:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Required — Embeddings for semantic search:
GOOGLE_API_KEY=your-google-api-key
EMBEDDING_PROVIDER=gemini

# Optional — Admin portal password (default: broncobot-admin-2026):
ADMIN_PASSWORD=your-admin-password
```

### 3. Set up Supabase

Run the SQL files in `supabase/migrations/` in order (`20260410_create_chunks.sql`, `20260411_create_analytics.sql`, `20260412_create_feedback.sql`, `20260417_admin_schema.sql`). This creates the `chunks` table with a `vector(768)` column and HNSW index, the `analytics` and `feedback` tables for the dashboard, the `match_chunks` RPC for vector similarity search, and the `scraper_schedules` table with ingestion-tracking columns for the admin portal.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app ships with pre-generated chunk data files, so BM25 search works immediately. Semantic search requires Supabase pgvector to be populated (see step 5).

### 5. (Optional) Regenerate data from corpus

If you have the original ITC corpus and want to rebuild the data pipeline:

```bash
# Step 1: Preprocess raw markdown into chunks
npx tsx scripts/preprocess-corpus.ts /path/to/itc2026_ai_corpus

# Step 2: Extract structured data (faculty, financial aid, programs, source pages)
npx tsx scripts/extract-structured-data.ts

# Step 3: Upload chunks to Supabase and generate embeddings
npx tsx scripts/embed-corpus.ts --provider gemini
```

The embedding script supports resume — if interrupted, rerun and it picks up where it left off. Rate limiting is handled automatically with 10-second backoff on 429 errors.

---

## Deployment

The app is deployed on Vercel with automatic deploys from the `main` branch.

### Vercel Configuration

- **Framework**: Next.js (auto-detected)
- **Build command**: `next build`
- **Environment variables**: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `EMBEDDING_PROVIDER=gemini`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`
- **Serverless function**: `/api/chat` loads 72K chunks into memory on cold start for BM25; semantic search is offloaded to Supabase pgvector

### `next.config.ts`

The `outputFileTracingIncludes` setting ensures `data/` files are bundled with the serverless function:

```ts
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/chat": ["./data/**/*"],
  },
};
```

---

## Corpus Statistics

| Metric | Count |
|--------|-------|
| Total text chunks | 72,499 |
| Unique pages indexed | 8,042 |
| Chunk embeddings (pgvector) | 72,499 (768d) |
| Faculty entries | 1,546 |
| Financial aid entries | 461 |
| Courses | 760 |
| Degree programs | 387 |
| Source pages cataloged | 8,042 |
| Unique BM25 terms | ~110,000 |
| Avg chunk length | ~600 chars |
| Embedding dimensions | 768 (Gemini) |

---

## Example Queries

| Query | What Happens |
|-------|-------------|
| "What are the admission requirements for freshmen?" | Corpus search → admissions content |
| "What are Dr. El Naga's office hours?" | Corpus search → faculty contact chunk |
| "What courses are required for a CS degree?" | Corpus search → degree requirements |
| "What engineering scholarships are available?" | Corpus search → financial aid content |
| "Link me to the housing application page" | Corpus search → page with source URL |
| "Who teaches CS 2400 and what's the course about?" | Multiple search rounds → faculty + course content |

---

## Team

Built for MISSA ITC 2026 — Cal Poly Pomona
