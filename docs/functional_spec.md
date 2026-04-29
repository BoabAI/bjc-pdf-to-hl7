# Functional Specification

## PDF to HL7 Converter

**Document Version:** 2.0
**Last refreshed:** 29 April 2026
**Prepared by:** SMEC AI
**Client:** BJC Health

---

## 1. Overview

The PDF to HL7 Converter is a web application that converts patient PDF documents into Australian HL7 v2.4 messages compatible with Genie clinical software. The system extracts patient data from uploaded PDFs using AWS Bedrock vision, generates standards-compliant HL7 messages with the original PDF embedded as Base64, and provides a download for import into practice management systems.

### 1.1 Key Capabilities

- Automatic document type detection across six types (consent forms, specialist referrals, GP referrals, pathology results, radiology results, generic)
- Patient data extraction via AWS Bedrock Claude Sonnet 4.6 vision (name, DOB, sex, Medicare, address, phone, sender, addressee, CC)
- HL7 v2.4 message generation per Australian ADRM specification: ORU^R01 (results) and REF^I12 (referrals)
- OBR-24 routing flag (`PHY` / `LAB` / `RAD`) drives Genie inbox per document type
- PDF embedding as Base64 in OBX segment for Genie import
- Addressee resolution against configurable BJC Health doctor list
- Password-protected web interface with multi-file drag-and-drop upload, sequential conversion
- Audit log dashboard with pie charts, table, and CSV export (DynamoDB-backed, metadata only)
- Configurable carrier, auto-filing, and doctor routing options

### 1.2 Technology Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14 (App Router) |
| Runtime | Bun (locally and on Amplify) |
| Language | TypeScript 5 (strict) |
| PDF Extraction | AWS Bedrock Claude Sonnet 4.6 (vision via Converse API) |
| Audit log | AWS DynamoDB (`bjc-pdf-to-hl7-audit`, `ap-southeast-2`) |
| Charts | Recharts |
| Styling | Tailwind CSS 3 + Custom CSS |
| Deployment | AWS Amplify (WEB_COMPUTE / SSR) |
| Infrastructure | Terraform (`infra/main.tf`) |
| Testing | Bun test runner (257 passing across 10 files; 2 pre-existing fixture-dependent fails) |

---

## 2. System Architecture

### 2.1 Data Flow

```
PDF Upload --> /api/convert --> convert-service.ts --> pdf-parser.ts --> vision-extractor.ts --> hl7-builder.ts --> HL7 Download
     |              |                  |                     |                  |                       |               |
  Browser      API Route          Orchestration         Facade           Bedrock Vision           Build Message    .hl7 File
   or PAD                       + form parsing                          (classify + extract)      (ORU or REF)
                                                                                                   + OBR-24 route
                                                                                                          |
                                                                                                          v
                                                                                                   Audit row to
                                                                                                   DynamoDB (audit.ts)
```

### 2.2 Component Overview

| Module | Purpose |
|--------|---------|
| `app/page.tsx` | Main converter UI: multi-file queue, drag-drop, conversion options, doctors tab |
| `app/dashboard/page.tsx` | Audit dashboard: pie charts, audit table, CSV export |
| `app/login/page.tsx` | Password authentication page |
| `app/compliance/page.tsx` | Static compliance / data-handling information |
| `app/privacy/page.tsx` | Static privacy information |
| `app/components/` | Shared UI sections (UploadZone, ConversionOptions, FileQueueItem, ConversionResultPanel, DoctorsTab, LogoStrip, AppFooter) |
| `app/api/convert/route.ts` | PDF conversion API endpoint (accepts `X-Source: web|email`); writes one audit row per call |
| `app/api/logs/route.ts` | `GET /api/logs?month=YYYY-MM` returns audit rows for the dashboard |
| `app/api/auth/route.ts` | Login / logout endpoint |
| `lib/convert-service.ts` | Form-data parsing + conversion orchestration (no HTTP / auth concerns) |
| `lib/conversion-config.ts` | Document types, default carrier, default BJC doctors, OBR-24 routing helpers |
| `lib/pdf-parser.ts` | Bedrock-backed PDF extraction facade |
| `lib/vision-extractor.ts` | Bedrock document classification + patient/referral extraction |
| `lib/hl7-builder.ts` | HL7 v2.4 message generation (ORU^R01 + REF^I12, OBR-24 routing) |
| `lib/audit.ts` | DynamoDB audit row schema + `recordConversion` / `listConversions` |
| `middleware.ts` | Route protection and session validation |
| `infra/main.tf` | Terraform: DynamoDB audit table + IAM policy attached to the Amplify compute role |

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
| `documentType` | string | No | `"auto"` | `"auto"`, `"consent_form"`, `"referral_letter"`, `"gp_referral"`, `"pathology_result"`, `"radiology_result"`, `"generic"` |
| `autoFile` | string | No | `"true"` | `"true"` = auto-file (Final), `"false"` = queue for review (Preliminary) |
| `orderingProvider` | string | No | - | Medicare Provider Number (e.g., `"1234567A"`) for doctor routing |
| `carrier` | string | No | `"SMECAI"` | Sending Application name for MSH-3 |
| `bjcDoctors` | JSON string | No | env `BJC_DOCTORS` | Array of doctor names for addressee resolution |

