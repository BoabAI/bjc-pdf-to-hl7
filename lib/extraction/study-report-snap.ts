/**
 * Deterministic backstop for the `isStudyReport` flag.
 *
 * Runs after extraction, before the eligibility gate. The Bedrock prompt asks
 * the model to set `isStudyReport` on a `consult_letter` that is really a
 * diagnostic study (prompt.ts "Study report flag"), but `normalize.ts` accepts
 * only a literal `true` — an omitted or malformed field silently becomes
 * `false`, and Genie then describes a sleep study as "Consult Letter".
 *
 * This is NOT an independent check. There is no text layer available (the repo
 * has no PDF text library, and the PAD faxes are image-only), so every signal
 * here is itself model output. What it catches is an *inconsistency*: the model
 * read the letterhead well enough to report a sleep or neurophysiology or
 * optometry service as the sender (prompt.ts: for study reports the sender is
 * the reporting / interpreting clinician) but did not set the flag. It cannot
 * catch a document the model misread outright — see the audit gap noted below.
 *
 * Design choices:
 * - Promote-only. A missed flag is the client's actual complaint; a spurious
 *   "Report" on a real letter is cosmetic. We never clear a flag the model set.
 * - `consult_letter` only. The flag is meaningless elsewhere and promoting it
 *   must never influence routing (OBR-24/MSH-9 are derived from documentType).
 * - Service-shaped tokens only. BJC Health is a rheumatology practice that
 *   receives ordinary correspondence from ophthalmologists and cardiologists,
 *   so bare "eye", "ophthalm" or "cardio" would mislabel real letters — the
 *   inverse of the problem we are fixing.
 * - ECG, echocardiogram and spirometry are deliberately absent. Those documents
 *   move inbox under PR #29 and the client has not ruled on echo; encoding an
 *   open decision in deterministic code would hide it.
 *
 * Warnings must stay digit-free: `redactWarning` in lib/audit.ts drops any
 * warning containing long digit runs or DOB-shaped dates.
 *
 * Non-goals: filename matching (`originalFilename` is not plumbed into
 * convertPdf and GoFax names are opaque), OCR, demotion.
 *
 * Note: because the flag is not persisted on the audit row, the warning this
 * emits is the only durable trace that the backstop fired.
 */

import type { DocumentType, ReferralInfo } from "../domain/types";

export interface SnapStudyReportResult {
  isStudyReport: boolean;
  warnings: string[];
}

/**
 * Service names that identify a diagnostic study provider rather than a
 * correspondent. Each must be specific enough that a rheumatology practice's
 * ordinary incoming mail cannot match it — "optometr" is safe, "eye" is not.
 *
 * Scoped to the three document families the client agreed on: sleep studies,
 * nerve conduction / EMG studies, and eye / optometry examination reports.
 */
const STUDY_SERVICE_PATTERNS: RegExp[] = [
  /\bsleep\s+(stud|diagnos|lab|physician|clinic|centre|center|medicine|disorder)/i,
  /\bpolysomnograph/i,
  /\bnerve\s+conduction/i,
  /\bneurophysiolog/i,
  /\belectromyograph/i,
  /\bEMG\b/,
  /\boptometr/i,
  /\beye\s+exam/i,
];

const BACKSTOP_WARNING =
  'Described as "Report" in Genie based on the sending service; the extraction did not flag this document as a study report.';

/**
 * Promote `isStudyReport` when the sender looks like a diagnostic study service
 * but the model left the flag unset. Returns the input value unchanged (and no
 * warning) in every other case.
 */
export function snapStudyReport(
  documentType: DocumentType,
  isStudyReport: boolean | undefined,
  referralInfo: ReferralInfo | undefined
): SnapStudyReportResult {
  const flagged = isStudyReport === true;

  if (documentType !== "consult_letter" || flagged) {
    return { isStudyReport: flagged, warnings: [] };
  }

  const haystack = [referralInfo?.senderClinic, referralInfo?.senderName]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");

  if (!haystack) return { isStudyReport: false, warnings: [] };

  const matched = STUDY_SERVICE_PATTERNS.some((pattern) => pattern.test(haystack));

  return matched
    ? { isStudyReport: true, warnings: [BACKSTOP_WARNING] }
    : { isStudyReport: false, warnings: [] };
}
