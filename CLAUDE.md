# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
bun dev          # Start development server (localhost:3000)
bun run build    # Production build
bun run lint     # ESLint check
bun run typecheck  # Typecheck (bun test does NOT typecheck)
bun test         # Run all tests (Bun test runner)
bun run check    # Typecheck, lint, then test
bun test --filter "consent"  # Run tests matching a pattern
bun start        # Start production server
```

**Bun is the only package manager.** There is no `package-lock.json`. Never use `npm ci`. Use `bun add`/`bun remove` for dependencies. On Amplify, `amplify.yml` uses `npm install` (not `npm ci`) because there's no lockfile.

### Local AWS Credentials (Bedrock)

Vision extraction calls Bedrock at runtime, even in local dev. To run `bun dev` or live test scripts (`scripts/test-vision.ts`, `scripts/test-addressee-scenarios.ts`):

- Export `AWS_PROFILE=<profile>` (or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) before starting the dev server
- Credentials need `bedrock:InvokeModel` on `anthropic.claude-sonnet-4-6` in **both** `ap-southeast-2` and `ap-southeast-4` (AU inference profiles route to Melbourne)
- Without credentials, `/api/convert` returns a credential warning instead of crashing — useful for non-Bedrock UI work

## Testing the API

```bash
# Health check
curl http://localhost:3000/api/convert

# Convert PDF to HL7 (auto-detect document type)
curl -X POST -F "pdf=@/path/to/file.pdf" http://localhost:3000/api/convert

# Detect document type only
curl -X POST -F "pdf=@/path/to/file.pdf" -F "detectOnly=true" http://localhost:3000/api/convert

# Convert with specific document type and Genie options
curl -X POST -F "pdf=@/path/to/file.pdf" -F "documentType=referral" -F "autoFile=true" http://localhost:3000/api/convert

