/**
 * PAD email pipeline authentication.
 *
 * The email-driven path (PDF arrives in a monitored mailbox, PAD POSTs the
 * file to /api/convert with `X-Source: email`) is service-to-service. There
 * is no Auth.js session for these calls. We authenticate them with a shared
 * bearer token in `Authorization: Bearer <PAD_TOKEN>`.
 *
 * Helpers here run in BOTH middleware (Edge runtime) and the route handler
 * (Node runtime), so we avoid any Node-only crypto APIs and use a manual
 * constant-time comparison instead.
 */

const MIN_TOKEN_LENGTH = 16;

/**
 * Constant-time string compare. Returns true iff `a` and `b` are equal byte
 * strings. Length-leak-resistant: refuses up front if lengths differ, which
 * is the standard tradeoff for non-padded bearer-token compares.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Pull the bearer token out of an `Authorization` header value.
 * Tolerates extra whitespace and case-insensitive `bearer` scheme.
 * Returns null when the header is missing or malformed.
 */
export function extractBearerToken(
  authHeader: string | null | undefined
): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^\s*Bearer\s+(\S.*?)\s*$/i);
  return match ? match[1] : null;
}

/**
 * Validate a token against the configured PAD secret. Refuses any
 * configuration where the secret is missing or shorter than 16 chars —
 * that's a guardrail against misconfigured envs accidentally accepting
 * empty/weak tokens.
 */
export function isValidPadToken(
  token: string | null | undefined,
  expected: string | undefined = process.env.PAD_TOKEN
): boolean {
  if (!token || !expected) return false;
  if (expected.length < MIN_TOKEN_LENGTH) return false;
  return constantTimeEqual(token, expected);
}

/**
 * True iff the request looks like a valid PAD-pipeline call:
 *   - `X-Source: email` is set
 *   - `Authorization: Bearer <token>` matches the configured PAD_TOKEN
 *
 * Used in middleware (so the request is not redirected to /login) AND in
 * the /api/convert route handler (defence in depth). Both must agree.
 */
export function isPadAuthenticated(
  headers: Headers,
  expectedToken?: string
): boolean {
  if (headers.get("x-source") !== "email") return false;
  const token = extractBearerToken(headers.get("authorization"));
  return isValidPadToken(token, expectedToken);
}
