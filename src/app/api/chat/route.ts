import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { searchCorpus } from "@/lib/search";

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

RULES:
1. ONLY answer based on information retrieved from the CPP corpus via the search_corpus tool.
2. If the search returns no relevant results, say "I couldn't find information about that in the CPP knowledge base. Try rephrasing your question or ask about admissions, financial aid, campus services, or academics."
3. ALWAYS cite your sources using the page URL at the end of your response.
4. Be conversational and helpful. Use formatting (bold, lists) when it improves readability.
5. If a question is ambiguous, ask for clarification.
6. NEVER fabricate information. Only state facts found in the retrieved content.
7. When listing sources, format them as clickable links.
8. When the retrieved content mentions specific dates, deadlines, or academic year cycles (e.g. "2025-2026"), check whether those dates have already passed relative to today's date. If they have, tell the user: "Note: The information I found references [date/cycle], which may no longer be current. Please visit [source URL] directly for the most up-to-date details." Always include the general process/requirements info alongside this caveat — the steps and policies are usually still accurate even if specific dates change.

You have access to the search_corpus tool to find relevant information from the official CPP website.`;

const TOOL_DEFINITION = {
  name: "search_corpus",
  description:
    "Search the Cal Poly Pomona website corpus for relevant information. Use this tool to find answers to student questions about admissions, financial aid, academics, campus services, and more. Call this tool BEFORE answering any factual question.",
  parameters: {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        description: "The search query. Use specific keywords related to the student's question.",
      },
    },
    required: ["query"],
  },
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function executeSearch(query: string): Promise<string> {
  const results = await searchCorpus(query, 8);
  return JSON.stringify(
    results.map((r, i) => ({
      rank: i + 1,
      title: r.chunk.title,
      section: r.chunk.section,
      content: r.chunk.content,
      url: r.url,
      score: Math.round(r.score * 100) / 100,
      matchType: r.matchType,
    })),
    null,
    2
  );
}

// --- Anthropic provider ---

async function handleAnthropic(messages: ChatMessage[], apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });

  const tools: Anthropic.Tool[] = [
    {
      name: TOOL_DEFINITION.name,
      description: TOOL_DEFINITION.description,
      input_schema: {
        type: "object" as const,
        properties: TOOL_DEFINITION.parameters.properties,
        required: TOOL_DEFINITION.parameters.required,
      },
    },
  ];

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
      if (toolUse.name === "search_corpus") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: await executeSearch(toolUse.input.query),
        });
      }
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
  opts: { baseURL?: string; model: string; defaultHeaders?: Record<string, string> }
): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: opts.baseURL,
    defaultHeaders: opts.defaultHeaders,
  });

  const tools: OpenAI.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: TOOL_DEFINITION.name,
        description: TOOL_DEFINITION.description,
        parameters: TOOL_DEFINITION.parameters,
      },
    },
  ];

  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map(
      (m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam
    ),
  ];

  let response = await client.chat.completions.create({
    model: opts.model,
    max_tokens: 2048,
    tools,
    messages: openaiMessages,
  });

  let maxToolRounds = 3;

  while (response.choices[0]?.finish_reason === "tool_calls" && maxToolRounds > 0) {
    maxToolRounds--;
    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls || [];

    openaiMessages.push(choice.message);

    for (const toolCall of toolCalls) {
      if (toolCall.type === "function" && toolCall.function.name === "search_corpus") {
        const args = JSON.parse(toolCall.function.arguments);
        openaiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: await executeSearch(args.query),
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

async function handleOpenAI(messages: ChatMessage[], apiKey: string): Promise<string> {
  return handleOpenAICompatible(messages, apiKey, {
    model: process.env.OPENAI_MODEL || "gpt-4o",
  });
}

async function handleOpenRouter(messages: ChatMessage[], apiKey: string): Promise<string> {
  return handleOpenAICompatible(messages, apiKey, {
    baseURL: "https://openrouter.ai/api/v1",
    model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
    defaultHeaders: { "HTTP-Referer": "https://github.com/AndersonsRepo/cpp-knowledge-agent" },
  });
}

// --- Route handler ---

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    const { provider, apiKey } = getProvider();

    let text: string;
    switch (provider) {
      case "anthropic":
        text = await handleAnthropic(messages, apiKey);
        break;
      case "openrouter":
        text = await handleOpenRouter(messages, apiKey);
        break;
      case "openai":
      default:
        text = await handleOpenAI(messages, apiKey);
        break;
    }

    return NextResponse.json({ response: text });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
