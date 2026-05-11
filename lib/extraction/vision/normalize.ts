/**
 * Pure normalization helpers — turn raw Bedrock tool input into domain types.
 *
 * No AWS SDK, no transport. Given an `unknown` (the model may return
 * anything), produce a fully-typed `PatientData` + `ReferralInfo`, plus
 * warnings for missing fields and invalid document types. The orchestrator
 * decides what to do with the result (success flag, response shape).
 */

import { DOCUMENT_TYPES } from "../../conversion-config";
import type {
  DocumentType,
  PatientData,
  ReferralInfo,
  Sex,
} from "../../domain/types";
import type { ToolUseContentBlock } from "./tool-schema";

const POSTCODE_TO_STATE: Record<string, string> = {
  "1": "NSW",
  "2": "NSW",
  "3": "VIC",
  "4": "QLD",
  "5": "SA",
  "6": "WA",
  "7": "TAS",
  "0": "NT",
};

export function inferStateFromPostcode(postcode: string): string | undefined {
  if (!postcode || postcode.length !== 4) return undefined;
  return POSTCODE_TO_STATE[postcode[0]];
}

export function convertDateToHL7(dateStr: string): string {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return "19000101";
  const [, day, month, year] = match;
  return `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
}

export function normalizeDocumentType(
  value: unknown,
  fallback: DocumentType = "generic"
): DocumentType {
  return typeof value === "string" &&
    DOCUMENT_TYPES.includes(value as DocumentType)
    ? (value as DocumentType)
    : fallback;
}

export function normalizeSex(value: unknown): Sex {
  return value === "M" || value === "F" || value === "U" ? value : "U";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isToolUseContentBlock(
  value: unknown
): value is ToolUseContentBlock {
  return (
    isRecord(value) &&
    isRecord((value as Record<string, unknown>).toolUse) &&
    isRecord(
      ((value as Record<string, unknown>).toolUse as Record<string, unknown>)
        .input
    )
  );
}

export function nullableString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function cleanPhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/[^\d ]/g, "").trim() || undefined;
}

export function cleanMedicareNumber(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/\s/g, "") || undefined;
}

// Provider numbers must be 1-12 alphanumeric characters. The HL7 separators
// (`|`, `^`, `~`, `&`, `\`) and ASCII control characters would corrupt segments
// if echoed back from a crafted PDF — drop the value to undefined rather than
// passing it through to HL7 build.
const PROVIDER_NUMBER_RE = /^[A-Z0-9]{1,12}$/i;

export function cleanProviderNumber(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return PROVIDER_NUMBER_RE.test(trimmed) ? trimmed : undefined;
}

export function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .map((item) => nullableString(item))
    .filter((item): item is string => Boolean(item));
  return strings.length > 0 ? strings : undefined;
}

export function emptyPatientData(): PatientData {
  return {
    firstName: "UNKNOWN",
    lastName: "PATIENT",
    dob: "19000101",
    sex: "U",
  };
}

/**
 * Letter sub-type emitted by the vision model for letter-shaped documents.
 * Snake_case values are stable — they get persisted to DynamoDB and may end
 * up on a diagnostics dashboard. Do not rename without a migration.
 */
export type LetterSubtype =
  | "referral"
  | "follow_up"
  | "discharge"
  | "result_commentary"
  | "other"
  | "not_a_letter";

const LETTER_SUBTYPES: ReadonlySet<LetterSubtype> = new Set<LetterSubtype>([
  "referral",
  "follow_up",
  "discharge",
  "result_commentary",
  "other",
  "not_a_letter",
]);

/** Subtypes that disqualify a referral_letter / gp_referral classification.
 * `not_a_letter` is intentionally excluded — pairing it with a referral type
 * is implausible; we leave the LLM verdict alone rather than guessing. */
const NON_REFERRAL_LETTER_SUBTYPES: ReadonlySet<LetterSubtype> = new Set<
  LetterSubtype
>(["follow_up", "discharge", "result_commentary", "other"]);

export function normalizeLetterSubtype(value: unknown): LetterSubtype | undefined {
  return typeof value === "string" && LETTER_SUBTYPES.has(value as LetterSubtype)
    ? (value as LetterSubtype)
    : undefined;
}

export interface NormalizedVisionInput {
  documentType: DocumentType;
  data: PatientData;
  referralInfo?: ReferralInfo;
  warnings: string[];
  /** Self-reported model confidence in the classification, 0-100. Defaults to
   * 100 when the model omits the field (older fixtures). */
  classificationConfidence: number;
  /** Sub-type for letter-shaped documents, used to gate promotion and to
   * demote a misclassified referral. Undefined when the model omits the
   * field or returns an unknown value. */
  letterSubtype?: LetterSubtype;
}

/** Names shorter than this are considered placeholder/noise and disqualify
 * heuristic promotion. */
const MIN_NAME_LENGTH = 3;

/** Medicare-style GP provider number pattern: 7 digits + a single check
 * character. Used as the GP signal when promoting a *_result classification to
 * gp_referral vs referral_letter. */
const GP_PROVIDER_NUMBER_RE = /^\d{7}[A-Z0-9]$/i;

/** Clamp the model's self-reported confidence to a 0-100 integer. Returns 100
 * (full confidence) when the value is missing, non-numeric, or out of range —
 * the safe default that keeps older fixtures and any legitimate omission from
 * triggering false-positive low-confidence warnings. */
function normalizeClassificationConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100;
  const clamped = Math.max(0, Math.min(100, Math.trunc(value)));
  return clamped;
}

/**
 * Decide whether a `*_result` classification with referral signals should be
 * promoted to a referral type. Defensive: requires both sender and addressee
 * names to be present, non-trivially long, and distinct.
 *
 * @returns promoted DocumentType, or `undefined` if no promotion applies.
 */
function promoteResultToReferral(
  original: DocumentType,
  referralInfo: ReferralInfo
): DocumentType | undefined {
  if (original !== "pathology_result" && original !== "radiology_result") {
    return undefined;
  }
  const sender = referralInfo.senderName?.trim();
  const addressee = referralInfo.addresseeName?.trim();
  if (!sender || !addressee) return undefined;
  if (sender.length < MIN_NAME_LENGTH || addressee.length < MIN_NAME_LENGTH) {
    return undefined;
  }
  if (sender === addressee) return undefined;

  const providerNo = referralInfo.senderProviderNumber;
  const looksLikeGp =
    typeof providerNo === "string" && GP_PROVIDER_NUMBER_RE.test(providerNo);
  return looksLikeGp ? "gp_referral" : "referral_letter";
}

/**
 * Normalize a raw Bedrock tool-use input object into domain types.
 *
 * - Validates `documentType` against the known set, falling back to `fallbackDocumentType` (default `generic`).
 * - Coerces nullable string fields into trimmed strings or `undefined`.
 * - Cleans phone (digits + spaces) and Medicare (digits only) values.
 * - Infers state from postcode when state is missing.
 * - Emits warnings for invalid documentType, missing patient name, or missing DOB.
 * - Returns `referralInfo` only when at least one referral field is present.
 */
export function normalizeVisionToolInput(
  rawInput: unknown,
  fallbackDocumentType: DocumentType = "generic"
): NormalizedVisionInput {
  const warnings: string[] = [];

  if (!isRecord(rawInput)) {
    return {
      documentType: fallbackDocumentType,
      data: emptyPatientData(),
      warnings,
      classificationConfidence: 100,
    };
  }

  const letterSubtype = normalizeLetterSubtype(
    (rawInput as Record<string, unknown>).letterSubtype
  );

  const raw = rawInput;

  let documentType = normalizeDocumentType(
    raw.documentType,
    fallbackDocumentType
  );

  if (raw.documentType !== undefined && raw.documentType !== documentType) {
    warnings.push(
      `Vision extraction returned an invalid document type; defaulted to ${documentType}`
    );
  }

  const classificationConfidence = normalizeClassificationConfidence(
    raw.classificationConfidence
  );

  const data: PatientData = {
    firstName: nullableString(raw.firstName) || "UNKNOWN",
    lastName: nullableString(raw.lastName) || "PATIENT",
    dob: typeof raw.dob === "string" ? convertDateToHL7(raw.dob) : "19000101",
    sex: normalizeSex(raw.sex),
    phone: cleanPhone(raw.phone),
    address: nullableString(raw.address),
    suburb: nullableString(raw.suburb),
    state: nullableString(raw.state),
    postcode: nullableString(raw.postcode),
    medicareNo: cleanMedicareNumber(raw.medicareNo),
    medicareRef: nullableString(raw.medicareRef),
  };

  if (!data.state && data.postcode) {
    data.state = inferStateFromPostcode(data.postcode);
  }

  const referralInfo: ReferralInfo = {};
  const senderName = nullableString(raw.senderName);
  const senderClinic = nullableString(raw.senderClinic);
  const senderProviderNumber = cleanProviderNumber(raw.senderProviderNumber);
  const addresseeName = nullableString(raw.addresseeName);
  const addresseeClinic = nullableString(raw.addresseeClinic);
  const ccNames = cleanStringArray(raw.ccNames);

  if (senderName) referralInfo.senderName = senderName;
  if (senderClinic) referralInfo.senderClinic = senderClinic;
  if (senderProviderNumber)
    referralInfo.senderProviderNumber = senderProviderNumber;
  if (addresseeName) referralInfo.addresseeName = addresseeName;
  if (addresseeClinic) referralInfo.addresseeClinic = addresseeClinic;
  if (ccNames) referralInfo.ccNames = ccNames;
  const hasReferralInfo = Object.keys(referralInfo).length > 0;

  // Heuristic: a "result" classification that nonetheless carries a complete
  // referral block (sender + addressee names) is almost certainly a multipage
  // referral where the cover letter was outweighed by attached results.
  // Promote it to the appropriate referral type and emit a warning so ops can
  // monitor. Gate on letterSubtype: if the model explicitly marks the letter
  // as a non-referral subtype, the sender/addressee block alone is not enough.
  // Missing letterSubtype preserves the unconditional promotion behaviour
  // (back-compat with fixtures and any genuine omission by the model).
  const subtypeBlocksPromotion =
    letterSubtype !== undefined &&
    NON_REFERRAL_LETTER_SUBTYPES.has(letterSubtype);
  const promotedType =
    hasReferralInfo && !subtypeBlocksPromotion
      ? promoteResultToReferral(documentType, referralInfo)
      : undefined;
  if (promotedType) {
    warnings.push(
      `classification promoted: ${documentType} → ${promotedType} (referral signals present)`
    );
    documentType = promotedType;
  }

  // Demote a referral classification to generic when the model marks the
  // letter as a non-referral subtype (clinic follow-up, discharge summary,
  // results commentary, etc.) — the inverse of the bias in the prompt: a
  // letter that *looks* like a referral but the model says is e.g. a discharge
  // summary should not be routed as a referral.
  if (
    (documentType === "referral_letter" || documentType === "gp_referral") &&
    subtypeBlocksPromotion
  ) {
    const original = documentType;
    documentType = "generic";
    warnings.push(
      `classification demoted: ${original} → generic (letterSubtype=${letterSubtype})`
    );
  }

  const hasName =
    data.firstName !== "UNKNOWN" && data.lastName !== "PATIENT";

  if (!hasName) {
    warnings.push("Vision extraction could not determine patient name");
  }
  if (data.dob === "19000101") {
    warnings.push("Vision extraction could not determine date of birth");
  }

  return {
    documentType,
    data,
    referralInfo: hasReferralInfo ? referralInfo : undefined,
    warnings,
    classificationConfidence,
    letterSubtype,
  };
}
