import { NextResponse } from "next/server";
import {
  convertPdf,
  parseConvertFormData,
  type ConvertResult,
} from "@/lib/convert-service";
import { recordConversion, type AuditRow } from "@/lib/audit";
import {
  buildConversionAuditRow,
  buildFailureAuditRow,
  type AuditSource,
} from "@/lib/audit/build-row";
import {
  isStrictRequiredFields,
  mailboxCategoryFor,
  parseMailboxSource,
} from "@/lib/conversion-config";
import { auth } from "@/lib/auth";
import { isPadAuthenticated } from "@/lib/pad-auth";
import {
  logAuditFailure,
  logOperationalError,
} from "@/lib/server/logging";

const PAD_USER_EMAIL = "service:pad-pipeline";

export const runtime = "nodejs";

function parseSource(header: string | null): AuditSource {
  return header === "email" ? "email" : "web";
}

async function safeRecord(row: AuditRow): Promise<void> {
  try {
    await recordConversion(row);
  } catch (error) {
    logAuditFailure(error);
  }
}

export const POST = auth(async (request) => {
  const startedAtMs = Date.now();
  const source = parseSource(request.headers.get("x-source"));
  // `x-source-mailbox` carries one of two value shapes:
  //   1. Legacy MailboxSource enum: "referrals" | "results" — used by the pilot
  //      and continues to drive the `mailboxHint` audit field + the legacy
  //      `mailboxDisagreement` flag.
  //   2. New: a full mailbox address (or `simulated:fax` / `simulated:admin`)
  //      that maps to a MailboxCategory via `mailboxCategoryFor`. This drives
  //      the eligibility-gate `mailbox_mismatch` check.
  // Parsing both keeps the legacy contract intact while the new pipeline rolls
  // out. Whichever value is supplied, only one parse will yield a non-default
  // result.
  const mailboxHeader = request.headers.get("x-source-mailbox");
  const mailboxHint = parseMailboxSource(mailboxHeader);
  const mailboxCategory = mailboxCategoryFor(mailboxHeader);
  const now = new Date();

  // Authenticate per source. Web = Auth.js cookie session.
  // Email = PAD pipeline shared bearer token in Authorization header.
  // Both 401 if missing/invalid; the 401 must not leak which check failed.
  let userEmail: string;
  if (source === "email") {
    if (!isPadAuthenticated(request.headers)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    userEmail = PAD_USER_EMAIL;
  } else {
    if (!request.auth) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    userEmail = request.auth.user?.email ?? "anonymous";
  }

  let originalFilename = "";
  let fileSizeBytes = 0;

  try {
    const formData = await request.formData();
    const parsed = await parseConvertFormData(formData);

    if ("error" in parsed) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: parsed.status }
      );
    }

    originalFilename = parsed.originalFilename;
    fileSizeBytes = parsed.data.pdfBuffer.length;

    const result = await convertPdf({
      ...parsed.data,
      mailboxHint,
      mailboxCategory,
    });

    // Strict-mode bridge to the legacy 422 contract: when STRICT_REQUIRED_FIELDS
    // is on and the eligibility gate diverted a result document because OBR-16
    // was missing, return 422 + the legacy error message so existing callers
    // (and the audit-table strict-mode test) continue to see a hard failure.
    const shouldStrictFail =
      isStrictRequiredFields() &&
      result.action === "manual_review" &&
      result.reason === "missing_fields";

    const effectiveResult: ConvertResult = shouldStrictFail
      ? {
          success: false,
          error:
            "Required field missing: OBR-16 (Ordered By) for pathology/radiology result",
          warnings: [
            ...(result.warnings ?? []),
            // Legacy callers + tests expect the OBR-16-missing warning to
            // surface in the audit row even when we return 422 instead of HL7.
            ...(result.documentType
              ? [`OBR-16 (Ordered By) missing for ${result.documentType}`]
              : []),
          ],
          extractionMethod: result.extractionMethod,
          documentType: result.documentType,
          ...(result.mailboxDisagreement
            ? { mailboxDisagreement: true }
            : {}),
        }
      : result;

    const row = buildConversionAuditRow(
      {
        source,
        userEmail,
        mailboxHint,
        mailboxCategory,
        originalFilename,
        fileSizeBytes,
        startedAtMs,
        finishedAtMs: Date.now(),
        now,
      },
      effectiveResult
    );

    await safeRecord(row);

    if (shouldStrictFail) {
      return NextResponse.json(effectiveResult, { status: 422 });
    }

    return NextResponse.json(effectiveResult);
  } catch (error) {
    logOperationalError("convert", error, { source });

    const failRow = buildFailureAuditRow({
      source,
      userEmail,
      mailboxHint,
      mailboxCategory,
      originalFilename,
      fileSizeBytes,
      startedAtMs,
      finishedAtMs: Date.now(),
      now,
    });
    await safeRecord(failRow);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Conversion failed",
      },
      { status: 500 }
    );
  }
});

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "PDF to HL7 Converter",
    version: "1.0.0",
  });
}
