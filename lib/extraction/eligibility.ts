/**
 * Auto-route eligibility gate.
 *
 * Runs after extraction, before HL7 build. Decides whether to emit HL7
 * (auto-route) or divert the document to manual review.
 *
 * Order of failure preference (most specific → most generic):
 *   1. `extraction_failed`     — Bedrock returned no usable patient data.
 *   2. `unknown_doc_type`      — model picked `generic` (catch-all). The
 *                                eligibility gate is never confident enough
 *                                to auto-route generic correspondence.
 *   3. `mailbox_mismatch`      — model picked a doc type outside the
 *                                allowed set for the mailbox category.
 *   4. `missing_fields`        — required field for the picked doc type
 *                                is absent (patient name/DOB; OBR-16 for
 *                                pathology/radiology results).
 *   5. `low_confidence`        — model confidence below the configured
 *                                floor.
 *
 * Reason → suggested Outlook category mapping lives on the wire shape
 * (`MANUAL_REVIEW_CATEGORIES` in `lib/contracts/convert.ts`).
 */

import {
  allowedDocTypesForCategory,
  isResultDocumentType,
  type MailboxCategory,
} from "../conversion-config";
import type { DocumentType } from "../domain/types";
import {
  getSettings,
  type RuntimeSettings,
} from "../settings";
import type { ExtractionResult } from "../pdf-parser";
import {
  MANUAL_REVIEW_CATEGORIES,
  type ManualReviewReason,
} from "../contracts/convert";

export interface EligibilityCheck {
  name:
    | "extractionSucceeded"
    | "docTypeSupported"
    | "docTypeInMailboxCategory"
    | "requiredFieldsPresent"
    | "confidenceFloor";
  passed: boolean;
  detail?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  /** Failing reason — only populated when `eligible === false`. */
  reason?: ManualReviewReason;
  /** Default Outlook category PAD should apply for `reason`. */
  suggestedCategory?: string;
  /** All checks that ran, in order. Inspectable for debugging / audit. */
  checks: EligibilityCheck[];
}

export interface EvaluateEligibilityInput {
  /** The extraction result returned by `extractPatientData`. */
  extraction: ExtractionResult;
  /** Mailbox category (see `mailboxCategoryFor`). */
  mailboxCategory: MailboxCategory;
  /** Optional override — tests inject this so they don't need DDB. */
  settings?: RuntimeSettings;
  /**
   * When `true`, missing-required-fields drives a manual_review outcome.
   * When `false` (default), the eligibility gate emits a warning via the
   * caller but still allows HL7 emission — matching the lenient pilot
   * behaviour controlled by `STRICT_REQUIRED_FIELDS=true`. The route
   * translates `missing_fields` failures to HTTP 422 in strict mode.
   */
  strictRequiredFields?: boolean;
}

const NAME_PLACEHOLDERS = new Set(["UNKNOWN", "PATIENT"]);

function hasRealPatientName(extraction: ExtractionResult): boolean {
  const first = extraction.data.firstName?.trim() ?? "";
  const last = extraction.data.lastName?.trim() ?? "";
  if (!first || !last) return false;
  if (NAME_PLACEHOLDERS.has(first.toUpperCase()) &&
      NAME_PLACEHOLDERS.has(last.toUpperCase())) {
    return false;
  }
  return true;
}

function hasRealDob(extraction: ExtractionResult): boolean {
  return Boolean(extraction.data.dob) && extraction.data.dob !== "19000101";
}

function fail(
  reason: ManualReviewReason,
  checks: EligibilityCheck[]
): EligibilityResult {
  return {
    eligible: false,
    reason,
    suggestedCategory: MANUAL_REVIEW_CATEGORIES[reason],
    checks,
  };
}

/**
 * Evaluate the document for auto-routing. The function is sync at the
 * boundary but uses an injected `settings` value (callers fetch settings
 * before calling) so the eligibility check itself stays a pure function.
 */
