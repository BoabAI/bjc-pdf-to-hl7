import type { DocumentType } from "./vision-extractor";

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_CARRIER = "SMECAI";

export const DOCUMENT_TYPES: DocumentType[] = [
  "consent_form",
  "referral_letter",
  "gp_referral",
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

export function documentTypeLabel(documentType: DocumentType): string {
  return isReferralDocumentType(documentType) ? "Referral" : "Correspondence";
}
