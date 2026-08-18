/**
 * Pure audit-row builders for the /api/convert route. No I/O, no globals —
 * everything they need is passed in via `AuditRowMeta`. This isolates the
 * policy decisions (when to set messageType, when to flag mailbox
 * disagreement, what counts as patient initials) from request plumbing,
 * making them directly unit-testable.
 *
 * NOTE: never add patient identifiers (names, DOB, Medicare) to the row. See
 * `app/api/convert/route.test.ts` `audit row contains hashed filename ...`
 * for the contract this builder must keep.
 */

import {
  buildPatientInitials,
  buildSortKey,
  extractFilenameExt,
  hashFilename,
  monthKey,
  redactWarning,
  type AuditRow,
} from "@/lib/audit";
import type { ConvertResult } from "@/lib/convert-service";
import {
  detectMailboxDisagreement,
  diagnosticServiceSectionFor,
  type MailboxCategory,
} from "@/lib/conversion-config";
import { messageTypeForDocumentType } from "@/lib/convert/policy";
import type { DocumentType, MailboxSource } from "@/lib/domain/types";

/** Source of the conversion request — `web` is browser, `email` is the PAD pipeline. */
export type AuditSource = "web" | "email";

/** Hard cap on persisted warnings per row. `warningCount` keeps the original
 * total, so an operator seeing `count=15, warnings.length=10` knows the tail
 * was elided rather than missing. */
const MAX_PERSISTED_WARNINGS = 10;

/** Below this self-reported confidence, append a "low classification
 * confidence" warning so it surfaces on the audit dashboard. */
const LOW_CONFIDENCE_THRESHOLD = 70;

/**
 * Sanitise + cap warnings for persistence. Drops anything PHI-shaped (handled
 * by `redactWarning`), truncates each entry, and keeps at most the first
 * `MAX_PERSISTED_WARNINGS` survivors. Returns `undefined` when nothing
 * survives so we don't write an empty array to DynamoDB.
 */
function persistableWarnings(raw: string[] | undefined): string[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: string[] = [];
  for (const msg of raw) {
    const safe = redactWarning(msg);
    if (safe !== undefined) {
      out.push(safe);
      if (out.length >= MAX_PERSISTED_WARNINGS) break;
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Per-request metadata needed to build an audit row. `now` is passed in (not
 * read from `Date.now()`) so the builder is deterministic in tests.
 */
export interface AuditRowMeta {
  source: AuditSource;
  userEmail: string;
  mailboxHint: MailboxSource | undefined;
  /**
   * Resolved mailbox category derived from `x-source-mailbox` header
   * (results / letters / none). Used by the audit log + dashboard for
   * mailbox-vs-doc-type routing analytics. Pass `"none"` (not undefined)
   * for web uploads with no mailbox hint.
   */
  mailboxCategory: MailboxCategory | undefined;
  originalFilename: string;
  /** sha256(pdf bytes)[0:12] via `hashPdfContent`; "" when no file was parsed. */
  contentHash: string;
  fileSizeBytes: number;
  startedAtMs: number;
  finishedAtMs: number;
  /** Single Date for both monthKey + sort key. Kept stable across success/fail paths. */
  now: Date;
}

/**
 * Build an audit row for a conversion that completed (success or controlled
 * failure — both produce a `ConvertResult`). When the result includes a
 * resolved document type, we record the routing policy (messageType,
 * diagnosticServiceSection, mailbox disagreement).
 */
export function buildConversionAuditRow(
  meta: AuditRowMeta,
  result: ConvertResult
): AuditRow {
  const resolvedDocType: DocumentType | undefined = result.documentType;
  const recordPolicy = result.success && resolvedDocType !== undefined;

  const mailboxDisagreement = detectMailboxDisagreement(
    meta.mailboxHint,
    resolvedDocType
  );

  const patientInitials = result.success
    ? buildPatientInitials(
        result.extractedData?.firstName,
        result.extractedData?.lastName
      )
    : undefined;

  // Augment warnings with a low-confidence advisory when the model self-reports
  // a value below threshold. The integer is a small non-PHI value (e.g. "60"),
  // so it survives `redactWarning`'s digit-run filter (8+ digits required).
  const confidence = result.classificationConfidence;
  const augmentedWarnings =
    typeof confidence === "number" && confidence < LOW_CONFIDENCE_THRESHOLD
      ? [
          ...(result.warnings ?? []),
          `low classification confidence: ${confidence}`,
        ]
      : result.warnings;

  return {
    month: monthKey(meta.now),
    ts: buildSortKey(meta.now),
    documentType: resolvedDocType,
    outcome: result.success ? "ok" : "fail",
    source: meta.source,
    messageType: recordPolicy
      ? messageTypeForDocumentType(resolvedDocType)
      : undefined,
    diagnosticServiceSection: recordPolicy
      ? diagnosticServiceSectionFor(resolvedDocType)
      : undefined,
    filenameHash: hashFilename(meta.originalFilename),
    filenameExt: extractFilenameExt(meta.originalFilename),
    contentHash: meta.contentHash,
    fileSizeBytes: meta.fileSizeBytes,
    durationMs: meta.finishedAtMs - meta.startedAtMs,
    warningCount: augmentedWarnings?.length ?? 0,
    ...((): { warnings?: string[] } => {
      const w = persistableWarnings(augmentedWarnings);
      return w ? { warnings: w } : {};
    })(),
    userEmail: meta.userEmail,
    patientInitials,
    mailboxHint: meta.mailboxHint,
    ...(meta.mailboxCategory !== undefined && meta.mailboxCategory !== "none"
      ? { mailboxCategory: meta.mailboxCategory }
      : {}),
    ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
    ...(typeof confidence === "number"
      ? { classificationConfidence: confidence }
      : {}),
    // Routing decision metadata. Only persist when we actually have a value
    // (skip on the controlled-failure path so the dashboard doesn't have to
    // distinguish "absent because no policy ran" from "absent because legacy").
    ...(result.action ? { routingDecision: result.action } : {}),
    ...(result.action === "manual_review" && result.reason
      ? { routingReason: result.reason }
      : {}),
    ...(result.action === "manual_review" && result.suggestedCategory
      ? { suggestedCategory: result.suggestedCategory }
      : {}),
  };
}

/**
 * Build a minimal failure audit row for the catch-block path, where the
 * conversion threw before producing a `ConvertResult`. Records request
 * metadata (filename hash, ext, size, timing, userEmail, mailbox hint) but
 * never any extracted patient fields — there are none.
 */
export function buildFailureAuditRow(meta: AuditRowMeta): AuditRow {
  return {
    month: monthKey(meta.now),
    ts: buildSortKey(meta.now),
    outcome: "fail",
    source: meta.source,
    filenameHash: hashFilename(meta.originalFilename),
    filenameExt: extractFilenameExt(meta.originalFilename),
    contentHash: meta.contentHash,
    fileSizeBytes: meta.fileSizeBytes,
    durationMs: meta.finishedAtMs - meta.startedAtMs,
    warningCount: 0,
    userEmail: meta.userEmail,
    mailboxHint: meta.mailboxHint,
    ...(meta.mailboxCategory !== undefined && meta.mailboxCategory !== "none"
      ? { mailboxCategory: meta.mailboxCategory }
      : {}),
  };
}