# Convert with carrier and doctor list for addressee resolution
curl -X POST -F "pdf=@/path/to/file.pdf" -F "carrier=MYAPP" -F 'bjcDoctors=["Dr Irwin Lim","Dr Herman Lau"]' http://localhost:3000/api/convert
```

## Debug Scripts

```bash
bun run scripts/diagnose-pdfs.ts          # Extract patient data from all test PDFs
bun run scripts/test-vision.ts            # Run live Bedrock extraction against mock referrals
bun run scripts/generate-test-pdfs.ts     # Regenerate all 20 test PDFs (requires puppeteer)
bun run scripts/generate-addressee-test-pdfs.ts  # Generate CC/addressee resolution test PDFs
bun run scripts/test-addressee-scenarios.ts      # Live Bedrock test for CC addressee scenarios
```

Tests use generated PDFs at `docs/test-pdfs/` (nested subdirectories with various formats).

### Test Structure

Tests are co-located with source files and use `bun:test` imports (`describe`, `expect`, `test` from `"bun:test"`). Key test files:
- `lib/pdf-parser.test.ts` - Extraction logic (mocks Bedrock responses)
- `lib/hl7-builder.test.ts` - HL7 message generation
- `lib/vision-extractor.test.ts` - Vision extraction with mocked Bedrock client
- `app/api/convert/route.test.ts` - API route integration tests
- `lib/utils.test.ts` - Utility functions

The `scripts/test-vision.ts` and `scripts/test-addressee-scenarios.ts` are **live Bedrock tests** (not unit tests) — they require valid AWS credentials and make real API calls.

### Bun mock.module Limitation

Tests use `mock.module()` for Bedrock and PDF parser mocking. Keep mocks declared before importing the module under test. `bun test` currently passes as a full suite.

## Architecture

Next.js 14 App Router application that converts PDF patient documents to Australian HL7 v2.4 format (Genie-compatible).

### Data Flow

```
PDF Upload → /api/convert → convert-service.ts → pdf-parser.ts → vision-extractor.ts (Bedrock classify + extract) → hl7-builder.ts → HL7 Download
```

### Authentication

Password auth via Next.js middleware (`middleware.ts`):
- **Browser (cookie):** `APP_PASSWORD` env var checked against user input → sets `app_authenticated` httpOnly cookie (7-day expiry)
- `/login` and `/api/auth` are public; everything else requires the cookie session
- Login: `POST /api/auth` with `{ password }`, Logout: `DELETE /api/auth`

### Document Type System

Six document types are classified by Bedrock vision:
- **`consent_form`** - BJC Health Patient Information and Consent Forms
- **`referral`** - Referral letters from any sender (GP, specialist, clinic, allied health)
- **`consult_letter`** - Specialist-to-GP consultation reports ("Thanks for referring…")
- **`pathology_result`** - Pathology / lab reports (Douglass Hanly Moir, Laverty, Sonic, etc.)
- **`radiology_result`** - Imaging reports (PRP, I-MED, Lumus, etc.)
- **`generic`** - Any other medical PDF or unclear case

Legacy `gp_referral` and `referral_letter` strings (from pre-2026-05-20 audit
rows or external callers) are aliased forward to `referral` by
`lib/domain/document-type-aliases.ts`. Historical audit rows in DynamoDB are
not migrated — `prettifyDocType` maps all three values to "Referral letter"
on the dashboard.

### Core Modules

**`lib/convert-service.ts`** - Conversion form parsing and orchestration (no HTTP response objects, no auth). Key functions:
- `convertPdf(req: ConvertRequest): Promise<ConvertResult>` - Orchestrates extraction → HL7 build → format response
- `parseConvertFormData(formData: FormData): Promise<{ data: ConvertRequest } | { error: string }>` - Validates and parses upload FormData

**`lib/conversion-config.ts`** - Shared document types, default carrier, default doctor list, and routing helpers.

**`lib/pdf-parser.ts`** - Bedrock extraction facade. Key functions:
- `extractPatientData(pdfBuffer, documentType?, bjcDoctors?)` - Main entry point, optionally passes document type hint and doctor list to Bedrock
- `formatExtractedData()` - Formats PatientData + ReferralInfo into display-friendly key/value pairs for the UI

**`lib/vision-extractor.ts`** - Sends PDFs to Bedrock Claude Sonnet 4.6 via the Converse API. Constants: region `ap-southeast-2`, model `au.anthropic.claude-sonnet-4-6`, timeout 30s. Returns:
- Classified document type
- Structured patient fields
- Referral info: sender, addressee, CC names (AI-resolved against BJC doctor list)
- Runtime warnings for timeout, IAM, or credential failures
- State inference from Australian postcodes when the model omits state

**`lib/hl7-builder.ts`** - Generates HL7 v2.4 messages per ADRM specification. Supports two message types:
- **ORU^R01** (results) for consent forms and generic documents
- **REF^I12** (referrals) for `referral` and `consult_letter`, with AU simplified REF profile in MSH-12
- MSH: Message header with AUS country code, 8859/1 charset, configurable carrier (MSH-3)
- PID: Patient identification with Medicare format (`number-ref^^^AUSHIC^MC`)
- PV1: Patient visit (Outpatient), routes to doctor via provider number (PV1-9)
- PRD: Provider roles for REF messages (sender as RP=Referring Provider, addressee as RT=Referred To)
- OBR: Observation request with document type label and result status (F=Final/auto-file, P=Preliminary/queue)
- OBX: Embedded PDF as Base64 in ED datatype with AUSPDI coding

### HL7 Format Notes

- Segment terminator: CR only (`\r`), no LF
- Special characters must be escaped: `|` → `\F\`, `^` → `\S\`, `\` → `\E\`, `~` → `\R\`, `&` → `\T\`
- PDF embedded in OBX-5: `^application^pdf^Base64^<data>`
- Date format: YYYYMMDD (converted from Australian DD/MM/YYYY)

### Genie Integration Options (via API params)

- `autoFile` (default true): Sets OBR-25 to F (Final/auto-file) or P (Preliminary/queue for review)
- `orderingProvider`: Medicare Provider Number placed in PV1-9 to route document to a specific doctor's inbox
- `carrier`: Overrides MSH-3 Sending Application (default "SMECAI")
- `bjcDoctors`: JSON array of doctor names for AI-driven addressee resolution (falls back to `BJC_DOCTORS` env var, then the DynamoDB reference-data roster)

#### OBR-24 routing matrix

OBR-24 (Diagnostic Service Section) drives which Genie inbox the document lands in. It is set automatically from the document type — see `diagnosticServiceSectionFor()` in `lib/conversion-config.ts`.

| Document type | Message type | OBR-24 | Genie inbox |
|---------------|--------------|--------|-------------|
| `referral`, `consult_letter` | `REF^I12` | `PHY` | Incoming Letters |
| `pathology_result` | `ORU^R01` | `LAB` | Pathology |
| `radiology_result` | `ORU^R01` | `RAD` | Radiology |
| `consent_form`, `generic` | `ORU^R01` | (empty) | Genie default routing |

### UI & API Routes

- `/` - Converter UI with multi-file queue, localStorage-backed carrier and doctor list settings
- `/login` - Password login page
- `/dashboard` - Audit log dashboard (pie charts + table + CSV export, sourced from `/api/logs`)
- `/compliance` and `/privacy` - Static information pages
- `/api/auth` (POST/DELETE) - Login/logout
- `/api/convert` (GET/POST) - Service health / PDF conversion (accepts optional `X-Source: email` header from PAD pipeline; defaults to `web`)
- `/api/logs` (GET) - `?month=YYYY-MM` returns the month's audit rows (cookie-protected)

### Addressee Resolution

The vision extractor uses AI to identify sender, addressee, and CC recipients from referral letters and results. The doctor roster is resolved server-side by `lib/convert/doctor-roster.ts`: request `bjcDoctors` → `BJC_DOCTORS` env → DynamoDB reference data (`/reference` page — what the PAD path uses) → `DEFAULT_BJC_DOCTORS`. Roster names are the exact Genie address-book strings ("Dr I Lim"); the model is instructed to return the matching list entry verbatim, and a BJC doctor on a CC line overrides an external primary recipient.

`lib/extraction/addressee-snap.ts` is the deterministic backstop: after extraction, `convertPdf` snaps the addressee onto the roster by surname + given-initial match ("Dr Irwin Geok San Lim" → "Dr I Lim"), promotes a roster doctor found on a CC line (tolerating trailing address/phone text), and appends a digit-free advisory warning when nothing matches. It runs before the eligibility gate so a promoted addressee satisfies the result-doc OBR-16 requirement.

### Bedrock Runtime Notes

- `/api/convert` is pinned to `nodejs` runtime (`export const runtime = "nodejs"`) for Amplify SSR
- Bedrock auth comes from the Amplify **compute role**, not the service role
- A missing compute role will surface as an AWS credential error at runtime
- AU inference profiles (`au.anthropic.*`) route to `ap-southeast-4` (Melbourne) — IAM must allow **both** `ap-southeast-2` and `ap-southeast-4`

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `APP_PASSWORD` | Yes | Password for login authentication |
| `BJC_DOCTORS` | No | Comma-separated doctor names — legacy override; when unset the server loads the roster from the DynamoDB reference data |
| `DYNAMODB_TABLE` | No | Override the audit table name (defaults to `bjc-pdf-to-hl7-audit`). Used by `lib/audit.ts`. |

Locally, create `.env.local`. On Amplify, env vars are set at the app level and written to `.env.production` during build (see `amplify.yml`).

### Reference Docs

- `docs/README.md` - Index/map of the docs tree (start here)
- `docs/engineering/functional-spec.md` - Full functional specification (developer reference)
- `docs/engineering/genie-hl7-input-format.md` - Genie's HL7 input requirements
- `docs/operations/amplify-bedrock-credentials.md` - Amplify compute role + Bedrock auth setup
- `docs/operations/bjc-aws-account-access.md` - BJC-owned AWS account access (cross-account role, regions, STS opt-in gotcha)
- `docs/operations/bjc-pdf-to-hl7-operational-guide.md` - Plain-English operational guide for BJC ops staff and Medihost
- `docs/engineering/sister-system-pdf-to-directory.md` - Reference for the sister consent-form-to-directory project (different repo)
- `docs/archive/` - Historical/superseded docs (cost analysis, pricing research, refactor plans, PDF dups)

## Deployment

Deploy to AWS Amplify with platform set to **WEB_COMPUTE** (required for SSR). The `amplify.yml` is pre-configured. Uses `output: "standalone"` in `next.config.mjs` for Amplify compatibility. Must create `.env.production` during build phase to pass `APP_PASSWORD` to Lambda runtime, and the app must have a compute role with Bedrock permissions attached.

### BJC production account

Production deploys into BJC Health's own AWS account (`375391317635`), accessed via the cross-account `smec-deployment-role` — use `aws --profile bjc`. Deploy all resources to **Sydney (`ap-southeast-2`)**; Melbourne (`ap-southeast-4`) is enabled in the account only because Bedrock's `au.anthropic.*` inference profiles route there. Beware: cross-account `sts:AssumeRole` through an opt-in region's STS endpoint fails with a generic AccessDenied that mimics a trust-policy error — pin STS calls to Sydney when diagnosing. Full details: `docs/operations/bjc-aws-account-access.md`.

The root layout uses `force-dynamic` and middleware sets `Cache-Control: no-store` on all responses to prevent CloudFront from caching pages and bypassing middleware auth.

## Agent skills

### Issue tracker

Issues and PRDs live in the `BoabAI/bjc-pdf-to-hl7` GitHub repo, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map 1:1 to GitHub labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
