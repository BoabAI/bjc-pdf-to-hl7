# PAD Integration Guide: PDF-to-HL7

Technical reference for building the Power Automate Desktop flow that connects the BJC Health email inbox to the SMEC AI conversion service. Also covers server setup requirements for Medihost.

---

## 1. Overview

The automation monitors a shared mailbox for incoming referral letter emails, sends each PDF attachment to the SMEC AI cloud service for AI-powered extraction, and saves the resulting HL7 file to the Genie import folder. Staff never touch the email -- it either lands in Genie automatically or gets flagged for manual review.

```
Shared Mailbox (referrals@bjchealth.com.au)
        |
        v
Windows Task Scheduler (every 15 min, business hours)
        |
        v
Power Automate Desktop (PAD)
        |
        +-- Retrieve unread emails with PDF attachments (top 10)
        |
        +-- For each email:
        |     |
        |     +-- For each PDF attachment:
        |     |     |
        |     |     +-- Save PDF to temp file (C:\SMEC AI\pdf-to-hl7\)
        |     |     +-- Fetch doctor list from API (cached per run)
        |     |     +-- POST PDF to /api/convert with API key
        |     |     +-- On success: save hl7Content as .hl7 to Genie LabRslts folder
        |     |     +-- On failure: mark attachment as failed
        |     |     +-- Delete temp file
        |     |
        |     +-- All succeeded:  move email to Inbox/Linked
        |     +-- Any failed:     move email to Inbox/Review + send notification
        |     +-- Mark email as read
        |
        v
Genie LabRslts folder (HL7 auto-import)
        |
        v
Genie creates patient record, routes to doctor's Incoming Letters
```

---

## 2. API Contract

Base URL: `https://<domain>` (the Amplify deployment URL, e.g. `https://main.ddv0o3k8wcjhr.amplifyapp.com`)

All authenticated endpoints require the `X-API-Key` header.

### POST /api/convert

Converts a PDF to an HL7 v2.4 message.

**Request:**

```
POST /api/convert
Headers:
  X-API-Key: bjc_<32hex>
Content-Type: multipart/form-data

Form fields:
  pdf               (File, required)    The PDF attachment
  documentType      (string, optional)  "auto" (default), "consent_form", "referral_letter", "gp_referral", "generic"
  autoFile          (string, optional)  "true" (default) auto-file in Genie, "false" queue for review
  carrier           (string, optional)  Sending application label -- use "EMAIL" for email-sourced referrals
  bjcDoctors        (JSON string, opt)  Array of doctor names for addressee resolution
  orderingProvider  (string, optional)  Medicare Provider Number for doctor routing in Genie (PV1-9)
```

**Response (HTTP 200, success):**

```json
{
  "success": true,
  "filename": "Smith_Jane_20260330143022.hl7",
  "hl7Content": "MSH|^~\\&|EMAIL|BJCHEALTH|GENIE|CLINIC|20260330143022||REF^I12|...<full message>...",
  "extractedData": {
    "firstName": "Jane",
    "lastName": "Smith",
    "dob": "15/03/1985",
    "sex": "Female",
    "medicareNo": "1234567890-1",
    "sender": "Dr John GP (Medical Centre)",
    "addressee": "Dr Irwin Lim",
    "messageType": "REF (Referral)",
    "carrier": "EMAIL"
  },
  "warnings": [],
  "extractionMethod": "vision"
}
```

**Response (HTTP 200, extraction failed):**

The API returns HTTP 200 even when extraction fails. Check the `success` field.

```json
{
  "success": false,
  "error": "Could not extract patient name from this document. The name may be redacted, missing, or in an unsupported format.",
  "warnings": ["Vision extraction timed out after 30s"],
  "extractionMethod": "vision"
}
```

**Response (HTTP 400, validation error):**

```json
{
  "success": false,
  "error": "No PDF file provided"
}
```

Other 400 errors: `"File must be a PDF"`, `"File size exceeds 10MB limit"`.

**Response (HTTP 401, auth error):**

```json
{
  "error": "Unauthorized"
}
```

**Response (HTTP 500, server error):**

```json
{
  "success": false,
  "error": "Conversion failed"
}
```

### GET /api/health

Public endpoint (no API key required). Returns service status and today's metrics.

```
GET /api/health
```

