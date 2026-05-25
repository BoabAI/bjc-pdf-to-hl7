/**
 * Shared HTTP contract for `POST /api/convert`.
 *
 * Client-safe: imported by both the server route and React components, so this
 * module must not pull in Node-only or AWS SDK code.
 *
 * Two response actions:
 *   - `auto_routed` — eligibility gate passed; HL7 emitted; existing behaviour.
 *   - `manual_review` — eligibility gate failed; no HL7. PAD must keep the
 *     source email in the inbox and tag it with the suggested Outlook category.
 */

import type { DocumentType } from "../domain/types";

/** Patient/referral fields rendered in the UI panel after a successful convert. */
export interface ConvertExtractedData {
  firstName: string;
  lastName: string;
  dob: string;
  sex: string;
  medicareNo: string;
  sender?: string;
  addressee?: string;
  cc?: string;
  date?: string;
  messageType?: string;
  carrier?: string;
}

/**
 * Routing decision the API made. `auto_routed` means HL7 was produced and
 * should be filed; `manual_review` means PAD should leave the source email
 * untouched in the inbox and tag it with `suggestedCategory`.
 */
export type RoutingAction = "auto_routed" | "manual_review";

/**
 * Stable machine identifier for why a document was diverted to manual review.
 * Maps 1:1 to an Outlook category that PAD applies to the source email — see
 * `MANUAL_REVIEW_CATEGORIES` below.
 */
export type ManualReviewReason =
  | "low_confidence"
  | "missing_fields"
  | "mailbox_mismatch"
  | "unknown_doc_type"
  | "extraction_failed"
  | "urgent_result";

/** Default Outlook category label PAD applies for each reason. Lives in code
 *  so the wire shape is self-contained; BJC ops can override on the PAD side
 *  if they prefer different colour codes / wording. */
export const MANUAL_REVIEW_CATEGORIES: Record<ManualReviewReason, string> = {
  low_confidence: "Needs review — Low confidence",
  missing_fields: "Needs review — Missing fields",
  mailbox_mismatch: "Needs review — Wrong inbox",
  unknown_doc_type: "Needs review — Unknown type",
  extraction_failed: "Needs review — Extraction failed",
  urgent_result: "Needs review — Urgent result",
};

/** Single shared shape for `/api/convert` responses. */
export interface ConvertResponse {
  success: boolean;
  /**
   * Routing decision. `auto_routed` for the legacy success path,
   * `manual_review` when the eligibility gate diverted the doc. Omitted on
   * the controlled-failure path (success=false, no extraction) so older
   * clients keep parsing.
   */
  action?: RoutingAction;
  filename?: string;
  hl7Content?: string;
  extractedData?: ConvertExtractedData;
  warnings?: string[];
  extractionMethod?: "vision";
  documentType?: DocumentType;
  /**
   * Self-reported model confidence in the documentType classification, 0-100.
   * Optional in the wire shape — not all callers care; audit row persists it
   * separately. Surfaces in the UI as a low-confidence advisory banner.
   */
  classificationConfidence?: number;
  /**
   * True when the LLM's family classification disagrees with the upstream
   * mailbox. Legacy field kept for back-compat — the new pipeline surfaces
   * the same condition via `action === "manual_review"` + `reason ===
   * "mailbox_mismatch"`.
   */
  mailboxDisagreement?: boolean;
  /** Manual-review reason. Only present when `action === "manual_review"`. */
  reason?: ManualReviewReason;
  /** Human-readable Outlook category PAD should apply. Only present when
   *  `action === "manual_review"`. */
  suggestedCategory?: string;
  error?: string;
}

const DOCUMENT_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>([
  "consent_form",
  "referral",
  "consult_letter",
  "pathology_result",
  "radiology_result",
  "generic",
]);

const ROUTING_ACTIONS: ReadonlySet<RoutingAction> = new Set<RoutingAction>([
  "auto_routed",
  "manual_review",
]);

const MANUAL_REVIEW_REASONS: ReadonlySet<ManualReviewReason> =
  new Set<ManualReviewReason>([
    "low_confidence",
    "missing_fields",
    "mailbox_mismatch",
    "unknown_doc_type",
    "extraction_failed",
    "urgent_result",
  ]);

export function isManualReviewReason(value: unknown): value is ManualReviewReason {
  return typeof value === "string" && MANUAL_REVIEW_REASONS.has(value as ManualReviewReason);
}

function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && DOCUMENT_TYPES.has(value as DocumentType);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isExtractedData(value: unknown): value is ConvertExtractedData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // Required fields are always strings (server emits empty strings, not undefined).
  if (typeof v.firstName !== "string") return false;
  if (typeof v.lastName !== "string") return false;
  if (typeof v.dob !== "string") return false;
  if (typeof v.sex !== "string") return false;
  if (typeof v.medicareNo !== "string") return false;
  // Optional fields, when present, must be strings.
  for (const key of ["sender", "addressee", "cc", "date", "messageType", "carrier"]) {
    if (v[key] !== undefined && typeof v[key] !== "string") return false;
  }
  return true;
}

/**
 * Runtime guard for `/api/convert` JSON. Used by the client before trusting
 * the response. Returns `false` for null, arrays, missing-success, or any
 * field whose type doesn't match.
 */
export function isConvertResponse(value: unknown): value is ConvertResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.success !== "boolean") return false;
  if (v.action !== undefined && !(typeof v.action === "string" && ROUTING_ACTIONS.has(v.action as RoutingAction))) {
    return false;
  }
  if (v.filename !== undefined && typeof v.filename !== "string") return false;
  if (v.hl7Content !== undefined && typeof v.hl7Content !== "string") return false;
  if (v.error !== undefined && typeof v.error !== "string") return false;
  if (v.warnings !== undefined && !isStringArray(v.warnings)) return false;
  if (
    v.extractionMethod !== undefined &&
    v.extractionMethod !== "vision"
  ) {
    return false;
  }
  if (v.documentType !== undefined && !isDocumentType(v.documentType)) return false;
  if (
    v.classificationConfidence !== undefined &&
    (typeof v.classificationConfidence !== "number" ||
      !Number.isFinite(v.classificationConfidence))
  ) {
    return false;
  }
  if (v.mailboxDisagreement !== undefined && typeof v.mailboxDisagreement !== "boolean") {
    return false;
  }
  if (v.reason !== undefined && !isManualReviewReason(v.reason)) {
    return false;
  }
  if (v.suggestedCategory !== undefined && typeof v.suggestedCategory !== "string") {
    return false;
  }
  if (v.extractedData !== undefined && !isExtractedData(v.extractedData)) {
    return false;
  }
  return true;
}
