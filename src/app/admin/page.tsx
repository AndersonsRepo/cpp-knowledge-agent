"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// --- Types ---

interface ScraperSchedule {
  id: string;
  name: string;
  target_url: string;
  url_pattern: string | null;
  cron_expression: string;
  last_run_at: string | null;
  next_run_at: string | null;
  chunks_added: number;
  pages_crawled: number;
  enabled: boolean;
  requires_auth: boolean;
}

interface CorpusChunk {
  id: string;
  title: string;
  section: string;
  source_url: string;
  content: string;
  chunk_index: number;
  ingested_by: string;
  ingested_at: string;
}

interface ScrapeResult {
  pagesCrawled: number;
  chunksCreated: number;
  chunksEmbedded: number;
  errors: string[];
  pages: Array<{ url: string; title: string; chunks: number }>;
}

// --- Auth Gate ---

function LoginGate({ onAuth }: { onAuth: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin() {
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const { token } = await res.json();
      onAuth(token);
    } else {
      setError("Invalid password");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#1E4D2B] rounded-full flex items-center justify-center text-lg font-bold text-[#C4A747]">
            B
          </div>
          <div>
            <h1 className="font-bold text-gray-900">BroncoBot Admin</h1>
            <p className="text-xs text-gray-500">Content Management Portal</p>
          </div>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          placeholder="Admin password"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D2B] mb-3"
        />
        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
        <button
          onClick={handleLogin}
          className="w-full py-2.5 bg-[#1E4D2B] text-white rounded-lg font-medium text-sm hover:bg-[#163D22] transition-colors"
        >
          Sign In
        </button>
      </div>
    </div>
  );
}

// --- Content Upload Tab ---

