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
  type AuditRow,
} from "@/lib/audit";
import type { ConvertResult } from "@/lib/convert-service";
import {
  detectMailboxDisagreement,
  diagnosticServiceSectionFor,
} from "@/lib/conversion-config";
import { messageTypeForDocumentType } from "@/lib/convert/policy";
import type { DocumentType, MailboxSource } from "@/lib/domain/types";

/** Source of the conversion request — `web` is browser, `email` is the PAD pipeline. */
export type AuditSource = "web" | "email";

/**
 * Per-request metadata needed to build an audit row. `now` is passed in (not
 * read from `Date.now()`) so the builder is deterministic in tests.
 */
export interface AuditRowMeta {
  source: AuditSource;
  userEmail: string;
  mailboxHint: MailboxSource | undefined;
  originalFilename: string;
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
    fileSizeBytes: meta.fileSizeBytes,
    durationMs: meta.finishedAtMs - meta.startedAtMs,
    warningCount: result.warnings?.length ?? 0,
    userEmail: meta.userEmail,
    patientInitials,
    mailboxHint: meta.mailboxHint,
    ...(mailboxDisagreement ? { mailboxDisagreement: true } : {}),
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
    fileSizeBytes: meta.fileSizeBytes,
    durationMs: meta.finishedAtMs - meta.startedAtMs,
    warningCount: 0,
    userEmail: meta.userEmail,
    mailboxHint: meta.mailboxHint,
  };
}
