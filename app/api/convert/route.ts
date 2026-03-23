import { NextRequest, NextResponse } from "next/server";
import { buildHL7Message, generateHL7Filename } from "@/lib/hl7-builder";
import { extractPatientData, formatExtractedData } from "@/lib/pdf-parser";

export const runtime = "nodejs";

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    // Validate file exists
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No PDF file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "File must be a PDF" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Check if this is a detect-only request
    const detectOnly = formData.get("detectOnly") === "true";

    // Get document type preference (auto, consent_form, referral_letter, gp_referral, or generic)
    const documentTypeParam = formData.get("documentType") as string | null;
    const documentType =
      documentTypeParam === "consent_form" ||
      documentTypeParam === "referral_letter" ||
      documentTypeParam === "gp_referral" ||
      documentTypeParam === "generic"
        ? documentTypeParam
        : "auto";

    // Parse BJC doctor list: prefer form data (from UI), fall back to env var
    const bjcDoctorsParam = formData.get("bjcDoctors") as string | null;
    const bjcDoctorsEnv = process.env.BJC_DOCTORS;
    let bjcDoctors: string[] | undefined;
    if (bjcDoctorsParam) {
      try {
        const parsed = JSON.parse(bjcDoctorsParam);
        if (Array.isArray(parsed) && parsed.length > 0) bjcDoctors = parsed;
      } catch { /* ignore malformed JSON */ }
    }
    if (!bjcDoctors && bjcDoctorsEnv) {
      bjcDoctors = bjcDoctorsEnv.split(",").map((s) => s.trim()).filter(Boolean);
    }

    // Extract patient data from PDF
    const extraction = await extractPatientData(pdfBuffer, documentType, bjcDoctors);

    // If detect-only, return just the document type
    if (detectOnly) {
      return NextResponse.json({
        success: true,
        documentType: extraction.documentType,
      });
    }

    if (!extraction.success) {
      if (extraction.warnings.length > 0) {
        console.warn("PDF extraction warnings:", extraction.warnings);
      }
      return NextResponse.json({
        success: false,
        error: "Could not extract patient name from this document. The name may be redacted, missing, or in an unsupported format.",
        warnings: extraction.warnings,
        extractionMethod: extraction.extractionMethod,
      });
    }

    // Extract Genie action options
    const autoFile = formData.get("autoFile") !== "false"; // Default to true
    const orderingProvider = formData.get("orderingProvider") as string | null;
    const carrier = formData.get("carrier") as string | null;

    // Derive HL7 message type: REF^I12 for referral letters, ORU^R01 for everything else
    const messageType = (extraction.documentType === "referral_letter" || extraction.documentType === "gp_referral")
      ? "REF^I12" as const
      : "ORU^R01" as const;

    // Map detected document type to Genie-friendly label for OBR-4 "Type" column
    const documentTypeLabel = (extraction.documentType === "referral_letter" || extraction.documentType === "gp_referral")
      ? "Referral"
      : extraction.documentType === "consent_form"
        ? "Correspondence"
        : "Correspondence";

    // Build HL7 message with embedded PDF
    const hl7Content = buildHL7Message(extraction.data, pdfBuffer, {
      documentTitle: documentTypeLabel,
      resultStatus: autoFile ? "F" : "P", // F=Final (auto-file), P=Preliminary (queue)
      orderingProvider: orderingProvider || undefined,
      ...(carrier ? { sendingApplication: carrier } : {}),
      messageType,
      referralInfo: extraction.referralInfo,
    });

    // Generate filename
    const filename = generateHL7Filename(extraction.data);

    // Format extracted data for display
    const baseData = formatExtractedData(extraction.data, extraction.referralInfo);

    // Add HL7 metadata fields for UI display
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const extractedData = {
      ...baseData,
      date: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
      messageType: messageType === "REF^I12" ? "REF (Referral)" : "ORU (Result)",
      carrier: carrier || "SMECAI",
    };

    return NextResponse.json({
      success: true,
      filename,
      hl7Content,
      extractedData,
      warnings: extraction.warnings,
      extractionMethod: extraction.extractionMethod,
    });
  } catch (error) {
    console.error("Conversion error:", error);
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
