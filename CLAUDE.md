# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
bun dev          # Start development server (localhost:3000)
bun run build    # Production build
bun run lint     # ESLint check
bun test         # Run tests (Bun test runner)
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

Tests require a sample PDF at `docs/input PDF/` - existing tests use a BJC Health consent form PDF.

## Architecture

Next.js 14 App Router application that converts PDF patient documents to Australian HL7 v2.4 format (Genie-compatible).

### Data Flow

```
PDF Upload → /api/convert → pdf-parser.ts (extract patient data) → hl7-builder.ts (generate HL7) → HL7 Download
```

### Authentication

Simple password-based auth using Next.js middleware (`middleware.ts`):
- `APP_PASSWORD` env var checked against user input
- Sets `app_authenticated` httpOnly cookie (7-day expiry)
- `/login` page and `/api/auth` are public; everything else requires auth
- Login: `POST /api/auth` with `{ password }`, Logout: `DELETE /api/auth`

### Document Type System

Three document types with auto-detection (`lib/pdf-parser.ts:detectDocumentType`):
- **`consent_form`** - BJC Health Patient Information and Consent Forms (regex on form field labels)
- **`referral_letter`** - Specialist referral letters, e.g. NeuroSpine format (`RE: FirstName LASTNAME - DOB:`)
- **`gp_referral`** - GP/Best Practice referral letters (`re. Mr Tim Ball` + separate DOB line)

Detection logic: checks for `Dear Dr/Professor` + `RE:/re.` patterns, then distinguishes GP vs specialist by title presence and Medicare number.

### Core Modules

**`lib/pdf-parser.ts`** - Extracts patient data using regex patterns per document type. Key functions:
- `extractPatientData(pdfBuffer, documentType?)` - Main entry point, auto-detects or uses forced type
- `extractConsentFormData()` - Parses BJC Health form fields (name, DOB, Medicare, address)
- `extractReferralLetterData()` - Parses both specialist and GP referral formats
- `inferSexFromPronouns()` - Falls back to pronoun counting when no title available
- State inference from Australian postcodes (first digit mapping)

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

## Deployment

Deploy to AWS Amplify with platform set to **WEB_COMPUTE** (required for SSR). The `amplify.yml` is pre-configured. Uses `output: "standalone"` in next.config.mjs for Amplify compatibility. Must create `.env.production` during build phase to pass `APP_PASSWORD` to Lambda runtime.