```json
{
  "status": "healthy",
  "timestamp": "2026-03-30T04:30:22.000Z",
  "version": "0.1.0",
  "checks": {
    "dynamodb": { "status": "ok", "latencyMs": 45 },
    "bedrock": { "status": "ok" }
  },
  "metrics": {
    "today": { "total": 12, "success": 11, "failure": 1 }
  }
}
```

The `status` field is `"healthy"` when all checks pass, `"degraded"` when DynamoDB is unreachable.

### GET /api/doctors

Returns the current doctor list (used for addressee resolution). Requires API key.

```
GET /api/doctors
Headers:
  X-API-Key: bjc_<32hex>
```

```json
{
  "doctors": [
    "Dr Irwin Lim",
    "Dr Herman Lau",
    "Dr Andrew Jordan",
    "Dr Ilana Ginges",
    "Dr Roberto Russo",
    "Dr Anne Chung",
    "Dr Simran Kaur",
    "Dr Shirley Yu",
    "Dr Queenie Luu",
    "Dr Adam Maundrell",
    "Dr Hugh Caterson",
    "Dr Pauline Habib",
    "Dr Elaine Ng",
    "Dr Kate Celkys",
    "Dr Cellina Ching",
    "Dr Vincent Wong",
    "Dr Dahlia Davidoff"
  ]
}
```

The PAD flow fetches this once per run and passes it as `bjcDoctors` to each conversion call. This means the doctor list is always current without hardcoding names in the PAD flow.

---

## 3. Authentication

### API Keys

API keys authenticate the PAD flow against the conversion service. Keys are managed via the web dashboard (Settings page).

| Property | Detail |
|----------|--------|
| Format | `bjc_<32 hex characters>` (36 characters total) |
| Storage | SHA-256 hash stored in DynamoDB (plaintext never stored) |
| Shown | Once at creation -- copy immediately |
| Validation | Header `X-API-Key` checked on every request |
| Management | Create, list, revoke via dashboard (`/api/keys`) |
| Audit | `lastUsedAt` timestamp updated on each use |

### Key Lifecycle

1. **Create**: Log into the web dashboard, go to Settings, click "Create API Key", give it a name like "PAD Automation". Copy the key.
2. **Configure**: Paste the key into the PAD flow's `ApiKey` variable.
3. **Rotate**: Create a new key, update the PAD flow variable, verify the new key works, then revoke the old key via the dashboard.
4. **Revoke**: If a key is compromised, revoke it immediately via the dashboard. The PAD flow will start returning 401 errors until the variable is updated.

### Web Auth vs API Key Auth

The middleware allows two auth paths:

- **Web (cookie)**: Browser-based login with `APP_PASSWORD`. Sets `app_authenticated` cookie.
- **API (header)**: `X-API-Key` header. Used by PAD and any external integrations.

The `/api/health` endpoint is public (no auth required). The `/api/keys` management endpoint requires web auth only -- API keys cannot create or revoke other API keys.

---

## 4. PAD Workflow Design

Robin pseudocode for the full flow. This follows the same patterns as the existing PDF-to-Directory flow (same service account, same Task Scheduler setup, same email handling conventions).

