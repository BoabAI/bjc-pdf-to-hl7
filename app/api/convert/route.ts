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
  isObr16MissingWarning,
  isStrictRequiredFields,
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
  const mailboxHint = parseMailboxSource(
    request.headers.get("x-source-mailbox")
  );
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

    const result = await convertPdf({ ...parsed.data, mailboxHint });

    // Strict-mode gate: when STRICT_REQUIRED_FIELDS=true, a results document
    // that survived extraction but ended up with an empty OBR-16 ("Ordered By")
    // is rejected with 422. The audit row records `outcome: "fail"` plus the
    // same warning so ops can see what was missing. Default (lenient) mode is
    // unchanged — the warning is persisted and the HL7 is returned to the
    // caller.
    const obr16Missing =
      result.success === true &&
      (result.warnings?.some(isObr16MissingWarning) ?? false);
    const shouldStrictFail = isStrictRequiredFields() && obr16Missing;

    const effectiveResult: ConvertResult = shouldStrictFail
      ? {
          success: false,
          error:
            "Required field missing: OBR-16 (Ordered By) for pathology/radiology result",
          warnings: result.warnings,
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
