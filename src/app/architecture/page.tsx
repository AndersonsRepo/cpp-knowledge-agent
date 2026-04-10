import Link from "next/link";

const DECISIONS = [
  {
    decision: "Search method",
    choice: "Hybrid BM25 + semantic",
    why: "BM25 catches exact matches (course codes, names); semantic catches paraphrased intent",
  },
  {
    decision: "Embedding model",
    choice: "Gemini text-embedding-004 (768d)",
    why: "Free tier, RETRIEVAL_QUERY task type optimizes for search",
  },
  {
    decision: "Vector storage",
    choice: "Supabase pgvector (HNSW index)",
    why: "72K vectors exceed Vercel's 250MB bundle limit; HNSW gives ~10-50ms query time",
  },
  {
    decision: "BM25 location",
    choice: "In-memory (serverless)",
    why: "70MB of chunk data fits in Vercel's limit; no DB round-trip for keyword search",
  },
  {
    decision: "Hybrid weights",
    choice: "70% semantic / 30% BM25",
    why: "Validated via blind evaluation (0.95 MRR)",
  },
  {
    decision: "Result count",
    choice: "8 per query",
    why: "A/B tested against 15 — higher MRR at 8 due to candidate pool distortion",
  },
  {
    decision: "Tool architecture",
    choice: "Single tool (search_corpus)",
    why: "Tested 5-tool approach; it routed queries to sparse structured data and degraded answers",
  },
  {
    decision: "LLM integration",
    choice: "Tool-calling, not RAG injection",
    why: "LLM decides when to search; avoids context bloat and hallucination from injected chunks",
  },
];

const CORPUS_STATS = [
  { metric: "Total pages indexed", value: "8,042" },
  { metric: "Total chunks", value: "72,499" },
  { metric: "Chunks embedded", value: "72,499 (100%)" },
  { metric: "Embedding dimensions", value: "768" },
  { metric: "Unique BM25 terms", value: "~110K" },
  { metric: "Avg chunk length", value: "~600 chars" },
];

const PIPELINE_STEPS = [
  { label: "User Question", detail: "Natural language query" },
  { label: "Claude Sonnet", detail: "Tool-calling LLM" },
  { label: "search_corpus", detail: "Single retrieval tool" },
  { label: "BM25 Keyword", detail: "In-memory, 72K chunks" },
  { label: "Gemini Semantic", detail: "pgvector, 768d vectors" },
  { label: "Hybrid Merge", detail: "70% semantic + 30% BM25" },
  { label: "Top 8 Results", detail: "With source URLs" },
  { label: "Grounded Answer", detail: "Cited response" },
];

export default function ArchitecturePage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-2xl bg-[#1E4D2B] px-6 py-5 text-white shadow-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-green-200">BroncoBot</p>
            <h1 className="text-3xl font-bold">Technical Architecture</h1>
            <p className="mt-1 text-sm text-green-100">
              How BroncoBot retrieves and grounds answers from 72,499 chunks of official CPP content.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center justify-center rounded-xl bg-[#C4A747] px-4 py-2 font-semibold text-[#1E4D2B] transition-colors hover:bg-[#d6bc61]"
            >
              Back to Chat
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-green-300 px-4 py-2 font-semibold text-green-100 transition-colors hover:bg-white hover:text-[#1E4D2B]"
            >
              Home
            </Link>
          </div>
        </div>

        {/* Section 1: Architecture Overview */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Architecture Overview</h2>
          <div className="overflow-x-auto">
            <div className="flex items-center gap-2 min-w-[700px] py-4">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className="flex flex-col items-center text-center w-24">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-sm ${
                      i === 0 ? "bg-[#C4A747]" :
                      i === PIPELINE_STEPS.length - 1 ? "bg-[#C4A747]" :
                      "bg-[#1E4D2B]"
                    }`}>
                      {i + 1}
                    </div>
                    <p className="text-xs font-semibold text-gray-800 mt-1.5">{step.label}</p>
                    <p className="text-[10px] text-gray-500 leading-tight">{step.detail}</p>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <span className="text-gray-300 text-lg flex-shrink-0">&rarr;</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 2: Key Technical Decisions */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Key Technical Decisions</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200 text-left text-gray-500">
                  <th className="px-4 py-3 font-semibold">Decision</th>
                  <th className="px-4 py-3 font-semibold">What we chose</th>
                  <th className="px-4 py-3 font-semibold">Why</th>
                </tr>
              </thead>
              <tbody>
                {DECISIONS.map((d, i) => (
                  <tr key={d.decision} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                    <td className="px-4 py-3 font-medium text-gray-800">{d.decision}</td>
                    <td className="px-4 py-3 text-[#1E4D2B] font-medium">{d.choice}</td>
                    <td className="px-4 py-3 text-gray-600">{d.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3: Corpus Statistics */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Corpus Statistics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {CORPUS_STATS.map((s) => (
              <div key={s.metric} className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-2xl font-bold text-[#1E4D2B]">{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.metric}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Retrieval Evaluation */}
        <section className="rounded-2xl bg-[#163D22] p-6 text-white shadow-md">
          <h2 className="text-lg font-semibold">Retrieval Evaluation — Blind A/B Test (10 queries)</h2>
          <p className="mt-1 text-sm text-green-200">
            We validated our search pipeline with objective metrics, not subjective judgment.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-green-700 text-green-300">
                  <th className="px-4 py-2 font-medium">Metric</th>
                  <th className="px-4 py-2 font-medium text-center">limit=8</th>
                  <th className="px-4 py-2 font-medium text-center">limit=15</th>
                </tr>
              </thead>
              <tbody className="text-green-100">
                <tr className="border-b border-green-800">
                  <td className="px-4 py-2">Mean Top-1 Score</td>
                  <td className="px-4 py-2 text-center">0.7388</td>
                  <td className="px-4 py-2 text-center">0.7472</td>
                </tr>
                <tr className="border-b border-green-800">
                  <td className="px-4 py-2 font-semibold text-white">Mean Reciprocal Rank (MRR)</td>
                  <td className="px-4 py-2 text-center font-semibold text-[#C4A747]">0.9500</td>
                  <td className="px-4 py-2 text-center">0.8833</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Queries with correct answer in top-3</td>
                  <td className="px-4 py-2 text-center font-semibold text-[#C4A747]">9/10</td>
                  <td className="px-4 py-2 text-center">8/10</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-green-300 leading-relaxed max-w-3xl">
            <strong className="text-green-200">Key finding:</strong> Expanding the semantic candidate pool from 24 to 45 (via match_count: limit * 3)
            pulled in tangentially related chunks that distorted hybrid score normalization. 6/10 queries returned different top-3 rankings.
            We chose limit=8 for higher MRR despite marginally lower top-1 scores — correct ranking matters more than marginal relevance gains.
          </p>
        </section>
      </div>
    </main>
  );
}
