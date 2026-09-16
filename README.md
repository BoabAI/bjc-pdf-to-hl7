# PDF to HL7 Converter

Convert Australian medical PDFs to HL7 v2.4 format (Genie-compatible) using AWS Bedrock vision.

## Features

- Upload PDFs via a multi-file web queue or the authenticated API (max 10MB per file)
- AWS Bedrock Claude Sonnet 4.6 vision classifies six document types: consent forms, referrals, consult letters, pathology results, radiology results, and generic documents
- Extracts patient data (name, DOB, address, Medicare) plus sender, addressee, and CC recipients
- Generates HL7 v2.4 messages: **ORU^R01** (results) or **REF^I12** (referrals), with OBR-24 routing to the matching Genie inbox
- AI addressee resolution against a DynamoDB-backed BJC Health doctor list (editable at `/reference`)
- Documents marked **Urgent** are blocked from conversion and routed to manual review — never auto-filed
- Embeds the original PDF as Base64 in the OBX segment
- DynamoDB audit log with dashboard pages (`/log`, `/stats`) and CSV export
- Microsoft Entra SSO via Auth.js v5 for browser users; shared bearer token for the PAD email pipeline

## Documentation map

- **`docs/README.md`** — Index/map of the whole docs tree (start here).
- **`docs/engineering/functional-spec.md`** — Developer / technical reference for this repo (architecture, modules, HL7 generation rules, deployment, testing).
- **`docs/operations/bjc-pdf-to-hl7-operational-guide.md`** — Plain-English guide for BJC ops staff and Medihost (workflow, what's imported, manual upload path, code escrow).
- **`docs/engineering/sister-system-pdf-to-directory.md`** — Reference for the sister consent-form-to-directory project (different repo).
- **[`CLAUDE.md`](./CLAUDE.md)** — Architecture notes and gotchas for AI-assisted development.

## Quick Start

```bash
# Install dependencies
bun install

# Configure local env (Auth.js/Entra vars, PAD_TOKEN — see .env.example)
cp .env.example .env.local

# Start development server
bun dev

# Open http://localhost:3000
```

For local development without an Entra app registration, set `AUTH_MODE=password` (login with `APP_PASSWORD`) or `AUTH_MODE=disabled` (no auth, non-prod only) in `.env.local`.

### Local AWS Credentials

Bedrock vision and the DynamoDB audit/reference tables are called server-side, even in dev. Export `AWS_PROFILE` (or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) before `bun dev`. The credentials need `bedrock:InvokeModel` on `anthropic.claude-sonnet-4-6` in **both** `ap-southeast-2` and `ap-southeast-4` — AU inference profiles route to Melbourne. Note that local runs hit the same DynamoDB tables as the deployed app.

### Common Commands

```bash
bun dev              # Dev server
bun run build        # Production build
bun run lint         # ESLint
bun run typecheck    # Typecheck (bun test does NOT typecheck)
bun test             # Run all tests
bun run check        # Typecheck, lint, then test
```

## Authentication

`AUTH_MODE` selects how browser requests authenticate (see `lib/auth-mode.ts`):

| Mode | Behaviour |
|------|-----------|
| `oauth` (default) | Microsoft Entra SSO via Auth.js v5; sign-in restricted to `AUTH_ALLOWED_DOMAINS` UPN domains |
| `password` | Shared password (`APP_PASSWORD`) with an HMAC-signed session cookie |
| `both` | Either accepted; login page shows both options |
| `disabled` | No auth (non-prod only) |

Service-to-service callers (the PAD email pipeline) authenticate to `/api/convert` only, with a shared bearer token plus source header:

```bash
curl -X POST \
  -H "Authorization: Bearer $PAD_TOKEN" \
  -H "X-Source: email" \
  -F "pdf=@/path/to/file.pdf" \
  http://localhost:3000/api/convert
```

Unauthenticated API requests get a JSON 401 (not a login redirect); unauthenticated page requests redirect to `/login`.

## API Usage

### Health Check

```bash
curl -H "Authorization: Bearer $PAD_TOKEN" -H "X-Source: email" \
  http://localhost:3000/api/convert
```

### Convert with Options

```bash
curl -X POST \
  -H "Authorization: Bearer $PAD_TOKEN" \
  -H "X-Source: email" \
  -F "pdf=@/path/to/file.pdf" \
  -F "documentType=referral" \
  -F "autoFile=true" \
  -F "carrier=MYAPP" \
  -F "orderingProvider=1234567A" \
  -F 'bjcDoctors=["Dr Irwin Lim","Dr Herman Lau"]' \
  http://localhost:3000/api/convert
```

### API Parameters (`POST /api/convert`)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pdf` | File | Yes | - | PDF file (max 10MB) |
| `detectOnly` | string | No | - | `"true"` to classify without converting. Legacy — kept for scripts; not used by the web UI (every file is classified during conversion, so a separate detect call would just double the Bedrock cost). |
| `documentType` | string | No | `"auto"` | Optional hint for the classifier. `auto`, `consent_form`, `referral`, `consult_letter`, `pathology_result`, `radiology_result`, `generic`. The vision model classifies regardless and uses this only as a tiebreaker on ambiguous documents. Legacy values `referral_letter` / `gp_referral` are silently aliased to `referral`. |
| `autoFile` | string | No | `"true"` | `"true"` = auto-file (F), `"false"` = queue for review (P) |
| `orderingProvider` | string | No | - | Medicare Provider Number for doctor routing (PV1-9) |
| `carrier` | string | No | `"SMECAI"` | Sending Application (MSH-3) |
| `bjcDoctors` | JSON string | No | - | Doctor names for addressee resolution |

### Response

```json
{
  "success": true,
  "filename": "SMITH_John_20260223143045.hl7",
  "hl7Content": "MSH|^~\\&|SMECAI|BJCHEALTH|GENIE|CLINIC|...",
  "extractedData": {
    "firstName": "John",
    "lastName": "Smith",
    "dob": "23/02/1980",
    "sex": "Male",
    "medicareNo": "1234567890-1",
    "sender": "Dr Jane Wilson (Lakeside Medical)",
    "addressee": "Dr Irwin Lim (BJC Health)",
    "cc": "Dr Herman Lau",
    "messageType": "REF (Referral)",
    "carrier": "SMECAI"
  },
  "warnings": []
}
```

### Routes

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/` | - | Session | Converter UI (multi-file queue) |
| `/login` | - | Public | Sign-in page (SSO and/or password per `AUTH_MODE`) |
| `/log` | - | Session | Audit log table + CSV export (`/dashboard` redirects here) |
| `/stats` | - | Session | Conversion stats charts |
| `/reference` | - | Session | Doctors + carriers reference data editor |
| `/settings` | - | Session | Runtime ops settings (classification-confidence floor) |
| `/compliance`, `/privacy` | - | Session | Static information pages |
| `/api/auth/[...nextauth]` | GET/POST | Public | Auth.js (Entra SSO) endpoints |
| `/api/auth/password` | POST/DELETE | Public | Password-mode login / logout |
| `/api/convert` | GET/POST | Session or PAD bearer | Service health / PDF → HL7 conversion |
| `/api/logs` | GET | Session | `?month=YYYY-MM` audit rows for the dashboard |
| `/api/reference-data` | GET/PUT/DELETE | Session | Doctors + carriers store |
| `/api/settings` | GET/PUT | Session | Runtime ops settings |

## HL7 Output Format

### Message type and Genie inbox routing

OBR-24 (Diagnostic Service Section) is set automatically from the document type and drives which Genie inbox the document lands in:

| Document type | Message type | OBR-24 | Genie inbox |
|---------------|--------------|--------|-------------|
| `referral`, `consult_letter` | `REF^I12` | `PHY` | Incoming Letters |
| `pathology_result` | `ORU^R01` | `LAB` | Pathology |
| `radiology_result` | `ORU^R01` | `RAD` | Radiology |
| `consent_form`, `generic` | `ORU^R01` | (empty) | Genie default routing |

### ORU^R01 (Results, Consent Forms, Generic Documents)

| Segment | Description |
|---------|-------------|
| MSH | Message header with AUS country code, 8859/1 charset |
| PID | Patient identification with Medicare format |
| PV1 | Patient visit (Outpatient), optional doctor routing |
| OBR | Observation request with document title |
| OBX | Embedded PDF as Base64 in ED datatype (AUSPDI) |

### REF^I12 (Referrals, Consult Letters)

| Segment | Description |
|---------|-------------|
| MSH | Message header with AU simplified REF profile in MSH-12 |
| RF1 | Referral information with effective date |
| PRD | Provider data: sender (RP) and addressee (RT) |
| PID | Patient identification with Medicare format |
| OBR | Observation request with sender/addressee context |
| OBX | Embedded PDF as Base64 in ED datatype (AUSPDI) |
| PV1 | Patient visit with addressee in PV1-9 |

Documents the model flags as **Urgent** are not converted at all — they are audited as manual-review items so a human handles them directly.

## Environment Variables

See `.env.example` for a working local template.

| Variable | Required | Purpose |
|----------|----------|---------|
| `AUTH_SECRET` | Yes | Auth.js session/cookie signing secret (`openssl rand -hex 32`) |
| `AUTH_URL` / `AUTH_TRUST_HOST` | Yes | Auth.js base URL config |
| `AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET` / `AZURE_AD_TENANT_ID` | SSO modes | Microsoft Entra app registration |
| `AUTH_ALLOWED_DOMAINS` | SSO modes | Comma-separated UPN domains allowed to sign in |
| `AUTH_MODE` | No | `oauth` (default), `password`, `both`, or `disabled` |
| `APP_PASSWORD` | Password modes | Shared password for `password`/`both` modes |
| `PAD_TOKEN` | For PAD calls | Bearer token for service-to-service `/api/convert` calls |
| `BJC_DOCTORS` | No | Comma-separated doctor-name fallback when no `bjcDoctors` param and no reference data |
| `DYNAMODB_TABLE` | No | Audit table override (default `bjc-pdf-to-hl7-audit`) |
| `REFERENCE_DATA_TABLE` | No | Reference data table override (default `bjc-pdf-to-hl7-reference-data`) |
| `MIN_CLASSIFICATION_CONFIDENCE` | No | Default classification-confidence floor (adjustable at runtime via `/settings`) |
| `AWS_PROFILE` / keys | Local only | Bedrock + DynamoDB credentials for `bun dev` (Amplify uses the compute role) |

## Deployment

### AWS Amplify

Hosted on AWS Amplify with platform **WEB_COMPUTE** (required for SSR). Infrastructure is defined in Terraform: `infra/main.tf` (SMEC AI account) and `infra/bjc/main.tf` (BJC production account) — each directory's README covers apply/runbook details.

Key points (the committed `amplify.yml` handles the build):

1. Platform must be **WEB_COMPUTE**; `next.config.mjs` uses `output: "standalone"`
2. Attach an Amplify **compute role** with Bedrock (`ap-southeast-2` **and** `ap-southeast-4`) and DynamoDB permissions — runtime credentials come from the compute role, not the service role
3. Set env vars at the app level — `amplify.yml` writes them into `.env.production` at build time so they reach the Lambda runtime
4. The root layout uses `force-dynamic` and middleware sets `Cache-Control: no-store` to keep CloudFront from caching pages and bypassing auth

See `docs/operations/amplify-bedrock-credentials.md` for the full credential setup.

## Tech Stack

- **Next.js 14** — App Router, Server Components, `output: "standalone"`
- **TypeScript** — strict mode
- **Auth.js v5 (next-auth)** — Microsoft Entra SSO
- **AWS Bedrock** — Claude Sonnet 4.6 vision for PDF classification + extraction
- **AWS DynamoDB** — audit log, reference data, runtime settings
- **AWS Amplify** — hosting (WEB_COMPUTE), Terraform-managed
- **Tailwind CSS** — styling
- **Bun** — package manager and test runner

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/   # Auth.js (Entra SSO) handlers
│   │   ├── auth/password/        # Password-mode login/logout
│   │   ├── convert/              # PDF → HL7 conversion + health
│   │   ├── logs/                 # Audit rows for dashboard pages
│   │   ├── reference-data/       # Doctors + carriers store
│   │   └── settings/             # Runtime ops settings
│   ├── components/               # UI components (converter, audit, reference)
│   ├── log/, stats/              # Audit dashboard pages
│   ├── reference/, settings/     # Ops pages
│   ├── login/, compliance/, privacy/
│   └── page.tsx                  # Converter UI
├── lib/
│   ├── convert-service.ts        # Conversion orchestration
│   ├── conversion-config.ts      # Document types, carriers, OBR-24 routing
│   ├── pdf-parser.ts             # Bedrock extraction facade
│   ├── vision-extractor.ts       # Bedrock classification + extraction
│   ├── hl7-builder.ts            # HL7 v2.4 message generation (ORU + REF)
│   ├── auth.ts, auth-mode.ts     # Auth.js config + AUTH_MODE selector
│   ├── pad-auth.ts               # PAD bearer-token validation
│   ├── audit.ts                  # DynamoDB audit log
│   ├── reference-data-store.ts   # DynamoDB doctors/carriers
│   ├── settings.ts               # Runtime settings store
│   └── convert/, extraction/, hl7/, domain/  # Submodules
├── middleware.ts                 # Auth + cache-control middleware
├── infra/                        # Terraform (SMEC account; infra/bjc/ = BJC account)
└── amplify.yml                   # AWS Amplify build config
```

See [`CLAUDE.md`](./CLAUDE.md) for deeper architecture notes and gotchas.

## License

Private - All rights reserved.
