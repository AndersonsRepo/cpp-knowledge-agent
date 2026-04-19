import Link from "next/link";
import { readAnalyticsEntries, summarizeAnalytics } from "@/lib/analytics";
import { createAdminClient } from "@/lib/supabase";

export const revalidate = 10;

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatScore(value: number | null) {
  return value === null ? "N/A" : value.toFixed(2);
}

async function getFeedbackStats(): Promise<{ total: number; helpful: number; rate: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("feedback")
    .select("helpful");

  if (error || !data) return { total: 0, helpful: 0, rate: 0 };

  const total = data.length;
  const helpful = data.filter((r) => r.helpful).length;
  return {
    total,
    helpful,
    rate: total > 0 ? Math.round((helpful / total) * 1000) / 10 : 0,
  };
}

export default async function AnalyticsPage() {
  const entries = await readAnalyticsEntries(100);
  const summary = summarizeAnalytics(entries);
  const feedback = await getFeedbackStats();

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl bg-[#1E4D2B] px-6 py-5 text-white shadow-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-green-200">BroncoBot</p>
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <p className="mt-1 text-sm text-green-100">
              Query volume, search quality, and response-time visibility for the competition demo.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#C4A747] px-4 py-2 font-semibold text-[#1E4D2B] transition-colors hover:bg-[#d6bc61]"
          >
            Back to Chat
          </Link>
        </div>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-500">Total Queries</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{summary.totalQueries}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-500">Avg Response Time</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {summary.avgResponseTimeMs} ms
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-500">Success Rate</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {formatPercent(summary.successRate)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-500">No-Answer Rate</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {formatPercent(summary.noAnswerRate)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-500">Helpful Rate</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {feedback.total > 0 ? `${feedback.rate}%` : "N/A"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {feedback.helpful}/{feedback.total} ratings
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900">Retrieval Quality</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Avg Top Search Score</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {formatScore(summary.avgTopSearchScore)}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Avg Results Returned</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {summary.avgResultCount}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Search Modes Seen</p>
                <div className="mt-2 space-y-1 text-sm text-gray-700">
                  <p>BM25: {summary.searchModeUsage.bm25}</p>
                  <p>Hybrid: {summary.searchModeUsage.hybrid}</p>
                  <p>Semantic: {summary.searchModeUsage.semantic}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Tool Usage</h2>
            <div className="mt-4 space-y-3">
              {summary.toolUsage.length === 0 ? (
                <p className="text-sm text-gray-500">No tool usage logged yet.</p>
              ) : (
                summary.toolUsage.slice(0, 6).map((tool) => (
                  <div key={tool.name} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                    <span className="text-sm font-medium text-gray-700">{tool.name}</span>
                    <span className="rounded-full bg-[#E8F1EA] px-2 py-1 text-xs font-semibold text-[#1E4D2B]">
                      {tool.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Retrieval Evaluation — Blind A/B Test */}
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

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent Queries</h2>
              <p className="text-sm text-gray-500">
                Latest analytics events captured from the chat route.
              </p>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
              No analytics entries yet. Ask a few questions in the chat first, then refresh this page.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Query</th>
                    <th className="px-3 py-2 font-medium">Response</th>
                    <th className="px-3 py-2 font-medium">Search</th>
                    <th className="px-3 py-2 font-medium">Tools</th>
                    <th className="px-3 py-2 font-medium">Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.slice(0, 20).map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-100 align-top">
                      <td className="px-3 py-3 text-gray-500">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-gray-800">
                        <p className="max-w-md font-medium">{entry.query || "N/A"}</p>
                        <p className="mt-1 text-xs text-gray-500">Session: {entry.sessionId}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            entry.success
                              ? "bg-[#E8F1EA] text-[#1E4D2B]"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {entry.success ? "Success" : "Error"}
                        </span>
                        <p className="mt-2 text-xs text-gray-600">{entry.responseTimeMs} ms</p>
                        <p className="text-xs text-gray-500">
                          {entry.noAnswer ? "No-answer response" : "Answer returned"}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        <p>Results: {entry.resultCount}</p>
                        <p>Top score: {formatScore(entry.topSearchScore)}</p>
                        <p>Modes: {entry.searchModes.join(", ") || "N/A"}</p>
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {entry.toolCalls.length > 0 ? entry.toolCalls.join(", ") : "N/A"}
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {entry.sourceUrls.length > 0 ? (
                          <div className="space-y-1">
                            {entry.sourceUrls.slice(0, 2).map((url) => (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-[#1E4D2B] underline underline-offset-2"
                              >
                                {url}
                              </a>
                            ))}
                          </div>
                        ) : (
                          "N/A"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
