# Functional Specification

## PDF to HL7 Converter v0.1.0

**Document Version:** 1.0
**Date:** 23 February 2026
**Prepared by:** SMEC AI
**Client:** BJC Health

---

## 1. Overview

The PDF to HL7 Converter is a web application that converts patient PDF documents into Australian HL7 v2.4 messages compatible with Genie clinical software. The system extracts patient data from uploaded PDFs using AWS Bedrock vision, generates standards-compliant HL7 messages with the original PDF embedded as Base64, and provides a download for import into practice management systems.

### 1.1 Key Capabilities

- Automatic document type detection (consent forms, specialist referrals, GP referrals)
- Patient data extraction via AWS Bedrock vision (name, DOB, sex, Medicare, address, phone)
- HL7 v2.4 ORU^R01 message generation per Australian ADRM specification
- PDF embedding as Base64 in OBX segment for Genie import
- Password-protected web interface with drag-and-drop upload
- Configurable auto-filing and doctor routing options

### 1.2 Technology Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14 (App Router) |
| Runtime | Bun |
| Language | TypeScript 5 |
| PDF Extraction | AWS Bedrock Claude Sonnet 4.6 |
| Styling | Tailwind CSS 3 + Custom CSS |
| Deployment | AWS Amplify (WEB_COMPUTE / SSR) |
| Testing | Bun test runner (244 tests) |

---

## 2. System Architecture

### 2.1 Data Flow

```
PDF Upload --> /api/convert --> pdf-parser.ts --> hl7-builder.ts --> HL7 Download
     |              |               |                  |               |
  Browser      API Route      Extract Data       Build Message    .hl7 File
```

### 2.2 Component Overview

| Module | Purpose |
|--------|---------|
| `app/page.tsx` | Main converter UI with drag-drop upload |
| `app/login/page.tsx` | Password authentication page |
| `app/api/convert/route.ts` | PDF conversion API endpoint |
| `app/api/auth/route.ts` | Authentication API endpoint |
| `lib/pdf-parser.ts` | Bedrock-backed PDF extraction facade |
| `lib/hl7-builder.ts` | HL7 v2.4 message generation |
| `middleware.ts` | Route protection and session validation |

---

## 3. Authentication

### 3.1 Authentication Flow

The application uses simple password-based authentication with HTTP-only cookies.

**Login Flow:**

1. User navigates to any protected route
2. Middleware checks for `app_authenticated` cookie
3. If absent, redirects to `/login`
4. User enters password on login page
5. `POST /api/auth` validates against `APP_PASSWORD` environment variable
6. On success, sets `app_authenticated` cookie (HTTP-only, 7-day expiry)
7. User redirected to home page

**Logout Flow:**

1. `DELETE /api/auth` clears the authentication cookie
2. User redirected to login page

### 3.2 Cookie Configuration

| Property | Value |
|----------|-------|
| Name | `app_authenticated` |
| Value | `"true"` |
| httpOnly | `true` |
| secure | `true` (production) / `false` (development) |
| sameSite | `"lax"` |
| maxAge | 604,800 seconds (7 days) |
| path | `/` |

### 3.3 Protected Routes

All routes are protected except:

- `/login` - Login page
- `/api/auth` - Authentication endpoint
- Static assets (`_next/static`, `_next/image`, images, favicon)

---

## 4. API Endpoints

### 4.1 POST /api/convert - PDF Conversion

Converts a PDF document to an HL7 v2.4 message with the original PDF embedded.

