/**
 * Legacy document-type aliases. Single source of truth used by every consumer
 * that may receive a pre-collapse doc type string (the vision model, the API
 * form-data input, the manual-override UI dropdown).
 *
 * The 2026-05-20 referral-collapse PR (`feat/2026-05-20-meeting-followup`)
 * merged `gp_referral` and `referral_letter` into a single `referral` type.
 * Both routed to PHY → Genie Incoming Letters anyway and Nicole confirmed the
 * GP-vs-specialist distinction has no operational consequence. Historical
 * audit rows (DynamoDB) still carry the old strings — they're translated for
 * display in `prettifyDocType`, not migrated.
 */

import type { DocumentType } from "./types";

/**
 * Map a legacy doc-type string to its current canonical equivalent.
 * Returns `undefined` when the input is not a known legacy alias AND not a
 * current canonical doc type (caller decides the fallback).
 */
export const LEGACY_DOC_TYPE_ALIASES: Readonly<Record<string, DocumentType>> = {
  gp_referral: "referral",
  referral_letter: "referral",
};

/**
 * Resolve any string the pipeline might receive as a document type — legacy
 * alias or current canonical — to the canonical `DocumentType`. Returns
 * `undefined` when the string is neither known canonical nor a known alias.
 *
 * Callers should chain this with their own fallback: e.g.
 *   `resolveDocumentTypeAlias(raw) ?? "generic"`
 *
 * We resolve aliases first so a legacy string like `"gp_referral"` maps to
 * `"referral"` even though it is not present in the current DocumentType union.
 */
export function resolveDocumentTypeAlias(raw: unknown): DocumentType | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  const aliased = LEGACY_DOC_TYPE_ALIASES[trimmed];
  if (aliased) return aliased;

  // Idempotent fast-path: if the value already looks canonical, return it.
  // We avoid importing DOCUMENT_TYPES from conversion-config to keep the
  // domain module dependency-free — the type-narrowing is by-value, not by
  // membership check, so callers must still validate against DOCUMENT_TYPES
  // when they care about full canonical membership (e.g. normalize).
  return undefined;
}
