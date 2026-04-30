import { createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = "ap-southeast-2";
const DEFAULT_TABLE = "bjc-pdf-to-hl7-audit";

export interface AuditRow {
  /** Partition key: "YYYY-MM" */
  month: string;
  /** Sort key: ISO timestamp + "#" + base36 random suffix, e.g. "2026-04-29T12:34:56.789Z#a3f9k1" */
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
  fileSizeBytes: number;
  durationMs: number;
  warningCount: number;
  /** Authenticated user's email (UPN). "anonymous" for email/PAD pipeline. */
  userEmail?: string;
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
 * Write a single audit row to DynamoDB. Errors are logged via console.error
 * and swallowed — the conversion API must continue to return 200 to the user
 * even if the audit table is unavailable.
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
    console.error("Audit write failed:", error);
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
    console.error("Audit query failed:", error);
    return [];
  }
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
    typeof v.fileSizeBytes === "number" &&
    typeof v.durationMs === "number" &&
    typeof v.warningCount === "number" &&
    (v.userEmail === undefined || typeof v.userEmail === "string")
  );
}