**Optional headers:**

| Header | Values | Default | Purpose |
|--------|--------|---------|---------|
| `X-Source` | `web` / `email` | `web` | Tags the audit row so the dashboard can split web uploads from automated PAD email volume. The PAD pipeline sets `X-Source: email`. |

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
    "medicareNo": "1234567890-1",
    "sender": "Dr Jane Wilson (Lakeside Medical)",
    "addressee": "Dr Irwin Lim (BJC Health)",
    "cc": "Dr Herman Lau",
    "date": "26/03/2026",
    "messageType": "REF (Referral)",
    "carrier": "SMECAI"
  },
  "warnings": [],
  "extractionMethod": "vision"
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

### 4.5 GET /api/logs - Audit log query

Returns audit rows for a single calendar month. Cookie-protected (returns 401 without `app_authenticated`). Used exclusively by the `/dashboard` page.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `month` | string | No | Current Sydney month | `YYYY-MM` (e.g., `2026-04`) |

**Success Response (200):**

```json
{
  "success": true,
  "month": "2026-04",
  "rows": [
    {
      "month": "2026-04",
      "ts": "2026-04-29T01:23:45.678Z#a3f9k1",
      "documentType": "pathology_result",
      "outcome": "ok",
      "source": "email",
      "messageType": "ORU^R01",
      "diagnosticServiceSection": "LAB",
      "filenameHash": "a1b2c3d4e5f6",
      "filenameExt": ".pdf",
      "fileSizeBytes": 234567,
      "durationMs": 4321,
      "warningCount": 0
    }
  ]
}
```

Rows are returned in descending timestamp order. If the audit query fails, the endpoint returns an empty array (the dashboard must not 500 on audit infra issues).

**Error responses:**

| Status | Condition | Message |
|--------|-----------|---------|
| 400 | Invalid month format | `"Invalid month format. Expected YYYY-MM."` |
| 401 | Missing / invalid cookie | `"Unauthorized"` |

---

## 5. Document Type Detection

### 5.1 Supported Document Types

| Type | Identifier | HL7 Message | OBR-24 | Genie inbox | Example Source |
|------|-----------|-------------|--------|-------------|----------------|
| Consent Form | `consent_form` | `ORU^R01` | (empty) | Genie default | BJC Health intake forms |
| Specialist Referral | `referral_letter` | `REF^I12` | `PHY` | Incoming Letters | NeuroSpine, specialist clinics |
| GP Referral | `gp_referral` | `REF^I12` | `PHY` | Incoming Letters | Best Practice exports |
| Pathology Result | `pathology_result` | `ORU^R01` | `LAB` | Pathology | Douglass Hanly Moir, Laverty, Sonic |
| Radiology Result | `radiology_result` | `ORU^R01` | `RAD` | Radiology | PRP, I-MED, Lumus |
| Generic | `generic` | `ORU^R01` | (empty) | Genie default | Discharge summaries, other |

The OBR-24 column comes from `diagnosticServiceSectionFor()` in `lib/conversion-config.ts`.

### 5.2 Detection Logic

Document classification is performed by AWS Bedrock Claude Sonnet 4.6 using vision analysis. The model examines the full PDF and classifies based on visual and textual cues:

