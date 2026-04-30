# Plan: Microsoft Entra ID SSO with Domain Allowlist

## Context

The app currently uses a single shared `APP_PASSWORD` checked by `middleware.ts` against an `app_authenticated` cookie. For an Australian medical-data tool this is non-compliant on three counts: no per-user identity, no MFA, and audit logs that record "anonymous" instead of who did what (Privacy Act 1988 / APP 11).

Both BJC Health (`bjchealth.com.au`) and SMEC AI (`smecai.au`) are on Microsoft 365. The user wants to avoid registering an app in BJC's Entra tenant if possible.

**Outcome:** users sign in with their existing M365 account; only `@bjchealth.com.au` and `@smecai.au` are accepted; MFA is enforced upstream by each tenant's Conditional Access policy; audit log records the signed-in email.

## Approach: Multi-tenant Entra app in SMEC tenant

Register one Entra app in `smecai.au`'s tenant, set `signInAudience = AzureADMultipleOrgs`, use Auth.js v5 with the Microsoft Entra ID provider against the `/common` endpoint. Domain allowlist enforced server-side in the `signIn` callback.

Why this over single-tenant in BJC's tenant:
- BJC IT involvement is limited to (at most) a one-time admin consent click — no app registration on their side
- BJC users still authenticate against **their own tenant**, so BJC's MFA/CA policies still apply (that's the compliance anchor)
- Faster to ship, you own the credentials and rotation
- Trade-off: BJC IT can't disable the app from their console — they'd revoke per-user access by removing the user from their tenant, which is the operative control anyway

**Trust anchor:** the `preferred_username` (UPN) claim, not `email`. UPN's domain is what each tenant administratively controls.

## Files to change

### New files
- `lib/auth.ts` — Auth.js v5 config: Entra provider on `/common`, JWT sessions, `signIn` callback enforces domain allowlist on UPN, `jwt`/`session` callbacks copy email + tenantId onto the session.
- `app/api/auth/[...nextauth]/route.ts` — Auth.js handlers (replaces the current `app/api/auth/route.ts`).
- `auth.config.ts` (root) — minimal edge-safe config used by middleware (provider list only, no DB calls).

### Modified files
- `middleware.ts` (current: `/Users/sean/Projects/bjc-pdf-to-hl7/middleware.ts`) — replace `app_authenticated` cookie check with Auth.js `auth()` middleware. Keep the public-route allowlist (`/login`, Auth.js callback paths). Keep the no-cache headers — they're load-bearing for Amplify/CloudFront.
- `app/login/page.tsx` — replace password form with a single "Sign in with Microsoft" button that calls `signIn("microsoft-entra-id")`. Keep existing styling.
- `app/api/auth/route.ts` — **delete** (replaced by Auth.js catch-all route).
- `app/api/logs/route.ts` — replace cookie re-check (lines 24–31) with `auth()` session check; pull email for audit context if needed.
- `app/api/reference-data/route.ts` — replace `requireAuth(request)` helper (lines 14–24) with Auth.js `auth()` session check.
- `app/api/convert/route.ts` (lines 29–35, 68–90) — pass signed-in email through to `recordConversion()`.
- `lib/audit.ts` (`AuditRow` interface lines 12–32, `recordConversion` lines 102–115) — add `userEmail: string` field. Update DynamoDB write to include it. Existing rows without the field stay readable (optional on read).
- `app/components/AppNav.tsx` — add "Signed in as `<email>`" + Sign out button (calls `signOut()`).
- `package.json` — add `next-auth@beta` (v5) and `@auth/core`.
- `amplify.yml` (line 10) — replace the `APP_PASSWORD` echo with the new Auth.js env vars (see below). Remove `APP_PASSWORD` write.
- `.env.example` — replace `APP_PASSWORD` with the Auth.js vars.
- `next.config.mjs` — no changes expected.
- `app/layout.tsx` — add `<SessionProvider>` if any client component needs the session (only needed if AppNav becomes client-side and uses `useSession`); otherwise read session server-side via `auth()` and pass email as a prop.

### Tests to update
- `middleware.test.ts` — mock Auth.js `auth()` instead of cookie.
- `app/api/auth/route.test.ts` — **delete** (route is replaced; Auth.js handlers are framework-tested upstream).
- `app/api/logs/route.test.ts`, `app/api/reference-data/route.test.ts` — mock `auth()` session.
- New: `lib/auth.test.ts` — unit-test the `signIn` callback domain allowlist (allowed domains pass, others rejected, missing UPN rejected, case-insensitive).
- `lib/audit.test.ts` (if exists) or add — assert `userEmail` is written and round-trips.

