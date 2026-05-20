import type {
  DiagnosticServiceSection,
  DocumentType,
  MailboxSource,
} from "./domain/types";
import { resolveDocumentTypeAlias } from "./domain/document-type-aliases";

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_CARRIER = "SMECAI";

export const DOCUMENT_TYPES: DocumentType[] = [
  "consent_form",
  "referral",
  "consult_letter",
  "pathology_result",
  "radiology_result",
  "generic",
];

export type DocumentTypeOption = DocumentType | "auto";

export const MAILBOX_SOURCES: MailboxSource[] = ["referrals", "results"];

export function isMailboxSource(value: unknown): value is MailboxSource {
  return value === "referrals" || value === "results";
}

/**
 * Mailbox category drives how aggressively we constrain the AI's classification
 * and which doc types are eligible for auto-routing. A doc landing in a
 * `results` mailbox is overwhelmingly likely to be pathology/radiology — the
 * AI is asked to sub-classify within that set only. `letters` mailboxes carry
 * referrals + consult letters. `none` (web upload, no header) keeps the
 * existing free-classification behaviour.
 */
export type MailboxCategory = "results" | "letters" | "none";

/**
 * Production mailbox → category mapping. Lives here (not env / DB) so adding a
 * new GoFax inbox is a one-line code change with code review. The simulated
 * sentinels are what the web UI sends when the user picks "Fax inbox" /
 * "Admin inbox" from the simulation dropdown.
 */
export const MAILBOX_CATEGORIES: Record<string, "results" | "letters"> = {
  "fax-pathology@bjchealth.com.au": "results",
  "fax-radiology@bjchealth.com.au": "results",
  "fax-vascular@bjchealth.com.au": "results",
  "admin@bjchealth.com.au": "letters",
  // Sentinels used by the web UI "Simulate inbox" dropdown so devs and Nicole
  // can rehearse a fax / admin arrival without spinning up PAD.
  "simulated:fax": "results",
  "simulated:admin": "letters",
};

/**
 * Map an `x-source-mailbox` header value to a mailbox category. Returns
 * `"none"` when the header is missing or the address isn't in the mapping
 * (defensive — an unknown mailbox falls back to free classification rather
 * than guessing).
 */
export function mailboxCategoryFor(
  hint: string | null | undefined
): MailboxCategory {
  if (!hint) return "none";
  const normalized = hint.trim().toLowerCase();
  return MAILBOX_CATEGORIES[normalized] ?? "none";
}

/**
 * The allowed document types for a given mailbox category. Used by:
 *
 * 1. The Bedrock prompt — narrows the candidate set the model is asked to
 *    choose from when a mailbox category is supplied.
 * 2. The eligibility gate — fails `docTypeInMailboxCategory` when the AI's
 *    pick falls outside this set.
 *
 * For `none`, every supported doc type is allowed (no constraint).
 */
export function allowedDocTypesForCategory(
  category: MailboxCategory
): DocumentType[] {
  if (category === "results") {
    return ["pathology_result", "radiology_result"];
  }
  if (category === "letters") {
    return ["referral", "consult_letter"];
  }
  return [...DOCUMENT_TYPES];
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
  { id: "carrier-smecai", value: DEFAULT_CARRIER, label: "SMECAI"         },
  { id: "carrier-email",  value: "EMAIL",         label: "Email"          },
  { id: "carrier-fax",    value: "FAX",           label: "Fax",            isDefault: true },
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
  // Accept legacy aliases (`gp_referral`, `referral_letter`) on input — they
  // map forward to `referral`. Saved client preferences and any external
  // callers still using the old strings keep working.
  if (typeof value === "string") {
    const aliased = resolveDocumentTypeAlias(value);
    if (aliased) return aliased;
  }
  return isDocumentType(value) ? value : "auto";
}

/**
 * True for doc types that route as REF^I12 with OBR-24=PHY (Genie Incoming
 * Letters). Includes `consult_letter` (specialist→GP correspondence) which
 * Nicole confirmed should land in the same inbox as referrals.
 */
export function isReferralDocumentType(documentType: DocumentType): boolean {
  return documentType === "referral" || documentType === "consult_letter";
}

export function isResultDocumentType(documentType: DocumentType): boolean {
  return (
    documentType === "pathology_result" || documentType === "radiology_result"
  );
}

/**
 * Display label for OBR-4 (and friendly UI text). The collapsed taxonomy is:
 *
 *   Pathology Result · Radiology Result · Referral · Consult Letter ·
 *   Correspondence (catch-all for consent_form / generic).
 *
 * Nicole's UI labels are slightly different (sentence case, see
 * `prettifyDocType` in app/components/auditShared.ts) — that file owns the
 * dashboard labels; this one owns the HL7 OBR-4 label.
 */
export function documentTypeLabel(documentType: DocumentType): string {
  switch (documentType) {
    case "pathology_result":
      return "Pathology Result";
    case "radiology_result":
      return "Radiology Result";
    case "referral":
      return "Referral";
    case "consult_letter":
      return "Consult Letter";
    case "consent_form":
    case "generic":
    default:
      return "Correspondence";
  }
}

/**
 * When true, the API rejects results documents that are missing required HL7
 * fields (currently OBR-16 / "Ordered By") with HTTP 422 instead of passing
 * them through with a warning. Defaults to false to preserve the pilot's
 * pass-through behaviour — operators see the warning in the audit log without
 * losing the conversion.
 *
 * Single env var so we can flip behaviour per environment without code changes.
 */
export function isStrictRequiredFields(): boolean {
  return process.env.STRICT_REQUIRED_FIELDS === "true";
}

/**
 * Warning string emitted (and persisted to audit) when a results document
 * lands with no value to populate OBR-16. Contains no PHI — just the missing
 * field name and the document type — so it survives `redactWarning()`.
 */
export function obr16MissingWarning(documentType: DocumentType): string {
  return `OBR-16 (Ordered By) missing for ${documentType}`;
}

/**
 * True when the warning string indicates a missing OBR-16 on a results
 * document. Used by the route to decide whether to fail in strict mode.
 */
export function isObr16MissingWarning(warning: string): boolean {
  return warning.startsWith("OBR-16 (Ordered By) missing for ");
}

export function diagnosticServiceSectionFor(
  documentType: DocumentType
): DiagnosticServiceSection | undefined {
  switch (documentType) {
    case "pathology_result":
      return "LAB";
    case "radiology_result":
      return "RAD";
    case "referral":
    case "consult_letter":
      return "PHY";
    default:
      return undefined;
  }
}