- **consent_form**: Checkboxes, signature lines, "I consent to...", patient declaration sections, BJC Health branding, intake questionnaires
- **gp_referral**: "re." line with patient name, "Dear Dr..." addressing a specialist, GP clinic letterhead, Medicare provider number, medication lists, "Yours sincerely" from a GP
- **referral_letter**: Specialist clinic letterhead, clinical findings, investigation results, management plan, letter addressed to referring GP or another specialist
- **pathology_result**: Lab letterhead (DHM, Laverty, Sonic, Histopath), tabular result list with reference ranges, collection / specimen identifiers, NATA accreditation, no letter-to-doctor structure
- **radiology_result**: Imaging provider letterhead (PRP, I-MED, Lumus, Capitol Radiology), modality (CT/MRI/ultrasound/X-ray), "Findings" / "Impression" / "Conclusion" prose, dictated-by signature
- **generic**: Any other medical document with no clear letter, lab, or imaging format

**Classification priority**: If the document is a letter from one doctor to another about a patient, it is classified as a referral (gp_referral or referral_letter). Result types take precedence over generic when a NATA / pathology / imaging letterhead is visible. Generic is the last-resort fallback.

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

### 6.2 Bedrock Vision Extraction

All document types are processed by AWS Bedrock Claude Sonnet 4.6 using the Converse API with tool calling. The model receives the full PDF as a document and extracts structured data via a tool schema.

**Extraction is format-agnostic** — the model uses visual and textual understanding to locate patient details regardless of document layout. There are no regex patterns or format-specific parsing rules.

### 6.3 Referral Information Extraction

For `referral_letter` and `gp_referral` documents, additional fields are extracted:

| Field | Description |
|-------|-------------|
| senderName | Doctor who wrote/signed the letter (letterhead, signature, "From:" line) |
| senderClinic | Clinic or practice of the sender (letterhead) |
| senderProviderNumber | Medicare provider number of the sender (if visible) |
| addresseeName | BJC Health doctor who should receive this document |
| addresseeClinic | Clinic of the resolved addressee |
| ccNames | Doctors on CC, "Copy to", "c/o" lines (array) |

**Addressee resolution priority** (when a BJC doctor list is provided):

1. If "BJC Health" appears as clinic for primary recipient or CC → use that doctor
2. If doctor list provided → match primary recipient or CC against the list
3. If no match, prefer CC recipient (more likely the local receiving doctor)
4. Fall back to primary recipient

For `consent_form`, `pathology_result`, `radiology_result`, and `generic` documents, all sender/addressee fields return null.

### 6.4 Sex Determination

Priority order:

1. **Title mapping:** Mr=M, Mrs/Miss/Ms=F, Dr/Mx=U
2. **Pronoun inference:** Counts `he/him/his` vs `she/her/hers` in document text. Requires 2+ pronouns in dominant category for reliable inference.
3. **Default:** `"U"` (Unknown)

### 6.5 State Inference from Postcode

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
| Message Types | `ORU^R01` (results) for consent_form, generic, pathology_result, radiology_result; `REF^I12` (referral) for referral_letter / gp_referral |
| Specification | Australian ADRM |
| Segment Terminator | `\r` (CR only, no LF) |
| Encoding | ISO 8859/1 (Latin-1) |

**Segment order by message type:**

