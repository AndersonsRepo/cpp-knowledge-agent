# BroncoBot — Cal Poly Pomona Campus Knowledge Agent

An AI-powered assistant that answers questions about Cal Poly Pomona using tool-calling, hybrid search, and structured data extracted from 8,000+ official CPP web pages. Built for the MISSA ITC 2026 Hackathon.

**Live Demo**: [itc-hackathon-nine.vercel.app](https://itc-hackathon-nine.vercel.app)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tool-Calling System](#tool-calling-system)
- [Search Pipeline](#search-pipeline)
- [Structured Data Extraction](#structured-data-extraction)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
- [Deployment](#deployment)
- [Corpus Statistics](#corpus-statistics)
- [Team](#team)

---

## Features

- **5-Tool Agentic Architecture** — Claude Sonnet intelligently selects from 5 specialized tools and chains up to 5 tool calls per query for comprehensive answers
- **Hybrid Search** — BM25 keyword matching + Gemini semantic embeddings (768d) with 70/30 weighting for high-precision retrieval
- **Structured Faculty Directory** — 2,000+ faculty entries with contact info, office hours, and locations
- **Academic Program Guide** — 760+ courses and 380+ degree programs with descriptions, prerequisites, and unit counts
- **Financial Aid Search** — 460+ scholarships, grants, and aid programs with amounts, eligibility, and deadlines
- **Source Document Linking** — Direct links to 8,000+ official CPP pages for verification
- **Multi-Conversation Tabs** — Multiple chat sessions with localStorage persistence, rename support, and tab management
- **Grounded Responses** — Every answer is derived from official CPP content with source citations
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
│  - "Try BroncoBot" CTA         - localStorage persistence          │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ POST /api/chat
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API Route (/api/chat)                           │
│  - Rate limiting (30 req/hr per IP)                                 │
│  - Provider detection (Anthropic / OpenAI / OpenRouter)             │
│  - System prompt with tool descriptions                             │
│  - Tool-calling loop (max 5 rounds)                                 │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ Tool calls
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Tool Execution Layer                           │
│                                                                     │
│  search_corpus ──► Hybrid BM25 + Semantic Search (72K chunks)      │
│  lookup_faculty ──► Fuzzy match against faculty.json (2,027)        │
│  academic_program_guide ──► Course/program search (760 + 387)      │
│  financial_aid_guide ──► Scholarship/aid search (461)               │
│  get_source_documents ──► Official page lookup (8,042)              │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ Tool results
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Claude Sonnet Response                            │
│  - Synthesizes tool results into natural language                   │
│  - Includes source citations as clickable links                     │
│  - Can chain multiple tools for complex queries                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tool-Calling System

BroncoBot uses Claude Sonnet's native tool-calling capability. The LLM receives 5 tool definitions and autonomously decides which tool(s) to invoke based on the user's question. It can chain multiple tools in a single query for comprehensive answers.

### Tools

| Tool | Description | Data Source | Example Query |
|------|-------------|-------------|---------------|
| `search_corpus` | General campus knowledge — admissions, dining, housing, policies, student life | 72,499 text chunks from cpp.edu | "What dining options are on campus?" |
| `lookup_faculty` | Faculty/staff directory — name, email, phone, office, hours | 2,027 extracted faculty entries | "What are Dr. El Naga's office hours?" |
| `academic_program_guide` | Courses and degree programs — descriptions, prerequisites, units | 760 courses + 387 programs | "What are the prerequisites for CS 2400?" |
| `financial_aid_guide` | Scholarships, grants, and aid — amounts, eligibility, deadlines | 461 financial aid entries | "What engineering scholarships are available?" |
| `get_source_documents` | Official CPP page links — direct URLs to authoritative sources | 8,042 indexed pages | "Link me to the housing application" |

### Multi-Tool Chaining

The agent can call multiple tools in sequence to answer complex questions:

- **"Who teaches CS 2400 and what's the course about?"** → `lookup_faculty` + `academic_program_guide`
- **"How do I apply for financial aid and where's the office?"** → `financial_aid_guide` + `search_corpus`
- **"Show me CS faculty and link to their department page"** → `lookup_faculty` + `get_source_documents`

The system allows up to 5 rounds of tool calls per query, enabling deep multi-step reasoning.

### Tool Selection Logic

Claude Sonnet receives a system prompt describing each tool's purpose and when to use it. The LLM autonomously:
1. Analyzes the user's question
2. Selects the most appropriate tool(s)
3. Formulates the search query for each tool
4. Synthesizes results into a cited response
5. Optionally chains additional tools if the answer is incomplete

---

## Search Pipeline

### Hybrid Search (search_corpus)

The primary search tool combines two complementary retrieval methods:

**BM25 Keyword Search** (always active)
- Full inverted index over 72,499 text chunks
- TF-IDF scoring with document length normalization
- Parameters: k1=1.5, b=0.75
- Handles exact matches, names, course codes, dates

**Semantic Vector Search** (when embeddings present)
- 8,042 page-level embeddings (first chunk per unique URL)
- Gemini `gemini-embedding-001` model at 768 dimensions
- Cosine similarity between query and document embeddings
- Uses `RETRIEVAL_QUERY` task type for queries vs `RETRIEVAL_DOCUMENT` for corpus
- Vectors pre-normalized for fast dot-product similarity

**Hybrid Scoring**
```
final_score = 0.7 × semantic_score + 0.3 × normalized_bm25_score
```

Falls back to BM25-only if no embeddings are present.

### Structured Data Search (other tools)

The 4 structured tools use fuzzy text matching with weighted scoring:
- **Exact match**: score 1.0
- **Contains**: score 0.9
- **Word overlap**: proportional score (matched words / query words)
- Field-specific weights (e.g., faculty name weighted 3x vs department 1x)

---

## Structured Data Extraction

Raw corpus chunks were processed through `scripts/extract-structured-data.ts` to generate structured JSON lookup files:

### Faculty Directory (`data/faculty.json`)
- **2,027 entries** extracted from corpus
- Fields: name, email, phone, office location, office hours, department, title, source URL
- Extraction method: scan for `@cpp.edu` email patterns, look backwards for name headers, parse contact blocks
- Enriched with office hours from dedicated faculty pages

### Financial Aid (`data/financial-aid.json`)
- **461 entries** (60 with specific dollar amounts)
- Fields: name, type (scholarship/grant/loan/fellowship), amount, description, eligibility, deadline, department, source URL
- Supports type-filtered searches (e.g., "grants only")

### Academic Programs (`data/programs.json`)
- **760 courses** with code, title, units, description, prerequisites
- **387 degree programs** with name, degree type, college, total units, required courses
- Course code regex matching for direct lookups (e.g., "CS 2400")

### Source Pages (`data/source-pages.json`)
- **8,042 unique pages** from cpp.edu
- Fields: URL, title, section, description
- Enables direct linking to official university resources

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | Next.js 16 (App Router) | Full-stack React with serverless API routes |
| Frontend | React 19 + Tailwind CSS v4 | Responsive chat UI with CPP branding |
| LLM | Claude Sonnet (Anthropic) | Tool-calling chat with multi-step reasoning |
| Embeddings | Gemini `gemini-embedding-001` | 768-dimensional semantic vectors |
| Search | Custom BM25 + cosine similarity | Hybrid keyword + semantic retrieval |
| Markdown | react-markdown + remark-gfm | Rich response rendering with tables |
| Deployment | Vercel | Serverless hosting with auto-deploy from GitHub |
| Language | TypeScript | End-to-end type safety |

### Why These Choices?

- **Claude Sonnet** — Best-in-class tool-calling accuracy; reliably selects the right tool and formulates effective queries
- **Gemini Embeddings** — High-quality 768d vectors with free/low-cost API; `RETRIEVAL_QUERY` vs `RETRIEVAL_DOCUMENT` task types improve search relevance
- **In-memory search** — No database needed; 72K chunks + 8K embeddings fit in serverless function memory (~155MB)
- **BM25 + Semantic hybrid** — Keywords catch exact matches (names, codes, dates) while embeddings catch conceptual similarity

---

## Project Structure

```
cpp-knowledge-agent/
├── src/
│   ├── app/
│   │   ├── page.tsx                # Landing page — features, stats, tech stack
│   │   ├── chat/
│   │   │   └── page.tsx            # Chat UI — tabs, localStorage, markdown rendering
│   │   ├── api/
│   │   │   └── chat/
│   │   │       └── route.ts        # API route — tool-calling loop, rate limiting
│   │   ├── layout.tsx              # Root layout with Geist fonts
│   │   └── globals.css             # Tailwind CSS v4 setup
│   └── lib/
│       ├── search.ts               # Hybrid BM25 + semantic search engine
│       ├── embeddings.ts           # Multi-provider embedding pipeline (Gemini, Ollama, OpenAI, OpenRouter)
│       └── tools.ts                # Tool implementations + TOOL_DEFINITIONS schema
├── scripts/
│   ├── preprocess-corpus.ts        # Corpus preprocessor (strip boilerplate, chunk, shard)
│   ├── embed-corpus.ts             # Batch embedding generator (resumable, concurrent)
│   └── extract-structured-data.ts  # Faculty/aid/program/source page extractor
├── data/
│   ├── chunks-{0-14}.jsonl         # 72,499 text chunks (15 shards)
│   ├── embeddings-{0-14}.jsonl     # 8,042 page-level embeddings (768d, 4dp precision)
│   ├── faculty.json                # 2,027 faculty entries
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

Edit `.env.local` and set your API key:

```env
# Required — LLM for chat (set ONE):
ANTHROPIC_API_KEY=sk-ant-...      # Recommended
# OPENAI_API_KEY=sk-...
# OPENROUTER_API_KEY=sk-or-...

# Optional — Embeddings for semantic search:
GOOGLE_API_KEY=your-google-api-key
EMBEDDING_PROVIDER=gemini
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app ships with pre-generated data files (chunks, embeddings, structured JSON), so no preprocessing is needed to run locally.

### 4. (Optional) Regenerate data from corpus

If you have the original ITC corpus and want to rebuild the data:

```bash
# Preprocess raw markdown into chunks
npx tsx scripts/preprocess-corpus.ts /path/to/itc2026_ai_corpus

# Extract structured data (faculty, financial aid, programs, source pages)
npx tsx scripts/extract-structured-data.ts

# Generate embeddings (requires GOOGLE_API_KEY)
GOOGLE_API_KEY=... npx tsx scripts/embed-corpus.ts --provider gemini --first-per-page
```

The embedding script supports resume — if interrupted, rerun and it picks up where it left off.

---

## Deployment

The app is deployed on Vercel with automatic deploys from the `main` branch.

### Vercel Configuration

- **Framework**: Next.js (auto-detected)
- **Build command**: `next build`
- **Environment variables**: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `EMBEDDING_PROVIDER=gemini`
- **Deploy size**: ~155MB (within Vercel's 250MB limit)
- **Serverless function**: `/api/chat` loads 72K chunks + 8K embeddings into memory on cold start

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
| Page-level embeddings | 8,042 (768d) |
| Faculty entries | 2,027 |
| Financial aid entries | 461 |
| Courses | 760 |
| Degree programs | 387 |
| Source pages cataloged | 8,042 |
| Data directory size | ~155MB |
| Embedding dimensions | 768 (Gemini) |
| Embedding precision | 4 decimal places |

---

## Example Queries

Try these to see the tool-calling system in action:

| Query | Tools Used |
|-------|-----------|
| "What are the admission requirements for freshmen?" | `search_corpus` |
| "What are Dr. El Naga's office hours?" | `lookup_faculty` |
| "What courses are required for a CS degree?" | `academic_program_guide` |
| "What engineering scholarships are available?" | `financial_aid_guide` |
| "Link me to the housing application page" | `get_source_documents` |
| "Who teaches CS 2400 and what's the course about?" | `lookup_faculty` + `academic_program_guide` |
| "How do I apply for financial aid and where's the office?" | `financial_aid_guide` + `search_corpus` |

---

## Team

Built for MISSA ITC 2026 — Cal Poly Pomona
