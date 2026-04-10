import { createAdminClient } from "./supabase";

export type SearchMode = "bm25" | "semantic" | "hybrid";

export interface SearchAnalytics {
  query: string;
  resultCount: number;
  topScore: number | null;
  matchTypes: SearchMode[];
  sourceUrls: string[];
}

export interface AnalyticsEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  query: string;
  messageCount: number;
  provider: string;
  responseTimeMs: number;
  success: boolean;
  noAnswer: boolean;
  statusCode: number;
  errorMessage?: string;
  toolCalls: string[];
  searches: SearchAnalytics[];
  sourceUrls: string[];
  topSearchScore: number | null;
  avgSearchScore: number | null;
  resultCount: number;
  searchModes: SearchMode[];
}

export interface AnalyticsSummary {
  totalQueries: number;
  successRate: number;
  noAnswerRate: number;
  avgResponseTimeMs: number;
  avgTopSearchScore: number | null;
  avgResultCount: number;
  toolUsage: Array<{ name: string; count: number }>;
  searchModeUsage: Record<SearchMode, number>;
}

export async function appendAnalyticsEntry(entry: AnalyticsEntry) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("analytics").insert({
    id: entry.id,
    created_at: entry.timestamp,
    session_id: entry.sessionId,
    query: entry.query,
    message_count: entry.messageCount,
    provider: entry.provider,
    response_time_ms: entry.responseTimeMs,
    success: entry.success,
    no_answer: entry.noAnswer,
    status_code: entry.statusCode,
    error_message: entry.errorMessage || null,
    tool_calls: entry.toolCalls,
    searches: entry.searches,
    source_urls: entry.sourceUrls,
    top_search_score: entry.topSearchScore,
    avg_search_score: entry.avgSearchScore,
    result_count: entry.resultCount,
    search_modes: entry.searchModes,
  });

  if (error) {
    console.error("[analytics] Failed to insert:", error.message);
  }
}

export async function readAnalyticsEntries(limit?: number): Promise<AnalyticsEntry[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("analytics")
    .select("*")
    .order("created_at", { ascending: false });

  if (typeof limit === "number") {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[analytics] Failed to read:", error.message);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    timestamp: row.created_at,
    sessionId: row.session_id,
    query: row.query || "",
    messageCount: row.message_count || 0,
    provider: row.provider || "",
    responseTimeMs: row.response_time_ms || 0,
    success: row.success ?? true,
    noAnswer: row.no_answer ?? false,
    statusCode: row.status_code || 200,
    errorMessage: row.error_message || undefined,
    toolCalls: row.tool_calls || [],
    searches: row.searches || [],
    sourceUrls: row.source_urls || [],
    topSearchScore: row.top_search_score,
    avgSearchScore: row.avg_search_score,
    resultCount: row.result_count || 0,
    searchModes: row.search_modes || [],
  }));
}

export function summarizeAnalytics(entries: AnalyticsEntry[]): AnalyticsSummary {
  if (entries.length === 0) {
    return {
      totalQueries: 0,
      successRate: 0,
      noAnswerRate: 0,
      avgResponseTimeMs: 0,
      avgTopSearchScore: null,
      avgResultCount: 0,
      toolUsage: [],
      searchModeUsage: { bm25: 0, semantic: 0, hybrid: 0 },
    };
  }

  const successful = entries.filter((entry) => entry.success).length;
  const noAnswers = entries.filter((entry) => entry.noAnswer).length;
  const avgResponseTimeMs = Math.round(
    entries.reduce((sum, entry) => sum + entry.responseTimeMs, 0) / entries.length
  );
  const avgResultCount = Number(
    (
      entries.reduce((sum, entry) => sum + entry.resultCount, 0) / entries.length
    ).toFixed(1)
  );

  const scoredEntries = entries.filter((entry) => entry.topSearchScore !== null);
  const avgTopSearchScore =
    scoredEntries.length > 0
      ? Number(
          (
            scoredEntries.reduce((sum, entry) => sum + (entry.topSearchScore ?? 0), 0) /
            scoredEntries.length
          ).toFixed(2)
        )
      : null;

  const toolCounts = new Map<string, number>();
  const searchModeUsage: Record<SearchMode, number> = { bm25: 0, semantic: 0, hybrid: 0 };

  for (const entry of entries) {
    for (const toolName of entry.toolCalls) {
      toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1);
    }

    for (const mode of entry.searchModes) {
      searchModeUsage[mode] += 1;
    }
  }

  const toolUsage = Array.from(toolCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalQueries: entries.length,
    successRate: Number(((successful / entries.length) * 100).toFixed(1)),
    noAnswerRate: Number(((noAnswers / entries.length) * 100).toFixed(1)),
    avgResponseTimeMs,
    avgTopSearchScore,
    avgResultCount,
    toolUsage,
    searchModeUsage,
  };
}
