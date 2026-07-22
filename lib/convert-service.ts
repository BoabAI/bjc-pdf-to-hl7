import { buildHL7Message, generateHL7Filename } from "./hl7-builder";
import { extractPatientData } from "./pdf-parser";
import {
  DEFAULT_CARRIER,
  detectMailboxDisagreement,
  diagnosticServiceSectionFor,
  documentTypeLabel,
  isResultDocumentType,
  isStrictRequiredFields,
  obr16MissingWarning,
  type MailboxCategory,
} from "./conversion-config";
import { messageTypeDisplayLabel, messageTypeForDocumentType } from "./convert/policy";
import type { MessageType } from "./domain/types";
import type { ConvertResponse } from "./contracts/convert";
import { formatExtractedData } from "./convert/display-data";
import {
  parseConvertFormData,
  type ConvertRequest,
  type ParseConvertFormDataResult,
} from "./convert/form-data";
import {
  evaluateAutoRouteEligibility,
  type EligibilityResult,
} from "./extraction/eligibility";
import { getSettings, type RuntimeSettings } from "./settings";

/**
 * Alias retained for callers inside the server bundle. The wire shape is
 * defined once in `lib/contracts/convert.ts` and shared with the client.
 */
export type ConvertResult = ConvertResponse;
export { parseConvertFormData, type ConvertRequest, type ParseConvertFormDataResult };

function formatDisplayDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export interface ConvertPdfOptions {
  /** Override the runtime settings (test seam). Production callers omit this
   *  and let the function fetch from DynamoDB once. */
  settings?: RuntimeSettings;
}

export async function convertPdf(
  request: ConvertRequest,
  options?: ConvertPdfOptions
): Promise<ConvertResult> {
  const mailboxCategory: MailboxCategory = request.mailboxCategory ?? "none";

  const extraction = await extractPatientData(
    request.pdfBuffer,
    request.documentType,
    request.bjcDoctors,
    request.mailboxHint
  );

  // Legacy mailboxDisagreement signal — retained for back-compat dashboards.
  // The new pipeline expresses the same condition via routing decision
  // mailbox_mismatch when a known mailbox category is supplied.
  const mailboxDisagreement = detectMailboxDisagreement(
    request.mailboxHint,
    extraction.documentType
  );

  // Append a routing-mismatch warning so the audit log + UI surface the
  // disagreement even when the new routing path doesn't divert the doc.
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
      classificationConfidence: extraction.classificationConfidence,
      ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
    };
  }

  if (!extraction.success) {
    return {
      success: false,
      action: "manual_review",
      reason: "extraction_failed",
      suggestedCategory: "Needs review — Extraction failed",
      error:
        "Could not extract patient name from this document. The name may be redacted, missing, or in an unsupported format.",
      warnings: warningsWithMailbox,
      extractionMethod: extraction.extractionMethod,
      classificationConfidence: extraction.classificationConfidence,
      ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
    };
  }

  const settings = options?.settings ?? (await getSettings());
  const strictRequiredFields = isStrictRequiredFields();
  const eligibility: EligibilityResult = evaluateAutoRouteEligibility({
    extraction,
    mailboxCategory,
    settings,
    strictRequiredFields,
  });

  if (!eligibility.eligible) {
    // Manual-review branch: no HL7, no filename, action=manual_review.
    // PAD reads `action` and leaves the source email in the inbox untouched
    // (`suggestedCategory` is dashboard-facing only). The strict-mode
    // missing-fields branch is handled here too — the API route translates
    // it to HTTP 422.
    const baseData = formatExtractedData(
      extraction.data,
      extraction.referralInfo
    );
    return {
      success: true,
      action: "manual_review",
      reason: eligibility.reason,
      suggestedCategory: eligibility.suggestedCategory,
      documentType: extraction.documentType,
      classificationConfidence: extraction.classificationConfidence,
      extractedData: {
        ...baseData,
        date: formatDisplayDate(new Date()),
        carrier: request.carrier || DEFAULT_CARRIER,
      },
      warnings: warningsWithMailbox,
      extractionMethod: extraction.extractionMethod,
      ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
    };
  }

  // Auto-route branch: build HL7 and return the full envelope.
  const messageType: MessageType = messageTypeForDocumentType(
    extraction.documentType
  );
  const diagnosticServiceSection = diagnosticServiceSectionFor(
    extraction.documentType
  );

  const hl7Content = buildHL7Message(extraction.data, request.pdfBuffer, {
    documentTitle: documentTypeLabel(extraction.documentType),
    documentType: extraction.documentType,
    resultStatus: request.autoFile ? "F" : "P",
    orderingProvider: request.orderingProvider,
    ...(request.carrier ? { sendingApplication: request.carrier } : {}),
    messageType,
    referralInfo: extraction.referralInfo,
    ...(diagnosticServiceSection ? { diagnosticServiceSection } : {}),
  });

  // Lenient-mode OBR-16 advisory: when a result doc went through eligibility
  // without strict mode and is missing the addressee that feeds OBR-16, append
  // a warning so ops can chase the gap without losing the conversion.
  const obr16Missing =
    isResultDocumentType(extraction.documentType) &&
    !extraction.referralInfo?.addresseeName?.trim();
  const warnings = obr16Missing
    ? [...warningsWithMailbox, obr16MissingWarning(extraction.documentType)]
    : warningsWithMailbox;

  const baseData = formatExtractedData(extraction.data, extraction.referralInfo);

  return {
    success: true,
    action: "auto_routed",
    filename: generateHL7Filename(extraction.data),
    hl7Content,
    extractedData: {
      ...baseData,
      date: formatDisplayDate(new Date()),
      messageType: messageTypeDisplayLabel(messageType),
      carrier: request.carrier || DEFAULT_CARRIER,
    },
    warnings,
    extractionMethod: extraction.extractionMethod,
    documentType: extraction.documentType,
    classificationConfidence: extraction.classificationConfidence,
    ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
  };
}
