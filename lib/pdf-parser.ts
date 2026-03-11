/**
 * Bedrock-backed PDF extraction facade.
 *
 * All document classification and patient extraction is performed by
 * Bedrock vision. This module keeps the rest of the app on the existing
 * extraction interface.
 */

import type { PatientData } from "./hl7-builder";
import {
  extractPatientDataWithVision,
  type DocumentType,
} from "./vision-extractor";

export type { DocumentType } from "./vision-extractor";

export interface ExtractionResult {
  success: boolean;
  data: PatientData;
  warnings: string[];
  documentType: DocumentType;
  extractionMethod: "vision";
}

const DEFAULT_DATA: PatientData = {
  firstName: "UNKNOWN",
  lastName: "PATIENT",
  dob: "19000101",
  sex: "U",
};

export async function extractPatientData(
  pdfBuffer: Buffer,
  forceDocumentType?: DocumentType | "auto"
): Promise<ExtractionResult> {
  const documentTypeHint =
    forceDocumentType && forceDocumentType !== "auto"
      ? forceDocumentType
      : undefined;

  try {
    const visionResult = await extractPatientDataWithVision(pdfBuffer, {
      documentTypeHint,
    });

    return {
      success: visionResult.success,
      data: visionResult.data,
      warnings: visionResult.warnings,
      documentType: documentTypeHint ?? visionResult.documentType,
      extractionMethod: "vision",
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

export function formatExtractedData(data: PatientData): {
  firstName: string;
  lastName: string;
  dob: string;
  sex: string;
  medicareNo: string;
} {
  const dob = data.dob;
  const formattedDob =
    dob.length === 8
      ? `${dob.substring(6, 8)}/${dob.substring(4, 6)}/${dob.substring(0, 4)}`
      : dob;

  return {
    firstName: data.firstName,
    lastName: data.lastName,
    dob: formattedDob,
    sex: data.sex === "M" ? "Male" : data.sex === "F" ? "Female" : "Unknown",
    medicareNo: data.medicareNo
      ? `${data.medicareNo}${data.medicareRef ? `-${data.medicareRef}` : ""}`
      : "Not provided",
  };
}
