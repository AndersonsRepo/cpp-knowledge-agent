import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { searchCorpus } from "@/lib/search";
import {
  lookupFaculty,
  financialAidGuide,
  academicProgramGuide,
  getSourceDocuments,
  TOOL_DEFINITIONS,
} from "@/lib/tools";

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

You have access to 5 specialized tools. Choose the most appropriate tool(s) for each question:

- **search_corpus**: General campus knowledge — admissions, dining, housing, campus services, policies, student life. Use this as your default for broad questions.
- **lookup_faculty**: Faculty/staff directory — find specific professors, their email, phone, office location, and office hours. Use this when someone mentions a professor's name or asks about faculty in a department.
- **academic_program_guide**: Academic programs and courses — degree requirements, course descriptions, prerequisites, units. Use this for questions about majors, courses, or graduation requirements.
- **financial_aid_guide**: Scholarships and financial aid — scholarship names, amounts, eligibility, deadlines. Use this for funding-related questions.
- **get_source_documents**: Official CPP pages — find direct links to official university web pages. Use this to provide authoritative source links or when someone wants the official page for a topic.

You can call multiple tools in sequence to build a comprehensive answer. For example:
- "Who teaches CS 2400 and what's the course about?" → lookup_faculty + academic_program_guide
- "How do I apply for financial aid and where's the office?" → financial_aid_guide + search_corpus
- "Link me to the CS department page and show me their faculty" → get_source_documents + lookup_faculty

RULES:
1. ONLY answer based on information retrieved from your tools. Never fabricate information.
2. If no tool returns relevant results, say so honestly and suggest the user visit cpp.edu directly.
3. ALWAYS cite your sources using the page URL at the end of your response.
4. Be conversational and helpful. Use formatting (bold, lists) when it improves readability.
5. When listing sources, format them as clickable links.
6. When retrieved content mentions specific dates or academic year cycles, check whether those dates have already passed relative to today. If they have, note this and suggest visiting the source URL for current information.
7. Do NOT use emojis. Keep a professional, clean tone.
8. When showing faculty info, format it clearly with name, department, contact details, and office hours.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// --- Tool execution ---

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case "search_corpus": {
      const results = await searchCorpus(args.query, 8);
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
    case "lookup_faculty":
      return lookupFaculty(args.query);
    case "financial_aid_guide":
      return financialAidGuide(args.query);
    case "academic_program_guide":
      return academicProgramGuide(args.query);
    case "get_source_documents":
      return getSourceDocuments(args.query);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// --- Anthropic provider ---

async function handleAnthropic(messages: ChatMessage[], apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });

  const tools: Anthropic.Tool[] = TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object" as const,
      properties: t.parameters.properties,
      required: t.parameters.required,
    },
  }));

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
  let maxToolRounds = 5; // Allow more rounds for multi-tool chains

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
        content: await executeTool(toolUse.name, toolUse.input),
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
  opts: { baseURL?: string; model: string; defaultHeaders?: Record<string, string> }
): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: opts.baseURL,
    defaultHeaders: opts.defaultHeaders,
  });

  const tools: OpenAI.ChatCompletionTool[] = TOOL_DEFINITIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

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

  let maxToolRounds = 5;

  while (response.choices[0]?.finish_reason === "tool_calls" && maxToolRounds > 0) {
    maxToolRounds--;
    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls || [];

    openaiMessages.push(choice.message);

    for (const toolCall of toolCalls) {
      if (toolCall.type === "function") {
        const args = JSON.parse(toolCall.function.arguments);
        openaiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: await executeTool(toolCall.function.name, args),
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
