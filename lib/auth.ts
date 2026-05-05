import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { logAuthRejection } from "@/lib/server/logging";
import {
  getAuthMode,
  PASSWORD_COOKIE_NAME,
  passwordSession,
  verifyPasswordCookie,
} from "@/lib/auth-mode";

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
 * Selected auth mode — see lib/auth-mode.ts for the full matrix:
 *   - oauth (default): Microsoft Entra SSO via Auth.js
 *   - password: shared APP_PASSWORD with HMAC-signed cookie
 *   - disabled: synthetic session for everyone (legacy AUTH_ENABLED=false /
 *               TEST_MODE=true also resolve here)
 */
export const AUTH_MODE = getAuthMode();

if (AUTH_MODE === "disabled") {
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] AUTH_MODE=disabled — auth is bypassed with a synthetic session. Do not use in production without compensating controls."
  );
} else if (AUTH_MODE === "password") {
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] AUTH_MODE=password — using shared APP_PASSWORD. Audit-log entries will be attributed to a single shared user."
  );
} else if (AUTH_MODE === "both") {
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] AUTH_MODE=both — either APP_PASSWORD or Microsoft Entra SSO is accepted."
  );
}

const DISABLED_SESSION = {
  user: {
    email: "test@bjchealth.com.au",
    name: "Test Mode",
  },
  expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
} as unknown as import("next-auth").Session;

type AuthFn = typeof nextAuth.auth;

const realAuth = nextAuth.auth;

const disabledAuth = ((...args: unknown[]) => {
  if (args.length === 0) {
    return Promise.resolve(DISABLED_SESSION);
  }
  const handler = args[0] as (
    request: { auth: unknown } & Record<string, unknown>,
    ctx?: unknown
  ) => unknown;
  return (request: { auth: unknown } & Record<string, unknown>, ctx?: unknown) => {
    request.auth = DISABLED_SESSION;
    return handler(request, ctx);
  };
}) as AuthFn;

/**
 * Password-mode auth() implementation.
 *
 * - Zero-arg form: read the password cookie from `next/headers`. If valid,
 *   resolve to a synthetic password session; otherwise null.
 * - Wrapped-handler form: read the cookie off the NextRequest passed in by
 *   Auth.js' wrapper signature. We can't import next/server here (Edge) so
 *   we duck-type the request.cookies API.
 */
const passwordAuth = ((...args: unknown[]) => {
  if (args.length === 0) {
    // Zero-arg form returns a Promise<Session | null> — the route handlers
    // that use `await auth()` already expect that.
    return (async () => {
      const { cookies } = await import("next/headers");
      const value = cookies().get(PASSWORD_COOKIE_NAME)?.value;
      const verified = await verifyPasswordCookie(value);
      return verified
        ? (passwordSession() as unknown as import("next-auth").Session)
        : null;
    })();
  }
  // Wrapped-handler form must return a function synchronously — Next.js
  // middleware loads `export default auth(...)` and expects a callable, not
  // a Promise. The async work happens *inside* the returned function.
  const handler = args[0] as (
    request: { auth: unknown; cookies?: { get: (n: string) => { value: string } | undefined } } & Record<string, unknown>,
    ctx?: unknown
  ) => unknown;
  return async (
    request: { auth: unknown; cookies?: { get: (n: string) => { value: string } | undefined } } & Record<string, unknown>,
    ctx?: unknown
  ) => {
    const cookieValue = request.cookies?.get(PASSWORD_COOKIE_NAME)?.value;
    const verified = await verifyPasswordCookie(cookieValue);
    request.auth = verified ? (passwordSession() as unknown) : null;
    return handler(request, ctx);
  };
}) as unknown as AuthFn;

/**
 * Combined-mode auth() implementation.
 *
 * Try the password cookie first; if valid, the user is authenticated as the
 * shared password user. Otherwise fall through to the real Auth.js (Entra)
 * implementation. This lets a single deployment accept either credential
 * type without forcing the operator to pick.
 */