```robin
# ─────────────────────────────────────────────────────────────────────
# PDF-to-HL7 Automation
# Monitors a shared mailbox for referral PDFs, converts via SMEC AI
# cloud service, saves HL7 files to Genie import folder.
# ─────────────────────────────────────────────────────────────────────

# ── Flow Variables ──────────────────────────────────────────────────
SET ApiUrl TO 'https://<domain>/api/convert'
SET DoctorsUrl TO 'https://<domain>/api/doctors'
SET HealthUrl TO 'https://<domain>/api/health'
SET ApiKey TO 'bjc_<key>'
SET GenieLabRsltsFolder TO '\\\\server\\path\\LabRslts'
SET TempFolder TO 'C:\\SMEC AI\\pdf-to-hl7'
SET NotifyRecipient TO 'amy.johnson@bjchealth.com.au'
SET Carrier TO 'EMAIL'
SET MaxRetries TO 2
SET RetryDelaySeconds TO 10

# ── Phase 1: Startup Cleanup ───────────────────────────────────────
# Delete any leftover temp files from a previous crash
IF Folder.Exists(TempFolder) THEN
    Folder.GetFiles TempFolder, '*.pdf', Files
    LOOP FOREACH File IN Files
        File.Delete File
    END
ELSE
    Folder.Create TempFolder
END

# ── Phase 2: Health Check ──────────────────────────────────────────
# Verify the service is reachable before processing
WebService.InvokeWebService \
    Url: HealthUrl \
    Method: 'GET' \
    Timeout: 15 \
    Response => HealthResponse \
    StatusCode => HealthStatus

IF HealthStatus <> 200 THEN
    # Service is down -- exit quietly, try again next scheduled run
    EXIT
END

SET HealthJson TO Json.Parse(HealthResponse)
IF HealthJson.status = 'degraded' THEN
    # Service is up but DynamoDB is down -- proceed anyway
    # (conversions still work, just no audit logging)
END

# ── Phase 3: Fetch Doctor List ─────────────────────────────────────
# Fetch once per run, reuse for all conversions
WebService.InvokeWebService \
    Url: DoctorsUrl \
    Method: 'GET' \
    CustomHeaders: 'X-API-Key: %ApiKey%' \
    Timeout: 15 \
    Response => DoctorsResponse \
    StatusCode => DoctorsStatus

IF DoctorsStatus = 200 THEN
    SET DoctorsJson TO Json.Parse(DoctorsResponse)
    SET DoctorListJson TO Json.Stringify(DoctorsJson.doctors)
ELSE
    # Fall back to empty -- the server will use its own default list
    SET DoctorListJson TO '[]'
END

# ── Phase 4: Retrieve Emails ──────────────────────────────────────
Outlook.RetrieveEmails \
    Account: 'referrals@bjchealth.com.au' \
    Folder: 'Inbox' \
    Filter: 'Unread' \
    Attachments: 'Save' \
    Top: 10 \
    Emails => Emails

# ── Phase 5: Process Each Email ───────────────────────────────────
LOOP FOREACH Email IN Emails
    SET AllSucceeded TO True
    SET FailedAttachments TO ''

    LOOP FOREACH Attachment IN Email.Attachments
        # Skip non-PDF attachments (images, signatures, etc.)
        IF NOT Text.EndsWith(Attachment.Name, '.pdf', IgnoreCase: True) THEN
            NEXT LOOP
        END

        # Save attachment to temp file
        SET TempFile TO '%TempFolder%\\%Attachment.Name%'
        File.WriteBytes TempFile, Attachment.Content

        # ── Convert via API ────────────────────────────────────
        SET RetryCount TO 0
        SET ConvertSucceeded TO False

        LOOP WHILE RetryCount <= MaxRetries AND NOT ConvertSucceeded
            BEGIN EXCEPTION HANDLING
                WebService.InvokeWebService \
                    Url: ApiUrl \
                    Method: 'POST' \
                    CustomHeaders: 'X-API-Key: %ApiKey%' \
                    ContentType: 'multipart/form-data' \
                    FormData: \
                        pdf=@%TempFile% \
                        carrier=%Carrier% \
                        bjcDoctors=%DoctorListJson% \
                    Timeout: 60 \
                    Response => ConvertResponse \
                    StatusCode => ConvertStatus

                SET ResponseJson TO Json.Parse(ConvertResponse)

                IF ConvertStatus = 200 AND ResponseJson.success = True THEN
                    # ── Save HL7 file to Genie folder ──────────
                    SET Hl7Filename TO ResponseJson.filename
                    SET Hl7Content TO ResponseJson.hl7Content
                    SET Hl7FilePath TO '%GenieLabRsltsFolder%\\%Hl7Filename%'

                    File.WriteText Hl7FilePath, Hl7Content, Encoding: 'ASCII'
                    SET ConvertSucceeded TO True

                ELSE IF ConvertStatus = 200 AND ResponseJson.success = False THEN
                    # Extraction failed -- no retry (AI couldn't read the PDF)
                    SET AllSucceeded TO False
                    SET FailedAttachments TO '%FailedAttachments%\n- %Attachment.Name%: %ResponseJson.error%'
                    SET RetryCount TO MaxRetries + 1  # Break retry loop

                ELSE IF ConvertStatus = 400 THEN
                    # Bad request -- no retry (file validation failed)
                    SET AllSucceeded TO False
                    SET FailedAttachments TO '%FailedAttachments%\n- %Attachment.Name%: %ResponseJson.error%'
                    SET RetryCount TO MaxRetries + 1

                ELSE IF ConvertStatus = 401 THEN
                    # Invalid API key -- stop everything, configuration error
                    SET AllSucceeded TO False
                    SET FailedAttachments TO '%FailedAttachments%\n- %Attachment.Name%: API key rejected (401)'
                    # Send urgent notification and exit
                    Email.Send \
                        To: NotifyRecipient \
                        Subject: 'URGENT: PDF-to-HL7 API Key Invalid' \
                        Body: 'The automation API key has been rejected. All processing has stopped. Please contact SMEC AI to resolve.' \
                        Account: 'referrals@bjchealth.com.au'
                    File.Delete TempFile
                    EXIT  # Stop entire flow

                ELSE
                    # 500 or unexpected status -- retry
                    SET RetryCount TO RetryCount + 1
                    IF RetryCount <= MaxRetries THEN
                        Wait RetryDelaySeconds
                    ELSE
                        SET AllSucceeded TO False
                        SET FailedAttachments TO '%FailedAttachments%\n- %Attachment.Name%: Server error (HTTP %ConvertStatus%)'
                    END
                END

            ON EXCEPTION
                # Network timeout or connection error -- retry
                SET RetryCount TO RetryCount + 1
                IF RetryCount <= MaxRetries THEN
                    Wait RetryDelaySeconds
                ELSE
                    SET AllSucceeded TO False
                    SET FailedAttachments TO '%FailedAttachments%\n- %Attachment.Name%: Connection failed after %MaxRetries% retries'
                END
            END

        END  # Retry loop

        # Clean up temp file
        File.Delete TempFile

    END  # Attachment loop

    # ── Move Email Based on Result ────────────────────────────
    IF AllSucceeded THEN
        Outlook.MoveEmail Email, 'Inbox/Linked'
    ELSE
        Outlook.MoveEmail Email, 'Inbox/Review'

        # Send failure notification
        Email.Send \
            To: NotifyRecipient \
            Subject: 'PDF-to-HL7: Email moved to Review' \
            Body: 'The following email could not be fully processed:\n\nFrom: %Email.From%\nSubject: %Email.Subject%\nDate: %Email.Date%\n\nFailed attachments:%FailedAttachments%\n\nPlease check the Review folder and process manually.' \
            Account: 'referrals@bjchealth.com.au'
    END

    # Mark as read regardless of outcome
    Outlook.MarkAsRead Email

END  # Email loop
```

