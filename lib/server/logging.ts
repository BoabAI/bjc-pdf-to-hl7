/**
 * Server-side structured logger with redaction.
 *
 * Server-only by convention — must not be imported into client bundles.
 * No AWS SDK imports, no app component imports.
 *
 * Every call emits a single JSON line so CloudWatch parses one log event per
 * call. Sensitive fields are redacted recursively before emission. The default
 * redact list covers credentials, tokens, and PHI-adjacent identifiers
 * (Medicare numbers, names, contact info, DOB, address). Adding more is fine;
 * removing entries is not.
 *
 * `Error.stack` is included only when `LOG_DEBUG=1` — the stack can carry
 * filenames and code we don't want in CloudWatch by default.
 */

export type LogLevel = "info" | "warn" | "error";

const REDACT_KEYS_EXACT = new Set<string>([
  "password",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "authorization",
  "cookie",
  "setcookie",
  "bearer",
  "medicare",
  "medicareno",
  "medicareref",
  "medicarenumber",
  "medicare_number",
  "providernumber",
  "provider_number",
  "dob",
  "phone",
  "address",
  "addressline1",
  "address_line_1",
  "addressline2",
  "address_line_2",
  "streetaddress",
  "street_address",
  "suburb",
  "postcode",
  "state",
  "firstname",
  "lastname",
  "patientname",
  "email",
]);

const REDACT_KEYS_SUBSTRING: readonly string[] = [
  "password",
  "secret",
  "token",
  "medicare",
  "apikey",
];

const REDACTED = "[redacted]";
const CIRCULAR = "[circular]";
const DEPTH_LIMIT = "[depth-limit]";
const MAX_DEPTH = 6;

function shouldRedactKey(rawKey: string): boolean {
  const key = rawKey.toLowerCase();
  if (REDACT_KEYS_EXACT.has(key)) return true;
  for (const sub of REDACT_KEYS_SUBSTRING) {
    if (key.includes(sub)) return true;
  }
  return false;
}

/**
 * Recursively redact known-sensitive keys. Only inspects own enumerable
 * string keys (no symbols, no prototype chain). Caps depth at MAX_DEPTH and
 * tracks visited objects with a WeakSet to handle cycles safely.
 */
function redact(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (depth >= MAX_DEPTH) return DEPTH_LIMIT;

  const obj = value as object;
  if (seen.has(obj)) return CIRCULAR;
  seen.add(obj);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[key];
    if (shouldRedactKey(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redact(v, depth + 1, seen);
    }
  }
  return out;
}

interface ErrorPayload {
  name: string;
  message: string;
  code?: string;
  stack?: string;
}

/**
 * Extract a safe Error-shaped payload. Never spreads the error — that would
 * bypass redaction. Includes `stack` only when LOG_DEBUG=1.
 */
function extractErrorPayload(error: unknown): ErrorPayload {
  const includeStack = process.env.LOG_DEBUG === "1";

  if (error instanceof Error) {
    const payload: ErrorPayload = {
      name: error.name,
      message: error.message,
    };
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === "string") {
      payload.code = maybeCode;
    }
    if (includeStack && typeof error.stack === "string") {
      payload.stack = error.stack;
    }
    return payload;
  }

  return {
    name: "NonError",
    message: typeof error === "string" ? error : String(error),
  };
}

/**
 * Build the wire payload that would be logged. Exported for test inspection.
 * Production code should call logServerEvent / logOperationalError /
 * logAuditFailure / logAuthRejection instead.
 */
export function buildLogPayload(
  level: LogLevel,
  category: string,
  message: string,
  context?: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    category,
    message,
  };
  if (context !== undefined) {
    const redacted = redact(context, 0, new WeakSet<object>());
    payload.context = redacted;
  }
  return payload;
}

function emit(level: LogLevel, payload: Record<string, unknown>): void {
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Emit a structured log event. One JSON line, redacted context, CloudWatch-
 * friendly. Use this for plain operational signals; for errors, prefer
 * `logOperationalError` so the Error fields are extracted safely.
 */
export function logServerEvent(
  level: LogLevel,
  category: string,
  message: string,
  context?: Record<string, unknown>
): void {
  emit(level, buildLogPayload(level, category, message, context));
}

/**
 * Error-level log. Extracts `name` / `message` (and `code` / `stack` when
 * available) from the error; the error itself is NEVER spread into context,
 * so its raw fields cannot bypass redaction. Use this for runtime failures
 * caught in route handlers and integration modules.
 */
export function logOperationalError(
  category: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const payload = buildLogPayload(
    "error",
    category,
    "operational error",
    context
  );
  payload.error = extractErrorPayload(error);
  emit("error", payload);
}

/**
 * Convenience wrapper for audit-write failures (DDB threw inside
 * `recordConversion`). Conversion API must continue to return 200 even when
 * the audit table is unavailable.
 */
export function logAuditFailure(
  error: unknown,
  context?: Record<string, unknown>
): void {
  logOperationalError("audit", error, context);
}

/**
 * Sign-in rejection log. Used by `lib/auth.ts` to record domain-not-allowed
 * and missing-UPN cases. The `claims` sub-object passes through redaction —
 * `claims.email` becomes `"[redacted]"` automatically, while UPN, name, tid,
 * oid, iss are preserved as the structured rejection diagnostic.
 */
export function logAuthRejection(
  reason: string,
  context: Record<string, unknown>
): void {
  const payload = buildLogPayload("warn", "auth", `sign-in rejected: ${reason}`, context);
  emit("warn", payload);
}
