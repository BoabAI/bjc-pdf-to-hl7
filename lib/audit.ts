import { createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { DateTime } from "luxon";
import { logOperationalError } from "./server/logging";

const REGION = "ap-southeast-2";
const DEFAULT_TABLE = "bjc-pdf-to-hl7-audit";
const SYDNEY_ZONE = "Australia/Sydney";
const SYDNEY_MONTH_PATTERN = /^\d{4}-\d{2}$/;

export interface AuditRow {
  /** Partition key: "YYYY-MM" for conversion rows; "settings" for settings
   *  rows (sentinel — see /api/settings PUT). */
  month: string;
  /** Sort key: ISO timestamp + "#" + base36 random suffix (e.g. "2026-04-29T12:34:56.789Z#a3f9k1")
   *  for conversion rows; "runtime" sentinel for the singleton settings row. */
  ts: string;
  /** Document type, e.g. "pathology_result". Never patient-identifying. */
  documentType?: string;
  outcome: "ok" | "fail";
  source: "web" | "email";
  /** "ORU^R01" | "REF^I12" | undefined when fail */
  messageType?: string;
  /** "LAB" | "RAD" | "PHY" | undefined */
  diagnosticServiceSection?: string;
  /** sha256(originalFilename).slice(0, 12). NEVER raw filename. */
  filenameHash: string;
  /** ".pdf" or "" */
  filenameExt: string;
  /**
   * sha256(pdf bytes).slice(0, 12) — identifies the document regardless of
   * filename (PAD uploads every attachment as `temp.pdf`). Staff can verify
   * with `shasum -a 256` / `Get-FileHash`. Optional: rows before 2026-08-18
   * don't have it.
   */
  contentHash?: string;
  fileSizeBytes: number;
  durationMs: number;
  warningCount: number;
  /**
   * Sanitised warning messages from the conversion. Empty/undefined when no
   * warnings, or when every original warning was dropped by `redactWarning`.
   * `warningCount` always reflects the *original* count for ops visibility,
   * so a row with `warningCount: 3` and `warnings.length: 1` means two of
   * the three warnings looked PHI-shaped and were dropped on the way in.
   * Cap: max 10 entries, each truncated to 300 chars.
   */
  warnings?: string[];
  /** Authenticated user's email (UPN). "anonymous" for email/PAD pipeline. */
  userEmail?: string;
  /**
   * Patient initials in `F.L.` form (e.g. "J.M."). Operational identifier
   * for staff who already hold the source PDFs — never a full name. Undefined
   * when extraction failed or returned placeholder values.
   */
  patientInitials?: string;
  /**
   * Upstream mailbox the PDF arrived in, when source==='email' and the PAD
   * pipeline forwarded the X-Source-Mailbox header. "referrals" | "results"
   * for legacy rows; the new pipeline persists the raw mailbox category
   * (see `mailboxCategory`) and leaves this field undefined.
   */
  mailboxHint?: string;
  /**
   * True when the LLM's family classification disagreed with the upstream
   * mailbox (e.g. arrived via referrals, classified as a result). A misroute
   * signal — not a rejection. Useful for ops to filter and review.
   */
  mailboxDisagreement?: boolean;
  /**
   * Full source mailbox address from the `x-source-mailbox` header, lowercased
   * (e.g. `gofax.par@bjchealth.com.au`). Identifies WHICH GoFax mailbox a PAD
   * conversion came from once several are live. Absent on web uploads, on
   * legacy-enum headers, and on rows written before 2026-09-01. A BJC mailbox
   * address, not patient data.
   */
  mailboxAddress?: string;
  /**
   * Self-reported model confidence in the documentType classification, 0-100.
   * Small integer — not PHI. Persisted to enable dashboard-side filtering of
   * low-confidence classifications.
   */
  classificationConfidence?: number;
  /**
   * Mailbox category derived from the `x-source-mailbox` header. The new
   * pipeline's load-bearing routing signal. "results" | "letters" | "none".
   */
  mailboxCategory?: string;
  /**
   * Routing decision — `auto_routed` when the eligibility gate passed and
   * HL7 was emitted; `manual_review` when the doc was diverted to a human.
   */
  routingDecision?: string;
  /**
   * Manual-review reason (one of the values in `MANUAL_REVIEW_CATEGORIES`).
   * Only populated when `routingDecision === "manual_review"`.
   */
  routingReason?: string;
  /**
   * Human review label for `routingReason` (dashboard-facing; PAD applies
   * no Outlook categories in the Jul 2026 pilot design). Kept for ops-side
   * filtering convenience.
   */
  suggestedCategory?: string;
  /**
   * Optional structured action discriminator for non-conversion rows.
   * Currently `settings_updated` is the only known value.
   */
  action?: string;
}

/**
 * Build patient initials in `F.L.` form (e.g. "J.M."). Returns undefined when
 * either name is missing, empty, or matches the extraction placeholders
 * ("UNKNOWN" / "PATIENT") so the audit row never carries fake initials.
 */
export function buildPatientInitials(
  firstName: string | undefined,
  lastName: string | undefined
): string | undefined {
  const first = firstName?.trim();
  const last = lastName?.trim();
  if (!first || !last) return undefined;
  if (first.toUpperCase() === "UNKNOWN" && last.toUpperCase() === "PATIENT") {
    return undefined;
  }
  const f = first.charAt(0).toUpperCase();
  const l = last.charAt(0).toUpperCase();
  if (!/[A-Z]/.test(f) || !/[A-Z]/.test(l)) return undefined;
  return `${f}.${l}.`;
}

const WARNING_MAX_LENGTH = 300;
// 8+ consecutive digits → likely Medicare or run-on ID.
const PHI_DIGIT_RUN = /\d{8,}/;
// Common DOB shapes: 14/07/1982, 14-07-82, 1982-07-14, 14.07.1982.
const PHI_DOB_PATTERN =
  /\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b|\b\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}\b/;

