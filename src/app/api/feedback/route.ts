import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { sessionId, query, helpful } = (await req.json()) as {
      sessionId: string;
      query: string;
      helpful: boolean;
    };

    if (typeof helpful !== "boolean") {
      return NextResponse.json({ error: "helpful must be a boolean" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("feedback").insert({
      session_id: sessionId || "unknown",
      query: query || "",
      helpful,
    });

    if (error) {
      console.error("[feedback] Insert failed:", error.message);
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
