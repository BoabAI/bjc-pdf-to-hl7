/**
 * Bedrock-backed PDF extraction facade.
 *
 * All document classification and patient extraction is performed by
 * Bedrock vision. This module keeps the rest of the app on the existing
 * extraction interface.
 */

import { extractPatientDataWithVision } from "./vision-extractor";
import type {
  DocumentType,
  MailboxSource,
  PatientData,
  ReferralInfo,
} from "./domain/types";
export { formatExtractedData } from "./convert/display-data";

export interface ExtractionResult {
  success: boolean;
  data: PatientData;
  warnings: string[];
  documentType: DocumentType;
  extractionMethod: "vision";
  classificationConfidence: number;
  /** True when the model flagged the word "urgent" prominently. Omitted (→
   * falsy) on the catch fallback path. Consumed by the eligibility gate to
   * block urgent documents (any type) from auto-routing. */
  isUrgent?: boolean;
  referralInfo?: ReferralInfo;
}

const DEFAULT_DATA: PatientData = {
  firstName: "UNKNOWN",
  lastName: "PATIENT",
  dob: "19000101",
  sex: "U",
};

export async function extractPatientData(
  pdfBuffer: Buffer,
  forceDocumentType?: DocumentType | "auto",
  bjcDoctors?: string[],
  mailboxHint?: MailboxSource
): Promise<ExtractionResult> {
  const documentTypeHint =
    forceDocumentType && forceDocumentType !== "auto"
      ? forceDocumentType
      : undefined;

  try {
    const visionResult = await extractPatientDataWithVision(pdfBuffer, {
      documentTypeHint,
      bjcDoctors,
      mailboxHint,
    });

    return {
      success: visionResult.success,
      data: visionResult.data,
      warnings: visionResult.warnings,
      // Bedrock's classification wins. The hint already influenced Bedrock via
      // the prompt as an advisory tie-breaker; using the hint here as a
      // post-hoc override would let a wrong caller-supplied hint shadow
      // Bedrock's actual classification (e.g. forcing REF^I12/PHY routing on a
      // pathology PDF). `documentType` is non-optional in VisionExtractionResult.
      documentType: visionResult.documentType,
      extractionMethod: "vision",
      classificationConfidence: visionResult.classificationConfidence,
      isUrgent: visionResult.isUrgent,
      referralInfo: visionResult.referralInfo,
    };
  } catch (error) {
    return {
      success: false,
      data: DEFAULT_DATA,
      warnings: [
        `Extraction error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      ],
      documentType: documentTypeHint ?? "generic",
      extractionMethod: "vision",
      classificationConfidence: 100,
    };
  }
}
