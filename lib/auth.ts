import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

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
      : typeof p.email === "string"
        ? p.email
        : "";
  const upn = upnRaw.toLowerCase().trim();
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

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        const p = (profile ?? {}) as Record<string, unknown>;
        console.warn(
          "[auth] sign-in rejected " +
            JSON.stringify({
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
            })
        );
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
              : typeof p.email === "string"
                ? p.email
                : undefined;
        if (upn) token.email = upn.toLowerCase();
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
