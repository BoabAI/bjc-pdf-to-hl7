# PAD Integration Guide: PDF-to-HL7

Technical reference for building the Power Automate Desktop flow that connects the BJC Health monitored mailboxes to the SMEC AI conversion service. Also covers server setup requirements for Medihost.

> **Rewritten July 2026.** The March 2026 version of this guide described an `X-API-Key` / dashboard-managed-key design that was never built, plus `/api/health` and `/api/doctors` endpoints that do not exist. This version matches the shipped API: shared bearer token auth, the `auto_routed` / `manual_review` response contract, and the BJC-account production URL. The authoritative wire contract lives in code at `lib/contracts/convert.ts`; PAD-side header/credential traps are covered in `docs/engineering/pad-bearer-token-gotchas.md` — read that before editing the flow.

---

## Rollout Status — as of 22 Jul 2026

Build is underway on the BJC server (MHS-SYD-APP47). Update this table as items complete.

**Done:**

| Item | Detail | Date |
|---|---|---|
| ✅ Guide rewritten to shipped API | This document (PR #10) | 21 Jul 2026 |
| ✅ Production reachable + token verified from BJC server | `curl` from MHS-SYD-APP47: 200 with bearer + `X-Source`, 401 without — proves token, TLS trust, and outbound 443 | 21 Jul 2026 |
| ✅ Token in Credential Manager | `BJC-PAD-Token` created via `cmdkey` as `BJC\medihost` (matches the account the scheduled task runs as) | 21 Jul 2026 |
| ✅ Run-as facts verified | Existing "SMEC AI Power Automate" task: `BJC\medihost`, "run only when user is logged on", highest privileges (§10 updated to match) | 21 Jul 2026 |
| ✅ Setup requests sent to Medihost + BJC | Initial email to Amol + Nicole (assumed the since-superseded three-mailbox / categories design) | 21 Jul 2026 |
| ✅ Pilot design agreed with BJC (Nicole) | Pilot mailbox = `gofax.par@bjchealth.com.au` polling subfolder "Inbox/HL7 Testing" (folder created by Nicole); **no mailbox restrictions** (mixed line, ~95% results); **PD@-style folder moves replace Outlook categories**; local processed-ID log replaces mark-as-read. See §1/§5/§7. | 22 Jul 2026 |
| ✅ PAuto Full Access to `gofax.par@bjchealth.com.au` | Granted — Amol: "permissions have been given already". Verify on first PAD poll of the mailbox. | 22 Jul 2026 |
| ✅ Genie LabRslts UNC path confirmed | `\\192.168.47.20\Labrslts` (Amol). Note it's a different server to the PD@ scans share (`\\192.168.47.10`). Verify with a test write from MHS-SYD-APP47 as `BJC\medihost`. | 22 Jul 2026 |

**Pending:**

| Item | Owner |
|---|---|
| ⬜ "Linked" subfolder created under "HL7 Testing" (mailbox access granted 22 Jul — ready to create) | Sean / Nicole |
| ✅ Doctor-list decision (§6) — server reads the DynamoDB roster automatically (Aug 2026); keep `/reference` names in Genie format | Sean + Nicole |
| ⬜ Carrier decision — PAD cannot send the `carrier` form field (see §4 note), so MSH-3 defaults to `SMECAI`; server-side change needed if BJC wants `EMAIL` | Sean + BJC |
| ✅ Build the PAD flow (§7) — live since 28 Jul 2026 (see incident history below and in `docs/operations/bjc-pdf-to-directory.md`) | Sean |
| ✅ Task Scheduler task (§10) — live; schedule corrected 3 Aug 2026 to fix contention with PD@ | Sean |
| ⬜ Testing checklist (§13) — dedupe fix verified 31 Jul 2026; full checklist not yet re-run end-to-end since | Sean |
| ⬜ Genie REF modifier confirmed — now a **pilot** gate, not just Phase 2: the mixed fax line carries referrals (§9) | Medihost |
| ⬜ Weekly PAD restart task (§14) — script + Task XML in `scripts/pad-server/`; install on MHS-SYD-APP47 | Sean / Medihost |

---

## 1. Overview

The automation polls a mail folder for fax emails, sends each PDF attachment to the SMEC AI cloud service for AI-powered extraction, and — when the service auto-routes the document — saves the resulting HL7 file to the Genie import folder and **moves the email to a "Linked" subfolder** (mirroring the existing PD@ consent-form flow). Anything the service won't auto-file **stays in the inbox exactly as it arrived** — unread, unflagged, uncategorised — for the team's normal process. Review reasons (including a red **Urgent** badge) are visible per document on the dashboard.

**Operating principle (Sean + Nicole, May 2026): a misroute is worse than no action.** Documents the service is not confident about are never filed to Genie; they stay in the inbox for a human. Target is ≥60% auto-routed, the rest reviewed by staff.

**Rollout phases (revised 22 Jul 2026 — BJC's real fax accounts are per-location GoFax mailboxes, not the per-modality addresses assumed earlier):**

- **Pilot (current)** — `gofax.par@bjchealth.com.au` (Parramatta, highest volume), polling the subfolder **`Inbox/HL7 Testing`**; Nicole moves a sample of live faxes into it.
- **Live Phase 1** — same mailbox, polled folder flips to `Inbox`; then extend to the other GoFax location mailboxes (each needs PAuto access and a flow entry; optionally a `MAILBOX_CATEGORIES` mapping — see §5).
- **Phase 2** — `admin@bjchealth.com.au` (referrals and consult letters).

```
gofax.par@bjchealth.com.au — polled folder: Inbox/HL7 Testing (pilot) -> Inbox (live)
        |
        v
Windows Task Scheduler (every 15 min, business hours)
        |
        v
Power Automate Desktop (PAD)
        |
        +-- Retrieve emails with attachments (top 25, read AND unread)
        +-- Skip emails whose ID is in the local processed log
        |
        +-- For each remaining email:
        |     |
        |     +-- For each PDF attachment (ONE POST PER PDF):
        |     |     |
        |     |     +-- Save PDF to temp file (C:\SMEC AI\pdf-to-hl7\)
        |     |     +-- POST /api/convert
        |     |     |     Authorization: Bearer <PAD_TOKEN>
        |     |     |     X-Source: email
        |     |     |     X-Source-Mailbox: gofax.par@bjchealth.com.au
        |     |     |
        |     |     +-- action = "auto_routed"   -> save hl7Content to Genie LabRslts
        |     |     +-- action = "manual_review" -> nothing (email untouched)
        |     |     +-- Delete temp file
        |     |
        |     +-- ALL PDFs filed -> move email to the Linked subfolder
        |     +-- otherwise      -> email stays in the inbox as it arrived
        |     +-- Append email ID to processed log (skipped on service errors,
        |         so transient outages retry next run)
        |
        v
Genie LabRslts folder (HL7 auto-import)
        |
        v
Genie creates/matches patient record, routes to doctor's inbox
```

**Email handling (Nicole, 22 Jul 2026):** mirrors the PD@ flow — filed emails move to `Linked`; everything else stays in the inbox untouched. **No Outlook categories, no read/unread changes, no per-document notification emails** — the dashboard is the visibility layer. This supersedes the May 2026 tag-in-place/categories design described in earlier versions of this guide.

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

- `action: "auto_routed"` → HL7 was produced; save it to Genie (and count towards moving the email to `Linked`).
- `action: "manual_review"` → **no HL7**; PAD leaves the source email in the inbox untouched (`suggestedCategory` is informational only — see §7).

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

`reason` is the stable machine identifier (used in audit rows and PAD logic). `suggestedCategory` is a human label the server still returns for back-compat and dashboard display, but **the pilot design applies no Outlook categories** (Nicole, 22 Jul 2026) — reasons surface on the dashboard instead, where each row shows the routing decision, reason badge (urgent = red), received time, and patient initials.

| `reason` | `suggestedCategory` (informational) | Meaning |
|---|---|---|
| `urgent_result` | Needs review — Urgent | Document is marked urgent. **Always** diverted — urgent documents of any type are never auto-filed. |
| `low_confidence` | Needs review — Low confidence | Classification confidence below the floor set on `/settings` |
| `missing_fields` | Needs review — Missing fields | Required routing fields missing (e.g. OBR-16 addressee on a result) |
| `mailbox_mismatch` | Needs review — Wrong inbox | AI classified the doc outside the mailbox's allowed set. Cannot trigger for the unmapped pilot mailbox (§5). |
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

PAD sends the polled mailbox's full address in `X-Source-Mailbox`. If the server has a mapping for that address, it (a) constrains the document types the AI may choose from and (b) powers the `mailbox_mismatch` eligibility check.

**The pilot mailbox is deliberately unmapped.** `gofax.par@bjchealth.com.au` is a mixed line — ~95% pathology/radiology results, plus correspondence and referrals — and Nicole asked for no content restrictions (22 Jul 2026). An unmapped address resolves to category `none`: free classification across all six document types, no mailbox gate. The safety gates that remain (urgent, low-confidence, missing-fields, extraction-failed) are mailbox-independent and unaffected.

| Mailbox | Category | Effect |
|---|---|---|
| `gofax.par@bjchealth.com.au` *(pilot)* | *(unmapped)* → none | Free classification — **deliberate**, per Nicole |
| `admin@bjchealth.com.au` | letters | Phase 2: constrains to `referral` / `consult_letter` |
| `fax-pathology@` / `fax-radiology@` / `fax-vascular@bjchealth.com.au` | results | **Relics.** These per-modality addresses came from the superseded design and never existed in BJC's tenant. Inert (nothing sends them); slated for cleanup. |
| *(anything else)* | none | Free classification, no mailbox gate |

BJC's real fax accounts are per-location GoFax mailboxes. When rollout extends to another one, decide per mailbox: leave it unmapped (free classification, like the pilot) or add a `MAILBOX_CATEGORIES` entry (`lib/conversion-config.ts`) to constrain it and enable the misroute gate — a one-line, code-reviewed change plus a deploy. Tell SMEC AI before pointing PAD at a new mailbox either way.

---

## 6. Doctor List for Addressee Resolution — resolved (Aug 2026)

The AI resolves the addressee ("Dear Rheumatologist", "Reported to: Dr I Lim") against a list of BJC doctors. The server resolves that list in this order:

1. `bjcDoctors` form field (JSON array of names) sent with the request
2. `BJC_DOCTORS` env var on the Amplify app (comma-separated names) — legacy override, unset in production
3. **The DynamoDB doctor reference data** (managed on the `/reference` page) — this is what the PAD path uses, since PAD sends only the PDF
4. `DEFAULT_BJC_DOCTORS` in `lib/conversion-config.ts` (only if DynamoDB is unreachable)

PAD needs no configuration: the conversion endpoint reads the roster server-side on every request, so roster changes made on `/reference` take effect immediately with no PAD change, redeploy, or `terraform apply`.

**The roster names must be the exact Genie address-book strings** ("Dr I Lim", not "Dr Irwin Lim") — the imported addressee is matched by Genie as a plain string, and the converter snaps extracted names (e.g. "Dr Irwin Geok San Lim" from a letterhead) onto the roster entry. A BJC doctor found on a CC line is promoted over an external primary recipient. The old `/api/doctors` endpoint described in the previous version of this guide does not exist; PAD cannot and need not fetch a list at runtime.

---

## 7. PAD Workflow Design

Robin pseudocode for the full flow. Same service account, Task Scheduler setup, and conventions as the existing PDF-to-Directory flow — including its Linked-folder move on success. See `docs/engineering/pad-bearer-token-gotchas.md` for the exact `Invoke web service` action shape (multipart toggle, custom-header syntax, 90 s timeout, sensitive variables).

```robin
# ─────────────────────────────────────────────────────────────────────
# PDF-to-HL7 Automation (pilot: gofax.par@bjchealth.com.au)
# Polls a mail folder for fax PDFs, converts via SMEC AI cloud service,
# saves HL7 to the Genie import folder, and moves fully-filed emails to
# the "Linked" subfolder. Everything else stays in the inbox untouched;
# a local processed-ID log prevents re-processing.
# ─────────────────────────────────────────────────────────────────────

# ── Flow Variables ──────────────────────────────────────────────────
SET BaseUrl TO 'https://prod.d20i409xquw7x3.amplifyapp.com'
SET MailboxAddress TO 'gofax.par@bjchealth.com.au'
SET MailFolder TO 'Inbox/HL7 Testing'      # pilot; switch to 'Inbox' at go-live
SET LinkedFolder TO '%MailFolder%/Linked'  # successes move here (mirrors PD@)
SET GenieLabRsltsFolder TO '\\\\192.168.47.20\\Labrslts'
SET TempFolder TO 'C:\\SMEC AI\\pdf-to-hl7'
SET ProcessedLog TO '%TempFolder%\\processed.log'
SET NotifyRecipient TO 'amy.johnson@bjchealth.com.au'   # 401 alerts only
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

# ── Phase 1: Startup Housekeeping ──────────────────────────────────
# Delete temp PDFs left by a crashed run; ensure the processed log
# exists and prune entries older than 30 days.
# Log format: one line per assessed email -> 'yyyy-MM-dd <message-id>'
Folder.Create TempFolder                     # no-op if it exists
Folder.GetFiles TempFolder, '*.pdf', LeftoverPdfs
LOOP FOREACH File IN LeftoverPdfs
    File.Delete File
END
IF NOT File.Exists(ProcessedLog) THEN
    File.WriteText ProcessedLog, ''
END
# (prune: rewrite ProcessedLog keeping only lines dated within 30 days)

# ── Phase 2: Health + Token Check ──────────────────────────────────
# GET with the PAD headers verifies reachability AND token validity.
WebService.InvokeWebService \
    Url: '%BaseUrl%/api/convert' Method: 'GET' \
    CustomHeaders: PadHeaders Timeout: 15 \
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
# ALL emails with attachments, read or unread -- the automation never
# changes read state. The processed log is the dedupe mechanism.
Outlook.RetrieveEmails \
    Account: MailboxAddress \
    Folder: MailFolder \
    Filter: 'All, with attachments' \
    Top: 25 \
    Emails => Emails

File.ReadText ProcessedLog => ProcessedIds

# ── Phase 4: Process Each Email ───────────────────────────────────
LOOP FOREACH Email IN Emails
    IF Contains(ProcessedIds, Email.Id) THEN
        NEXT LOOP                  # Already assessed on a previous run
    END

    SET PdfCount TO 0
    SET FiledCount TO 0
    SET HadServiceError TO False

    LOOP FOREACH Attachment IN Email.Attachments
        IF NOT Text.EndsWith(Attachment.Name, '.pdf', IgnoreCase: True) THEN
            NEXT LOOP              # Skip images, signatures, .docx etc.
        END
        SET PdfCount TO PdfCount + 1

        # Fixed temp name is fine: the audit log's "File Hash" column is a
        # hash of the PDF bytes, not the filename (see /help/file-hash).
        SET TempFile TO '%TempFolder%\\temp.pdf'
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
                    Url: '%BaseUrl%/api/convert' Method: 'POST' \
                    CustomHeaders: PadHeaders \
                    Attachments: pdf=@%TempFile% \
                    Timeout: 90 \
                    Response => ConvertResponse StatusCode => ConvertStatus

                SET ResponseJson TO Json.Parse(ConvertResponse)

                IF ConvertStatus = 200 AND ResponseJson.action = 'auto_routed' THEN
                    File.WriteText '%GenieLabRsltsFolder%\\%ResponseJson.filename%', \
                        ResponseJson.hl7Content, Encoding: 'ASCII'
                    SET FiledCount TO FiledCount + 1
                    SET Settled TO True

                ELSE IF ConvertStatus = 200 AND ResponseJson.action = 'manual_review' THEN
                    # No HL7. Do NOTHING to the email -- the team works the
                    # inbox; reasons (incl. urgent) are on the dashboard.
                    SET Settled TO True

                ELSE IF ConvertStatus = 400 OR ConvertStatus = 422 THEN
                    SET Settled TO True    # Invalid file -- leave for the team

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
                        SET HadServiceError TO True
                        SET Settled TO True
                    END
                END

            ON EXCEPTION
                # Network timeout / connection error -- retry
                SET RetryCount TO RetryCount + 1
                IF RetryCount <= MaxRetries THEN
                    Wait RetryDelaySeconds
                ELSE
                    SET HadServiceError TO True
                    SET Settled TO True
                END
            END
        END  # Retry loop

        File.Delete TempFile
    END  # Attachment loop

    # ── Outcome ───────────────────────────────────────────────────
    # Fully filed -> move to Linked (mirrors PD@). Anything else stays
    # in the inbox exactly as it arrived: unread, unflagged, untagged.
    IF PdfCount > 0 AND FiledCount = PdfCount THEN
        Outlook.MoveEmail Email, LinkedFolder
    END

    # Log as assessed UNLESS a service error occurred -- service-error
    # emails stay unlogged so the next run retries them (failed requests
    # never reached Bedrock, so retrying costs nothing).
    IF NOT HadServiceError THEN
        File.AppendText ProcessedLog, '%CurrentDate% %Email.Id%'
    END
END  # Email loop
```

Design notes:

- **PD@-mirror decision (Nicole, 22 Jul 2026):** filed → `Linked`; everything else stays in the inbox untouched. No categories, no read-state changes, no per-document notification emails — the dashboard (red **Urgent** badge, reason per row, patient initials, received time) is the visibility layer.
- **The processed-ID log is the dedupe mechanism.** Without it, every email left in the inbox would be re-sent to Bedrock each 15-minute run (~48 calls/day per lingering fax) and would write duplicate dashboard rows. The log lives on the server; if it's ever lost, each leftover email gets one extra assessment and the log rebuilds — self-healing. Graph message IDs change when an email is manually moved between folders, so an email dragged out of the inbox and back gets one re-assessment; harmless.
- **Service errors are deliberately NOT logged as processed** — a transient outage or timeout leaves the email eligible for retry next run. Failed requests don't reach Bedrock, so this retry loop is free. Only a 200 (either action) or a 400/422 marks the email assessed.
- **Multi-attachment emails**: one POST per PDF; the email moves to `Linked` only when **every** PDF auto-filed. A partial success stays in the inbox (the filed PDFs are already in Genie — the dashboard shows which). GoFax emails normally carry exactly one PDF, so this is a rare edge.
- **One flow (or one loop iteration set) per mailbox** — `X-Source-Mailbox` must match the mailbox actually being polled. For the pilot it resolves to free classification server-side (§5) but is still recorded in the audit log.

---

## 8. Error Handling Decision Matrix

| Condition | Detect via | Action | Retry? | Log as processed? |
|---|---|---|---|---|
| Auto-routed (all PDFs in email) | 200 + `action=auto_routed` | Save HL7 to LabRslts; move email to `Linked` | No | Yes |
| Manual review (any `reason`, incl. urgent) | 200 + `action=manual_review` | **Nothing** — email stays in inbox untouched; reason visible on dashboard | No | Yes |
| Invalid file | 400 (or 422 strict mode) | Nothing — email stays in inbox for the team | No | Yes |
| Token rejected | 401 | **Stop entire flow** + URGENT email to `NotifyRecipient` | No | No |
| Server error | 500 | Retry 2× (10 s apart), then leave in inbox | Yes | **No — retried next run** |
| Timeout / connection refused | exception (90 s budget) | Same as server error | Yes | **No — retried next run** |

A full-service outage is silent by design (no notification spam): nothing moves to `Linked`, the health check exits early, and PAD run history shows the skips. If BJC wants an alert after N consecutive unreachable runs, add a counter file next to the processed log — noted as a possible follow-up, not built.

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

Genie requires the **REF modifier** to be enabled to handle REF^I12 messages. Without it, referrals land in Pathology/Radiology instead of Incoming Letters. **This is now a pilot gate, not just Phase 2:** the pilot fax line is mixed and referrals do arrive on it (~5% per Nicole, 22 Jul 2026), and a confidently-classified faxed referral will auto-route as REF^I12. Medihost must confirm the modifier is enabled before the pilot goes live on the Inbox.

---

## 10. Task Scheduler Configuration

Identical in structure to the existing PDF-to-Directory task (renamed `SMEC AI BJC PDF-to-directory` — see `docs/operations/bjc-pdf-to-directory.md`).

| Setting | Value |
|---|---|
| Task name | `SMEC AI BJC PDF-to-HL7` (confirmed live 3 Aug 2026 — not the placeholder `BJC PDF-to-HL7` this section originally specified) |
| Program | `C:\Program Files (x86)\Power Automate Desktop\PAD.Console.Host.exe` |
| Arguments | `ms-powerautomate:/console/flow/run?...` URL syntax (confirmed as-built 28 Jul 2026) — **not** `/flow "<flow-name>" /run`, which does not work |
| Run as | `BJC\medihost` (same account as the existing `SMEC AI BJC PDF-to-directory` task; also owns the `BJC-PAD-Token` Credential Manager entry) |
| Run only when user is logged on | Yes — matches the existing task. PAD desktop flows need the interactive session, so the `medihost` session stays signed in on the server (disconnect the RDP session, don't log off). |
| Run with highest privileges | Yes (matches the existing task) |
| Do not start new instance if running | Yes |

**As configured live on MHS-SYD-APP47 (confirmed 3 Aug 2026 — supersedes the original 15-min/7 AM design further below):**

**Trigger 1 — Daily:** starts **12:50 PM**, repeats every **10 minutes**, for a duration of 1 day, stop if running longer than 30 minutes.

**Trigger 2 — at startup (crash recovery):** **5-minute delay**, then repeats every 10 minutes for 1 day — so network and Outlook initialise first. Combined with the processed-ID log, this catches up on anything unprocessed after a restart. Because the task is "run only when user is logged on", after a server reboot nothing fires until `medihost` signs back in — include that sign-in in the restart runbook (same constraint as the existing PDF-to-Directory task).

⚠️ **These exact values are load-bearing, not arbitrary.** `SMEC AI BJC PDF-to-HL7` was originally cloned from PDF-to-Directory's own Task Scheduler XML (28 Jul 2026) and ended up on a near-identical cadence to it — both tasks run on the same server and authenticate through the same shared O365 connection (`PAuto@bjchealth.com.au`). On 3 Aug 2026 Nicole reported PDF-to-Directory ("PD@") had silently stopped filing since the previous Friday; Task Scheduler still showed `(0x0)` success on every run, but the two flows were contending for the shared connection. Fix: **PD@'s Daily trigger is 12:45 PM / 10-min repeat (unchanged, the anchor); this task's is offset 5 minutes later (12:50 PM) on the matching 10-min period, and its At-startup trigger carries the same 5-minute delay** (PD@'s startup trigger has none). If either task's schedule is ever touched, re-verify this offset still holds — see `docs/operations/bjc-pdf-to-directory.md` ("Shared-Server Scheduling" section) for the full incident writeup.

Original design (superseded, kept for context): Daily, repeat every 15 minutes for 12 hours from 7:00 AM, Monday–Friday.

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
| **Genie LabRslts folder access** | `\\192.168.47.20\Labrslts` — `BJC\medihost` needs read/write. Path + permissions confirmed by Medihost 22 Jul 2026; verify with a test write from MHS-SYD-APP47 | Confirmed |
| **Internet access** | Outbound HTTPS (443) to `*.amplifyapp.com` only; no inbound, no VPN | Confirm |
| **Mailbox access** | `PAuto@bjchealth.com.au` Full Access to `gofax.par@bjchealth.com.au` granted 22 Jul 2026; other GoFax location mailboxes at rollout | Granted |
| **Linked subfolder** | `Linked` under the polled folder (`Inbox/HL7 Testing` for the pilot; `Inbox` at go-live) — access now granted, Sean or Nicole creates it | Create |
| **Genie REF modifier** | Required before the pilot goes live (mixed fax line carries referrals — §9) | Confirm / Enable |
| **Local temp folder** | `C:\SMEC AI\pdf-to-hl7\` — created automatically by the flow; also holds `processed.log` | Verify no restrictions |

No Outlook categories and no `Inbox/Review` folder are needed — the July 2026 pilot design (§1) moves successes to `Linked` and leaves everything else untouched, superseding both the March folder-plus-categories design and the May tag-in-place design.

---

## 12. Flow Variables

| Variable | Example value | Notes |
|---|---|---|
| `BaseUrl` | `https://prod.d20i409xquw7x3.amplifyapp.com` | BJC production app |
| `MailboxAddress` | `gofax.par@bjchealth.com.au` | Also sent as `X-Source-Mailbox` — must match the polled mailbox |
| `MailFolder` | `Inbox/HL7 Testing` | The polled folder. Pilot value shown; flip to `Inbox` at go-live |
| `LinkedFolder` | `%MailFolder%/Linked` | Fully-filed emails move here (mirrors PD@) |
| `PadToken` | *(from Credential Manager at runtime)* | Never hardcoded in the flow; marked sensitive |
| `GenieLabRsltsFolder` | `\\192.168.47.20\Labrslts` | Confirmed by Medihost 22 Jul 2026 |
| `TempFolder` | `C:\SMEC AI\pdf-to-hl7` | Local temp directory |
| `ProcessedLog` | `C:\SMEC AI\pdf-to-hl7\processed.log` | Assessed-email IDs; the dedupe mechanism (§7) |
| `NotifyRecipient` | `amy.johnson@bjchealth.com.au` | **401 token alerts only** — no per-document notifications |
| ~~`Carrier`~~ | — | Dropped: PAD cannot send text form fields (§4 note); MSH-3 defaults to `SMECAI` server-side |
| `MaxRetries` | `2` | For 5xx / connection errors only |
| `RetryDelaySeconds` | `10` | Delay between retries |

Values still to be filled in: `NotifyRecipient` (BJC) and the doctor-list decision from §6. The Credential Manager entry was created 21 Jul 2026; `GenieLabRsltsFolder` was confirmed by Medihost 22 Jul 2026.

---

## 13. Testing Checklist

### API connectivity (from the BJC server, PowerShell/curl)

```bash
# Health + token check in one call (expect 200 {"status":"ok",...})
curl -H "Authorization: Bearer <PAD_TOKEN>" -H "X-Source: email" \
  https://prod.d20i409xquw7x3.amplifyapp.com/api/convert

# No headers -> expect 401 (proves the gate is on)
curl -i https://prod.d20i409xquw7x3.amplifyapp.com/api/convert

# Convert a test PDF as the pipeline would (expect free classification —
# gofax.par is deliberately unmapped, see §5)
curl -X POST \
  -H "Authorization: Bearer <PAD_TOKEN>" \
  -H "X-Source: email" \
  -H "X-Source-Mailbox: gofax.par@bjchealth.com.au" \
  -F "pdf=@test-result.pdf" \
  https://prod.d20i409xquw7x3.amplifyapp.com/api/convert
```

### End-to-end (from PAD, against the HL7 Testing folder)

- [ ] Health check returns 200 with the flow's headers; 401 triggers the urgent-stop path
- [ ] Auto-routed result saves `.hl7` to LabRslts with the response filename, ASCII + CR endings, **and the email moves to `Linked`**
- [ ] Genie imports the file (it disappears from LabRslts), matches/creates the patient, routes to the correct inbox per OBR-24
- [ ] PDF is attached to the patient record in Genie
- [ ] `manual_review` response: **no** file written, email still in the polled folder — **unread, no category, no flag, byte-for-byte untouched** — and the dashboard shows the row with the right reason
- [ ] Urgent fixture (see `docs/test-pdfs/urgent/`) → `reason: urgent_result`, never auto-filed, red **Urgent** badge on the dashboard
- [ ] Referral PDF via the pilot mailbox → classified freely (no `mailbox_mismatch` — unmapped mailbox); if confident, auto-routes as REF^I12 → **requires the Genie REF modifier (§9)**
- [ ] Redacted/unreadable PDF → `reason: extraction_failed` (response has `success: false` — confirm the flow still branches on `action`)
- [ ] **Dedupe:** run the flow twice with a manual-review email left in the folder — second run skips it (no new POST, no duplicate dashboard row; `processed.log` contains its ID)
- [ ] Non-PDF attachments are skipped without error; multi-PDF emails produce one POST each; a partial success (one filed, one not) leaves the email in the folder
- [ ] Oversize (>10 MB) PDF → 400 → email stays put, no retry loop, ID logged
- [ ] Retry works: kill connectivity mid-run → flow retries 2×, leaves the email, does **not** log it; next run retries it
- [ ] Crash recovery: restart server, sign in as `medihost`, Task Scheduler fires within 5 minutes, unassessed emails are picked up
- [ ] Temp folder is cleaned of leftover PDFs on next startup; `processed.log` prunes entries older than 30 days
- [ ] Bearer token does not appear in PAD logs (`%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Logs`) — sensitive marking verified

### Genie verification

- [ ] ORU^R01 pathology/radiology results land in Pathology / Radiology respectively
- [ ] REF^I12 (Phase 2) routes to Incoming Letters — REF modifier confirmed
- [ ] Patient matching works for existing patients (name + DOB + Medicare); new patient created when no match
- [ ] Addressee/provider routing puts the document in the correct doctor's inbox (§6 shipped Aug 2026 — verify the imported addressee links to Genie's doctor record, e.g. "Dr I Lim")

---

## 14. Weekly PAD Runtime Restart

Both PAD flows on MHS-SYD-APP47 have silently stopped after days of running while Task Scheduler kept showing `(0x0)` (PD@ 19 Feb 2026; both flows 3 Aug 2026). A weekly restart of the PAD runtime is the mitigation — **not** a root-cause fix. Artifacts live in `scripts/pad-server/`:

| File | Purpose |
|---|---|
| `Restart-PadRuntime.ps1` | Waits for any in-flight flow run, kills `PAD.Console.Host` / `PAD.Robin.Host` / `PAD.Designer.Host`, restarts the **Power Automate Service** (`UIFlowService`), then (with `-SmokeRun`) starts `SMEC AI BJC PDF-to-HL7` and checks the console relaunched and wrote a fresh run log. Appends to `C:\SMEC AI\pdf-to-hl7\pad-restart.log`. |
| `SMEC-AI-BJC-PAD-Weekly-Restart.xml` | Task Scheduler definition — Sunday **03:07**, `BJC\medihost`, highest privileges, run only when logged on, 15-min limit, catch-up if missed. |

**Why killing the console is safe:** both flow tasks launch `PAD.Console.Host.exe ms-powerautomate:/console/flow/run?...` every 10 minutes, and that command cold-starts the console if it isn't running (it's how the At-startup trigger already recovers). The restart task starts nothing itself beyond the optional smoke run.