/**
 * Sanitise a single warning message for persistence. Returns `undefined` when
 * the message is empty/whitespace or matches a PHI-shaped pattern (long digit
 * runs that look like a Medicare number, or DOB-shaped dates). Otherwise
 * returns the message truncated to `WARNING_MAX_LENGTH`.
 *
 * Defensive only — current warning sources (vision-extractor, convert-service)
 * emit operational strings, not patient data — but warnings are free-form
 * text and this is the first audit field to carry one, so the gate exists to
 * keep that contract safe even if a future warning is sloppily worded.
 */
export function redactWarning(message: string): string | undefined {
  if (typeof message !== "string") return undefined;
  const trimmed = message.trim();
  if (trimmed.length === 0) return undefined;
  if (PHI_DIGIT_RUN.test(trimmed)) return undefined;
  if (PHI_DOB_PATTERN.test(trimmed)) return undefined;
  return trimmed.length > WARNING_MAX_LENGTH
    ? trimmed.slice(0, WARNING_MAX_LENGTH)
    : trimmed;
}

function getTableName(): string {
  return process.env.DYNAMODB_TABLE ?? DEFAULT_TABLE;
}

function buildDocClient(): DynamoDBDocumentClient {
  const base = new DynamoDBClient({ region: REGION });
  return DynamoDBDocumentClient.from(base);
}

/**
 * Generate a base36 random suffix for the sort key. Avoids collisions on
 * rapid-fire writes within the same millisecond.
 */
export function randomSuffix(length = 6): string {
  let out = "";
  while (out.length < length) {
    out += Math.random().toString(36).slice(2);
  }
  return out.slice(0, length);
}

/**
 * Hash a filename for audit logging. Returns a 12-char hex prefix of the
 * sha256 digest. Never include patient-identifying data (firstName, lastName,
 * dob, medicareNo, address) in the audit row — only this hash.
 */
export function hashFilename(filename: string): string {
  return createHash("sha256").update(filename).digest("hex").slice(0, 12);
}

/**
 * Hash the uploaded PDF's bytes for audit logging. First 12 hex chars of the
 * full-file sha256 — the same digest `shasum -a 256 file.pdf` (Mac) or
 * `Get-FileHash file.pdf` (Windows) print, so staff can match a document to
 * a log row without any custom tooling.
 */
export function hashPdfContent(pdf: Buffer | Uint8Array): string {
  return createHash("sha256").update(pdf).digest("hex").slice(0, 12);
}

/**
 * Extract the file extension. Strictly allowlisted: returns ".pdf" only when
 * the filename ends in .pdf (case-insensitive); empty string otherwise.
 *
 * This is intentionally NOT generic. Free-form `lastIndexOf(".")` parsing
 * leaks PHI when filenames contain a name suffix (e.g. `Referral.Smith.pdf`
 * or, worse, a name without a real extension like `Note.JOHN`).
 * /api/convert only accepts application/pdf, so .pdf is the only valid value.
 */
export function extractFilenameExt(filename: string): string {
  return filename.toLowerCase().endsWith(".pdf") ? ".pdf" : "";
}

/**
 * Build the partition key (month, "YYYY-MM") from a Date.
 */
export function monthKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Build the sort key for a single audit row. Combines ISO timestamp with a
 * random base36 suffix for collision resistance.
 */
export function buildSortKey(date = new Date()): string {
  return `${date.toISOString()}#${randomSuffix(6)}`;
}

/**
 * Write a single audit row to DynamoDB. Errors are logged via the central
 * server logger and swallowed — the conversion API must continue to return
 * 200 to the user even if the audit table is unavailable.
 *
 * Awaited inline before /api/convert returns, because Lambda freezes
 * fire-and-forget work between requests.
 */
export async function recordConversion(row: AuditRow): Promise<void> {
  try {
    const client = buildDocClient();
    await client.send(
      new PutCommand({
        TableName: getTableName(),
        Item: row,
      })
    );
  } catch (error) {
    logOperationalError("audit", error, { op: "write" });
    // Swallow — never fail the conversion because of audit infra.
  }
}

/**
 * Query audit rows for a given month partition. Returns rows in descending
 * timestamp order (most recent first). Returns an empty array on error
 * rather than throwing — the dashboard should not 500 if audit reads fail.
 */
