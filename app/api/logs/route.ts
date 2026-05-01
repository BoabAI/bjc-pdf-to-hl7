import { NextResponse } from "next/server";
import { listConversionsForSydneyMonth } from "@/lib/audit";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function currentSydneyMonth(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

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
