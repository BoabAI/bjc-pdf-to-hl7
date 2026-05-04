import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { logAuthRejection } from "@/lib/server/logging";

declare module "next-auth" {
  interface Session {
    user: {
      email: string;
      name?: string | null;
    } & DefaultSession["user"];
  }
}

function parseAllowedDomains(): string[] {
  return (process.env.AUTH_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Extract the trusted UPN domain from an Entra profile. UPN
 * (`preferred_username`) is what the user's home tenant administratively
 * controls. The `email` claim can be a self-asserted alias and must not be
 * used as the trust anchor on its own.
 */
export function trustedDomainFromProfile(profile: unknown): string | null {
  if (typeof profile !== "object" || profile === null) return null;
  const p = profile as Record<string, unknown>;
  const upnRaw = typeof p.preferred_username === "string"
    ? p.preferred_username
    : typeof p.upn === "string"
      ? p.upn
      : "";
  const upn = upnRaw.toLowerCase().trim();
  if (!upn) return null;
  const at = upn.lastIndexOf("@");
  if (at < 0 || at === upn.length - 1) return null;
  const domain = upn.slice(at + 1);
  return domain || null;
}

export function isAllowedDomain(
  domain: string | null,
  allowed: string[] = parseAllowedDomains()
): boolean {
  if (!domain) return false;
  if (allowed.length === 0) return false;
  return allowed.includes(domain);
}

const nextAuth = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID ?? "common"}/v2.0`,
      authorization: { params: { scope: "openid profile email offline_access" } },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // absolute lifetime: 8 hours
    updateAge: 60 * 30, // touch session at most every 30 min
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ profile, account }) {
      const domain = trustedDomainFromProfile(profile);
      if (!isAllowedDomain(domain)) {
        // Structured log for CloudWatch — captures every claim that could
        // explain why a domain check failed (e.g. UPN on .onmicrosoft.com,
        // email vs UPN mismatch, missing claims). Never logs full tokens.
        // `claims.email` is redacted by the logger by default; UPN, tid, oid,
        // iss are preserved as the rejection diagnostic.
        const p = (profile ?? {}) as Record<string, unknown>;
        logAuthRejection("domain-not-allowed", {
          extractedDomain: domain ?? null,
          allowedDomains: parseAllowedDomains(),
          claims: {
            preferred_username:
              typeof p.preferred_username === "string"
                ? p.preferred_username
                : null,
            upn: typeof p.upn === "string" ? p.upn : null,
            email: typeof p.email === "string" ? p.email : null,
            name: typeof p.name === "string" ? p.name : null,
            tid: typeof p.tid === "string" ? p.tid : null,
            oid: typeof p.oid === "string" ? p.oid : null,
            iss: typeof p.iss === "string" ? p.iss : null,
          },
          provider: account?.provider ?? null,
        });
        return false;
      }
      return true;
    },
    async jwt({ token, profile }) {
      if (profile) {
        const p = profile as Record<string, unknown>;
        const upn =
          typeof p.preferred_username === "string"
            ? p.preferred_username
            : typeof p.upn === "string"
              ? p.upn
              : undefined;
        if (upn) {
          token.email = upn.toLowerCase();
        } else {
          // Defense in depth: signIn should already have rejected this token,
          // but never trust the email claim as a UPN substitute.
          logAuthRejection("missing-upn", {
            claims: {
              preferred_username:
                typeof p.preferred_username === "string"
                  ? p.preferred_username
                  : null,
              upn: typeof p.upn === "string" ? p.upn : null,
              email: typeof p.email === "string" ? p.email : null,
              name: typeof p.name === "string" ? p.name : null,
              tid: typeof p.tid === "string" ? p.tid : null,
              oid: typeof p.oid === "string" ? p.oid : null,
              iss: typeof p.iss === "string" ? p.iss : null,
            },
          });
        }
        if (typeof p.name === "string") token.name = p.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.email) session.user.email = token.email;
      if (token.name) session.user.name = token.name;
      return session;
    },
  },
});

export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;

/**
 * Auth bypass triggers — either flag short-circuits Entra and returns a
 * synthetic session for an allowed test user.
 *
 * - `AUTH_ENABLED=false`: explicit feature toggle to disable auth entirely.
 *   Honoured in any environment (including production). Use with care —
 *   only set this on environments that have other access controls in place
 *   (e.g. private demos, internal-only deployments).
 * - `TEST_MODE=true`: legacy bypass for browser-agent UI tests. Hard-gated
 *   to non-production.
 */
const AUTH_DISABLED = process.env.AUTH_ENABLED === "false";
const TEST_MODE_BYPASS =
  AUTH_DISABLED ||
  (process.env.TEST_MODE === "true" && process.env.NODE_ENV !== "production");

if (TEST_MODE_BYPASS) {
  // eslint-disable-next-line no-console
  console.warn(
    AUTH_DISABLED
      ? "[auth] AUTH_ENABLED=false — auth is disabled. All requests receive a synthetic session."
      : "[auth] TEST_MODE=true — auth is bypassed with a synthetic session. Never enable this in production."
  );
}

const TEST_SESSION = {
  user: {
    email: "test@bjchealth.com.au",
    name: "Test Mode",
  },
  expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
} as unknown as import("next-auth").Session;

type AuthFn = typeof nextAuth.auth;

const realAuth = nextAuth.auth;

const bypassAuth = ((...args: unknown[]) => {
  // Zero-arg form: `await auth()` returns a Session | null.
  if (args.length === 0) {
    return Promise.resolve(TEST_SESSION);
  }
  // Handler-wrapping form: `auth(async (request) => ...)`. Inject synthetic
  // session onto request.auth before delegating to the user handler.
  const handler = args[0] as (
    request: { auth: unknown } & Record<string, unknown>,
    ctx?: unknown
  ) => unknown;
  return (request: { auth: unknown } & Record<string, unknown>, ctx?: unknown) => {
    request.auth = TEST_SESSION;
    return handler(request, ctx);
  };
}) as AuthFn;

export const auth: AuthFn = TEST_MODE_BYPASS ? bypassAuth : realAuth;

/**
 * In TEST_MODE, intercept the `/api/auth/session` endpoint that
 * `useSession()` polls so client components also see the synthetic session.
 * Without this, a real Auth.js cookie left over from a prior login would
 * leak the real user into client UI even though server-side `auth()` is
 * bypassed.
 */
const realHandlers = nextAuth.handlers;

export const handlers: typeof realHandlers = TEST_MODE_BYPASS
  ? {
      GET: (async (request: Parameters<typeof realHandlers.GET>[0]) => {
        const url = new URL(request.url);
        if (url.pathname.endsWith("/api/auth/session")) {
          return Response.json(TEST_SESSION);
        }
        return realHandlers.GET(request);
      }) as typeof realHandlers.GET,
      POST: realHandlers.POST,
    }
  : realHandlers;
