import Link from "next/link";

const FEATURES = [
  {
    icon: "🔍",
    title: "Hybrid Search",
    description:
      "Combines BM25 keyword matching with Gemini semantic embeddings via Supabase pgvector for accurate retrieval across 72,000+ chunks from cpp.edu.",
  },
  {
    icon: "🛠",
    title: "Agentic Tool-Calling",
    description:
      "Claude Sonnet uses tool-calling to search the corpus before answering, ensuring every response is grounded in official CPP content.",
  },
  {
    icon: "🧠",
    title: "Semantic Understanding",
    description:
      "768-dimensional Gemini embeddings capture meaning — not just keywords — so the agent finds relevant answers even when phrasing differs.",
  },
  {
    icon: "📚",
    title: "8,000+ Pages Indexed",
    description:
      "Admissions, academics, faculty, financial aid, housing, dining, campus services, and more — all searchable from one conversation.",
  },
  {
    icon: "📊",
    title: "Analytics Dashboard",
    description:
      "Real-time visibility into query volume, search quality scores, response times, and tool usage patterns.",
  },
  {
    icon: "🔗",
    title: "Source Attribution",
    description:
      "Every answer cites the official CPP web pages it drew from, so users can verify information at the source.",
  },
];

const TECH_STACK = [
  { name: "Next.js 16", role: "Full-stack framework" },
  { name: "Claude Sonnet", role: "LLM with tool-calling" },
  { name: "Gemini Embeddings", role: "768d semantic vectors" },
  { name: "Supabase pgvector", role: "Vector database" },
  { name: "BM25 + Cosine", role: "Hybrid retrieval" },
  { name: "Vercel", role: "Serverless deployment" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1E4D2B] text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#C4A747] rounded-full flex items-center justify-center text-xl font-bold">
              B
            </div>
            <span className="text-xl font-bold">BroncoBot</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/architecture"
              className="px-5 py-2 rounded-lg border border-green-200 font-semibold text-green-50 hover:bg-white hover:text-[#1E4D2B] transition-colors"
            >
              Architecture
            </Link>
            <Link
              href="/analytics"
              className="px-5 py-2 rounded-lg border border-green-200 font-semibold text-green-50 hover:bg-white hover:text-[#1E4D2B] transition-colors"
            >
              Analytics
            </Link>
            <Link
              href="/chat"
              className="px-5 py-2 bg-[#C4A747] text-[#1E4D2B] rounded-lg font-semibold hover:bg-[#d4b757] transition-colors"
            >
              Open Chat
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-[#1E4D2B] text-white pb-20 pt-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="w-24 h-24 bg-[#C4A747] rounded-full flex items-center justify-center text-5xl font-bold mx-auto mb-6">
            B
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">BroncoBot</h1>
          <p className="text-xl text-green-200 mb-2">
            Your Cal Poly Pomona Campus Knowledge Agent
          </p>
          <p className="text-green-300 max-w-2xl mx-auto mb-8">
            An AI-powered assistant that answers questions about Cal Poly Pomona
            using tool-calling and hybrid search over 72,000+ chunks from
            cpp.edu.
          </p>
          <Link
            href="/chat"
            className="inline-block px-8 py-3 bg-[#C4A747] text-[#1E4D2B] rounded-xl font-bold text-lg hover:bg-[#d4b757] transition-colors shadow-lg"
          >
            Try BroncoBot
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-gray-800 text-center mb-4">
          How It Works
        </h2>
        <p className="text-gray-500 text-center max-w-2xl mx-auto mb-12">
          BroncoBot uses a multi-tool agentic architecture. Claude Sonnet
          analyzes each question, selects the right tool(s), and chains results
          to build comprehensive answers.
        </p>

        {/* Pipeline diagram */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
          {[
            { step: "1", label: "User Question" },
            { step: "2", label: "Claude Sonnet" },
            { step: "3", label: "Tool Selection" },
            { step: "4", label: "Hybrid Search" },
            { step: "5", label: "Cited Answer" },
          ].map((s, i) => (
            <div key={s.step} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 bg-[#1E4D2B] text-white rounded-full flex items-center justify-center font-bold text-lg">
                  {s.step}
                </div>
                <span className="text-sm text-gray-600 mt-1 font-medium">
                  {s.label}
                </span>
              </div>
              {i < 4 && (
                <span className="text-gray-300 text-2xl hidden sm:block">
                  &rarr;
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="text-2xl mb-3 block">{f.icon}</span>
              <h3 className="font-bold text-gray-800 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="bg-white border-t border-gray-200 py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-800 text-center mb-10">
            Tech Stack
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {TECH_STACK.map((t) => (
              <div
                key={t.name}
                className="border border-gray-200 rounded-lg p-4 text-center"
              >
                <p className="font-semibold text-gray-800">{t.name}</p>
                <p className="text-xs text-gray-500 mt-1">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Corpus Stats */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-gray-800 text-center mb-10">
          Corpus Coverage
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { stat: "72,499", label: "Text Chunks" },
            { stat: "8,042", label: "Pages Indexed" },
            { stat: "1,546", label: "Faculty Entries" },
            { stat: "760+", label: "Courses" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-[#1E4D2B]">{s.stat}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1E4D2B] text-white py-12">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to try it?</h2>
          <p className="text-green-200 mb-6">
            Ask BroncoBot anything about Cal Poly Pomona.
          </p>
          <Link
            href="/chat"
            className="inline-block px-8 py-3 bg-[#C4A747] text-[#1E4D2B] rounded-xl font-bold text-lg hover:bg-[#d4b757] transition-colors"
          >
            Open Chat
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-100 border-t border-gray-200 py-6">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-gray-500">
          <p>
            Built for the ITC Hackathon 2026 — Cal Poly Pomona
          </p>
          <p className="mt-1">
            Powered by Claude Sonnet + Gemini Embeddings
          </p>
        </div>
      </footer>
    </div>
  );
}
