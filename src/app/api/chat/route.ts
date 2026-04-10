import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { searchCorpus } from "@/lib/search";
import {
  appendAnalyticsEntry,
  type AnalyticsEntry,
  type SearchAnalytics,
} from "@/lib/analytics";

// --- Provider detection ---

type Provider = "anthropic" | "openai" | "openrouter";

function getProvider(): { provider: Provider; apiKey: string } {
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "your-api-key-here") {
    return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your-api-key-here") {
    return { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== "your-api-key-here") {
    return { provider: "openrouter", apiKey: process.env.OPENROUTER_API_KEY };
  }
  throw new Error("No API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY in .env.local");
}

// --- Shared ---

const SYSTEM_PROMPT = `You are the Cal Poly Pomona Campus Knowledge Agent — a helpful assistant that answers questions about Cal Poly Pomona (CPP) using official university information.

Today's date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.

You have access to the search_corpus tool to find relevant information from 8,000+ official CPP web pages covering admissions, academics, faculty, financial aid, dining, housing, campus services, student life, and more.

RULES:
1. ONLY answer based on information retrieved from the search_corpus tool. Never fabricate information.
2. If the search returns no relevant results, say "I couldn't find information about that in the CPP knowledge base." and suggest the user visit cpp.edu directly. For course-specific questions (prerequisites, descriptions), direct them to https://catalog.cpp.edu.
3. ALWAYS cite your sources using the page URL at the end of your response.
4. Be conversational and helpful. Use formatting (bold, lists) when it improves readability.
5. If a question is ambiguous, ask for clarification.
6. When listing sources, format them as clickable links.
7. When retrieved content mentions specific dates or academic year cycles, check whether those dates have already passed relative to today. If they have, note this and suggest visiting the source URL for current information.
8. Do NOT use emojis. Keep a professional, clean tone.
9. Do NOT guess or fabricate course codes, faculty names, or other specific details.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolAnalyticsState {
  toolCalls: string[];
  searches: SearchAnalytics[];
}

function createToolAnalyticsState(): ToolAnalyticsState {
  return {
    toolCalls: [],
    searches: [],
  };
}

function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}

function extractLatestUserQuery(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content.trim() || "";
}

function parseToolArguments(rawArguments: string, fallbackQuery: string): Record<string, string> {
  try {
    return JSON.parse(rawArguments) as Record<string, string>;
  } catch {
    const queryMatch = rawArguments.match(/"query"\s*:\s*"([\s\S]*?)"/);
    if (queryMatch) {
      return {
        query: queryMatch[1]
          .replace(/\\"/g, "\"")
          .replace(/\\n/g, "\n")
          .replace(/\\\\/g, "\\"),
      };
    }

    return { query: fallbackQuery };
  }
}

function detectNoAnswer(text: string, searches: SearchAnalytics[]): boolean {
  if (searches.length > 0 && searches.every((search) => search.resultCount === 0)) {
    return true;
  }

  return /could(?:n't| not) find|visit cpp\.edu directly|no relevant results/i.test(text);
}

function getUserFacingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/rate limit/i.test(message)) {
    return "I'm getting a lot of requests right now. Please wait a moment and try again.";
  }

  if (/No API key configured/i.test(message)) {
    return "This assistant is still being configured. Please try again after the setup is completed.";
  }

  if (/Expected ',' or '\]' after array element in JSON|JSON at position|Unexpected token/i.test(message)) {
    return "I’m having trouble with that right now. Try another campus question.";
  }

  if (/timeout|fetch failed|network|ECONNRESET|ENOTFOUND/i.test(message)) {
    return "I couldn't reach the information service right now. Please try again in a moment.";
  }

  return "I’m having trouble with that right now. Try another campus question.";
}

async function safeAppendAnalytics(entry: AnalyticsEntry) {
  try {
    await appendAnalyticsEntry(entry);
  } catch (error) {
    console.warn("Failed to write analytics entry:", error);
  }
}

// --- Tool execution ---

async function executeTool(
  name: string,
  args: Record<string, string>,
  analytics: ToolAnalyticsState
): Promise<string> {
  analytics.toolCalls.push(name);

  const results = await searchCorpus(args.query, 8);
  const normalizedResults = results.map((r, i) => ({
    rank: i + 1,
    title: r.chunk.title,
    section: r.chunk.section,
    content: r.chunk.content,
    url: r.url,
    score: roundScore(r.score),
    matchType: r.matchType,
  }));

  analytics.searches.push({
    query: args.query,
    resultCount: normalizedResults.length,
    topScore: normalizedResults[0]?.score ?? null,
    matchTypes: Array.from(new Set(normalizedResults.map((r) => r.matchType))),
    sourceUrls: Array.from(new Set(normalizedResults.map((r) => r.url))),
  });

  return JSON.stringify(normalizedResults, null, 2);
}

// --- Anthropic provider ---

async function handleAnthropic(
  messages: ChatMessage[],
  apiKey: string,
  analytics: ToolAnalyticsState
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const tools: Anthropic.Tool[] = [{
    name: "search_corpus",
    description: "Search the Cal Poly Pomona website corpus. Covers admissions, academics, faculty, courses, programs, dining, housing, financial aid, campus services, and all official cpp.edu content. Call this tool BEFORE answering any factual question.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "Search query. Use specific keywords from the student's question." },
      },
      required: ["query"],
    },
  }];

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools,
    messages: anthropicMessages,
  });

  const allMessages = [...anthropicMessages];
  let maxToolRounds = 3;

  while (response.stop_reason === "tool_use" && maxToolRounds > 0) {
    maxToolRounds--;

    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use"
    ) as Array<{ type: "tool_use"; id: string; name: string; input: Record<string, string> }>;

    allMessages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: await executeTool(toolUse.name, toolUse.input, analytics),
      });
    }

    allMessages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools,
      messages: allMessages,
    });
  }

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// --- OpenAI provider ---

async function handleOpenAICompatible(
  messages: ChatMessage[],
  apiKey: string,
  opts: { baseURL?: string; model: string; defaultHeaders?: Record<string, string> },
  analytics: ToolAnalyticsState
): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: opts.baseURL,
    defaultHeaders: opts.defaultHeaders,
  });

  const tools: OpenAI.ChatCompletionTool[] = [{
    type: "function" as const,
    function: {
      name: "search_corpus",
      description: "Search the Cal Poly Pomona website corpus. Covers admissions, academics, faculty, courses, programs, dining, housing, financial aid, campus services, and all official cpp.edu content.",
      parameters: {
        type: "object" as const,
        properties: {
          query: { type: "string" as const, description: "Search query. Use specific keywords from the student's question." },
        },
        required: ["query"],
      },
    },
  }];

  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map(
      (m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam
    ),
  ];
  const fallbackQuery = extractLatestUserQuery(messages);

  let response = await client.chat.completions.create({
    model: opts.model,
    max_tokens: 2048,
    tools,
    messages: openaiMessages,
  });

  let maxToolRounds = 5;

  while (response.choices[0]?.finish_reason === "tool_calls" && maxToolRounds > 0) {
    maxToolRounds--;
    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls || [];

    openaiMessages.push(choice.message);

    for (const toolCall of toolCalls) {
      if (toolCall.type === "function") {
        const args = parseToolArguments(toolCall.function.arguments, fallbackQuery);
        openaiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: await executeTool(toolCall.function.name, args, analytics),
        });
      }
    }

    response = await client.chat.completions.create({
      model: opts.model,
      max_tokens: 2048,
      tools,
      messages: openaiMessages,
    });
  }

  return response.choices[0]?.message?.content || "No response generated.";
}

async function handleOpenAI(
  messages: ChatMessage[],
  apiKey: string,
  analytics: ToolAnalyticsState
): Promise<string> {
  return handleOpenAICompatible(messages, apiKey, {
    model: process.env.OPENAI_MODEL || "gpt-4o",
  }, analytics);
}

async function handleOpenRouter(
  messages: ChatMessage[],
  apiKey: string,
  analytics: ToolAnalyticsState
): Promise<string> {
  return handleOpenAICompatible(messages, apiKey, {
    baseURL: "https://openrouter.ai/api/v1",
    model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
    defaultHeaders: { "HTTP-Referer": "https://github.com/AndersonsRepo/cpp-knowledge-agent" },
  }, analytics);
}

// --- Rate limiting ---

const RATE_LIMIT = 30; // max requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// --- Route handler ---

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let sessionId = "unknown";
  let query = "";
  let messageCount = 0;
  let providerForLog: Provider | "unknown" = "unknown";
  const analytics = createToolAnalyticsState();

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(ip)) {
      await safeAppendAnalytics({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        sessionId,
        query,
        messageCount,
        provider: providerForLog,
        responseTimeMs: Date.now() - startedAt,
        success: false,
        noAnswer: false,
        statusCode: 429,
        errorMessage: "Rate limit exceeded",
        toolCalls: [],
        searches: [],
        sourceUrls: [],
        topSearchScore: null,
        avgSearchScore: null,
        resultCount: 0,
        searchModes: [],
      });
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as { messages: ChatMessage[]; sessionId?: string };
    const { messages } = body;
    sessionId = body.sessionId || crypto.randomUUID();

    if (!messages || messages.length === 0) {
      await safeAppendAnalytics({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        sessionId,
        query,
        messageCount,
        provider: providerForLog,
        responseTimeMs: Date.now() - startedAt,
        success: false,
        noAnswer: false,
        statusCode: 400,
        errorMessage: "No messages provided",
        toolCalls: [],
        searches: [],
        sourceUrls: [],
        topSearchScore: null,
        avgSearchScore: null,
        resultCount: 0,
        searchModes: [],
      });
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    messageCount = messages.length;
    query =
      [...messages].reverse().find((message) => message.role === "user")?.content.trim() || "";

    const { provider, apiKey } = getProvider();
    providerForLog = provider;

    let text: string;
    switch (provider) {
      case "anthropic":
        text = await handleAnthropic(messages, apiKey, analytics);
        break;
      case "openrouter":
        text = await handleOpenRouter(messages, apiKey, analytics);
        break;
      case "openai":
      default:
        text = await handleOpenAI(messages, apiKey, analytics);
        break;
    }

    const allSourceUrls = Array.from(
      new Set(analytics.searches.flatMap((search) => search.sourceUrls))
    );
    const topSearchScore =
      analytics.searches.length > 0
        ? Math.max(...analytics.searches.map((search) => search.topScore ?? 0))
        : null;
    const scoredSearches = analytics.searches.filter((search) => search.topScore !== null);
    const avgSearchScore =
      scoredSearches.length > 0
        ? Number(
            (
              scoredSearches.reduce((sum, search) => sum + (search.topScore ?? 0), 0) /
              scoredSearches.length
            ).toFixed(2)
          )
        : null;
    const resultCount = analytics.searches.length > 0
      ? Math.max(...analytics.searches.map((search) => search.resultCount))
      : 0;
    const searchModes = Array.from(
      new Set(analytics.searches.flatMap((search) => search.matchTypes))
    );

    await safeAppendAnalytics({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId,
      query,
      messageCount,
      provider,
      responseTimeMs: Date.now() - startedAt,
      success: true,
      noAnswer: detectNoAnswer(text, analytics.searches),
      statusCode: 200,
      toolCalls: Array.from(new Set(analytics.toolCalls)),
      searches: analytics.searches,
      sourceUrls: allSourceUrls,
      topSearchScore,
      avgSearchScore,
      resultCount,
      searchModes,
    });

    return NextResponse.json({ response: text });
  } catch (error: unknown) {
    console.error("Chat API error:", error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const userFacingMessage = getUserFacingErrorMessage(error);

    await safeAppendAnalytics({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId,
      query,
      messageCount,
      provider: providerForLog,
      responseTimeMs: Date.now() - startedAt,
      success: false,
      noAnswer: false,
      statusCode: 500,
      errorMessage: message,
      toolCalls: Array.from(new Set(analytics.toolCalls)),
      searches: analytics.searches,
      sourceUrls: Array.from(
        new Set(analytics.searches.flatMap((search) => search.sourceUrls))
      ),
      topSearchScore:
        analytics.searches.length > 0
          ? Math.max(...analytics.searches.map((search) => search.topScore ?? 0))
          : null,
      avgSearchScore: null,
      resultCount:
        analytics.searches.length > 0
          ? Math.max(...analytics.searches.map((search) => search.resultCount))
          : 0,
      searchModes: Array.from(
        new Set(analytics.searches.flatMap((search) => search.matchTypes))
      ),
    });

    return NextResponse.json({ error: userFacingMessage }, { status: 500 });
  }
}
