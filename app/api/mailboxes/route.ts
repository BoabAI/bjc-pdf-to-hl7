/**
 * GET/PUT/DELETE /api/mailboxes — the input mailboxes the PAD email pipeline
 * polls, and which folder each is polled from (Settings page).
 *
 * Session auth only. PAD reads the same data through /api/pad-config with its
 * bearer token. Every change writes an `action: settings_updated` audit row:
 * repointing a mailbox changes what gets filed into Genie, and there are no
 * roles, so the audit trail is the control.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteMailbox, listMailboxes, putMailbox } from "@/lib/reference-data-store";
import {
  describeMailboxChange,
  LAST_ENABLED_ERROR,
  leavesNoEnabledMailbox,
  validateMailboxInput,
  type MailboxConfig,
  type MailboxesResponse,
} from "@/lib/mailbox-config";
import { recordConversion, buildSortKey, monthKey } from "@/lib/audit";
import { logOperationalError, logServerEvent } from "@/lib/server/logging";

export const runtime = "nodejs";

function json(body: MailboxesResponse, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

// A failed list read must not lock the settings: the guard is skipped and the
// change goes ahead (it is still audited).
async function currentMailboxes(): Promise<MailboxConfig[] | null> {
  return listMailboxes().catch(() => null);
}

// Same audit-row shape as /api/settings so the Log page shows both alike.
function auditSettingsChange(userEmail: string | undefined, message: string): void {
  const now = new Date();
  void recordConversion({
    month: monthKey(now),
    ts: buildSortKey(now),
    outcome: "ok",
    source: "web",
    filenameHash: "",
    filenameExt: "",
    contentHash: "",
    fileSizeBytes: 0,
    durationMs: 0,
    warningCount: 0,
    userEmail,
    action: "settings_updated",
    warnings: [`settings_updated: ${message}`],
  }).catch((err) => logOperationalError("mailboxes", err, { op: "audit" }));
}

export const GET = auth(async (request) => {
  if (!request.auth) return json({ success: false, error: "Unauthorized" }, 401);
  try {
    return json({ success: true, mailboxes: await listMailboxes() });
  } catch (error) {
    logOperationalError("mailboxes", error, { op: "GET" });
    return json({ success: false, error: "Failed to load mailboxes" }, 500);
  }
});

export const PUT = auth(async (request) => {
  if (!request.auth) return json({ success: false, error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const result = validateMailboxInput(body);
  if (!result.ok) {
    logServerEvent("warn", "mailboxes", "validation-reject", { reason: result.error });
    return json({ success: false, error: result.error }, 400);
  }

  try {
    const all = await currentMailboxes();
    if (all && leavesNoEnabledMailbox(all, { type: "put", value: result.value })) {
      return json({ success: false, error: LAST_ENABLED_ERROR }, 409);
    }
    const previous = all?.find((m) => m.id === result.value.id);
    await putMailbox(result.value);
    auditSettingsChange(
      request.auth.user?.email ?? undefined,
      describeMailboxChange(previous, result.value)
    );
    return json({ success: true, mailboxes: [result.value] });
  } catch (error) {
    logOperationalError("mailboxes", error, { op: "PUT" });
    return json({ success: false, error: "Failed to save mailbox" }, 500);
  }
});

export const DELETE = auth(async (request) => {
  if (!request.auth) return json({ success: false, error: "Unauthorized" }, 401);

  const id = request.nextUrl.searchParams.get("id")?.trim().toLowerCase();
  if (!id) return json({ success: false, error: "Missing id parameter" }, 400);

  try {
    const all = await currentMailboxes();
    if (all && leavesNoEnabledMailbox(all, { type: "delete", id })) {
      return json({ success: false, error: LAST_ENABLED_ERROR }, 409);
    }
    await deleteMailbox(id);
    auditSettingsChange(request.auth.user?.email ?? undefined, `mailbox ${id} removed`);
    return json({ success: true });
  } catch (error) {
    logOperationalError("mailboxes", error, { op: "DELETE" });
    return json({ success: false, error: "Failed to remove mailbox" }, 500);
  }
});
