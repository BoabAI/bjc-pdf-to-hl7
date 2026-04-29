import { NextRequest, NextResponse } from "next/server";
import { listConversions } from "@/lib/audit";

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

export async function GET(request: NextRequest) {
  // Defense in depth: middleware already gates /api/logs because it isn't on
  // the public list, but enforce the cookie check here too so this endpoint
  // is safe even if middleware config changes.
  const isAuthenticated =
    request.cookies.get("app_authenticated")?.value === "true";
  if (!isAuthenticated) {
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

  const rows = await listConversions(month);

  return NextResponse.json({ success: true, month, rows });
}