- **ORU^R01**: MSH → PID → PV1 → OBR → OBX
- **REF^I12**: MSH → RF1 → PRD (sender) → PRD (addressee) → PID → OBR → OBX → PV1

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
MSH|^~\&|SMECAI|BJCHEALTH|GENIE|CLINIC|{timestamp}||ORU^R01|{messageId}|P|2.4|||AL|NE|AUS|8859/1
```

For REF^I12 messages, MSH-9 is `REF^I12` and MSH-12 includes the AU simplified REF profile:
`2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L`

| Field | Value | Description |
|-------|-------|-------------|
| MSH-3 | SMECAI (configurable via `carrier`) | Sending application |
| MSH-4 | BJCHEALTH | Sending facility |
| MSH-5 | GENIE | Receiving application |
| MSH-6 | CLINIC | Receiving facility |
| MSH-7 | YYYYMMDDHHMMSS | Message timestamp |
| MSH-9 | ORU^R01 or REF^I12 | Message type |
| MSH-10 | MSG{timestamp}{4 random chars} | Unique message ID |
| MSH-11 | P | Processing ID (Production) |
| MSH-12 | 2.4 (or extended AU REF profile for REF^I12) | HL7 version |
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
| PID-3 | Medicare identifier | `{number}-{ref}^^^AUSHIC^MC` |
| PID-5 | Patient name | `{lastName}^{firstName}` |
| PID-7 | Date of birth | `YYYYMMDD` |
| PID-8 | Sex | `M`, `F`, or `U` |
| PID-11 | Address | `{street}^^{suburb}^{state}^{postcode}^AUS` |
| PID-13 | Phone | Digits only |

### 7.4 PV1 - Patient Visit

Minimal format (no provider): `PV1|1|O`

With ordering provider: `PV1|1|O|||||||{providerNo}^^^AUSHICPR`

With addressee name (no provider number): `PV1|1|O|||||||^{lastName}^{firstName}^^^DR`

| Field | Description |
|-------|-------------|
| PV1-2 | Patient class: `O` (Outpatient) |
| PV1-9 | Consulting doctor — routes to this doctor's inbox in Genie |

**PV1-9 resolution priority:**
1. If `orderingProvider` param provided → Medicare Provider Number format
2. Else if referral addressee resolved → doctor name format
3. Otherwise → PV1-9 empty

### 7.5 OBR - Observation Request

```
OBR|1||RPT{timestamp}^BJCHEALTH|PDF^{title}^L|||{timestamp}|||||||||||||||||{timestamp}||{status}
```

| Field | Description |
|-------|-------------|
| OBR-3 | Filler order number: `RPT{timestamp}^BJCHEALTH` |
| OBR-4 | Universal service ID: `PDF^{document title}^L` |
| OBR-7 | Observation date/time |
| OBR-22 | Results change date/time |
| OBR-24 | Diagnostic Service Section ID: `LAB`, `RAD`, `PHY`, or empty (driven by document type — see §5.1) |
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

### 7.7 RF1 - Referral Information (REF^I12 only)

```
RF1|||||||{timestamp}
```

Contains the referral effective date in RF1-7.

### 7.8 PRD - Provider Data (REF^I12 only)

Two PRD segments are generated for referral messages:

**Sender (Referring Provider):**
```
PRD|RP~AP|{lastName}^{firstName}^^^DR|||||{providerNo}^AUSHICPR^UPIN
```

**Addressee (Referred-To Provider):**
```
PRD|RT~IR|{lastName}^{firstName}^^^DR
```

| Field | Sender | Addressee |
|-------|--------|-----------|
| PRD-1 | `RP~AP` (Referring + Authoring) | `RT~IR` (Referred-To + Intended Recipient) |
| PRD-2 | Sender doctor name (XPN format) | Addressee doctor name (XPN format) |
| PRD-7 | Provider number if available | (empty) |

### 7.9 OBR - Observation Request (additional REF^I12 fields)

For REF^I12 messages, OBR includes additional fields beyond §7.5:

| Field | Value | Description |
|-------|-------|-------------|
| OBR-4 | `PDF^Referral^L` | Document type label ("Referral" for REF, "Correspondence" for ORU, "Pathology Result" / "Radiology Result" for results) |
| OBR-16 | Sender doctor details | Ordering provider with name and optional provider number |

### 7.10 HL7 Options

| Option | Default | Description |
|--------|---------|-------------|
| sendingApplication | `"SMECAI"` (configurable via `carrier`) | MSH-3 value |
| sendingFacility | `"BJCHEALTH"` | MSH-4 value |
| receivingApplication | `"GENIE"` | MSH-5 value |
| receivingFacility | `"CLINIC"` | MSH-6 value |
| documentTitle | Derived from document type | OBR-4 display name |
| resultStatus | `"F"` or `"P"` | Auto-file vs queue for review |
| orderingProvider | - | Medicare Provider Number for doctor routing |
| messageType | Derived from document type | `ORU^R01` or `REF^I12` |
| referralInfo | Extracted by Bedrock | Sender/addressee for REF messages |
| diagnosticServiceSection | Derived from document type | Drives OBR-24: `LAB` (pathology), `RAD` (radiology), `PHY` (referrals), `undefined` (consent / generic — leaves OBR-24 empty) |

### 7.11 Filename Generation

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

The main converter interface with multi-file drag-and-drop upload, per-file detection, and sequential conversion.

**Upload Zone (`app/components/UploadZone.tsx`):**
- Drag-and-drop area with visual feedback (border colour change on drag)
- File picker button ("Browse") supports multi-select
- Accepts `.pdf` files only — non-PDFs are rejected client-side with a count
- 10MB file size limit per file (validated server-side)

**File Queue:**
- Each dropped/selected PDF appears as a `FileQueueItem` (`app/components/FileQueueItem.tsx`)
- Statuses: `queued` → `detecting` → `ready` → `converting` → `done` / `error`
- Detection runs in parallel for every queued file as soon as it lands
- Conversion runs sequentially through the queue (one PDF at a time, to avoid overwhelming the Bedrock client)
- Per-file remove button; per-file download button when conversion completes
- Per-file conversion options (document type override, carrier, auto-file, ordering provider)

**Auto-Detection (per file):**
- Triggers automatically when a file is added
- Sends `detectOnly=true` request to API
- Shows "detecting..." badge during request, "auto-detected: <type>" on completion

**Conversion Options (`app/components/ConversionOptions.tsx`):**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| Document Type | Select | Auto-detect | Choose: Auto, Consent Form, Specialist Referral, GP Referral, Pathology Result, Radiology Result, Generic |
| Carrier | Select | SMECAI | Sending Application for MSH-3 (SMECAI, Email, Fax, Post, Hand Delivered) |
| Auto-file | Checkbox | Checked | When checked, document auto-files in Genie. When unchecked, queues for review |
| Send to Doctor | Checkbox | Unchecked | Enables provider number input |
| Provider Number | Text input | Empty | Medicare Provider Number for routing (shown only if Send to Doctor checked) |

**Doctors Tab:**

A second tab allows managing the BJC Health doctor list used for addressee resolution:

- Pre-populated with default BJC Health doctors (17 doctors)
- Add/remove individual doctors
- Reset to defaults
- Stored in browser localStorage
- Passed to the API as `bjcDoctors` for each conversion

**Convert Button:**
- Triggers sequential processing of all `ready` items in the queue
- Shows spinner and "Converting..." text during processing
- Disabled while converting

**Success Display (per file, `app/components/ConversionResultPanel.tsx`):**
- Green success box with checkmark
- Patient data grid: Name, DOB, Sex, Medicare number, Sender, Addressee, CC, Message Type, Carrier
- "Download HL7 File" button (green)

**Error Display:**
- Red error box with icon, per-file
- Error message from API

### 8.3 Dashboard Page (`/dashboard`)

Audit log dashboard for ops staff. Sourced from `GET /api/logs?month=YYYY-MM`.

**Components:**
- Month picker (defaults to current Sydney month)
- Three pie charts: outcome (`ok` / `fail`), document type, source (`web` / `email`)
- Audit table: timestamp, source, document type, outcome, message type, OBR-24 routing, file size, duration, warnings, filename hash
- "Export CSV" button — downloads the visible month as CSV
- Total count + success-rate summary card

The page is a client component that calls `/api/logs` on mount and on month change. AWS SDK types are mirrored locally (`AuditRow`) so the browser bundle does not pull in `@aws-sdk/lib-dynamodb`.

### 8.4 Compliance Page (`/compliance`)

Static page describing the data-handling commitments — Australian data residency, IRAP-PROTECTED Bedrock model, audit-only metadata storage, no PHI retention. Linked from the footer.

### 8.5 Privacy Page (`/privacy`)

Static page describing privacy treatment — what is and isn't stored, the cookie used for authentication, and contact details. Linked from the footer.

### 8.6 Visual Design

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
| App ID | `ddv0o3k8wcjhr` |
| Region | `ap-southeast-2` (Sydney) |

### 9.2 Environment Variables

| Variable | Location | Required | Purpose |
|----------|----------|----------|---------|
| `APP_PASSWORD` | Amplify Console | Yes | Application password (cookie session is checked against this) |
| `BJC_DOCTORS` | Amplify Console | No | Comma-separated doctor names — fallback for addressee resolution when the UI doesn't pass `bjcDoctors` |
| `DYNAMODB_TABLE` | Amplify Console | No | Audit table name override (default `bjc-pdf-to-hl7-audit`) |

**Build phase** creates `.env.production` from Amplify env vars to ensure they're available at Lambda runtime.

### 9.3 IAM (Compute Role)

The Amplify **compute role** (`AmplifyComputeRole-ddv0o3k8wcjhr`), not the service role, provides runtime AWS credentials for SSR Lambda invocations. It must allow:

- `bedrock:InvokeModel` on `anthropic.claude-sonnet-4-6` foundation model + `au.anthropic.claude-sonnet-4-6` inference profile in **both** `ap-southeast-2` (Sydney) and `ap-southeast-4` (Melbourne). AU inference profiles route to Melbourne.
- `dynamodb:PutItem` and `dynamodb:Query` on the `bjc-pdf-to-hl7-audit` table.

These permissions are managed by `infra/main.tf` (Terraform). The DynamoDB table itself, an inline IAM policy attached to the compute role, and the Bedrock inline policy are all defined there.

### 9.4 Infrastructure as Code

`infra/main.tf` (Terraform ≥ 1.5, AWS provider ~> 5.0) provisions:

- DynamoDB table `bjc-pdf-to-hl7-audit` (PAY_PER_REQUEST, partition `month`, sort `ts`, point-in-time recovery on)
- Inline IAM policy `bjc-pdf-to-hl7-audit-dynamodb` attached to the Amplify compute role

Run with `terraform init && terraform apply` from the `infra/` directory. The compute-role name is parameterised via the `amplify_compute_role_name` variable.

### 9.5 Build Commands

```bash
bun dev          # Development server (localhost:3000)
bun run build    # Production build
bun run lint     # ESLint check
bun run typecheck  # Typecheck (bun test does NOT typecheck)
bun test         # Run test suite
bun run check    # Typecheck, lint, test
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
| Access logging | Not logged. Conversion-level audit log only (`/dashboard`). |

