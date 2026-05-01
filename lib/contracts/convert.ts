/**
 * Shared HTTP contract for `POST /api/convert`.
 *
 * Client-safe: imported by both the server route and React components, so this
 * module must not pull in Node-only or AWS SDK code.
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

/** Single shared shape for `/api/convert` responses. */
export interface ConvertResponse {
  success: boolean;
  filename?: string;
  hl7Content?: string;
  extractedData?: ConvertExtractedData;
  warnings?: string[];
  extractionMethod?: "vision";
  documentType?: DocumentType;
  /**
   * True when the LLM's family classification disagrees with the upstream
   * mailbox (PDF arrived in `referrals` but classified as a result, etc.).
   * Surfaces as a UI banner — the server still trusts the LLM verdict.
   */
  mailboxDisagreement?: boolean;
  error?: string;
}

const DOCUMENT_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>([
  "consent_form",
  "referral_letter",
  "gp_referral",
  "pathology_result",
  "radiology_result",
  "generic",
]);

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
  if (v.mailboxDisagreement !== undefined && typeof v.mailboxDisagreement !== "boolean") {
    return false;
  }
  if (v.extractedData !== undefined && !isExtractedData(v.extractedData)) {
    return false;
  }
  return true;
}
