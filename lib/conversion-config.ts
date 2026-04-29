import type { DocumentType } from "./vision-extractor";

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_CARRIER = "SMECAI";

export const DOCUMENT_TYPES: DocumentType[] = [
  "consent_form",
  "referral_letter",
  "gp_referral",
  "pathology_result",
  "radiology_result",
  "generic",
];

export type DocumentTypeOption = DocumentType | "auto";

export const DEFAULT_BJC_DOCTORS = [
  "Dr Irwin Lim",
  "Dr Herman Lau",
  "Dr Andrew Jordan",
  "Dr Ilana Ginges",
  "Dr Roberto Russo",
  "Dr Anne Chung",
  "Dr Simran Kaur",
  "Dr Shirley Yu",
  "Dr Queenie Luu",
  "Dr Adam Maundrell",
  "Dr Hugh Caterson",
  "Dr Pauline Habib",
  "Dr Elaine Ng",
  "Dr Kate Celkys",
  "Dr Cellina Ching",
  "Dr Vincent Wong",
  "Dr Dahlia Davidoff",
];

export const CARRIER_OPTIONS = [
  { value: DEFAULT_CARRIER, label: "SMECAI" },
  { value: "EMAIL", label: "Email" },
  { value: "FAX", label: "Fax" },
  { value: "POST", label: "Post" },
  { value: "HAND", label: "Hand Delivered" },
];

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && DOCUMENT_TYPES.includes(value as DocumentType);
}

export function parseDocumentTypeOption(value: FormDataEntryValue | null): DocumentTypeOption {
  return isDocumentType(value) ? value : "auto";
}

export function isReferralDocumentType(documentType: DocumentType): boolean {
  return documentType === "referral_letter" || documentType === "gp_referral";
}

export function isResultDocumentType(documentType: DocumentType): boolean {
  return (
    documentType === "pathology_result" || documentType === "radiology_result"
  );
}

export function documentTypeLabel(documentType: DocumentType): string {
  switch (documentType) {
    case "pathology_result":
      return "Pathology Result";
    case "radiology_result":
      return "Radiology Result";
    case "referral_letter":
    case "gp_referral":
      return "Referral";
    case "consent_form":
    case "generic":
    default:
      return "Correspondence";
  }
}

export function diagnosticServiceSectionFor(
  documentType: DocumentType
): "LAB" | "RAD" | "PHY" | undefined {
  switch (documentType) {
    case "pathology_result":
      return "LAB";
    case "radiology_result":
      return "RAD";
    case "referral_letter":
    case "gp_referral":
      return "PHY";
    default:
      return undefined;
  }
}
