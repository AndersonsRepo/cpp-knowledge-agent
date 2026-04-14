import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { chunkPlainText, chunkText } from "@/lib/chunker";
import { ingestChunks } from "@/lib/ingest";

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  const body = (await req.json()) as {
    title: string;
    sourceUrl: string;
    content: string;
    type?: "text" | "markdown" | "url";
  };

  if (!body.title || !body.content) {
    return NextResponse.json(
      { error: "title and content are required" },
      { status: 400 }
    );
  }

  const sourceUrl = body.sourceUrl || `admin://${body.title.replace(/\s+/g, "-").toLowerCase()}`;
  const type = body.type || "text";

  const chunks =
    type === "markdown"
      ? chunkText(body.content, sourceUrl, body.title)
      : chunkPlainText(body.content, body.title, sourceUrl);

  if (chunks.length === 0) {
    return NextResponse.json(
      { error: "Content too short to create any chunks" },
      { status: 400 }
    );
  }

  const source = type === "url" ? "admin_url" : "admin_text";
  const result = await ingestChunks(chunks, source);

  return NextResponse.json({
    chunksCreated: result.chunksUpserted,
    chunksEmbedded: result.chunksEmbedded,
    errors: result.errors,
    preview: chunks.map((c) => ({
      id: c.id,
      section: c.section,
      length: c.content.length,
    })),
  });
}
