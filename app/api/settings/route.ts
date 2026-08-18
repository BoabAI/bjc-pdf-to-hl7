/**
 * GET/PUT /api/settings — runtime ops dial (confidence floor today; more
 * fields tomorrow).
 *
 * Auth is required for both methods. Reads are cheap so any authenticated
 * user can see the current values from the dashboard. Writes audit an
 * `action: settings_updated` row with old + new values so changes are
 * traceable.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  coerceConfidenceFloor,
  getSettings,
  updateSettings,
} from "@/lib/settings";
import { recordConversion, buildSortKey, monthKey } from "@/lib/audit";
import { logOperationalError } from "@/lib/server/logging";

export const runtime = "nodejs";

export const GET = auth(async (request) => {
  if (!request.auth) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    const settings = await getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    logOperationalError("settings", error, { op: "GET" });
    return NextResponse.json(
      { success: false, error: "Failed to load settings" },
      { status: 500 }
    );
  }
});

export const PUT = auth(async (request) => {
  if (!request.auth) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const updatedBy = request.auth.user?.email ?? "anonymous";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const rawFloor =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).minClassificationConfidence
      : undefined;
  const floor = coerceConfidenceFloor(rawFloor);
  if (floor === undefined) {
    return NextResponse.json(
      {
        success: false,
        error:
          "minClassificationConfidence must be an integer between 0 and 100",
      },
      { status: 400 }
    );
  }

  try {
    const { next, previous } = await updateSettings({
      minClassificationConfidence: floor,
      updatedBy,
    });

    // Audit row — fire and forget. The audit table is the same one used for
    // conversions, so this just adds a sentinel-typed row under the current
    // month partition for the dashboard to pick up.
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
      userEmail: updatedBy,
      action: "settings_updated",
      warnings: [
        `settings_updated: minClassificationConfidence ${previous.minClassificationConfidence} → ${next.minClassificationConfidence}`,
      ],
    }).catch((err) => logOperationalError("settings", err, { op: "audit" }));

    return NextResponse.json({ success: true, settings: next, previous });
  } catch (error) {
    logOperationalError("settings", error, { op: "PUT" });
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update settings",
      },
      { status: 500 }
    );
  }
});
