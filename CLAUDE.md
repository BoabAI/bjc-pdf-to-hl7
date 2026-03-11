# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
bun dev          # Start development server (localhost:3000)
bun run build    # Production build
bun run lint     # ESLint check
bun test         # Run all tests (Bun test runner)
bun test --filter "consent"  # Run tests matching a pattern
bun start        # Start production server
```

## Testing the API

```bash
# Health check
curl http://localhost:3000/api/convert

# Convert PDF to HL7 (auto-detect document type)
curl -X POST -F "pdf=@/path/to/file.pdf" http://localhost:3000/api/convert

# Detect document type only
curl -X POST -F "pdf=@/path/to/file.pdf" -F "detectOnly=true" http://localhost:3000/api/convert

# Convert with specific document type and Genie options
curl -X POST -F "pdf=@/path/to/file.pdf" -F "documentType=gp_referral" -F "autoFile=true" http://localhost:3000/api/convert
```

## Debug Scripts

```bash
bun run scripts/diagnose-pdfs.ts          # Extract patient data from all test PDFs
bun run scripts/test-vision.ts            # Run live Bedrock extraction against mock referrals
bun run scripts/generate-test-pdfs.ts     # Regenerate all 20 test PDFs (requires puppeteer)
```

Tests use generated PDFs at `docs/input PDF/` (nested subdirectories with various formats).

## Architecture

Next.js 14 App Router application that converts PDF patient documents to Australian HL7 v2.4 format (Genie-compatible).

### Data Flow

```
PDF Upload → /api/convert → pdf-parser.ts → vision-extractor.ts (Bedrock classify + extract) → hl7-builder.ts → HL7 Download
```

### Authentication

Simple password-based auth using Next.js middleware (`middleware.ts`):
- `APP_PASSWORD` env var checked against user input
- Sets `app_authenticated` httpOnly cookie (7-day expiry)
- `/login` page and `/api/auth` are public; everything else requires auth
- Login: `POST /api/auth` with `{ password }`, Logout: `DELETE /api/auth`

### Document Type System

Four document types are classified by Bedrock vision:
- **`consent_form`** - BJC Health Patient Information and Consent Forms
- **`referral_letter`** - Specialist referral letters and clinic letters
- **`gp_referral`** - GP/Best Practice referral letters
- **`generic`** - Any other medical PDF or unclear case

### Core Modules

**`lib/pdf-parser.ts`** - Bedrock extraction facade. Key functions:
- `extractPatientData(pdfBuffer, documentType?)` - Main entry point, optionally passes a document type hint to Bedrock
- `formatExtractedData()` - Formats PatientData into display-friendly key/value pairs for the UI

**`lib/vision-extractor.ts`** - Sends PDFs to Bedrock Claude Sonnet 4.6 and returns:
- Classified document type
- Structured patient fields
- Runtime warnings for timeout, IAM, or credential failures
- State inference from Australian postcodes when the model omits state

**`lib/hl7-builder.ts`** - Generates HL7 v2.4 ORU^R01 messages per ADRM specification:
- MSH: Message header with AUS country code, 8859/1 charset
- PID: Patient identification with Medicare format (`number-ref^^^Medicare^MC`)
- PV1: Patient visit (Outpatient), optionally routes to doctor via provider number
- OBR: Observation request with result status (F=Final/auto-file, P=Preliminary/queue)
- OBX: Embedded PDF as Base64 in ED datatype with AUSPDI coding

### HL7 Format Notes

- Segment terminator: CR only (`\r`), no LF
- Special characters must be escaped: `|` → `\F\`, `^` → `\S\`, `\` → `\E\`, `~` → `\R\`, `&` → `\T\`
- PDF embedded in OBX-5: `^application^pdf^Base64^<data>`
- Date format: YYYYMMDD (converted from Australian DD/MM/YYYY)

### Genie Integration Options (via API params)

- `autoFile` (default true): Sets OBR-25 to F (Final/auto-file) or P (Preliminary/queue for review)
- `orderingProvider`: Medicare Provider Number placed in PV1-9 to route document to a specific doctor's inbox

### Bedrock Runtime Notes

- `/api/convert` is pinned to `nodejs` runtime for Amplify SSR
- Bedrock auth comes from the Amplify compute role, not the Amplify service role
- A missing compute role will surface as an AWS credential error at runtime

## Deployment

Deploy to AWS Amplify with platform set to **WEB_COMPUTE** (required for SSR). The `amplify.yml` is pre-configured. Uses `output: "standalone"` in next.config.mjs for Amplify compatibility. Must create `.env.production` during build phase to pass `APP_PASSWORD` to Lambda runtime, and the app must have a compute role with Bedrock permissions attached.