### 10.3 Data Extraction Constraints

| Constraint | Detail |
|------------|--------|
| Extraction method | AWS Bedrock vision extraction |
| Document formats | Six supported types (consent_form, referral_letter, gp_referral, pathology_result, radiology_result, generic) |
| Missing fields | Defaults used when extraction fails (warnings generated) |
| Address parsing | Scoped to patient block to avoid letterhead addresses |
| Medicare ref | Defaults to "1" if not found |

### 10.4 HL7 Constraints

| Constraint | Detail |
|------------|--------|
| Standard | HL7 v2.4 only |
| Message types | ORU^R01 (results) and REF^I12 (referrals) |
| Target system | Genie clinical software |
| Timestamp | Server local time (no timezone conversion) |

---

## 11. Testing

### 11.1 Test Coverage

10 test files run by `bun test`. Latest run on the `pr-integration` branch: **257 pass, 2 fail** (the two failures are pre-existing fixture-loading tests that depend on PDFs no longer present in the repo — unrelated to behaviour changes).

| Test File | Coverage |
|-----------|----------|
| `lib/pdf-parser.test.ts` | Bedrock facade behaviour and display formatting |
| `lib/hl7-builder.test.ts` | All segments (ORU + REF), OBR-24 routing, encoding, escaping |
| `lib/vision-extractor.test.ts` | Bedrock tool extraction, date conversion, state inference |
| `lib/conversion-config.test.ts` | Document type helpers + OBR-24 routing matrix |
| `lib/audit.test.ts` | Audit row schema, filename hashing, ext extraction, DynamoDB client |
| `lib/utils.test.ts` | Utility functions |
| `app/api/convert/route.test.ts` | API validation, detect-only, document type handling, audit row write |
| `app/api/logs/route.test.ts` | Auth gating, month validation, list response shape |
| `app/api/auth/route.test.ts` | Login / logout flow |
| `middleware.test.ts` | Auth flow, caching headers |