const bothAuth = ((...args: unknown[]) => {
  if (args.length === 0) {
    return (async () => {
      const { cookies } = await import("next/headers");
      const value = cookies().get(PASSWORD_COOKIE_NAME)?.value;
      const verified = await verifyPasswordCookie(value);
      if (verified) {
        return passwordSession() as unknown as import("next-auth").Session;
      }
      // realAuth() is overloaded; zero-arg form returns Promise<Session|null>.
      return (realAuth as unknown as () => Promise<import("next-auth").Session | null>)();
    })();
  }
  const handler = args[0] as (
    request: { auth: unknown; cookies?: { get: (n: string) => { value: string } | undefined } } & Record<string, unknown>,
    ctx?: unknown
  ) => unknown;
  // Pre-wrap the real handler once; reuse on every request.
  const realWrapped = (realAuth as unknown as (
    h: typeof handler
  ) => (
    request: { auth: unknown; cookies?: { get: (n: string) => { value: string } | undefined } } & Record<string, unknown>,
    ctx?: unknown
  ) => unknown)(handler);
  return async (
    request: { auth: unknown; cookies?: { get: (n: string) => { value: string } | undefined } } & Record<string, unknown>,
    ctx?: unknown
  ) => {
    const cookieValue = request.cookies?.get(PASSWORD_COOKIE_NAME)?.value;
    const verified = await verifyPasswordCookie(cookieValue);
    if (verified) {
      request.auth = passwordSession() as unknown;
      return handler(request, ctx);
    }
    return realWrapped(request, ctx);
  };
}) as unknown as AuthFn;

export const auth: AuthFn =
  AUTH_MODE === "disabled"
    ? disabledAuth
    : AUTH_MODE === "password"
      ? passwordAuth
      : AUTH_MODE === "both"
        ? bothAuth
        : realAuth;

/**
 * `/api/auth/[...nextauth]` handlers. In disabled mode, intercept
 * `/api/auth/session` so `useSession()` polls return the synthetic session
 * even if a stale Auth.js cookie is present. In password mode, return the
 * synthetic password session when the password cookie is valid.
 */
const realHandlers = nextAuth.handlers;

async function readPasswordCookieFromRequest(
  request: Parameters<typeof realHandlers.GET>[0]
): Promise<{ expires: number } | null> {
  // NextRequest exposes .cookies; Web Request does not.
  const req = request as unknown as {
    cookies?: { get: (n: string) => { value: string } | undefined };
    headers: Headers;
  };
  const direct = req.cookies?.get(PASSWORD_COOKIE_NAME)?.value;
  if (direct) return verifyPasswordCookie(direct);
  // Fallback: parse the raw Cookie header.
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.split(/;\s*/).find((c) => c.startsWith(`${PASSWORD_COOKIE_NAME}=`));
  if (!match) return null;
  return verifyPasswordCookie(match.slice(PASSWORD_COOKIE_NAME.length + 1));
}

export const handlers: typeof realHandlers =
  AUTH_MODE === "disabled"
    ? {
        GET: (async (request: Parameters<typeof realHandlers.GET>[0]) => {
          const url = new URL(request.url);
          if (url.pathname.endsWith("/api/auth/session")) {
            return Response.json(DISABLED_SESSION);
          }
          return realHandlers.GET(request);
        }) as typeof realHandlers.GET,
        POST: realHandlers.POST,
      }
    : AUTH_MODE === "password"
      ? {
          GET: (async (request: Parameters<typeof realHandlers.GET>[0]) => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/api/auth/session")) {
              const verified = await readPasswordCookieFromRequest(request);
              return Response.json(verified ? passwordSession() : null);
            }
            // Block Entra endpoints in password mode — they'd 500 anyway
            // without provider env vars, but a clean 404 is friendlier.
            return new Response("Not found", { status: 404 });
          }) as typeof realHandlers.GET,
          POST: (async () =>
            new Response("Not found", { status: 404 })) as typeof realHandlers.POST,
        }
      : AUTH_MODE === "both"
        ? {
            GET: (async (request: Parameters<typeof realHandlers.GET>[0]) => {
              const url = new URL(request.url);
              if (url.pathname.endsWith("/api/auth/session")) {
                // Password cookie wins if present and valid; otherwise let
                // Auth.js return the Entra session (or null).
                const verified = await readPasswordCookieFromRequest(request);
                if (verified) return Response.json(passwordSession());
              }
              return realHandlers.GET(request);
            }) as typeof realHandlers.GET,
            POST: realHandlers.POST,
          }
        : realHandlers;