**Request:** Multipart form data (`multipart/form-data`)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pdf` | File | Yes | - | PDF file to convert (max 10MB) |
| `detectOnly` | string | No | `"false"` | If `"true"`, returns detected document type only |
| `documentType` | string | No | `"auto"` | `"auto"`, `"consent_form"`, `"referral_letter"`, `"gp_referral"` |
| `autoFile` | string | No | `"true"` | `"true"` = auto-file (Final), `"false"` = queue for review (Preliminary) |
| `orderingProvider` | string | No | - | Medicare Provider Number (e.g., `"1234567A"`) for doctor routing |

**Success Response (200):**

```json
{
  "success": true,
  "filename": "LASTNAME_FIRSTNAME_20260223143045.hl7",
  "hl7Content": "[HL7 message with CR segment terminators]",
  "extractedData": {
    "firstName": "John",
    "lastName": "Smith",
    "dob": "23/02/1980",
    "sex": "Male",
    "medicareNo": "1234567890-1"
  },
  "warnings": []
}
```

**Error Responses:**

| Status | Condition | Message |
|--------|-----------|---------|
| 400 | No file uploaded | `"No PDF file provided"` |
| 400 | Wrong file type | `"File must be a PDF"` |
| 400 | File too large | `"File size exceeds 10MB limit"` |
| 500 | Processing error | `"Conversion failed"` or specific error |

### 4.2 GET /api/convert - Health Check

Returns service status.

**Response (200):**

```json
{
  "status": "ok",
  "service": "PDF to HL7 Converter",
  "version": "1.0.0"
}
```

### 4.3 POST /api/auth - Login

Validates password and creates session.

**Request Body:** `{ "password": "string" }`

**Success Response (200):** `{ "success": true }` (sets authentication cookie)

**Error Responses:**

| Status | Condition | Message |
|--------|-----------|---------|
| 401 | Wrong password | `"Invalid password"` |
| 500 | No APP_PASSWORD set | `"Server configuration error"` |

### 4.4 DELETE /api/auth - Logout

Clears session cookie.

**Response (200):** `{ "success": true }` (clears authentication cookie)

---

## 5. Document Type Detection

### 5.1 Supported Document Types

| Type | Identifier | Description | Example Source |
|------|-----------|-------------|----------------|
| Consent Form | `consent_form` | Patient information and consent forms | BJC Health intake forms |
| Specialist Referral | `referral_letter` | Specialist referral letters | NeuroSpine, specialist clinics |
| GP Referral | `gp_referral` | General practitioner referral letters | Best Practice exports |

### 5.2 Detection Logic

Auto-detection examines extracted PDF text using this decision tree:

```
1. Check for referral indicators:
   - "Dear Dr/Professor" OR "Dear [Name]," present?
   - "RE:" or "re." present?

2. If BOTH present --> Referral type
   - Check for GP format: "re. Mr/Mrs/Miss/Ms [Name]"
   - Check for Medicare number in text
   - If GP format OR Medicare present --> gp_referral
   - Otherwise --> referral_letter

