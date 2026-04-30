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

export interface ExtractionResult {
  success: boolean;
  data: PatientData;
  warnings: string[];
  documentType: DocumentType;
  extractionMethod: "vision";
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
      documentType: documentTypeHint ?? visionResult.documentType,
      extractionMethod: "vision",
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
    };
  }
}

export function formatExtractedData(data: PatientData, referralInfo?: ReferralInfo): {
  firstName: string;
  lastName: string;
  dob: string;
  sex: string;
  medicareNo: string;
  sender?: string;
  addressee?: string;
  cc?: string;
} {
  const dob = data.dob;
  const formattedDob =
    dob.length === 8
      ? `${dob.substring(6, 8)}/${dob.substring(4, 6)}/${dob.substring(0, 4)}`
      : dob;

  const result: {
    firstName: string;
    lastName: string;
    dob: string;
    sex: string;
    medicareNo: string;
    sender?: string;
    addressee?: string;
    cc?: string;
  } = {
    firstName: data.firstName,
    lastName: data.lastName,
    dob: formattedDob,
    sex: data.sex === "M" ? "Male" : data.sex === "F" ? "Female" : "Unknown",
    medicareNo: data.medicareNo
      ? `${data.medicareNo}${data.medicareRef ? `-${data.medicareRef}` : ""}`
      : "Not provided",
  };

  if (referralInfo?.senderName) {
    result.sender = referralInfo.senderClinic
      ? `${referralInfo.senderName} (${referralInfo.senderClinic})`
      : referralInfo.senderName;
  }

  if (referralInfo?.addresseeName) {
    result.addressee = referralInfo.addresseeClinic
      ? `${referralInfo.addresseeName} (${referralInfo.addresseeClinic})`
      : referralInfo.addresseeName;
  }

  if (referralInfo?.ccNames && referralInfo.ccNames.length > 0) {
    result.cc = referralInfo.ccNames.join(", ");
  }

  return result;
}
