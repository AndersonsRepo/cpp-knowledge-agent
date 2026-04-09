import { promises as fs } from "fs";
import path from "path";

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

const ANALYTICS_DIR = path.join(process.cwd(), "data");
const ANALYTICS_FILE = path.join(ANALYTICS_DIR, "analytics-log.jsonl");

async function ensureAnalyticsDir() {
  await fs.mkdir(ANALYTICS_DIR, { recursive: true });
}

export async function appendAnalyticsEntry(entry: AnalyticsEntry) {
  await ensureAnalyticsDir();
  await fs.appendFile(ANALYTICS_FILE, JSON.stringify(entry) + "\n", "utf-8");
}

export async function readAnalyticsEntries(limit?: number): Promise<AnalyticsEntry[]> {
  try {
    const raw = await fs.readFile(ANALYTICS_FILE, "utf-8");
    const entries = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AnalyticsEntry)
      .reverse();

    return typeof limit === "number" ? entries.slice(0, limit) : entries;
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }
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
