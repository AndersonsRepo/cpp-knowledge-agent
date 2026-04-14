import { NextRequest, NextResponse } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "broncobot-admin-2026";

export function checkAdminAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get("x-admin-token");
  if (authHeader !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
