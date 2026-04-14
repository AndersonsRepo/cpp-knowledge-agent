import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { deleteChunksBySource } from "@/lib/ingest";

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();
  const url = req.nextUrl.searchParams.get("source_url");
  const search = req.nextUrl.searchParams.get("search");
  const page = parseInt(req.nextUrl.searchParams.get("page") || "0");
  const limit = 20;

  let query = supabase
    .from("chunks")
    .select("id, title, section, source_url, content, chunk_index, ingested_by, ingested_at", { count: "exact" })
    .order("ingested_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (url) query = query.eq("source_url", url);
  if (search) query = query.ilike("content", `%${search}%`);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    chunks: (data || []).map((c) => ({
      ...c,
      content: c.content?.slice(0, 200) + (c.content && c.content.length > 200 ? "..." : ""),
    })),
    total: count ?? 0,
    page,
    pageSize: limit,
  });
}

export async function DELETE(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  const { sourceUrl } = (await req.json()) as { sourceUrl: string };
  if (!sourceUrl) {
    return NextResponse.json({ error: "sourceUrl required" }, { status: 400 });
  }

  const deleted = await deleteChunksBySource(sourceUrl);
  return NextResponse.json({ deleted });
}