function ContentUpload({ token }: { token: string }) {
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"text" | "markdown">("text");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    chunksCreated: number;
    chunksEmbedded: number;
    errors: string[];
  } | null>(null);

  async function handleUpload() {
    if (!title || !content) return;
    setUploading(true);
    setResult(null);

    const res = await fetch("/api/admin/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify({ title, sourceUrl, content, type }),
    });

    const data = await res.json();
    setUploading(false);
    setResult(data);

    if (data.chunksCreated > 0) {
      setTitle("");
      setSourceUrl("");
      setContent("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(["text", "markdown"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              type === t
                ? "bg-[#1E4D2B] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t === "text" ? "Plain Text" : "Markdown"}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="CS 2400 — Data Structures (Fall 2026)"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D2B]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Source URL (optional)
        </label>
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://catalog.cpp.edu/cs-2400"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D2B]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder={
            type === "markdown"
              ? "# Course Title\n\n**Prerequisites:** ...\n\n**Description:** ..."
              : "Paste course description, policy text, or any content here..."
          }
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1E4D2B]"
        />
        {content && (
          <p className="text-xs text-gray-400 mt-1">
            {content.length} chars — estimated{" "}
            {Math.max(1, Math.ceil(content.length / 800))} chunk(s)
          </p>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={uploading || !title || !content}
        className="px-6 py-2.5 bg-[#1E4D2B] text-white rounded-lg font-medium text-sm hover:bg-[#163D22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? "Uploading & Embedding..." : "Upload & Embed"}
      </button>

      {result && (
        <div
          className={`rounded-xl p-4 text-sm ${
            result.errors.length > 0
              ? "bg-yellow-50 border border-yellow-200"
              : "bg-green-50 border border-green-200"
          }`}
        >
          <p className="font-medium">
            {result.chunksCreated} chunk(s) created,{" "}
            {result.chunksEmbedded} embedded
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 text-xs text-yellow-700 space-y-1">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {result.chunksEmbedded > 0 && (
            <p className="mt-2 text-green-700 text-xs">
              Content is now searchable in BroncoBot.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Corpus Browser Tab ---

function cleanTitle(raw: string | null | undefined): string {
  if (!raw) return "Untitled";
  const linkMatch = raw.trim().match(/^\[([^\]]+)\]\([^)]+\)\s*$/);
  if (linkMatch) return linkMatch[1].trim();
  return raw.replace(/^#+\s*/, "").trim() || "Untitled";
}

function cleanPreview(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/\n{2,}/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
}

function prettifyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const q = u.search ? u.search : "";
    return `${u.host}${path}${q}`;
  } catch {
    return url;
  }
}

function CorpusBrowser({ token }: { token: string }) {
  const [chunks, setChunks] = useState<CorpusChunk[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChunks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/admin/corpus?${params}`, {
        headers: { "x-admin-token": token },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        setChunks([]);
        setTotal(0);
      } else {
        setChunks(data.chunks || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setChunks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, page, search]);

  useEffect(() => {
    fetchChunks();
  }, [fetchChunks]);

  async function handleDelete(sourceUrl: string) {
    if (!confirm(`Delete all chunks from ${sourceUrl}?`)) return;
    await fetch("/api/admin/corpus", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify({ sourceUrl }),
    });
    fetchChunks();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (setPage(0), fetchChunks())}
          placeholder="Search chunks..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D2B]"
        />
        <button
          onClick={() => {
            setPage(0);
            fetchChunks();
          }}
          className="px-4 py-2 bg-[#1E4D2B] text-white rounded-lg text-sm font-medium"
        >
          Search
        </button>
      </div>

      <p className="text-xs text-gray-500">
        {total} total chunks {search && `matching "${search}"`}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <p className="font-medium mb-1">Failed to load corpus</p>
          <p className="text-xs font-mono break-all">{error}</p>
          <p className="text-xs text-red-600 mt-2">
            If this mentions a missing column or relation, apply{" "}
            <code>supabase/migrations/20260417_admin_schema.sql</code> in the
            Supabase SQL Editor.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
      ) : (
        <div className="space-y-2">
          {chunks.map((chunk) => (
            <div
              key={chunk.id}
              className="bg-white border border-gray-200 rounded-xl p-4 text-sm hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">
                    {cleanTitle(chunk.title)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {cleanTitle(chunk.section)} · chunk #{chunk.chunk_index}
                  </p>
                  {chunk.source_url && (
                    <a
                      href={chunk.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-xs text-[#1E4D2B] hover:text-[#0f3018] hover:underline break-all"
                      title={chunk.source_url}
                    >
                      <span>{prettifyUrl(chunk.source_url)}</span>
                      <svg
                        className="w-3 h-3 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  )}
                  <p className="text-gray-600 mt-2 text-xs leading-relaxed line-clamp-3">
                    {cleanPreview(chunk.content)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      chunk.ingested_by === "corpus"
                        ? "bg-gray-100 text-gray-600"
                        : chunk.ingested_by === "scraper"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {chunk.ingested_by || "corpus"}
                  </span>
                  {chunk.ingested_by !== "corpus" && (
                    <button
                      onClick={() => handleDelete(chunk.source_url)}
                      className="text-[10px] text-red-400 hover:text-red-600"
                    >
                      delete source
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-30"
        >
          Previous
        </button>
        <span className="text-xs text-gray-500">
          Page {page + 1} of {Math.ceil(total / 20) || 1}
        </span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={(page + 1) * 20 >= total}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// --- Scraper Dashboard Tab ---

function ScraperDashboard({ token }: { token: string }) {
  const [schedules, setSchedules] = useState<ScraperSchedule[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/scraper", {
          headers: { "x-admin-token": token },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || `Request failed (${res.status})`);
          setSchedules([]);
        } else {
          setSchedules(data.schedules || []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setSchedules([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  function formatDate(d: string | null) {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatCron(cron: string) {
    if (cron.includes("* * 0")) return "Weekly (Sundays)";
    if (cron.includes("1 * *")) return "Monthly (1st)";
    if (cron.includes("*/3")) return "Quarterly";
    if (cron.includes("1,8")) return "Per semester";
    return cron;
  }

  async function runScraper(schedule: ScraperSchedule) {
    if (schedule.requires_auth) return;
    setRunning(schedule.id);
    setProgress(0);
    setResult(null);
    setLogs([]);

    // Animate a progress bar while the request is in flight. Real per-page
    // results are populated from the response below (request is synchronous
    // from the client's perspective — ~15-25s for 5 pages + embed).
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const next = p + Math.random() * 8 + 2;
        return Math.min(next, 90);
      });
    }, 800);

    const res = await fetch("/api/scraper", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify({ scheduleId: schedule.id }),
    });

    clearInterval(interval);
    setProgress(100);

    const data = (await res.json()) as ScrapeResult;
    setResult(data);
    setLogs(
      (data.pages || []).map(
        (p) => `${p.url.replace(/^https?:\/\//, "")} — ${p.chunks} chunk${p.chunks === 1 ? "" : "s"} — ${p.title}`
      )
    );

    // Refresh schedules
    const updated = await fetch("/api/scraper", {
      headers: { "x-admin-token": token },
    });
    const refreshed = await updated.json();
    setSchedules(refreshed.schedules || []);

    setTimeout(() => setRunning(null), 3000);
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <p className="font-medium mb-1">Failed to load scraper schedules</p>
          <p className="text-xs font-mono break-all">{error}</p>
          <p className="text-xs text-red-600 mt-2">
            If this mentions a missing relation, apply{" "}
            <code>supabase/migrations/20260417_admin_schema.sql</code> in the
            Supabase SQL Editor.
          </p>
        </div>
      )}
      {!error && !loading && schedules.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">
          No scraper schedules configured yet.
        </p>
      )}
      {loading && (
        <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
      )}
      {schedules.map((s) => (
        <div
          key={s.id}
          className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    s.requires_auth
                      ? "bg-gray-400"
                      : s.enabled
                      ? "bg-green-500"
                      : "bg-yellow-500"
                  }`}
                />
                <h3 className="font-semibold text-gray-900">{s.name}</h3>
                {s.requires_auth && (
                  <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                    Requires Auth
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">{s.target_url}</p>
              {s.url_pattern && (
                <p className="text-xs text-gray-400">
                  Pattern: {s.url_pattern}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-4 text-xs">
            <div>
              <p className="text-gray-500">Schedule</p>
              <p className="font-medium text-gray-800">
                {formatCron(s.cron_expression)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Last run</p>
              <p className="font-medium text-gray-800">
                {formatDate(s.last_run_at)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Pages crawled</p>
              <p className="font-medium text-gray-800">
                {s.pages_crawled.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Chunks synced</p>
              <p className="font-medium text-gray-800">
                {s.chunks_added.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => runScraper(s)}
              disabled={s.requires_auth || running === s.id}
              className="px-4 py-1.5 bg-[#1E4D2B] text-white rounded-lg text-xs font-medium hover:bg-[#163D22] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {running === s.id ? "Running..." : "Run Now"}
            </button>
            {s.requires_auth && (
              <button className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
                Configure
              </button>
            )}
          </div>

          {running === s.id && (
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-700">
                  Scraping: {s.name}
                </p>
                <p className="text-xs text-gray-500">
                  {Math.round(progress)}%
                </p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-[#1E4D2B] h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {logs.length > 0 && (
                <div className="mt-3 space-y-1 font-mono text-[11px] text-gray-500 max-h-32 overflow-y-auto">
                  {logs.map((log, i) => (
                    <p key={i}>
                      <span className="text-green-600">
                        {i < logs.length - 1 || progress === 100 ? "+" : "~"}
                      </span>{" "}
                      {log}
                    </p>
                  ))}
                </div>
              )}
              {result && progress === 100 && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                  Done: {result.pagesCrawled} pages crawled,{" "}
                  {result.chunksCreated} chunks created,{" "}
                  {result.chunksEmbedded} embeddings generated.
                  {result.errors.length > 0 && (
                    <p className="text-yellow-700 mt-1">
                      {result.errors.length} warning(s)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Main Admin Page ---

type Tab = "upload" | "corpus" | "scraper";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("scraper");

  if (!token) return <LoginGate onAuth={setToken} />;

  const tabs: { key: Tab; label: string }[] = [
    { key: "scraper", label: "Scraper Dashboard" },
    { key: "upload", label: "Content Upload" },
    { key: "corpus", label: "Corpus Browser" },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1E4D2B] text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#C4A747] rounded-full flex items-center justify-center text-xl font-bold">
              B
            </div>
            <div>
              <span className="text-xl font-bold">BroncoBot Admin</span>
              <p className="text-xs text-green-200">
                Content Management Portal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="px-4 py-2 rounded-lg border border-green-200 text-sm font-semibold text-green-50 hover:bg-white hover:text-[#1E4D2B] transition-colors"
            >
              Open Chat
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-lg border border-green-200 text-sm font-semibold text-green-50 hover:bg-white hover:text-[#1E4D2B] transition-colors"
            >
              Home
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-white text-[#1E4D2B] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === "scraper" && <ScraperDashboard token={token} />}
        {tab === "upload" && <ContentUpload token={token} />}
        {tab === "corpus" && <CorpusBrowser token={token} />}
      </div>
    </main>
  );
}