### Key Differences from PDF-to-Directory

| Aspect | PDF-to-Directory | PDF-to-HL7 |
|--------|-----------------|------------|
| Processing | Local (PAD text extraction + Python regex) | Cloud (SMEC AI API + Bedrock vision) |
| Output | Renamed PDF file | HL7 v2.4 message file |
| Destination | Network folder (`Genie Scans\PD`) | Genie LabRslts folder |
| Error handling | Skip silently | Move to Review + notification email |
| Doctor list | N/A | Fetched from API each run |
| Retry logic | None (local processing) | 2 retries with 10s delay for server errors |

---

## 5. Error Handling and Retry

### Decision Matrix

| Condition | Action | Retry? | Email to Review? | Notification? |
|-----------|--------|--------|-----------------|---------------|
| HTTP 200 + `success: true` | Save HL7, move to Linked | No | No | No |
| HTTP 200 + `success: false` | Extraction failed | No | Yes | Yes |
| HTTP 400 | Bad request (file validation) | No | Yes | Yes |
| HTTP 401 | Invalid API key | No | Yes | Yes + URGENT |
| HTTP 500 | Server error | Yes (2x) | Yes (after retries) | Yes |
| Network timeout (60s) | Connection failed | Yes (2x) | Yes (after retries) | Yes |
| Connection refused | Service down | Yes (2x) | Yes (after retries) | Yes |

### Retry Behaviour

- Maximum 2 retries (3 attempts total) for server errors and network failures
- 10 second delay between retries
- No retry for 200 (success or extraction failure), 400, or 401 responses
- HTTP 401 triggers an URGENT notification and stops the entire flow (configuration error)

### Notification Email Template

```
Subject: PDF-to-HL7: Email moved to Review

The following email could not be fully processed:

From: Dr Smith <dr.smith@medicalpractice.com.au>
Subject: Referral for Jane Smith
Date: 30/03/2026 2:30 PM

Failed attachments:
- Referral_Smith_Jane.pdf: Could not extract patient name from this document.

Please check the Review folder and process manually.
```

---

## 6. HL7 File Handling

### Saving the HL7 File

The `hl7Content` field in the API response contains the complete HL7 message as a string. Save it directly to a file -- no parsing or modification needed.

