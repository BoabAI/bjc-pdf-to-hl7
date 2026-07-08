# PDF to HL7 Converter

Convert Australian medical PDFs to HL7 v2.4 format (Genie-compatible) using AWS Bedrock vision.

## Features

- Upload consent forms, specialist referrals, GP referrals, and generic medical documents via web interface or API
- Automatic document type classification via AWS Bedrock Claude Sonnet 4.6
- Extract patient data with AI vision (name, DOB, address, Medicare, sender, addressee, CC recipients)
- Generate HL7 v2.4 messages: **ORU^R01** (results) for consent forms/generic, **REF^I12** (referrals) for referral letters
- AI addressee resolution against a configurable BJC Health doctor list
- Embed original PDF as Base64 in OBX segment
- Configurable carrier, auto-file, and doctor routing options
- Password-protected browser access via a 7-day httpOnly cookie

## Documentation map

- **`docs/README.md`** — Index/map of the whole docs tree (start here).
- **`docs/engineering/functional-spec.md`** — Developer / technical reference for this repo (architecture, modules, HL7 generation rules, deployment, testing).
- **`docs/operations/bjc-pdf-to-hl7-operational-guide.md`** — Plain-English guide for BJC ops staff and Medihost (workflow, what's imported, manual upload path, code escrow).
- **`docs/operations/bjc-aws-account-access.md`** — Accessing BJC's own AWS account (cross-account role, region layout, STS opt-in region gotcha).
- **`docs/engineering/sister-system-pdf-to-directory.md`** — Reference for the sister consent-form-to-directory project (different repo).

## Quick Start

```bash
# Install dependencies
bun install

# Configure local env (APP_PASSWORD, optional BJC_DOCTORS, AWS credentials)
cp .env.example .env.local

# Start development server
bun dev

# Open http://localhost:3000
```

### Local AWS Credentials

Bedrock vision runs server-side, even in dev. Export `AWS_PROFILE` (or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) before `bun dev`. The credentials need `bedrock:InvokeModel` on `anthropic.claude-sonnet-4-6` in **both** `ap-southeast-2` and `ap-southeast-4` — AU inference profiles route to Melbourne.

### Common Commands

```bash
bun dev              # Dev server
bun run build        # Production build
bun run lint         # ESLint
bun run typecheck    # Typecheck (bun test does NOT typecheck)
bun test             # Run all tests
bun run check        # Typecheck, lint, then test
```

## API Usage

### Authentication

- Log in at `/login` with `APP_PASSWORD` to receive a 7-day httpOnly session cookie.
- Middleware protects all app and API routes except `/login` and `/api/auth`.

For curl usage, create a local cookie jar first:

```bash
curl -c cookies.txt \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$APP_PASSWORD\"}" \
  http://localhost:3000/api/auth
```

### Health Check

```bash
curl -b cookies.txt http://localhost:3000/api/convert
```

### Convert PDF to HL7

```bash
curl -X POST \
  -b cookies.txt \
  -F "pdf=@/path/to/file.pdf" \
  http://localhost:3000/api/convert
```

### Convert with Options

```bash
curl -X POST \
  -b cookies.txt \
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

### Other API Routes

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/auth` | POST/DELETE | Public | Login / logout |
| `/api/convert` | GET/POST | Cookie | Service health / PDF → HL7 conversion |

## HL7 Output Format

### ORU^R01 (Consent Forms, Generic Documents)

| Segment | Description |
|---------|-------------|
| MSH | Message header with AUS country code, 8859/1 charset |
| PID | Patient identification with Medicare format |
| PV1 | Patient visit (Outpatient), optional doctor routing |
| OBR | Observation request with document title |
| OBX | Embedded PDF as Base64 in ED datatype (AUSPDI) |

### REF^I12 (Referral Letters, GP Referrals)

| Segment | Description |
|---------|-------------|
| MSH | Message header with AU simplified REF profile in MSH-12 |
| RF1 | Referral information with effective date |
| PRD | Provider data: sender (RP) and addressee (RT) |
| PID | Patient identification with Medicare format |
| OBR | Observation request with sender/addressee context |
| OBX | Embedded PDF as Base64 in ED datatype (AUSPDI) |
| PV1 | Patient visit with addressee in PV1-9 |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `APP_PASSWORD` | Yes | Password for browser login |
| `BJC_DOCTORS` | No | Comma-separated doctor names (fallback when UI omits `bjcDoctors`) |
| `AWS_PROFILE` / keys | Local only | Bedrock credentials for `bun dev` (Amplify uses compute role) |

## Deployment

### AWS Amplify

1. Connect your GitHub repository to AWS Amplify
2. Amplify auto-detects Next.js and uses the committed `amplify.yml`
3. Set platform to **WEB_COMPUTE** (required for SSR)
4. Attach an Amplify **compute role** with Bedrock permissions for runtime
5. Set `APP_PASSWORD` (and any other env vars) at the app level — `amplify.yml` writes them into `.env.production` at build time so they reach the Lambda runtime

```bash
# Manual build test
bun run build
```

The root layout uses `force-dynamic` and middleware sets `Cache-Control: no-store` to keep CloudFront from caching pages and bypassing auth.

### Production account (BJC-owned)

Production runs in BJC Health's own AWS account (`375391317635`), deployed to **Sydney (`ap-southeast-2`)** via the cross-account `smec-deployment-role` (`aws --profile bjc`). Melbourne (`ap-southeast-4`) is enabled in that account solely for Bedrock's AU inference-profile routing — no resources deploy there. See [`docs/operations/bjc-aws-account-access.md`](docs/operations/bjc-aws-account-access.md).

## Tech Stack

- **Next.js 14** — App Router, Server Components, `output: "standalone"`
- **TypeScript** — strict mode
- **Tailwind CSS** — styling
- **AWS Bedrock** — Claude Sonnet 4.6 vision for PDF classification + extraction
- **AWS Amplify** — hosting (WEB_COMPUTE)
- **Bun** — package manager and test runner

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/route.ts         # Login / logout
│   │   └── convert/route.ts      # PDF → HL7 conversion + health response
│   ├── components/               # Shared UI sections
│   ├── login/page.tsx            # Login page
│   ├── page.tsx                  # Converter UI
│   └── layout.tsx                # Root layout (force-dynamic)
├── lib/
│   ├── convert-service.ts        # Conversion form parsing + orchestration
│   ├── conversion-config.ts      # Shared document/carrier/doctor constants
│   ├── pdf-parser.ts             # Bedrock extraction facade
│   ├── vision-extractor.ts       # Bedrock classification + extraction
│   ├── hl7-builder.ts            # HL7 v2.4 message generation (ORU + REF)
│   └── utils.ts
├── middleware.ts                 # Auth + cache-control middleware
└── amplify.yml                   # AWS Amplify config
```

See [`CLAUDE.md`](./CLAUDE.md) for deeper architecture notes and gotchas.

## License

Private - All rights reserved.