**Why Sunday 03:07:** trigger minutes on the box are PD@ `:45 :55 :05 :15 :25 :35` and PDF-to-HL7 `:50 :00 :10 :20 :30 :40`. 03:07 is 2 minutes after PD@'s slot and 3 before HL7's; at 3 AM Sunday both mailboxes are empty, so each run finishes in seconds. The script still waits for `PAD.Robin.Host.exe` to be absent for 20 s (max 4 min) before killing. **This task does not touch either flow task's triggers** — the 5-minute PD@/HL7 offset in §10 stays as is.

**Mid-run kill risk:** PDF-to-HL7 is safe (the `processed.log` append happens before the mailbox move, so an interrupted run is simply re-assessed next slot — one extra Bedrock call at worst). PD@ could, in theory, write a consent-form PDF and be killed before moving the email to `Linked`, yielding one duplicate PDF in Genie Scans; the quiescence wait plus the 3 AM Sunday window makes this very unlikely.

### Install (RDP to MHS-SYD-APP47 as an admin)

1. Copy both files to `C:\SMEC AI\pdf-to-hl7\`.
2. **Elevation pre-check** — open a prompt as `medihost` and run `whoami /groups | findstr /i administrators`. "Highest privileges" only elevates if `medihost` is in the local Administrators group; `Restart-Service` needs that. If it isn't listed, either ask Medihost to add it or swap the `<Principal>` in the XML for the SYSTEM variant shown in the XML's header comment (SYSTEM can still kill medihost's PAD processes).
3. Import: `schtasks /Create /TN "SMEC AI BJC PAD Weekly Restart" /XML "C:\SMEC AI\pdf-to-hl7\SMEC-AI-BJC-PAD-Weekly-Restart.xml"`
4. First manual run at a quiet time (not between 12:40 and 13:00): `schtasks /Run /TN "SMEC AI BJC PAD Weekly Restart"`, then within a couple of minutes check:
   - `Get-Content 'C:\SMEC AI\pdf-to-hl7\pad-restart.log' -Tail 20` shows `status after=Running` and `SMOKE PASS`, `END exit=0`.
   - Task Scheduler → the task's **Last Run Result** is `0x0`.
   - Both flow tasks' **Last Run Time** advance on their next 10-minute slot; send a test fax to `gofax.par@` and confirm it files (or lands on the dashboard).

### Weekly check

Unlike the two flow tasks, this one fails **loudly**. Last Run Result must be `0x0`; anything else maps to:

| Exit | Meaning | Action |
|---|---|---|
| `2` | Not elevated — processes killed, service restart skipped | Fix step 2 above |
| `3` | Smoke run failed — console didn't relaunch or no new run log in 90 s | Sign in as `medihost`, open the PAD console manually, check `%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Logs\` |
| `4` | Power Automate service not found | PAD install changed — check `Get-Service *Automate*` |
| `5` | Service didn't reach Running in 60 s | Check Services.msc / Event Viewer → Application |

If the flows still stop between Sundays, capture `%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Logs\` and `Get-ScheduledTaskInfo` for **both** flow tasks **before** the next restart wipes the evidence — the weekly restart hides symptoms, and the existing pipeline-alerts CloudWatch alarm remains the detection layer for "nothing converted".

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
