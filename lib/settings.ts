/**
 * Runtime settings (DynamoDB-backed).
 *
 * Reuses the audit table (`DYNAMODB_TABLE`, default `bjc-pdf-to-hl7-audit`)
 * to avoid Terraform churn. Settings live under a sentinel partition key so
 * they don't collide with audit rows (which key on `YYYY-MM`).
 *
 * Single record (`month = "settings"`, `ts = "runtime"`). Adding a field is
 * a one-line extension; no schema migrations.
 *
 * In-memory cache with 30-second TTL keeps `/api/convert` hot — the
 * eligibility gate reads the confidence floor on every conversion. A 30s
 * staleness window is acceptable for an ops dial.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { logOperationalError } from "./server/logging";

const REGION = "ap-southeast-2";
const DEFAULT_TABLE = "bjc-pdf-to-hl7-audit";
const SETTINGS_PK = "settings";
const SETTINGS_SK = "runtime";
const DEFAULT_CACHE_TTL_MS = 30_000;

/** Bootstrap default — used when the DynamoDB record is empty and the
 *  `MIN_CLASSIFICATION_CONFIDENCE` env var is unset / invalid. */
export const DEFAULT_MIN_CLASSIFICATION_CONFIDENCE = 75;

/**
 * Runtime settings shape. All fields are scalar and non-PHI — the table is
 * accessible to any operator with audit-table read access.
 */
export interface RuntimeSettings {
  /** Confidence floor (0-100). Conversions below this score divert to manual
   *  review. */
  minClassificationConfidence: number;
  /** ISO timestamp of the most recent write, or undefined if never set. */
  updatedAt?: string;
  /** User email of the most recent writer, or undefined if never set. */
  updatedBy?: string;
}

interface CachedSettings {
  value: RuntimeSettings;
  expiresAtMs: number;
}

let cached: CachedSettings | null = null;

function getTableName(): string {
  return process.env.DYNAMODB_TABLE ?? DEFAULT_TABLE;
}

function buildDocClient(): DynamoDBDocumentClient {
  const base = new DynamoDBClient({ region: REGION });
  return DynamoDBDocumentClient.from(base);
}

/**
 * Coerce an arbitrary value (env var, DDB item, request body) to a valid
 * confidence floor. Returns `undefined` when the input is missing/invalid so
 * the caller can fall back to a lower-priority source.
 */
export function coerceConfidenceFloor(value: unknown): number | undefined {
  let num: number;
  if (typeof value === "number") {
    num = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    num = Number(value);
  } else {
    return undefined;
  }
  if (!Number.isFinite(num)) return undefined;
  const truncated = Math.trunc(num);
  if (truncated < 0 || truncated > 100) return undefined;
  return truncated;
}

function bootstrapDefault(): RuntimeSettings {
  const fromEnv = coerceConfidenceFloor(process.env.MIN_CLASSIFICATION_CONFIDENCE);
  return {
    minClassificationConfidence:
      fromEnv ?? DEFAULT_MIN_CLASSIFICATION_CONFIDENCE,
  };
}

function isRuntimeSettings(value: unknown): value is RuntimeSettings {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.minClassificationConfidence !== "number" ||
    !Number.isFinite(v.minClassificationConfidence)
  ) {
    return false;
  }
  if (v.updatedAt !== undefined && typeof v.updatedAt !== "string") return false;
  if (v.updatedBy !== undefined && typeof v.updatedBy !== "string") return false;
  return true;
}

/**
 * Clear the in-memory cache. Used by tests and immediately after a write to
 * force the next read to see the latest value.
 */
export function clearSettingsCache(): void {
  cached = null;
}

/**
 * Fetch the current settings. On a cache hit, returns immediately. On a miss,
 * reads from DynamoDB; if the record is absent / malformed / read fails,
 * returns the bootstrap default (env var → in-code constant). Never throws.
 */
export async function getSettings(options?: {
  /** Override the cache TTL (ms). Tests use 0 to disable caching. */
  cacheTtlMs?: number;
}): Promise<RuntimeSettings> {
  const ttlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = Date.now();

  if (cached && cached.expiresAtMs > now) {
    return cached.value;
  }

  try {
    const client = buildDocClient();
    const response = await client.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { month: SETTINGS_PK, ts: SETTINGS_SK },
      })
    );
    const item = response.Item;
    if (isRuntimeSettings(item)) {
      const value: RuntimeSettings = {
        minClassificationConfidence: clampConfidence(
          item.minClassificationConfidence
        ),
        updatedAt: item.updatedAt,
        updatedBy: item.updatedBy,
      };
      cached = { value, expiresAtMs: now + ttlMs };
      return value;
    }
  } catch (error) {
    logOperationalError("settings", error, { op: "read" });
  }

  const fallback = bootstrapDefault();
  cached = { value: fallback, expiresAtMs: now + ttlMs };
  return fallback;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MIN_CLASSIFICATION_CONFIDENCE;
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

export interface UpdateSettingsInput {
  /** New floor in [0, 100]. Validated before write — caller should also
   *  validate at the HTTP boundary for a friendlier error message. */
  minClassificationConfidence: number;
  /** User email recorded on the row + audit log. */
  updatedBy: string;
}

export interface UpdateSettingsResult {
  /** The settings as persisted (with `updatedAt` populated). */
  next: RuntimeSettings;
  /** The settings observed immediately before this write — used for audit
   *  logging. May reflect the bootstrap default if no prior record existed. */
  previous: RuntimeSettings;
}

/**
 * Persist a settings update. Validates inputs, writes the row, clears the
 * cache. Throws on validation failure or DynamoDB error so the caller can
 * surface a meaningful HTTP error.
 */
export async function updateSettings(
  input: UpdateSettingsInput
): Promise<UpdateSettingsResult> {
  const floor = coerceConfidenceFloor(input.minClassificationConfidence);
  if (floor === undefined) {
    throw new Error(
      "minClassificationConfidence must be an integer between 0 and 100"
    );
  }
  if (!input.updatedBy || input.updatedBy.trim() === "") {
    throw new Error("updatedBy is required");
  }

  // Force the previous-value read to hit DynamoDB even if the cache is warm,
  // so the audit log captures the actual persisted value (not a stale one).
  clearSettingsCache();
  const previous = await getSettings({ cacheTtlMs: 0 });

  const next: RuntimeSettings = {
    minClassificationConfidence: floor,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy,
  };

  const client = buildDocClient();
  await client.send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        month: SETTINGS_PK,
        ts: SETTINGS_SK,
        ...next,
      },
    })
  );

  // Force the next reader to see the new value.
  clearSettingsCache();

  return { next, previous };
}
