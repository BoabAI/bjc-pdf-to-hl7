/**
 * GET /api/pad-config — the PAD email pipeline reads which mailboxes to poll,
 * and from which folder, at the start of each run.
 *
 * Bearer-token auth (PAD_TOKEN + `X-Source: email`), same as /api/convert.
 * Middleware lets this path through on valid PAD credentials; we re-check here
 * (defence in depth).
 *
 * `?format=lines` returns `address|sourceFolder|linkedFolder` lines joined by
 * CRLF, which a PAD "Split text" action can consume without JSON parsing.
 * A 503 means "config unavailable" — PAD must fall back to its built-in list
 * rather than poll nothing.
 */

import { NextRequest, NextResponse } from "next/server";
import { isPadAuthenticated } from "@/lib/pad-auth";
import { listMailboxes } from "@/lib/reference-data-store";
import { logOperationalError } from "@/lib/server/logging";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isPadAuthenticated(request.headers)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE }
    );
  }

  let mailboxes;
  try {
    mailboxes = (await listMailboxes())
      .filter((m) => m.enabled)
      .map(({ address, sourceFolder, linkedFolder }) => ({ address, sourceFolder, linkedFolder }));
  } catch (error) {
    logOperationalError("pad-config", error, { op: "GET" });
    return NextResponse.json(
      { success: false, error: "Mailbox config unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }

  if (request.nextUrl.searchParams.get("format") === "lines") {
    const text = mailboxes
      .map((m) => `${m.address}|${m.sourceFolder}|${m.linkedFolder}`)
      .join("\r\n");
    return new NextResponse(text, {
      status: 200,
      headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({ success: true, mailboxes }, { headers: NO_STORE });
}
