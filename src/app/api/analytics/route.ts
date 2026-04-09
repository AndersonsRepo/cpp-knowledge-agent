import { NextResponse } from "next/server";
import { readAnalyticsEntries, summarizeAnalytics } from "@/lib/analytics";

export async function GET() {
  const entries = await readAnalyticsEntries(100);
  const summary = summarizeAnalytics(entries);

  return NextResponse.json({
    summary,
    entries,
  });
}