### 11.2 Test Infrastructure

| Script | Purpose |
|--------|---------|
| `scripts/generate-test-pdfs.ts` | Creates 20 test PDFs with realistic content (currently regenerated on demand) |
| `scripts/generate-cc-test-pdfs.ts` | Generates CC / addressee resolution test PDFs |
| `scripts/diagnose-pdfs.ts` | Runs extraction across all test PDFs |
| `scripts/test-vision.ts` | Live Bedrock extraction against mock referrals (requires AWS creds) |
| `scripts/test-cc-scenarios.ts` | Live Bedrock test for CC addressee scenarios |

### 11.3 Test PDF Inventory

Test PDFs live under `docs/input PDF/`:

| Subdirectory | Purpose |
|--------------|---------|
| `mock-referrals/` | Five generated mock referral PDFs (`test_mock_referral1.pdf`–`5`) |
| `cc-scenarios/` | Three CC / addressee resolution scenarios (BJC primary, BJC in CC, both BJC) |
| `originals/` | Sample original PDFs used as fixtures |

---

## 12. Code Escrow

On termination of the SMEC AI engagement, BJC Health receives the complete codebase — this repo, the Power Automate Desktop email-poller flow, the Terraform infrastructure-as-code, and the operational documentation. The handover is structured so BJC can continue running the service (or hand it to another vendor) without operational disruption. Specific terms — handover format, support window, dependency lists, and any transition assistance — are documented in the SMEC AI service proposal.

