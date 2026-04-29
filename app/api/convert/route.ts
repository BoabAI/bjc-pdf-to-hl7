import { NextRequest, NextResponse } from "next/server";
import { convertPdf, parseConvertFormData } from "@/lib/convert-service";
import {
  buildSortKey,
  extractFilenameExt,
  hashFilename,
  monthKey,
  recordConversion,
  type AuditRow,
} from "@/lib/audit";
import {
  diagnosticServiceSectionFor,
  isReferralDocumentType,
} from "@/lib/conversion-config";
import type { DocumentType } from "@/lib/vision-extractor";

export const runtime = "nodejs";

type Source = "web" | "email";

function parseSource(header: string | null): Source {
  return header === "email" ? "email" : "web";
}

function messageTypeFor(documentType: DocumentType): string {
  return isReferralDocumentType(documentType) ? "REF^I12" : "ORU^R01";
}

async function safeRecord(row: AuditRow): Promise<void> {
  try {
    await recordConversion(row);
  } catch (error) {
    console.error("Audit row could not be written:", error);
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const source = parseSource(request.headers.get("x-source"));
  const now = new Date();

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

    const result = await convertPdf(parsed.data);

    // Resolve document type for audit (auto resolves to actual classification)
    const resolvedDocType: DocumentType | undefined =
      (result.documentType as DocumentType | undefined) ??
      (parsed.data.documentType !== "auto"
        ? parsed.data.documentType
        : undefined);

    const row: AuditRow = {
      month: monthKey(now),
      ts: buildSortKey(now),
      documentType: resolvedDocType,
      outcome: result.success ? "ok" : "fail",
      source,
      messageType:
        result.success && resolvedDocType
          ? messageTypeFor(resolvedDocType)
          : undefined,
      diagnosticServiceSection:
        result.success && resolvedDocType
          ? diagnosticServiceSectionFor(resolvedDocType)
          : undefined,
      filenameHash: hashFilename(originalFilename),
      filenameExt: extractFilenameExt(originalFilename),
      fileSizeBytes,
      durationMs: Date.now() - startedAt,
      warningCount: result.warnings?.length ?? 0,
    };

    // Awaited inline before responding — Lambda freeze drops fire-and-forget work.
    await safeRecord(row);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Conversion error:", error);

    const failRow: AuditRow = {
      month: monthKey(now),
      ts: buildSortKey(now),
      outcome: "fail",
      source,
      filenameHash: hashFilename(originalFilename),
      filenameExt: extractFilenameExt(originalFilename),
      fileSizeBytes,
      durationMs: Date.now() - startedAt,
      warningCount: 0,
    };
    await safeRecord(failRow);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Conversion failed",
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "PDF to HL7 Converter",
    version: "1.0.0",
  });
}