export async function listConversions(month: string): Promise<AuditRow[]> {
  try {
    const client = buildDocClient();
    const response = await client.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: "#m = :month",
        ExpressionAttributeNames: { "#m": "month" },
        ExpressionAttributeValues: { ":month": month },
        ScanIndexForward: false,
      })
    );

    const items = response.Items ?? [];
    return items.filter(isAuditRow);
  } catch (error) {
    logOperationalError("audit", error, { op: "query" });
    return [];
  }
}

/**
 * Returns the UTC month-partition keys that any timestamp inside the given
 * Sydney calendar month could fall into. A Sydney month always spans either
 * one or two adjacent UTC months because Sydney is UTC+10 / UTC+11. The
 * results are returned in ascending order and deduplicated.
 *
 * @param sydneyMonth - YYYY-MM, interpreted as a Sydney calendar month.
 * @throws Error when sydneyMonth is not a YYYY-MM string or is invalid.
 */
export function utcMonthsForSydneyMonth(sydneyMonth: string): string[] {
  if (typeof sydneyMonth !== "string" || !SYDNEY_MONTH_PATTERN.test(sydneyMonth)) {
    throw new Error(
      `utcMonthsForSydneyMonth: expected YYYY-MM, got ${JSON.stringify(sydneyMonth)}`
    );
  }
  const [yearStr, monthStr] = sydneyMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const start = DateTime.fromObject(
    { year, month, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
    { zone: SYDNEY_ZONE }
  );
  if (!start.isValid) {
    throw new Error(
      `utcMonthsForSydneyMonth: invalid Sydney month ${sydneyMonth} (${start.invalidReason})`
    );
  }
  const end = start.endOf("month");
  const startKey = start.toUTC().toFormat("yyyy-MM");
  const endKey = end.toUTC().toFormat("yyyy-MM");
  return startKey === endKey ? [startKey] : [startKey, endKey];
}

/**
 * List audit rows for a Sydney calendar month. Queries every UTC partition
 * the Sydney month can span, filters to rows whose `ts` falls inside the
 * Sydney month, and returns them sorted by descending timestamp.
 *
 * Audit rows are partitioned by UTC month at write-time (see `monthKey`),
 * but operators think in Sydney calendar months. A Sydney month always
 * straddles two UTC partitions, so a single-partition query would miss
 * rows landing in the late-evening tail of the month.
 */
export async function listConversionsForSydneyMonth(
  sydneyMonth: string
): Promise<AuditRow[]> {
  const utcMonths = utcMonthsForSydneyMonth(sydneyMonth);
  const partitionResults = await Promise.all(
    utcMonths.map((m) => listConversions(m))
  );
  const merged: AuditRow[] = [];
  for (const rows of partitionResults) {
    for (const row of rows) {
      if (sydneyMonthOfTs(row.ts) === sydneyMonth) {
        merged.push(row);
      }
    }
  }
  merged.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return merged;
}

/**
 * Convert an audit `ts` (UTC ISO + optional `#suffix`) to the Sydney calendar
 * month (`YYYY-MM`) the timestamp falls inside. Returns an empty string when
 * the timestamp is unparseable so misformatted rows are filtered out rather
 * than surfaced under the wrong month.
 */
function sydneyMonthOfTs(ts: string): string {
  const isoPart = ts.split("#")[0];
  const dt = DateTime.fromISO(isoPart, { zone: "utc" }).setZone(SYDNEY_ZONE);
  return dt.isValid ? dt.toFormat("yyyy-MM") : "";
}

function isAuditRow(value: unknown): value is AuditRow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.month === "string" &&
    typeof v.ts === "string" &&
    (v.outcome === "ok" || v.outcome === "fail") &&
    (v.source === "web" || v.source === "email") &&
    typeof v.filenameHash === "string" &&
    typeof v.filenameExt === "string" &&
    (v.contentHash === undefined || typeof v.contentHash === "string") &&
    (v.mailboxAddress === undefined || typeof v.mailboxAddress === "string") &&
    typeof v.fileSizeBytes === "number" &&
    typeof v.durationMs === "number" &&
    typeof v.warningCount === "number" &&
    (v.warnings === undefined ||
      (Array.isArray(v.warnings) &&
        v.warnings.every((w) => typeof w === "string"))) &&
    (v.userEmail === undefined || typeof v.userEmail === "string") &&
    (v.patientInitials === undefined || typeof v.patientInitials === "string") &&
    (v.mailboxHint === undefined || typeof v.mailboxHint === "string") &&
    (v.mailboxDisagreement === undefined ||
      typeof v.mailboxDisagreement === "boolean") &&
    (v.classificationConfidence === undefined ||
      typeof v.classificationConfidence === "number") &&
    (v.mailboxCategory === undefined ||
      typeof v.mailboxCategory === "string") &&
    (v.routingDecision === undefined ||
      typeof v.routingDecision === "string") &&
    (v.routingReason === undefined || typeof v.routingReason === "string") &&
    (v.suggestedCategory === undefined ||
      typeof v.suggestedCategory === "string") &&
    (v.action === undefined || typeof v.action === "string")
  );
}