## Entra app registration (SMEC tenant, one-time)

1. Azure Portal → Entra ID → App registrations → New registration
2. Name: `BJC PDF-to-HL7`
3. Supported account types: **Accounts in any organizational directory (Multitenant)**
4. Redirect URI (Web): `https://<amplify-domain>/api/auth/callback/microsoft-entra-id` (production) and `http://localhost:3000/api/auth/callback/microsoft-entra-id` (dev)
5. Certificates & secrets → New client secret → 24-month expiry → store value
6. API permissions: `openid`, `profile`, `email`, `offline_access` (Microsoft Graph delegated). All admin-consented in SMEC tenant.
7. Token configuration: add `email` and `upn` optional claims to the ID token.
8. Branding: add publisher domain `smecai.au` and verify (improves consent UX, reduces chance BJC blocks the app).

Capture: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID=common`.

## Environment variables

Replace in `.env.local`, `.env.example`, and Amplify app-level config:

| Var | Value | Notes |
|-----|-------|-------|
| ~~`APP_PASSWORD`~~ | — | **Remove.** |
| `AUTH_SECRET` | random 32-byte hex | `openssl rand -hex 32` — signs the JWT |
| `AUTH_URL` | `https://<amplify-domain>` | Auth.js needs this in prod |
| `AUTH_TRUST_HOST` | `true` | Required behind Amplify proxy |
| `AZURE_AD_CLIENT_ID` | from app reg | |
| `AZURE_AD_CLIENT_SECRET` | from app reg | rotate every 18 months |
| `AZURE_AD_TENANT_ID` | `common` | multi-tenant |
| `AUTH_ALLOWED_DOMAINS` | `bjchealth.com.au,smecai.au` | comma-separated, read by `signIn` callback |

Update `amplify.yml` build phase to write all of these (except `AUTH_SECRET` and `AZURE_AD_CLIENT_SECRET` — set those at the Amplify app level so they end up in the Lambda env, not in `.env.production`). Pattern: same as current — `echo "VAR=$VAR" >> .env.production` for non-secret vars only.

## Domain allowlist logic (the only piece worth pseudocoding)

```ts
// lib/auth.ts — signIn callback
async signIn({ profile }) {
  const upn = (profile?.preferred_username ?? profile?.email ?? "").toLowerCase();
  const domain = upn.split("@")[1];
  const allowed = (process.env.AUTH_ALLOWED_DOMAINS ?? "")
    .split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
  return Boolean(domain) && allowed.includes(domain);
}
```

Reject (return `false`) if UPN missing or domain not in allowlist. Auth.js will redirect to `/login?error=AccessDenied`. Log the rejected email + reason via `console.warn` (Amplify CloudWatch picks it up — useful for "why can't I log in?" debugging).

## Audit log change

`AuditRow` gains `userEmail: string`. `recordConversion()` now receives it from the route handler. `lib/audit.ts:listConversions()` returns it; `/dashboard` table can optionally show a "User" column (not required for v1, but the data is captured from day one — non-trivial to backfill later).

## Verification

End-to-end:
1. Local: `bun dev`, hit `/`, expect redirect to `/login`. Click Sign in with Microsoft. Sign in with `@smecai.au` account → redirected to `/`. Convert a PDF. Check DynamoDB row has `userEmail`.
2. Local: sign out → cookie cleared → `/` redirects to `/login`.
3. Local: try a non-allowlisted account (personal `@outlook.com`) → expect `/login?error=AccessDenied`.
4. Tests: `bun run check` passes (typecheck + lint + tests). New `lib/auth.test.ts` covers allowed/denied/missing-UPN cases.
5. Staging Amplify deploy: full flow with a real BJC user (need one volunteer). Confirm BJC's MFA prompt appears (proves we're hitting their tenant's CA). Confirm audit row has BJC email.
6. After 30 min of inactivity, session expires and forces re-auth. After 8 h absolute lifetime, same.

## Rollout / cutover

- This is a hard cutover — there's no read path that keeps the password flow alongside SSO. Land it behind a deploy and notify the two users (you + initial BJC contact) before the deploy.
- Keep a one-commit revert ready (the password flow is well-isolated in the files listed above).
- After 1 week clean: delete `APP_PASSWORD` from Amplify env vars and rotate it out of any password manager entries.

## Out of scope (deliberate)

- DynamoDB session store / logout-everywhere — JWT is fine at this scale.
- Backfilling `userEmail` on historical audit rows — leave as null/missing.
- Per-user role/permission system — everyone signed in has the same access. Add later if needed.
- Cognito / Auth0 — over-engineered for two domains.
