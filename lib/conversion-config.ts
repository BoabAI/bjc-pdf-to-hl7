import type {
  DiagnosticServiceSection,
  DocumentType,
  MailboxSource,
} from "./domain/types";

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

export const MAILBOX_SOURCES: MailboxSource[] = ["referrals", "results"];

export function isMailboxSource(value: unknown): value is MailboxSource {
  return value === "referrals" || value === "results";
}

/** Lower-cases and trims; returns undefined when the header is missing or junk. */
export function parseMailboxSource(
  value: string | null | undefined
): MailboxSource | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return isMailboxSource(normalized) ? normalized : undefined;
}

/**
 * True when the LLM's classification belongs to a different family than the
 * mailbox suggests. Returns false when the mailbox is unknown, the document
 * type is missing, or the type is consent_form/generic (never a misroute).
 */
export function detectMailboxDisagreement(
  mailbox: MailboxSource | undefined,
  documentType: DocumentType | undefined
): boolean {
  if (!mailbox || !documentType) return false;
  if (mailbox === "referrals") return isResultDocumentType(documentType);
  if (mailbox === "results") return isReferralDocumentType(documentType);
  return false;
}

export interface Doctor {
  /** UUID — stable across renames. */
  id: string;
  /** Display name, e.g. "Dr Irwin Lim". Used by Bedrock for AI addressee resolution. */
  name: string;
  /**
   * Medicare provider number — placed in PV1-9 as `<num>^^^AUSHICPR`.
   * Real allocations are 8 chars (6 digits + check digit + location char).
   * Seeded values lead with `9` so they are clearly fictional.
   */
  providerNumber: string;
}

export interface Carrier {
  /** UUID — stable across label edits. */
  id: string;
  /** MSH-3 wire value, e.g. "SMECAI". */
  value: string;
  /** UI label shown in the dropdown. */
  label: string;
  /** Exactly one carrier should carry this flag — drives initial selection. */
  isDefault?: boolean;
}

/**
 * Seeded BJC doctors used on first DynamoDB read (seedDefaults). Provider
 * numbers are deliberately fictional — they all start with `9`, which is not
 * used for real Australian provider-number allocations. Replace before going
 * to production.
 */
export const DEFAULT_BJC_DOCTORS: Doctor[] = [
  { id: "doctor-irwin-lim",       name: "Dr Irwin Lim",       providerNumber: "9000001Z" },
  { id: "doctor-herman-lau",      name: "Dr Herman Lau",      providerNumber: "9000002Z" },
  { id: "doctor-andrew-jordan",   name: "Dr Andrew Jordan",   providerNumber: "9000003Z" },
  { id: "doctor-ilana-ginges",    name: "Dr Ilana Ginges",    providerNumber: "9000004Z" },
  { id: "doctor-roberto-russo",   name: "Dr Roberto Russo",   providerNumber: "9000005Z" },
  { id: "doctor-anne-chung",      name: "Dr Anne Chung",      providerNumber: "9000006Z" },
  { id: "doctor-simran-kaur",     name: "Dr Simran Kaur",     providerNumber: "9000007Z" },
  { id: "doctor-shirley-yu",      name: "Dr Shirley Yu",      providerNumber: "9000008Z" },
  { id: "doctor-queenie-luu",     name: "Dr Queenie Luu",     providerNumber: "9000009Z" },
  { id: "doctor-adam-maundrell",  name: "Dr Adam Maundrell",  providerNumber: "9000010Z" },
  { id: "doctor-hugh-caterson",   name: "Dr Hugh Caterson",   providerNumber: "9000011Z" },
  { id: "doctor-pauline-habib",   name: "Dr Pauline Habib",   providerNumber: "9000012Z" },
  { id: "doctor-elaine-ng",       name: "Dr Elaine Ng",       providerNumber: "9000013Z" },
  { id: "doctor-kate-celkys",     name: "Dr Kate Celkys",     providerNumber: "9000014Z" },
  { id: "doctor-cellina-ching",   name: "Dr Cellina Ching",   providerNumber: "9000015Z" },
  { id: "doctor-vincent-wong",    name: "Dr Vincent Wong",    providerNumber: "9000016Z" },
  { id: "doctor-dahlia-davidoff", name: "Dr Dahlia Davidoff", providerNumber: "9000017Z" },
];

/**
 * Seeded carriers used on first DynamoDB read. Exactly one row carries
 * `isDefault: true` — that value drives the initial selection in the UI.
 */
export const DEFAULT_CARRIERS: Carrier[] = [
  { id: "carrier-smecai", value: DEFAULT_CARRIER, label: "SMECAI",         isDefault: true },
  { id: "carrier-email",  value: "EMAIL",         label: "Email"          },
  { id: "carrier-fax",    value: "FAX",           label: "Fax"            },
  { id: "carrier-post",   value: "POST",          label: "Post"           },
  { id: "carrier-hand",   value: "HAND",          label: "Hand Delivered" },
];

/** Returns just the doctor names — what the Bedrock prompt expects. */
export function doctorNames(doctors: Doctor[]): string[] {
  return doctors.map((d) => d.name);
}

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
): DiagnosticServiceSection | undefined {
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
