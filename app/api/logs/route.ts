import { NextResponse } from "next/server";
import { listConversionsForSydneyMonth } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { currentSydneyMonth } from "@/lib/dates/sydney";

export const runtime = "nodejs";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/**
 * GET /api/logs?month=YYYY-MM
 *
 * The `month` query parameter is a **Sydney calendar month** (Australia/Sydney).
 * Audit rows are partitioned by UTC month at write-time, but operators think
 * in Sydney months — `listConversionsForSydneyMonth` translates between the
 * two so rows landing in the late-evening tail of a Sydney month aren't
 * dropped because they live in the next UTC partition.
 */
export const GET = auth(async (request) => {
  // Defense in depth: middleware already gates /api/logs, but enforce the
  // session check here too so this endpoint is safe even if middleware config
  // changes.
  if (!request.auth) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const monthParam = request.nextUrl.searchParams.get("month");
  const month = monthParam ?? currentSydneyMonth();

  if (!MONTH_PATTERN.test(month)) {
    return NextResponse.json(
      { success: false, error: "Invalid month format. Expected YYYY-MM." },
      { status: 400 }
    );
  }

  const rows = await listConversionsForSydneyMonth(month);

  return NextResponse.json({ success: true, month, rows });
});