---

## 13. Audit Log and PHI Safety

Every conversion writes one row to the DynamoDB audit table `bjc-pdf-to-hl7-audit` (partition `month`, sort `ts`). The schema is defined in `lib/audit.ts` (`interface AuditRow`).

### 13.1 What the audit row contains

| Field | Type | Notes |
|-------|------|-------|
| `month` | string | Partition key, `YYYY-MM` (Sydney calendar month) |
| `ts` | string | Sort key, ISO 8601 UTC timestamp + `#` + 6-char base36 random suffix |
| `documentType` | string \| undefined | `consent_form` / `referral_letter` / `gp_referral` / `pathology_result` / `radiology_result` / `generic` |
| `outcome` | `"ok"` \| `"fail"` | Whether the conversion succeeded |
| `source` | `"web"` \| `"email"` | From the `X-Source` request header (defaults to `web`) |
| `messageType` | string \| undefined | `ORU^R01` / `REF^I12`; undefined on failure |
| `diagnosticServiceSection` | `"LAB"` \| `"RAD"` \| `"PHY"` \| undefined | OBR-24 routing flag |
| `filenameHash` | string | First 12 hex chars of `sha256(originalFilename)`. **Never** the raw filename. |
| `filenameExt` | string | `".pdf"` or `""` (allowlisted — see `extractFilenameExt`) |
| `fileSizeBytes` | number | PDF size in bytes |
| `durationMs` | number | End-to-end conversion duration |
| `warningCount` | number | Number of extraction warnings produced |

### 13.2 What the audit row never contains

- Patient first name, last name, date of birth, or sex
- Medicare number or Medicare reference digit
- Patient address, suburb, postcode, phone
- Sender, addressee, or CC names from referral letters
- Document text, embedded PDF bytes, or any extracted clinical content
- The raw original filename (only the SHA-256 prefix hash)

`extractFilenameExt` is intentionally allowlisted to `.pdf` rather than a generic `lastIndexOf(".")` parse — that protects against PHI leaks from filenames like `Note.JOHN` (where a name segment could be misread as an extension). The conversion API only accepts `application/pdf`, so `.pdf` is the only valid value.

### 13.3 Visibility

The `/dashboard` page (cookie-protected) reads the current month's rows via `GET /api/logs?month=YYYY-MM`, renders pie charts (outcome / document type / source) and a row-level audit table, and supports CSV export. Audit-write failures are logged to `console.error` and swallowed — the conversion API must never fail because of audit infra issues.

---

## Appendix A: File Structure