export function evaluateAutoRouteEligibility(
  input: EvaluateEligibilityInput & { settings: RuntimeSettings }
): EligibilityResult {
  const { extraction, mailboxCategory, settings } = input;
  // Default true — eligibility unit-tests assert this rule. The route / service
  // disables this in lenient mode (the historical pilot behaviour) so a missing
  // OBR-16 emits a warning but still produces HL7.
  const strictRequiredFields = input.strictRequiredFields ?? true;
  const checks: EligibilityCheck[] = [];

  // 1. Extraction succeeded — name + DOB present (the only fields the rest
  //    of the pipeline truly depends on; everything else is best-effort).
  const extractionOk = extraction.success && hasRealPatientName(extraction) && hasRealDob(extraction);
  checks.push({
    name: "extractionSucceeded",
    passed: extractionOk,
    detail: extractionOk
      ? undefined
      : "Patient name or DOB missing from extraction",
  });
  if (!extractionOk) return fail("extraction_failed", checks);

  // 2. Doc type is something we can route. `generic` is intentionally
  //    treated as "I don't know" — we never auto-route it.
  const docType = extraction.documentType;
  const docTypeKnown = docType !== "generic";
  checks.push({
    name: "docTypeSupported",
    passed: docTypeKnown,
    detail: docTypeKnown ? undefined : `Doc type "${docType}" is not auto-routable`,
  });
  if (!docTypeKnown) return fail("unknown_doc_type", checks);

  // 3. Doc type is in the mailbox category's allowed set. Only enforced
  //    when the mailbox is known (results/letters); web uploads with no
  //    header skip this check.
  const inCategory =
    mailboxCategory === "none" ||
    allowedDocTypesForCategory(mailboxCategory).includes(docType);
  checks.push({
    name: "docTypeInMailboxCategory",
    passed: inCategory,
    detail: inCategory
      ? undefined
      : `Doc type "${docType}" not allowed for mailbox category "${mailboxCategory}"`,
  });
  if (!inCategory) return fail("mailbox_mismatch", checks);

  // 4. Required HL7 fields for the picked doc type. Today the only
  //    type-specific requirement is OBR-16 on result documents — sourced
  //    from referralInfo.addresseeName when the doc has been classified
  //    as pathology/radiology. Lenient callers (`strictRequiredFields: false`)
  //    skip this gate — the convert-service appends a warning so ops can chase
  //    the gap without losing the conversion.
  const requiredOk = checkRequiredFields(extraction, docType);
  checks.push({
    name: "requiredFieldsPresent",
    passed: requiredOk.ok,
    detail: requiredOk.ok ? undefined : requiredOk.missing,
  });
  if (!requiredOk.ok && strictRequiredFields) return fail("missing_fields", checks);

  // 5. Confidence floor (read from runtime settings). Missing confidence
  //    (e.g. legacy callers that pre-date the classifier reporting it) is
  //    treated as no-signal and passes — we never want to manual-review on
  //    pure absence of a signal.
  const floor = settings.minClassificationConfidence;
  const confidence = extraction.classificationConfidence;
  const confidenceOk =
    typeof confidence !== "number" || confidence >= floor;
  checks.push({
    name: "confidenceFloor",
    passed: confidenceOk,
    detail: confidenceOk
      ? undefined
      : `confidence ${confidence} below floor ${floor}`,
  });
  if (!confidenceOk) return fail("low_confidence", checks);

  return { eligible: true, checks };
}

interface RequiredFieldsCheck {
  ok: boolean;
  missing?: string;
}

function checkRequiredFields(
  extraction: ExtractionResult,
  docType: DocumentType
): RequiredFieldsCheck {
  // Result documents (pathology / radiology) drive OBR-16 from the
  // addressee block. Missing addressee → no Ordered By → Genie can't route
  // to the right inbox. Treat as a required-field failure.
  if (isResultDocumentType(docType)) {
    const addressee = extraction.referralInfo?.addresseeName?.trim();
    if (!addressee) {
      return {
        ok: false,
        missing: `OBR-16 (Ordered By) missing for ${docType} — required addressee name not extracted`,
      };
    }
  }
  return { ok: true };
}

/**
 * Async wrapper that fetches runtime settings before evaluating. Most
 * callers want this; tests prefer the sync `evaluateAutoRouteEligibility`
 * variant with an injected settings object.
 */
export async function evaluateEligibility(
  input: EvaluateEligibilityInput
): Promise<EligibilityResult> {
  const settings = input.settings ?? (await getSettings());
  return evaluateAutoRouteEligibility({
    extraction: input.extraction,
    mailboxCategory: input.mailboxCategory,
    settings,
  });
}