| Property | Value |
|----------|-------|
| Filename | Use `filename` from response (e.g. `Smith_Jane_20260330143022.hl7`) |
| Extension | `.hl7` |
| Encoding | ASCII (the message uses 8859/1 charset per MSH-18, compatible with ASCII) |
| Line endings | CR only (`\r`) -- the API returns the message with correct HL7 line endings |
| Destination | Genie LabRslts import folder (path from `GenieLabRsltsFolder` variable) |

### How Genie Imports

Genie polls the LabRslts folder and auto-imports any `.hl7` files it finds. For each file:

1. Reads the MSH segment to determine message type (REF^I12 or ORU^R01)
2. Reads the PID segment to match or create the patient record
3. For REF messages: reads PRD segments to identify sender and addressee, routes to the addressee's Incoming Letters inbox
4. Extracts the embedded PDF from the OBX segment and attaches it to the patient record
5. Deletes the `.hl7` file from the folder after successful import

### Important: Genie REF Modifier

Genie requires the **REF modifier** to be enabled to correctly handle REF^I12 messages. Without it, all imported documents go to Pathology/Radiology results instead of Incoming Letters.

Medihost must confirm this is enabled before go-live.

---

## 7. Task Scheduler Configuration

The PAD flow runs on a schedule, identical in structure to the existing PDF-to-Directory task.

| Setting | Value |
|---------|-------|
| Task name | `BJC PDF-to-HL7` |
| Program | `C:\Program Files (x86)\Power Automate Desktop\PAD.Console.Host.exe` |
| Arguments | `/flow "<flow-name>" /run` |
| Start in | `C:\Program Files (x86)\Power Automate Desktop` |
| Run as | `CORP\demonstration` (same service account as PDF-to-Directory) |
| Run whether user is logged on | Yes |
| Do not start new instance if running | Yes |

### Triggers

**Trigger 1 -- Scheduled (business hours):**

| Setting | Value |
|---------|-------|
| Type | Daily |
| Repeat every | 15 minutes |
| For duration | 12 hours |
| Start time | 7:00 AM |
| Days | Monday through Friday |
| Stop if running longer than | 30 minutes |

**Trigger 2 -- At startup (crash recovery):**

| Setting | Value |
|---------|-------|
| Type | At startup |
| Delay | 5 minutes |

The startup trigger ensures the automation catches up on any unprocessed emails after a server restart or crash. The 5-minute delay gives Windows time to fully initialise network connections and Outlook.

### Registry Fix (Required)

The same registry key used by PDF-to-Directory must be set to suppress the PAD external flow confirmation dialog:

```
HKCU\Software\Microsoft\Power Automate Desktop
  DisableExternalFlowConfirmationDialog = 1 (DWORD)
```

---

## 8. Server Requirements (for Medihost)

These items must be in place before the automation can be deployed and tested. The server is the same Windows machine already running PAD and the PDF-to-Directory automation.