```
bjc-pdf-to-hl7/
+-- app/
|   +-- api/
|   |   +-- auth/route.ts                Authentication endpoint (POST/DELETE)
|   |   +-- auth/route.test.ts           Auth integration tests
|   |   +-- convert/route.ts             PDF -> HL7 conversion + audit write
|   |   +-- convert/route.test.ts        Conversion integration tests
|   |   +-- logs/route.ts                Audit log query (GET ?month=YYYY-MM)
|   |   +-- logs/route.test.ts           Logs endpoint tests
|   +-- components/
|   |   +-- AppFooter.tsx                Footer with compliance/privacy links
|   |   +-- ConversionOptions.tsx        Per-file conversion options
|   |   +-- ConversionResultPanel.tsx    Per-file success/error display
|   |   +-- DoctorsTab.tsx               BJC doctor list management
|   |   +-- FileQueueItem.tsx            Multi-file queue row
|   |   +-- LogoStrip.tsx                BJC + SMEC AI logo strip
|   |   +-- UploadZone.tsx               Drag-drop upload area
|   +-- compliance/page.tsx              Compliance / data-handling page
|   +-- dashboard/page.tsx               Audit dashboard (charts + table + CSV)
|   +-- login/page.tsx                   Login page
|   +-- privacy/page.tsx                 Privacy page
|   +-- page.tsx                         Converter UI (multi-file queue)
|   +-- layout.tsx                       Root layout (force-dynamic)
|   +-- globals.css                      Styling
+-- lib/
|   +-- audit.ts                         DynamoDB audit row schema + helpers
|   +-- audit.test.ts                    Audit unit tests
|   +-- conversion-config.ts             Document types, OBR-24 routing, defaults
|   +-- conversion-config.test.ts        Config helper tests
|   +-- convert-service.ts               Form-data parsing + orchestration
|   +-- pdf-parser.ts                    Bedrock extraction facade
|   +-- pdf-parser.test.ts               Bedrock facade tests
|   +-- vision-extractor.ts              Bedrock classification + extraction
|   +-- vision-extractor.test.ts         Bedrock extraction tests
|   +-- hl7-builder.ts                   HL7 generation (ORU^R01 + REF^I12)
|   +-- hl7-builder.test.ts              Builder tests
|   +-- utils.ts                         Utility functions
|   +-- utils.test.ts                    Utility tests
+-- infra/
|   +-- main.tf                          Terraform: audit table + IAM policy
+-- scripts/
|   +-- generate-test-pdfs.ts            Test PDF generator
|   +-- generate-cc-test-pdfs.ts         CC scenario PDF generator
|   +-- diagnose-pdfs.ts                 Extraction diagnostics
|   +-- test-vision.ts                   Live Bedrock test (mock referrals)
|   +-- test-cc-scenarios.ts             Live Bedrock test (CC addressee scenarios)
+-- docs/
|   +-- functional_spec.md               This document
|   +-- amplify-bedrock-credentials.md   Compute role + Bedrock auth setup
|   +-- workflow/
|   |   +-- bjc-pdf-to-hl7-operational-guide.md  Operational guide for ops staff
|   +-- research/
|   |   +-- genie-hl7-input-format.md            Genie HL7 input requirements
|   |   +-- genie-desktop-results-workflow.md    Genie desktop results research
|   |   +-- sister-system-pdf-to-directory.md    Sister system reference
|   +-- input PDF/                       Test PDF fixtures (mock-referrals/, cc-scenarios/, originals/)
|   +-- archive/                         Historical / superseded docs
+-- middleware.ts                        Auth + cache-control middleware
+-- middleware.test.ts                   Middleware tests
+-- next.config.mjs                      Next.js config (output: standalone)
+-- amplify.yml                          AWS Amplify build spec
+-- tailwind.config.ts                   Tailwind config
+-- tsconfig.json                        TypeScript config
+-- package.json                         Dependencies
```

---

## Appendix B: API Quick Reference

```bash
# Login (creates cookie jar)
curl -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"password":"your_password"}' \
  http://localhost:3000/api/auth

# Health check
curl -b cookies.txt http://localhost:3000/api/convert

# Convert PDF (auto-detect type)
curl -X POST -b cookies.txt \
  -F "pdf=@file.pdf" \
  http://localhost:3000/api/convert

# Detect document type only
curl -X POST -b cookies.txt \
  -F "pdf=@file.pdf" -F "detectOnly=true" \
  http://localhost:3000/api/convert

# Convert with options
curl -X POST -b cookies.txt \
  -F "pdf=@file.pdf" \
  -F "documentType=pathology_result" \
  -F "autoFile=false" \
  -F "orderingProvider=1234567A" \
  http://localhost:3000/api/convert

# Convert from the email pipeline (X-Source: email tags the audit row)
curl -X POST -b cookies.txt \
  -H "X-Source: email" \
  -F "pdf=@file.pdf" \
  http://localhost:3000/api/convert

# Read audit log for a month (for /dashboard)
curl -b cookies.txt "http://localhost:3000/api/logs?month=2026-04"

# Logout
curl -X DELETE -b cookies.txt http://localhost:3000/api/auth
```
