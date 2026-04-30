import { buildHL7Message, generateHL7Filename } from "./hl7-builder";
import { extractPatientData, formatExtractedData } from "./pdf-parser";
import {
  DEFAULT_CARRIER,
  MAX_PDF_SIZE_BYTES,
  detectMailboxDisagreement,
  diagnosticServiceSectionFor,
  documentTypeLabel,
  isReferralDocumentType,
  parseDocumentTypeOption,
  type DocumentTypeOption,
  type MailboxSource,
} from "./conversion-config";

export interface ConvertRequest {
  pdfBuffer: Buffer;
  detectOnly: boolean;
  documentType: DocumentTypeOption;
  autoFile: boolean;
  orderingProvider?: string;
  carrier?: string;
  bjcDoctors?: string[];
  /** Upstream mailbox the PDF arrived in. Soft prior, not a hard override. */
  mailboxHint?: MailboxSource;
}

export type ParseConvertFormDataResult =
  | { data: ConvertRequest; originalFilename: string }
  | { error: string; status: number };

export interface ConvertResult {
  success: boolean;
  filename?: string;
  hl7Content?: string;
  extractedData?: ReturnType<typeof formatExtractedData> & {
    date: string;
    messageType: string;
    carrier: string;
  };
  warnings?: string[];
  extractionMethod?: "vision";
  documentType?: string;
  /**
   * True when the LLM's family classification disagrees with the upstream
   * mailbox (e.g. PDF arrived in `referrals` but classified as a result).
   * Not flagged for consent_form/generic. Caller decides what to do — we
   * still trust the LLM verdict for routing.
   */
  mailboxDisagreement?: boolean;
  error?: string;
}

function parseDoctorList(value: string | null | undefined): string[] | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((name): name is string => typeof name === "string");
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function parseEnvDoctorList(value: string | undefined): string[] | undefined {
  const doctors = value?.split(",").map((name) => name.trim()).filter(Boolean);
  return doctors && doctors.length > 0 ? doctors : undefined;
}

function formatDisplayDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export async function parseConvertFormData(
  formData: FormData,
  bjcDoctorsEnv = process.env.BJC_DOCTORS
): Promise<ParseConvertFormDataResult> {
  const file = formData.get("pdf") as File | null;

  if (!file) {
    return { error: "No PDF file provided", status: 400 };
  }

  if (file.type !== "application/pdf") {
    return { error: "File must be a PDF", status: 400 };
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return { error: "File size exceeds 10MB limit", status: 400 };
  }

  const pdfBuffer = Buffer.from(await file.arrayBuffer());
  const bjcDoctors =
    parseDoctorList(formData.get("bjcDoctors") as string | null) ??
    parseEnvDoctorList(bjcDoctorsEnv);

  return {
    data: {
      pdfBuffer,
      detectOnly: formData.get("detectOnly") === "true",
      documentType: parseDocumentTypeOption(formData.get("documentType")),
      autoFile: formData.get("autoFile") !== "false",
      orderingProvider: (formData.get("orderingProvider") as string | null) || undefined,
      carrier: (formData.get("carrier") as string | null) || undefined,
      bjcDoctors,
    },
    originalFilename: file.name,
  };
}

export async function convertPdf(request: ConvertRequest): Promise<ConvertResult> {
  const extraction = await extractPatientData(
    request.pdfBuffer,
    request.documentType,
    request.bjcDoctors,
    request.mailboxHint
  );

  const mailboxDisagreement = detectMailboxDisagreement(
    request.mailboxHint,
    extraction.documentType
  );
  const warningsWithMailbox = mailboxDisagreement
    ? [
        ...extraction.warnings,
        `Mailbox/content mismatch: arrived via ${request.mailboxHint} mailbox but classified as ${extraction.documentType}. Verify before filing.`,
      ]
    : extraction.warnings;

  if (request.detectOnly) {
    return {
      success: true,
      documentType: extraction.documentType,
      ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
    };
  }

  if (!extraction.success) {
    if (warningsWithMailbox.length > 0) {
      console.warn("PDF extraction warnings:", warningsWithMailbox);
    }
    return {
      success: false,
      error:
        "Could not extract patient name from this document. The name may be redacted, missing, or in an unsupported format.",
      warnings: warningsWithMailbox,
      extractionMethod: extraction.extractionMethod,
      ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
    };
  }

  const messageType = isReferralDocumentType(extraction.documentType)
    ? ("REF^I12" as const)
    : ("ORU^R01" as const);

  const diagnosticServiceSection = diagnosticServiceSectionFor(
    extraction.documentType
  );

  const hl7Content = buildHL7Message(extraction.data, request.pdfBuffer, {
    documentTitle: documentTypeLabel(extraction.documentType),
    resultStatus: request.autoFile ? "F" : "P",
    orderingProvider: request.orderingProvider,
    ...(request.carrier ? { sendingApplication: request.carrier } : {}),
    messageType,
    referralInfo: extraction.referralInfo,
    ...(diagnosticServiceSection ? { diagnosticServiceSection } : {}),
  });

  const baseData = formatExtractedData(extraction.data, extraction.referralInfo);

  return {
    success: true,
    filename: generateHL7Filename(extraction.data),
    hl7Content,
    extractedData: {
      ...baseData,
      date: formatDisplayDate(new Date()),
      messageType: messageType === "REF^I12" ? "REF (Referral)" : "ORU (Result)",
      carrier: request.carrier || DEFAULT_CARRIER,
    },
    warnings: warningsWithMailbox,
    extractionMethod: extraction.extractionMethod,
    documentType: extraction.documentType,
    ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
  };
}