| Requirement | Detail | Status |
|-------------|--------|--------|
| **Server capacity** | This automation runs alongside PDF-to-Directory on the same server. Minimal additional load -- the heavy processing happens in the cloud. | Confirm |
| **Genie LabRslts folder access** | The service account (`CORP\demonstration`) needs read/write access to the Genie LabRslts import folder. Provide the full UNC path. | Provide path |
| **Internet access from server** | HTTPS (port 443) to `*.amplifyapp.com`. No other ports or protocols needed. | Confirm |
| **Shared mailbox** | A dedicated shared mailbox for referral emails (separate from `PD@bjchealth.com.au`). The service account needs full access. | Create mailbox |
| **Review email folder** | Create `Inbox/Review` and `Inbox/Linked` subfolders in the new mailbox. | Create folders |
| **Service account permissions** | `CORP\demonstration` needs: mailbox access (new mailbox), LabRslts folder write access, Task Scheduler rights. Already has PAD Premium licence and Outlook connection. | Verify |
| **Genie REF modifier enabled** | Genie must have the REF modifier to correctly route REF^I12 messages to Incoming Letters. Without it, referrals go to Pathology/Radiology. | Confirm / Enable |
| **Local temp folder** | `C:\SMEC AI\pdf-to-hl7\` will be created automatically by the flow. No action needed unless local drive policies restrict folder creation. | Verify no restrictions |

### Network Requirements

The server only needs outbound HTTPS access. No inbound connections, no VPN, no firewall changes beyond standard HTTPS.

| Destination | Protocol | Port | Purpose |
|-------------|----------|------|---------|
| `*.amplifyapp.com` | HTTPS | 443 | Conversion API and health check |

---

## 9. Flow Variables

All configurable values are set as flow variables at the top of the PAD flow. No hardcoded values in the flow logic.

| Variable | Example Value | Notes |
|----------|---------------|-------|
| `ApiUrl` | `https://main.ddv0o3k8wcjhr.amplifyapp.com/api/convert` | Conversion endpoint |
| `DoctorsUrl` | `https://main.ddv0o3k8wcjhr.amplifyapp.com/api/doctors` | Doctor list endpoint |
| `HealthUrl` | `https://main.ddv0o3k8wcjhr.amplifyapp.com/api/health` | Health check endpoint (public) |
| `ApiKey` | `bjc_a1b2c3d4e5f6...` | Created via web dashboard |
| `GenieLabRsltsFolder` | `\\192.168.47.10\PracticeData\LabRslts` | From Medihost (TBD) |
| `TempFolder` | `C:\SMEC AI\pdf-to-hl7` | Local temp directory |
| `NotifyRecipient` | `amy.johnson@bjchealth.com.au` | Failure notification email |
| `Carrier` | `EMAIL` | Sent as MSH-3 in HL7 message |
| `MaxRetries` | `2` | Retries for server errors |
| `RetryDelaySeconds` | `10` | Delay between retries |

### Values That Need to Be Filled In

| Variable | Who Provides | When |
|----------|-------------|------|
| `ApiKey` | Sean (via dashboard) | After dashboard is deployed |
| `GenieLabRsltsFolder` | Medihost | During server setup |
| `NotifyRecipient` | Amy / BJC Health | During configuration |

---

## 10. Testing Checklist

Run these in order. Each step depends on the previous one passing.

### API Connectivity

```bash
# Health check (no auth required)
curl https://<domain>/api/health

# Verify API key works
curl -H "X-API-Key: bjc_<key>" https://<domain>/api/doctors

# Convert a test PDF
curl -X POST \
  -H "X-API-Key: bjc_<key>" \
  -F "pdf=@test-referral.pdf" \
  -F "carrier=EMAIL" \
  https://<domain>/api/convert
```

### End-to-End (from PAD)

- [ ] API key works: health check returns `"healthy"`
- [ ] Doctor list loads: `/api/doctors` returns the current list
- [ ] Conversion works: API returns `success: true` with `hl7Content`
- [ ] HL7 file saves to Genie LabRslts folder with correct filename
- [ ] HL7 file encoding is ASCII with CR line endings
- [ ] Genie imports the HL7 file and creates/matches the patient record
- [ ] Referral appears in correct doctor's Incoming Letters inbox in Genie
- [ ] PDF is attached to the patient record in Genie
- [ ] Email moves to Linked folder on success
- [ ] Email moves to Review folder on extraction failure
- [ ] Notification email sent when moved to Review
- [ ] HTTP 401 triggers URGENT notification and stops flow
- [ ] Retry works: kill API mid-request, flow retries and succeeds
- [ ] Crash recovery: restart server, Task Scheduler fires within 5 minutes
- [ ] Temp file cleanup: leftover PDFs from a crash are deleted on next startup
- [ ] Non-PDF attachments (images, .docx) are skipped without error
- [ ] Multiple PDF attachments in one email all get processed
- [ ] Empty/corrupt PDF returns extraction failure (not crash)

### Genie Verification

- [ ] REF^I12 message routes to Incoming Letters (not Pathology/Radiology)
- [ ] ORU^R01 message (consent form) routes correctly
- [ ] Patient matching works for existing patients (name + DOB + Medicare)
- [ ] New patient is created when no match exists
- [ ] Provider routing works (document appears in correct doctor's inbox)

---

## Appendix: Licensing

Same licence requirements as the existing PDF-to-Directory flow. No additional licences needed.

| Component | Licence | Already in Place |
|-----------|---------|-----------------|
| Power Automate Desktop | Free with Windows | Yes |
| Power Automate Premium | Required (assigned to `CORP\demonstration`) | Yes |
| AI Builder | Not required | N/A |
| Outlook connection | Office 365 connector | Yes (need new connection for new mailbox) |

---

*Prepared by SMEC AI | March 2026*
