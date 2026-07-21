# PAD Integration Guide: PDF-to-HL7

Technical reference for building the Power Automate Desktop flow that connects the BJC Health monitored mailboxes to the SMEC AI conversion service. Also covers server setup requirements for Medihost.

> **Rewritten July 2026.** The March 2026 version of this guide described an `X-API-Key` / dashboard-managed-key design that was never built, plus `/api/health` and `/api/doctors` endpoints that do not exist. This version matches the shipped API: shared bearer token auth, the `auto_routed` / `manual_review` response contract, and the BJC-account production URL. The authoritative wire contract lives in code at `lib/contracts/convert.ts`; PAD-side header/credential traps are covered in `docs/engineering/pad-bearer-token-gotchas.md` — read that before editing the flow.

---

## Rollout Status — as of 21 Jul 2026

Build is underway on the BJC server (MHS-SYD-APP47). Update this table as items complete.

**Done:**

| Item | Detail | Date |
|---|---|---|
| ✅ Guide rewritten to shipped API | This document (PR #10) | 21 Jul 2026 |
| ✅ Production reachable + token verified from BJC server | `curl` from MHS-SYD-APP47: 200 with bearer + `X-Source`, 401 without — proves token, TLS trust, and outbound 443 | 21 Jul 2026 |
| ✅ Token in Credential Manager | `BJC-PAD-Token` created via `cmdkey` as `BJC\medihost` (matches the account the scheduled task runs as) | 21 Jul 2026 |
| ✅ Run-as facts verified | Existing "SMEC AI Power Automate" task: `BJC\medihost`, "run only when user is logged on", highest privileges (§10 updated to match) | 21 Jul 2026 |
| ✅ Setup requests sent to Medihost + BJC | Email to Amol + Nicole: PAuto Full Access to the three fax mailboxes; eight review categories per mailbox (Nicole picks colours) | 21 Jul 2026 |

**Pending:**

| Item | Owner |
|---|---|
| ⬜ PAuto Full Access to `fax-pathology@` / `fax-radiology@` / `fax-vascular@` | Amol (Medihost) |
| ⬜ Eight review categories created in each fax mailbox (exact names, §4 + §11) | Nicole / Amol |
| ⬜ Genie LabRslts UNC path confirmed | Amol (Medihost) |
| ⬜ Doctor-list decision (§6) — recommended: `BJC_DOCTORS` in `infra/bjc/main.tf` | Sean + Nicole |
| ⬜ Carrier decision — PAD cannot send the `carrier` form field (see §4 note), so MSH-3 defaults to `SMECAI`; server-side change needed if BJC wants `EMAIL` | Sean + BJC |
| ⬜ Build the PAD flow (§7) | Sean |
| ⬜ Task Scheduler task (§10) | Sean |
| ⬜ Testing checklist (§13) | Sean |
| ⬜ Genie REF modifier confirmed — Phase 2 gate (§9) | Medihost |

---

## 1. Overview

The automation monitors mailboxes for incoming document emails, sends each PDF attachment to the SMEC AI cloud service for AI-powered extraction, and — when the service auto-routes the document — saves the resulting HL7 file to the Genie import folder. When the service diverts a document to manual review, the email **stays in its inbox** and PAD tags it with an Outlook category so staff can triage by colour.

**Operating principle (Sean + Nicole, May 2026): a misroute is worse than no action.** Documents the service is not confident about are never filed to Genie; they stay in the inbox for a human. Target is ≥60% auto-routed, the rest reviewed by staff.

**Rollout phases:**

- **Phase 1** — the three GoFax fax-to-email inboxes (`fax-pathology@`, `fax-radiology@`, `fax-vascular@bjchealth.com.au`). These carry almost exclusively pathology/radiology results.
- **Phase 2** — `admin@bjchealth.com.au` (referrals and consult letters).

```
Monitored mailbox (e.g. fax-pathology@bjchealth.com.au)
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
        |     +-- For each PDF attachment (ONE POST PER PDF):
        |     |     |
        |     |     +-- Save PDF to temp file (C:\SMEC AI\pdf-to-hl7\)
        |     |     +-- POST /api/convert
        |     |     |     Authorization: Bearer <PAD_TOKEN>
        |     |     |     X-Source: email
        |     |     |     X-Source-Mailbox: <this mailbox's address>
        |     |     |
        |     |     +-- action = "auto_routed"   -> save hl7Content to Genie LabRslts
        |     |     +-- action = "manual_review" -> remember suggestedCategory
        |     |     +-- Delete temp file
        |     |
        |     +-- Any manual_review: apply Outlook category(s), email STAYS in inbox
        |     +-- Mark email as read
        |
        v
Genie LabRslts folder (HL7 auto-import)
        |
        v
Genie creates/matches patient record, routes to doctor's inbox
```

Emails are never moved to subfolders. Outlook categories are the review mechanism (Nicole's confirmed preference, 4 May 2026); folder-moving remains a future option if categories prove insufficient.

---

## 2. Environments

| Environment | Base URL | Notes |
|---|---|---|
| **Production (BJC AWS account)** | `https://prod.d20i409xquw7x3.amplifyapp.com` | Amplify app `d20i409xquw7x3`, branch `prod`, account 375391317635. This is what PAD targets. |
| Dev/staging (SMEC account) | `https://prod.ddv0o3k8wcjhr.amplifyapp.com` | Separate `PAD_TOKEN` — secrets are not shared across accounts. |

---

## 3. Authentication

There is **no API key and no key-management UI**. (`/settings` on the web app is a runtime ops dial — classification confidence floor — not key management.) PAD authenticates with a shared bearer token, sent on every request together with the source marker:

```
Authorization: Bearer <PAD_TOKEN>
X-Source: email
```

Both headers are required; either one missing or wrong returns `401 {"success":false,"error":"Unauthorized"}` (deliberately without revealing which check failed). Validation happens in middleware **and** in the route handler (defence in depth), and the bearer is honoured **only on `/api/convert`** — it cannot access `/api/logs`, `/api/reference-data`, or anything else.

### Where the token lives

| Location | Detail |
|---|---|
| Source of truth | `pad_token` in `infra/bjc/terraform.tfvars` (local, never committed) |
| Server side | Terraform sets it as the `PAD_TOKEN` Amplify env var; the build writes it into `.env.production` for the SSR runtime |
| PAD side | Windows Credential Manager generic credential (e.g. `BJC-PAD-Token`), created **while signed in as the unattended PAD connection user** — DPAPI encryption is per-Windows-user. The flow reads it with "Get password from Windows Credentials" and the variable is marked **sensitive** before the first run. Full trap-list: `docs/engineering/pad-bearer-token-gotchas.md`. |

The token is validated with a constant-time compare and must be ≥16 characters (the server refuses to authenticate anything if `PAD_TOKEN` is misconfigured shorter than that). Current production token is 64 hex chars.

### Rotation procedure

1. Generate: `openssl rand -hex 32`.
2. Update `pad_token` in `infra/bjc/terraform.tfvars`, run `terraform apply`.
3. **Trigger an Amplify build of the `prod` branch** — env vars are baked into `.env.production` at build time, so an apply alone does not rotate the running token.
4. On the PAD server, signed in as the connection user, update the Credential Manager entry.
5. Verify the next scheduled run succeeds (or run the health check in §4) before discarding the old token anywhere.

Between steps 3 and 4 requests using the old token will 401; for a 15-minute polling cadence that window is acceptable.

---

## 4. API Contract

### GET /api/convert — health check

Send the same two PAD headers. This doubles as a token check: 200 proves reachability **and** a valid token in one call.

```
GET /api/convert
Authorization: Bearer <PAD_TOKEN>
X-Source: email
```

```json
{ "status": "ok", "service": "PDF to HL7 Converter", "version": "1.0.0" }
```

Without valid headers: `401`.

### POST /api/convert — conversion

```
POST /api/convert
Headers:
  Authorization: Bearer <PAD_TOKEN>      (required)
  X-Source: email                        (required — marks the request as PAD-pipeline)
  X-Source-Mailbox: <mailbox address>    (strongly recommended — see §5)
Content-Type: multipart/form-data

Form fields:
  pdf               (File, required)    The PDF attachment. Max 10 MB, must be application/pdf.
  documentType      (string, optional)  "auto" (default) or one of: consent_form, referral,
                                        consult_letter, pathology_result, radiology_result,
                                        generic. (Legacy referral_letter / gp_referral are
                                        aliased to referral.) PAD should omit this — let the
                                        mailbox category constrain classification.
  autoFile          (string, optional)  "true" (default) -> OBR-25 = F (auto-file),
                                        "false" -> P (queue for review in Genie)
  carrier           (string, optional)  MSH-3 Sending Application. Default "SMECAI".
                                        NOTE (Jul 2026): PAD's Invoke web service can
                                        only attach FILES, not text form fields, so the
                                        PAD flow cannot send this — MSH-3 falls back to
                                        SMECAI. If BJC wants "EMAIL", the fix is server-
                                        side (default the carrier off X-Source: email).
                                        Same limitation applies to bjcDoctors — another
                                        reason for the env-var route in §6.
  bjcDoctors        (JSON string, opt)  Array of doctor names for addressee resolution — see §6.
  orderingProvider  (string, optional)  Medicare Provider Number for PV1-9 doctor routing.
```

### Responses — branch on `action`, never on `success`

Every conversion outcome — including extraction failure — returns **HTTP 200**. The routing decision is the `action` field:

- `action: "auto_routed"` → HL7 was produced; save it to Genie.
- `action: "manual_review"` → **no HL7**; tag the source email with `suggestedCategory` and leave it in the inbox.

Note the trap: the extraction-failure variant has `success: false` but is still `action: "manual_review"`. A flow that branches on `success` will mishandle it. Branch on `action`.

**1. Auto-routed (HL7 produced):**

```json
{
  "success": true,
  "action": "auto_routed",
  "filename": "Smith_Jane_20260721143022.hl7",
  "hl7Content": "MSH|^~\\&|EMAIL|...<full message, CR line endings>...",
  "extractedData": {
    "firstName": "Jane",
    "lastName": "Smith",
    "dob": "15/03/1985",
    "sex": "Female",
    "medicareNo": "1234567890-1",
    "sender": "Douglass Hanly Moir",
    "addressee": "Dr Irwin Lim",
    "messageType": "ORU (Result)",
    "carrier": "EMAIL"
  },
  "warnings": [],
  "extractionMethod": "vision",
  "documentType": "pathology_result",
  "classificationConfidence": 96
}
```

**2. Manual review — eligibility gate diverted the document:**

```json
{
  "success": true,
  "action": "manual_review",
  "reason": "urgent_result",
  "suggestedCategory": "Needs review — Urgent",
  "documentType": "pathology_result",
  "classificationConfidence": 97,
  "extractedData": { "firstName": "Jane", "lastName": "Smith", "...": "..." },
  "warnings": [],
  "extractionMethod": "vision"
}
```

**3. Manual review — extraction failed (note `success: false`):**

```json
{
  "success": false,
  "action": "manual_review",
  "reason": "extraction_failed",
  "suggestedCategory": "Needs review — Extraction failed",
  "error": "Could not extract patient name from this document. The name may be redacted, missing, or in an unsupported format.",
  "warnings": ["Vision extraction timed out after 30s"],
  "extractionMethod": "vision"
}
```

### Manual-review reasons

`reason` is the stable machine identifier (used in audit rows and PAD logic); `suggestedCategory` is the human label PAD applies as an Outlook category. The reason→category mapping should live in PAD config so BJC ops can rename labels/colours without a code change — `suggestedCategory` is the default.

| `reason` | `suggestedCategory` | Meaning |
|---|---|---|
| `urgent_result` | Needs review — Urgent | Document is marked urgent. **Always** diverted — urgent documents of any type are never auto-filed. |
| `low_confidence` | Needs review — Low confidence | Classification confidence below the floor set on `/settings` |
| `missing_fields` | Needs review — Missing fields | Required routing fields missing (e.g. OBR-16 addressee on a result) |
| `mailbox_mismatch` | Needs review — Wrong inbox | AI classified the doc outside the mailbox's allowed set (e.g. a referral arriving in a fax-results inbox) |
| `unknown_doc_type` | Needs review — Unknown type | Could not classify within the allowed set |
| `extraction_failed` | Needs review — Extraction failed | Vision extraction could not read the document |

### Non-200 responses

| Status | Body | Meaning |
|---|---|---|
| 400 | `{"success":false,"error":"No PDF file provided"}` — also `"File must be a PDF"`, `"File size exceeds 10MB limit"` | Validation failure. No retry. |
| 401 | `{"success":false,"error":"Unauthorized"}` | Bearer token or `X-Source` header missing/invalid. Configuration error — stop the flow. |
| 422 | manual-review-shaped body with `error` | Only when `STRICT_REQUIRED_FIELDS=true` is set server-side. **Off in BJC production** — treat as manual_review if ever seen. |
| 500 | `{"success":false,"error":"Conversion failed"}` | Server error. Retry. |

---

## 5. Mailbox → Category Mapping (`X-Source-Mailbox`)

PAD sends the monitored mailbox's full address in `X-Source-Mailbox`. The server maps it to a category that (a) constrains the document types the AI may choose from and (b) powers the `mailbox_mismatch` eligibility check:

| Mailbox | Category | Allowed document types |
|---|---|---|
| `fax-pathology@bjchealth.com.au` | results | `pathology_result`, `radiology_result` |
| `fax-radiology@bjchealth.com.au` | results | `pathology_result`, `radiology_result` |
| `fax-vascular@bjchealth.com.au` | results | `pathology_result`, `radiology_result` |
| `admin@bjchealth.com.au` | letters | `referral`, `consult_letter` |
| *(missing / unrecognised)* | none | all six types — free classification, no mailbox gate |

An unknown mailbox address is safe (falls back to free classification) but forfeits the misroute protection. The mapping is deliberately in code (`MAILBOX_CATEGORIES` in `lib/conversion-config.ts`) so adding a new GoFax inbox is a one-line, code-reviewed change followed by a deploy — tell SMEC AI before pointing PAD at a new mailbox.

---

## 6. Doctor List for Addressee Resolution — decide before go-live

The AI resolves the addressee ("Dear Rheumatologist", "Reported to: Dr I Lim") against a list of BJC doctors. On the PAD path the server looks for that list in this order:

1. `bjcDoctors` form field (JSON array of names) sent with the request
2. `BJC_DOCTORS` env var on the Amplify app (comma-separated names)
3. Nothing — addressee resolution runs without a BJC list (weaker matching)

**Current state: neither is configured for the PAD path.** The web UI sends its own list, and the doctor reference data in DynamoDB (`/reference` page) is *not* read by the conversion endpoint. Two options:

- **Recommended:** set `BJC_DOCTORS` in `infra/bjc/main.tf` (one source of truth, roster changes need no PAD redeploy — just `terraform apply` + an Amplify build).
- Alternative: maintain a `DoctorListJson` flow variable in PAD and send it as `bjcDoctors` on every POST.

The default roster used by the web UI is `DEFAULT_BJC_DOCTORS` in `lib/conversion-config.ts` — use it as the starting list. The old `/api/doctors` endpoint described in the previous version of this guide does not exist; PAD cannot fetch a list at runtime.

---

## 7. PAD Workflow Design

Robin pseudocode for the full flow. Same service account, Task Scheduler setup, and conventions as the existing PDF-to-Directory flow. See `docs/engineering/pad-bearer-token-gotchas.md` for the exact `Invoke web service` action shape (multipart toggle, custom-header syntax, 90 s timeout, sensitive variables).

```robin
# ─────────────────────────────────────────────────────────────────────
# PDF-to-HL7 Automation
# Monitors a mailbox for document PDFs, converts via SMEC AI cloud
# service, saves HL7 to Genie import folder OR tags the email for
# manual review. Emails never leave the inbox.
# ─────────────────────────────────────────────────────────────────────

# ── Flow Variables ──────────────────────────────────────────────────
SET BaseUrl TO 'https://prod.d20i409xquw7x3.amplifyapp.com'
SET MailboxAddress TO 'fax-pathology@bjchealth.com.au'   # this flow's mailbox
SET GenieLabRsltsFolder TO '\\\\server\\path\\LabRslts'
SET TempFolder TO 'C:\\SMEC AI\\pdf-to-hl7'
SET NotifyRecipient TO 'amy.johnson@bjchealth.com.au'
SET MaxRetries TO 2
SET RetryDelaySeconds TO 10

# ── Phase 0: Token ─────────────────────────────────────────────────
# Credential created on this server as the unattended connection user.
Credentials.GetPasswordFromWindowsCredentials TargetName: 'BJC-PAD-Token' \
    Password => PadTokenRaw
Text.Trim Text: PadTokenRaw TrimOption: BothSides TrimmedText => PadToken
# Mark PadTokenRaw + PadToken SENSITIVE in the Variables pane before first run.

SET PadHeaders TO 'Authorization: Bearer %PadToken%
X-Source: email
X-Source-Mailbox: %MailboxAddress%'

# ── Phase 1: Startup Cleanup ───────────────────────────────────────
IF Folder.Exists(TempFolder) THEN
    Folder.GetFiles TempFolder, '*.pdf', Files
    LOOP FOREACH File IN Files
        File.Delete File
    END
ELSE
    Folder.Create TempFolder
END

# ── Phase 2: Health + Token Check ──────────────────────────────────
# GET with the PAD headers verifies reachability AND token validity.
WebService.InvokeWebService \
    Url: '%BaseUrl%/api/convert' \
    Method: 'GET' \
    CustomHeaders: PadHeaders \
    Timeout: 15 \
    StatusCode => HealthStatus

IF HealthStatus = 401 THEN
    Email.Send To: NotifyRecipient \
        Subject: 'URGENT: PDF-to-HL7 token rejected' \
        Body: 'The automation bearer token was rejected (401). Processing stopped. Contact SMEC AI.'
    EXIT
END
IF HealthStatus <> 200 THEN
    EXIT   # Service unreachable -- try again next scheduled run
END

# ── Phase 3: Retrieve Emails ──────────────────────────────────────
Outlook.RetrieveEmails \
    Account: MailboxAddress \
    Folder: 'Inbox' \
    Filter: 'Unread' \
    Attachments: 'Save' \
    Top: 10 \
    Emails => Emails

# ── Phase 4: Process Each Email ───────────────────────────────────
LOOP FOREACH Email IN Emails
    SET ReviewCategories TO []     # Outlook categories to apply to this email
    SET FailureLines TO ''

    LOOP FOREACH Attachment IN Email.Attachments
        IF NOT Text.EndsWith(Attachment.Name, '.pdf', IgnoreCase: True) THEN
            NEXT LOOP              # Skip images, signatures, .docx etc.
        END

        SET TempFile TO '%TempFolder%\\%Attachment.Name%'
        File.WriteBytes TempFile, Attachment.Content

        SET RetryCount TO 0
        SET Settled TO False

        LOOP WHILE RetryCount <= MaxRetries AND NOT Settled
            BEGIN EXCEPTION HANDLING
                # One POST per PDF. Timeout 90 s (Bedrock vision variance).
                # Upload attachments toggle ON; do NOT set Content-Type manually.
                # Attachments can only carry FILES (no text form fields --
                # see the carrier note in §4), so the pdf is the only part.
                WebService.InvokeWebService \
                    Url: '%BaseUrl%/api/convert' \
                    Method: 'POST' \
                    CustomHeaders: PadHeaders \
                    Attachments: \
                        pdf=@%TempFile% \
                    Timeout: 90 \
                    Response => ConvertResponse \
                    StatusCode => ConvertStatus

                SET ResponseJson TO Json.Parse(ConvertResponse)

                IF ConvertStatus = 200 AND ResponseJson.action = 'auto_routed' THEN
                    File.WriteText '%GenieLabRsltsFolder%\\%ResponseJson.filename%', \
                        ResponseJson.hl7Content, Encoding: 'ASCII'
                    SET Settled TO True

                ELSE IF ConvertStatus = 200 AND ResponseJson.action = 'manual_review' THEN
                    # No HL7. Tag email; it stays in the inbox for staff.
                    List.Add ReviewCategories, ResponseJson.suggestedCategory
                    SET FailureLines TO '%FailureLines%\n- %Attachment.Name%: %ResponseJson.reason%'
                    SET Settled TO True

                ELSE IF ConvertStatus = 400 OR ConvertStatus = 422 THEN
                    # Validation / strict-mode failure -- no retry
                    List.Add ReviewCategories, 'Needs review — Invalid file'
                    SET FailureLines TO '%FailureLines%\n- %Attachment.Name%: %ResponseJson.error%'
                    SET Settled TO True

                ELSE IF ConvertStatus = 401 THEN
                    # Token rejected mid-run: configuration error, stop everything
                    Email.Send To: NotifyRecipient \
                        Subject: 'URGENT: PDF-to-HL7 token rejected' \
                        Body: 'Bearer token rejected during processing. Flow stopped. Contact SMEC AI.'
                    File.Delete TempFile
                    EXIT

                ELSE
                    # 500 / unexpected -- retry
                    SET RetryCount TO RetryCount + 1
                    IF RetryCount <= MaxRetries THEN
                        Wait RetryDelaySeconds
                    ELSE
                        List.Add ReviewCategories, 'Needs review — Service error'
                        SET FailureLines TO '%FailureLines%\n- %Attachment.Name%: HTTP %ConvertStatus% after retries'
                        SET Settled TO True
                    END
                END

            ON EXCEPTION
                # Network timeout / connection error -- retry
                SET RetryCount TO RetryCount + 1
                IF RetryCount <= MaxRetries THEN
                    Wait RetryDelaySeconds
                ELSE
                    List.Add ReviewCategories, 'Needs review — Service error'
                    SET FailureLines TO '%FailureLines%\n- %Attachment.Name%: connection failed after retries'
                    SET Settled TO True
                END
            END
        END  # Retry loop

        File.Delete TempFile
    END  # Attachment loop

    # ── Tag + finish. The email NEVER leaves the inbox. ───────────
    IF List.Count(ReviewCategories) > 0 THEN
        Outlook.ApplyCategories Email, List.Distinct(ReviewCategories)
        Email.Send To: NotifyRecipient \
            Subject: 'PDF-to-HL7: document(s) need review' \
            Body: 'Email tagged for manual review:\n\nFrom: %Email.From%\nSubject: %Email.Subject%\nMailbox: %MailboxAddress%\n%FailureLines%\n\nThe email remains in the inbox with a review category applied.'
    END

    Outlook.MarkAsRead Email
END  # Email loop
```

Design notes:

- **One flow (or one loop iteration set) per mailbox** — `X-Source-Mailbox` must match the mailbox actually being polled, since it drives classification constraints.
- **Multi-attachment emails**: `/api/convert` accepts one PDF per POST; PAD splits and posts each attachment separately (confirmed design).
- **Mark-as-read is the "processed" marker.** Unread = not yet processed; read + no category = auto-filed; read + category = needs human review.
- The two PAD-side category labels (`Needs review — Invalid file`, `Needs review — Service error`) are local conventions for failures the API can't label; BJC ops may rename them alongside the server-suggested ones.

---

## 8. Error Handling Decision Matrix

| Condition | Detect via | Action | Retry? | Notify? |
|---|---|---|---|---|
| Auto-routed | 200 + `action=auto_routed` | Save HL7 to LabRslts | No | No |
| Manual review (any `reason`, incl. urgent) | 200 + `action=manual_review` | Apply `suggestedCategory`, leave in inbox | No | Yes |
| Invalid file | 400 (or 422 strict mode) | Apply "Invalid file" category | No | Yes |
| Token rejected | 401 | **Stop entire flow** | No | Yes — URGENT |
| Server error | 500 | Retry 2× (10 s apart), then "Service error" category | Yes | Yes (after retries) |
| Timeout / connection refused | exception (90 s budget) | Same as server error | Yes | Yes (after retries) |

---

## 9. HL7 File Handling

### Saving the HL7 file

`hl7Content` is the complete HL7 message — save it verbatim, no parsing or modification.

| Property | Value |
|---|---|
| Filename | Use `filename` from the response (e.g. `Smith_Jane_20260721143022.hl7`) |
| Encoding | ASCII (message declares 8859/1 in MSH-18; ASCII-compatible) |
| Line endings | CR only (`\r`) — already correct in `hl7Content`; do not re-terminate |
| Destination | Genie LabRslts import folder (UNC path from Medihost) |

### How Genie imports

Genie polls LabRslts and auto-imports `.hl7` files: reads MSH for message type, PID to match/create the patient, PRD (REF messages) for sender/addressee routing, extracts the embedded PDF from OBX, then deletes the file.

### Inbox routing (OBR-24)

The service sets OBR-24 automatically from the document type — this is what puts each document in the right Genie inbox:

| Document type | Message type | OBR-24 | Genie inbox |
|---|---|---|---|
| `referral`, `consult_letter` | REF^I12 | `PHY` | Incoming Letters |
| `pathology_result` | ORU^R01 | `LAB` | Pathology |
| `radiology_result` | ORU^R01 | `RAD` | Radiology |
| `consent_form`, `generic` | ORU^R01 | *(empty)* | Genie default routing |

### Important: Genie REF modifier

Genie requires the **REF modifier** to be enabled to handle REF^I12 messages. Without it, referrals land in Pathology/Radiology instead of Incoming Letters. Medihost must confirm this is enabled before Phase 2 (letters) go-live.

---

## 10. Task Scheduler Configuration

Identical in structure to the existing PDF-to-Directory task.

| Setting | Value |
|---|---|
| Task name | `BJC PDF-to-HL7` |
| Program | `C:\Program Files (x86)\Power Automate Desktop\PAD.Console.Host.exe` |
| Arguments | `/flow "<flow-name>" /run` |
| Run as | `BJC\medihost` (same account as the existing "SMEC AI Power Automate" PDF-to-Directory task; also owns the `BJC-PAD-Token` Credential Manager entry) |
| Run only when user is logged on | Yes — matches the existing task. PAD desktop flows need the interactive session, so the `medihost` session stays signed in on the server (disconnect the RDP session, don't log off). |
| Run with highest privileges | Yes (matches the existing task) |
| Do not start new instance if running | Yes |

**Trigger 1 — scheduled:** Daily, repeat every 15 minutes for 12 hours from 7:00 AM, Monday–Friday, stop if running longer than 30 minutes.

**Trigger 2 — at startup (crash recovery):** 5-minute delay, so network and Outlook initialise first. Combined with mark-as-read semantics, this catches up on anything unprocessed after a restart. Because the task is "run only when user is logged on", after a server reboot nothing fires until `medihost` signs back in — include that sign-in in the restart runbook (same constraint as the existing PDF-to-Directory task).

**Registry fix (required):** same as PDF-to-Directory —

```
HKCU\Software\Microsoft\Power Automate Desktop
  DisableExternalFlowConfirmationDialog = 1 (DWORD)
```

---

## 11. Server Requirements (for Medihost)

Same Windows machine already running PAD and PDF-to-Directory.

| Requirement | Detail | Status |
|---|---|---|
| **Server capacity** | Runs alongside PDF-to-Directory; heavy processing is in the cloud | Confirm |
| **Genie LabRslts folder access** | `BJC\medihost` needs read/write; provide the full UNC path | Provide path |
| **Internet access** | Outbound HTTPS (443) to `*.amplifyapp.com` only; no inbound, no VPN | Confirm |
| **Mailbox access** | Service account needs full access to each monitored mailbox (Phase 1: the three GoFax fax inboxes) | Verify |
| **Outlook categories** | Create the review categories in each monitored mailbox (see §4 table plus `Needs review — Invalid file` / `Needs review — Service error`); pick colours with BJC ops | Create |
| **Genie REF modifier** | Required before Phase 2 (letters) go-live | Confirm / Enable |
| **Local temp folder** | `C:\SMEC AI\pdf-to-hl7\` — created automatically by the flow | Verify no restrictions |

No `Inbox/Review` or `Inbox/Linked` subfolders are needed — the previous version of this guide predates the tag-in-place design.

---

## 12. Flow Variables

| Variable | Example value | Notes |
|---|---|---|
| `BaseUrl` | `https://prod.d20i409xquw7x3.amplifyapp.com` | BJC production app |
| `MailboxAddress` | `fax-pathology@bjchealth.com.au` | Also sent as `X-Source-Mailbox` — must match the polled mailbox |
| `PadToken` | *(from Credential Manager at runtime)* | Never hardcoded in the flow; marked sensitive |
| `GenieLabRsltsFolder` | `\\192.168.47.10\PracticeData\LabRslts` | From Medihost (TBD) |
| `TempFolder` | `C:\SMEC AI\pdf-to-hl7` | Local temp directory |
| `NotifyRecipient` | `amy.johnson@bjchealth.com.au` | Failure notifications |
| ~~`Carrier`~~ | — | Dropped: PAD cannot send text form fields (§4 note); MSH-3 defaults to `SMECAI` server-side |
| `MaxRetries` | `2` | For 5xx / connection errors only |
| `RetryDelaySeconds` | `10` | Delay between retries |

Values still to be filled in: `GenieLabRsltsFolder` (Medihost), `NotifyRecipient` (BJC), the Credential Manager entry (Sean provides the token from `infra/bjc/terraform.tfvars`), and the doctor-list decision from §6.

---

## 13. Testing Checklist

### API connectivity (from the BJC server, PowerShell/curl)

```bash
# Health + token check in one call (expect 200 {"status":"ok",...})
curl -H "Authorization: Bearer <PAD_TOKEN>" -H "X-Source: email" \
  https://prod.d20i409xquw7x3.amplifyapp.com/api/convert

# No headers -> expect 401 (proves the gate is on)
curl -i https://prod.d20i409xquw7x3.amplifyapp.com/api/convert

# Convert a test PDF as the pipeline would
curl -X POST \
  -H "Authorization: Bearer <PAD_TOKEN>" \
  -H "X-Source: email" \
  -H "X-Source-Mailbox: fax-pathology@bjchealth.com.au" \
  -F "pdf=@test-result.pdf" \
  https://prod.d20i409xquw7x3.amplifyapp.com/api/convert
```

### End-to-end (from PAD)

- [ ] Health check returns 200 with the flow's headers; 401 triggers the urgent-stop path
- [ ] Auto-routed result saves `.hl7` to LabRslts with the response filename, ASCII + CR endings
- [ ] Genie imports the file, matches/creates the patient, routes to the correct inbox per OBR-24
- [ ] PDF is attached to the patient record in Genie
- [ ] `manual_review` response: **no** file written, correct Outlook category applied, email still in inbox, marked read, notification sent
- [ ] Urgent fixture (see `docs/test-pdfs/urgent/`) → `reason: urgent_result`, never auto-filed
- [ ] Referral PDF sent with `X-Source-Mailbox: fax-pathology@...` → `reason: mailbox_mismatch`
- [ ] Redacted/unreadable PDF → `reason: extraction_failed` (response has `success: false` — confirm the flow still branches on `action`)
- [ ] Non-PDF attachments are skipped without error; multi-PDF emails produce one POST each
- [ ] Oversize (>10 MB) PDF → 400 → "Invalid file" category, no retry loop
- [ ] Retry works: kill connectivity mid-run, flow retries then applies "Service error" category
- [ ] Crash recovery: restart server, Task Scheduler fires within 5 minutes, unread emails are picked up
- [ ] Temp folder is cleaned of leftover PDFs on next startup
- [ ] Bearer token does not appear in PAD logs (`%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Logs`) — sensitive marking verified

### Genie verification

- [ ] ORU^R01 pathology/radiology results land in Pathology / Radiology respectively
- [ ] REF^I12 (Phase 2) routes to Incoming Letters — REF modifier confirmed
- [ ] Patient matching works for existing patients (name + DOB + Medicare); new patient created when no match
- [ ] Addressee/provider routing puts the document in the correct doctor's inbox (requires §6 resolved)

---

## Appendix: Licensing

Same licence requirements as the existing PDF-to-Directory flow. No additional licences needed.

| Component | Licence | Already in place |
|---|---|---|
| Power Automate Desktop | Free with Windows | Yes |
| Power Automate Premium | Required (in place for the existing flow's account, `PAuto@bjchealth.com.au`) | Yes |
| AI Builder | Not required | N/A |
| Outlook connection | Office 365 connector | Yes (new connections needed per monitored mailbox) |

---

*Prepared by SMEC AI | March 2026, rewritten July 2026 to match the shipped API*
