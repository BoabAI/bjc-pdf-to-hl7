/**
 * Auth mode selector + password-mode cookie helpers.
 *
 * `AUTH_MODE` selects how requests authenticate:
 *   - `oauth` (default): Microsoft Entra SSO via Auth.js
 *   - `password`: shared password (`APP_PASSWORD`), HMAC-signed session cookie
 *   - `both`: either password OR Entra SSO accepted (login page shows both)
 *   - `disabled`: no auth, synthetic session for everyone
 *
 * Back-compat: `AUTH_ENABLED=false` and `TEST_MODE=true` (non-prod only)
 * still force `disabled` mode.
 *
 * Helpers in this file run in BOTH the Edge middleware and the Node route
 * handler, so we use Web Crypto (`crypto.subtle`) — never node:crypto.
 */

export type AuthMode = "oauth" | "password" | "both" | "disabled";

export const PASSWORD_COOKIE_NAME = "app_pw_session";
const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60; // 8h, mirrors Auth.js JWT lifetime

export function getAuthMode(env: Record<string, string | undefined> = process.env): AuthMode {
  // Legacy disable flags win.
  if (env.AUTH_ENABLED === "false") return "disabled";
  if (env.TEST_MODE === "true" && env.NODE_ENV !== "production") {
    return "disabled";
  }
  const raw = (env.AUTH_MODE ?? "").trim().toLowerCase();
  if (raw === "password") return "password";
  if (raw === "both" || raw === "any" || raw === "password+oauth" || raw === "oauth+password") {
    return "both";
  }
  if (raw === "disabled" || raw === "off" || raw === "none") return "disabled";
  return "oauth";
}

function getSecret(env: Record<string, string | undefined> = process.env): string {
  // AUTH_SECRET is already required by Auth.js. Fall back to APP_PASSWORD so
  // password mode keeps working on environments that haven't set AUTH_SECRET
  // (the password itself is the only secret needed to forge a cookie anyway).
  return env.AUTH_SECRET ?? env.APP_PASSWORD ?? "";
}

function utf8(value: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(value);
  // Copy into a fresh ArrayBuffer to satisfy strict BufferSource typing
  // (Uint8Array<ArrayBufferLike> can include SharedArrayBuffer).
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  // btoa is available in both Edge and Node 18+
  const b64 = typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(u8).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    utf8(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, utf8(message));
  return toBase64Url(sig);
}

/** Constant-time string compare; tolerates empty strings without leaking length. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Sign a password-mode session cookie. The payload is just the absolute
 * expiry (epoch seconds); the signature binds it to the server secret so a
 * client can't forge or extend it.
 */
export async function signPasswordCookie(
  expiresEpochSeconds: number,
  env: Record<string, string | undefined> = process.env
): Promise<string> {
  const secret = getSecret(env);
  if (!secret) throw new Error("AUTH_SECRET (or APP_PASSWORD) must be set");
  const payload = String(expiresEpochSeconds);
  const sig = await hmacSha256(secret, payload);
  return `${payload}.${sig}`;
}

/**
 * Verify a password-mode cookie. Returns the parsed expiry on success, or
 * null on any tampering, expiry, or malformed input.
 */
export async function verifyPasswordCookie(
  cookieValue: string | undefined | null,
  env: Record<string, string | undefined> = process.env,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<{ expires: number } | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0 || dot === cookieValue.length - 1) return null;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expires = Number(payload);
  if (!Number.isFinite(expires) || expires <= nowSeconds) return null;
  const secret = getSecret(env);
  if (!secret) return null;
  const expected = await hmacSha256(secret, payload);
  if (!constantTimeEqual(sig, expected)) return null;
  return { expires };
}

/**
 * Validate a submitted password against `APP_PASSWORD`. Refuses empty/short
 * configurations to avoid trivially-bypassable deployments.
 */
export function isValidAppPassword(
  candidate: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  const expected = env.APP_PASSWORD ?? "";
  if (expected.length < 8) return false;
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  return constantTimeEqual(candidate, expected);
}

export function passwordCookieMaxAgeSeconds(): number {
  return COOKIE_MAX_AGE_SECONDS;
}

/** Synthetic session shape used for both `disabled` and `password` modes. */
export function passwordSession(email = "user@bjchealth.com.au") {
  return {
    user: { email, name: "Password User" },
    expires: new Date(Date.now() + COOKIE_MAX_AGE_SECONDS * 1000).toISOString(),
  };
}