3. If NOT both present --> consent_form
```

### 5.3 Detection Patterns

**Referral indicators:**

- `Dear Dr/Professor`: `/Dear\s+(?:Dr|Professor)/i`
- `Dear [Name]`: `/Dear\s+[A-Z][a-z]+,/m`
- `RE/re line`: `/\b(?:RE|re)[:\.]?\s+/i`

**GP Referral distinguishers:**

- Title + name format: `/\bre\.?\s+(?:Mr|Mrs|Miss|Ms|Dr)\s+[A-Za-z]+\s+[A-Za-z][A-Za-z'-]*/i`
- Medicare presence: `/Medicare\s*No[:\s]+\d{10,11}/i`

---

## 6. Patient Data Extraction

### 6.1 Extracted Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| firstName | string | Yes | `"UNKNOWN"` | Patient first name |
| lastName | string | Yes | `"PATIENT"` | Patient last name |
| dob | string | Yes | `"19000101"` | Date of birth (YYYYMMDD) |
| sex | string | Yes | `"U"` | `"M"`, `"F"`, or `"U"` |
| address | string | No | - | Street address |
| suburb | string | No | - | Suburb/city |
| state | string | No | - | 3-letter state code |
| postcode | string | No | - | 4-digit postcode |
| phone | string | No | - | Phone number |
| medicareNo | string | No | - | 10-11 digit Medicare number |
| medicareRef | string | No | - | Single reference digit |

### 6.2 Consent Form Extraction

Parses BJC Health consent forms with labelled fields:

| Field | Pattern | Example Match |
|-------|---------|---------------|
| Title | `/^\s*(Mr\|Mrs\|Miss\|Ms)\s*$/m` | `Mr` |
| First Name | `/First Name\s*\*?\s*\n?\s*([A-Za-z]+)/i` | `John` |
| Last Name | `/Last Name\s*\*?\s*\n?\s*([A-Za-z]+)/i` | `Smith` |
| DOB | `/Date of Birth\s*\*?\s*\n?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i` | `23/02/1980` |
| Mobile | `/Mobile Phone\s*\*?\s*\n?\s*([\d ]{10,14})/i` | `0412 345 678` |
| Medicare No | `/Medicare Card No\.?\s*\*?\s*\n?\s*(\d{10,11})/i` | `2673291844` |
| Medicare Ref | `/Medicare Ref\s*(?:Number)?\s*\*?\s*\n?\s*(\d)/i` | `1` |
| Address | `/Address\s*\*?\s*\n?\s*(.+?)(?=\n*Postcode\|\n*City)/is` | `42 George St` |
| Postcode | `/Postcode\s*\*?\s*\n?\s*(\d{4})/i` | `2000` |
| Suburb | `/City\s*\/?\s*Suburb\s*\*?\s*\n?\s*([A-Za-z\s]+?)(?=\n\|State)/i` | `Sydney` |

### 6.3 Specialist Referral Extraction

Parses specialist referral letters (e.g., NeuroSpine format):

**Primary pattern - RE: line with DOB:**

`/RE:\s*(?:([A-Za-z][A-Za-z'-]*)\s+([A-Z][A-Z'-]+)|([A-Z][A-Z'-]+),\s*([A-Za-z][A-Za-z'-]*))\s*[-]\s*DOB:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i`

Matches both formats:
- `RE: Scott LAWLER - DOB: 15/03/1985`
- `RE: LAWLER, Scott - DOB: 15/03/1985`

**Secondary patterns:**

| Field | Pattern |
|-------|---------|
| Phone | `/(?:Mobile\|Ph\|Tel\|Phone)[:\s]+(\d[\d ]{9,14})/i` |
| Address | `/^\s*(\d+[^,\n]+),\s*([A-Z][A-Za-z\s]+),\s*([A-Z]{2,3}),?\s*(\d{4})\s*$/m` |
| Provider No | `/Provider\s*No[:\.]?\s*(\d{6}[A-Z]{2})/i` |
| Letter Date | `/(\d{1,2}\s+(?:January\|February\|...)\s+\d{4})/i` |

### 6.4 GP Referral Extraction

Parses Best Practice GP referral letters:

**Primary pattern - re. line with title:**

`/\bre\.?\s+(Mr|Mrs|Miss|Ms|Dr)\s+([A-Za-z]+)\s+([A-Za-z][A-Za-z'-]*)/i`

Example: `re. Mr Tim Ball`

**Additional patterns:**

| Field | Pattern |
|-------|---------|
| DOB | `/\bDOB:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i` |
| Medicare | `/Medicare\s*No[:\s]+(\d{10,11})/i` |
| Mobile | `/Mobile:\s*([\d ]{10,14})/i` |
| Provider No | `/^\s*(\d{6}[A-Z]{2})\s*$/m` |

**Address extraction** is scoped to text between the `re.` line and `Dear` line to avoid matching clinic letterhead addresses.

### 6.5 Sex Determination

Priority order:

1. **Title mapping:** Mr=M, Mrs/Miss/Ms=F, Dr/Mx=U
2. **Pronoun inference:** Counts `he/him/his` vs `she/her/hers` in document text. Requires 2+ pronouns in dominant category for reliable inference.
3. **Default:** `"U"` (Unknown)

### 6.6 State Inference from Postcode

Maps first digit of 4-digit Australian postcode to state:

| First Digit | State |
|-------------|-------|
| 2 | NSW |
| 3 | VIC |
| 4 | QLD |
| 5 | SA |
| 6 | WA |
| 7 | TAS |
| 0 | NT |

Default: VIC (if postcode invalid or unavailable)

---

## 7. HL7 Message Generation

### 7.1 Message Format

| Property | Value |
|----------|-------|
| Standard | HL7 v2.4 |
| Message Type | ORU^R01 (Observation Result, Unsolicited) |
| Specification | Australian ADRM |
| Segment Terminator | `\r` (CR only, no LF) |
| Encoding | ISO 8859/1 (Latin-1) |

**HL7 Encoding Characters:**

| Character | Purpose | Escape |
|-----------|---------|--------|
| `\|` | Field separator | `\F\` |
| `^` | Component separator | `\S\` |
| `~` | Repetition separator | `\R\` |
| `\` | Escape character | `\E\` |
| `&` | Subcomponent separator | `\T\` |

### 7.2 MSH - Message Header

```
MSH|^~\&|MEDIHOST|BJCHEALTH|GENIE|CLINIC|{timestamp}||ORU^R01|{messageId}|P|2.4||AL|NE|AUS|8859/1
```

| Field | Value | Description |
|-------|-------|-------------|
| MSH-3 | MEDIHOST | Sending application |
| MSH-4 | BJCHEALTH | Sending facility |
| MSH-5 | GENIE | Receiving application |
| MSH-6 | CLINIC | Receiving facility |
| MSH-7 | YYYYMMDDHHMMSS | Message timestamp |
| MSH-9 | ORU^R01 | Message type |
| MSH-10 | MSG{timestamp}{4 random chars} | Unique message ID |
| MSH-11 | P | Processing ID (Production) |
| MSH-12 | 2.4 | HL7 version |
| MSH-15 | AL | Accept acknowledgement (logging level) |
| MSH-16 | NE | No application acknowledgement |
| MSH-17 | AUS | Country code |
| MSH-18 | 8859/1 | Character set |

### 7.3 PID - Patient Identification

```
PID|1||{medicare}-{ref}^^^Medicare^MC||{lastName}^{firstName}||{dob}|{sex}|||{address}^^{suburb}^{state}^{postcode}^AUS||{phone}
```

| Field | Description | Format |
|-------|-------------|--------|
| PID-3 | Medicare identifier | `{number}-{ref}^^^Medicare^MC` |
| PID-5 | Patient name | `{lastName}^{firstName}` |
| PID-7 | Date of birth | `YYYYMMDD` |
| PID-8 | Sex | `M`, `F`, or `U` |
| PID-11 | Address | `{street}^^{suburb}^{state}^{postcode}^AUS` |
| PID-13 | Phone | Digits only |

### 7.4 PV1 - Patient Visit

Minimal format (no provider): `PV1|1|O`

With ordering provider: `PV1|1|O|||||||{providerNo}^^^AUSHICPR`

| Field | Description |
|-------|-------------|
| PV1-2 | Patient class: `O` (Outpatient) |
| PV1-9 | Consulting doctor: Medicare Provider Number with AUSHICPR identifier |

Only included when `orderingProvider` parameter is provided.

### 7.5 OBR - Observation Request

```
OBR|1||RPT{timestamp}^MEDIHOST|PDF^{title}^L|||{timestamp}|||||||||||||||||{timestamp}||{status}
```

| Field | Description |
|-------|-------------|
| OBR-3 | Filler order number: `RPT{timestamp}^MEDIHOST` |
| OBR-4 | Universal service ID: `PDF^{document title}^L` |
| OBR-7 | Observation date/time |
| OBR-22 | Results change date/time |
| OBR-25 | Result status: `F` (Final/auto-file) or `P` (Preliminary/queue) |

### 7.6 OBX - Observation/Result (Embedded PDF)

```
OBX|1|ED|PDF^Display format in PDF^AUSPDI||^application^pdf^Base64^{base64data}||||||F
```

| Field | Description |
|-------|-------------|
| OBX-2 | Value type: `ED` (Encapsulated Data) |
| OBX-3 | Observation ID: AUSPDI coding system |
| OBX-5 | PDF as Base64 in ED format: `^application^pdf^Base64^{data}` |
| OBX-11 | Observation result status: `F` (Final) |

### 7.7 HL7 Options

| Option | Default | Description |
|--------|---------|-------------|
| sendingApplication | `"MEDIHOST"` | MSH-3 value |
| sendingFacility | `"BJCHEALTH"` | MSH-4 value |
| receivingApplication | `"GENIE"` | MSH-5 value |
| receivingFacility | `"CLINIC"` | MSH-6 value |
| documentTitle | `"Patient Consent Form"` | OBR-4 display name |
| resultStatus | `"F"` or `"P"` | Auto-file vs queue for review |
| orderingProvider | - | Medicare Provider Number for doctor routing |

### 7.8 Filename Generation

Format: `{LASTNAME}_{FIRSTNAME}_{YYYYMMDDHHMMSS}.hl7`

Non-alphanumeric characters in names are replaced with underscores.

---

## 8. User Interface

### 8.1 Login Page (`/login`)

A single password input form with BJC Health and SMEC AI branding.

**Elements:**
- Logo strip (BJC Health + SMEC AI logos)
- Password input field (placeholder: "Enter access password")
- Submit button (disabled while loading or empty)
- Error message display
- Contact admin footer text

**Behaviour:**
- Auto-redirects authenticated users to home page
- Displays error on invalid password
- Clears password field on failed attempt
- Shows loading spinner during authentication

### 8.2 Home Page (`/`) - Converter

The main converter interface with drag-and-drop upload and conversion options.

**Upload Zone:**
- Drag-and-drop area with visual feedback (border colour change on drag)
- File picker button ("Browse")
- Accepts `.pdf` files only
- Shows file name, size, and remove button when file selected
- 10MB file size limit (validated server-side)

**Auto-Detection:**
- Triggers on file selection or drop
- Sends `detectOnly=true` request to API
- Shows "detecting..." badge during request
- Shows "auto-detected" badge on completion

**Conversion Options (shown after file selection):**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| Document Type | Select | Auto-detect | Choose: Auto, Consent Form, Specialist Referral, GP Referral |
| Auto-file | Checkbox | Checked | When checked, document auto-files in Genie. When unchecked, queues for review |
| Send to Doctor | Checkbox | Unchecked | Enables provider number input |
| Provider Number | Text input | Empty | Medicare Provider Number for routing (shown only if Send to Doctor checked) |

**Convert Button:**
- Full-width primary style
- Shows spinner and "Converting..." text during processing
- Disabled while converting

**Success Display:**
- Green success box with checkmark
- Patient data grid: Name, DOB, Sex, Medicare number
- "Download HL7 File" button (green)
- "Convert Another" button (secondary)

**Error Display:**
- Red error box with icon
- Error message from API

### 8.3 Visual Design

**Colour Palette:**

| Colour | Hex | Usage |
|--------|-----|-------|
| BJC Navy | `#002e50` | Button hover, headings |
| BJC Blue | `#2874cc` | Primary buttons, focus states, links |
| BJC Teal | `#01bfa5` | Accent elements |
| BJC Orange | `#fe7b29` | Warning states |
| BJC Green | `#5bb841` | Success indicators |
| Success | `#16a34a` | Success messages, download button |
| Error | `#dc2626` | Error messages |

**Typography:**
- Primary: Plus Jakarta Sans (weights 300-800)
- Monospace: JetBrains Mono (weights 400-500)

**Components:** Cards with 16px border radius and subtle shadows, custom checkboxes, animated fade-in-up transitions with staggered delays.

---

## 9. Deployment

### 9.1 AWS Amplify Configuration

| Setting | Value |
|---------|-------|
| Platform | WEB_COMPUTE (required for SSR) |
| Build output | `.next` directory |
| Build format | `frontend:` (not `applications:`) |
| Runtime | Node.js with standalone output |

### 9.2 Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `APP_PASSWORD` | Amplify Console | Application password |

**Build phase** creates `.env.production` from Amplify env vars to ensure they're available at Lambda runtime.

### 9.3 Build Commands

```bash
bun dev          # Development server (localhost:3000)
bun run build    # Production build
bun run lint     # ESLint check
bun test         # Run test suite (244 tests)
bun start        # Production server
```

---

## 10. Constraints and Limitations

### 10.1 Technical Constraints

| Constraint | Detail |
|------------|--------|
| PDF type | Machine-readable text PDFs only (no OCR) |
| File size | Maximum 10MB per upload |
| Character set | ISO 8859/1 (Latin-1) - non-ASCII characters escaped |
| Concurrency | Single-threaded Node.js, no job queue |
| Scale | Suitable for fewer than 100 PDFs per day |

### 10.2 Authentication Constraints

| Constraint | Detail |
|------------|--------|
| Auth model | Single shared password (no multi-user support) |
| Session | Fixed 7-day expiry, no refresh mechanism |
| Password storage | Plaintext comparison (not hashed) |
| Audit | No access logging |

### 10.3 Data Extraction Constraints

| Constraint | Detail |
|------------|--------|
| Extraction method | AWS Bedrock vision extraction |
| Document formats | Three supported formats only |
| Missing fields | Defaults used when extraction fails (warnings generated) |
| Address parsing | Scoped to patient block to avoid letterhead addresses |
| Medicare ref | Defaults to "1" if not found |

### 10.4 HL7 Constraints

| Constraint | Detail |
|------------|--------|
| Standard | HL7 v2.4 only |
| Message type | ORU^R01 only |
| Target system | Genie clinical software |
| Timestamp | Server local time (no timezone conversion) |

---

## 11. Testing

### 11.1 Test Coverage

| Test File | Count | Coverage |
|-----------|-------|----------|
| `lib/pdf-parser.test.ts` | 6 | Bedrock facade behavior and display formatting |
| `lib/hl7-builder.test.ts` | 100+ | All segments, encoding, escaping |
| `app/api/convert/route.test.ts` | 12 | API validation and Bedrock integration flows |
| **Total** | **117** | |

### 11.2 Test Infrastructure

| Script | Purpose |
|--------|---------|
| `scripts/generate-test-pdfs.ts` | Creates 20 test PDFs with realistic content |
| `scripts/diagnose-pdfs.ts` | Runs extraction across all test PDFs |
| `scripts/test-vision.ts` | Runs live Bedrock extraction against mock referrals |

### 11.3 Test PDF Variants

Generated test PDFs include: standard forms, skewed layouts, grainy/fax-quality, logo overlays, multicultural names (O'Brien, hyphenated surnames), and nested directory structures.

---

## Appendix A: File Structure

```
medihost-pdf-to-hl7/
+-- app/
|   +-- api/
|   |   +-- auth/route.ts              Authentication endpoint
|   |   +-- convert/route.ts           Conversion endpoint
|   |   +-- convert/route.test.ts      Integration tests
|   +-- login/page.tsx                 Login page
|   +-- layout.tsx                     Root layout
|   +-- page.tsx                       Converter page
|   +-- globals.css                    Styling
+-- lib/
|   +-- pdf-parser.ts                  Bedrock extraction facade
|   +-- pdf-parser.test.ts             Bedrock facade tests
|   +-- vision-extractor.ts            Bedrock document classification + extraction
|   +-- hl7-builder.ts                 HL7 generation
|   +-- hl7-builder.test.ts            Builder tests
+-- scripts/
|   +-- generate-test-pdfs.ts          Test PDF generator
|   +-- diagnose-pdfs.ts               Extraction diagnostics
|   +-- test-vision.ts                 Bedrock integration script
+-- middleware.ts                      Auth middleware
+-- next.config.mjs                    Next.js config
+-- amplify.yml                        AWS Amplify config
+-- package.json                       Dependencies
```

---

## Appendix B: API Quick Reference

```bash
# Health check
curl http://localhost:3000/api/convert

# Convert PDF (auto-detect type)
curl -X POST -F "pdf=@file.pdf" http://localhost:3000/api/convert

# Detect document type only
curl -X POST -F "pdf=@file.pdf" -F "detectOnly=true" \
  http://localhost:3000/api/convert

# Convert with options
curl -X POST \
  -F "pdf=@file.pdf" \
  -F "documentType=gp_referral" \
  -F "autoFile=false" \
  -F "orderingProvider=1234567A" \
  http://localhost:3000/api/convert

# Login
curl -X POST -H "Content-Type: application/json" \
  -d '{"password":"your_password"}' \
  http://localhost:3000/api/auth

# Logout
curl -X DELETE http://localhost:3000/api/auth
```
