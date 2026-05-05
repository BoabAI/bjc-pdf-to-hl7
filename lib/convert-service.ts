import { buildHL7Message, generateHL7Filename } from "./hl7-builder";
import { extractPatientData } from "./pdf-parser";
import {
  DEFAULT_CARRIER,
  detectMailboxDisagreement,
  diagnosticServiceSectionFor,
  documentTypeLabel,
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
    return {
      success: false,
      error:
        "Could not extract patient name from this document. The name may be redacted, missing, or in an unsupported format.",
      warnings: warningsWithMailbox,
      extractionMethod: extraction.extractionMethod,
      ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
    };
  }

  const messageType: MessageType = messageTypeForDocumentType(
    extraction.documentType
  );

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
      messageType: messageTypeDisplayLabel(messageType),
      carrier: request.carrier || DEFAULT_CARRIER,
    },
    warnings: warningsWithMailbox,
    extractionMethod: extraction.extractionMethod,
    documentType: extraction.documentType,
    ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
  };
}
