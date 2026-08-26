# BJC PDF-to-HL7 Operational Guide

Plain-English guide to the BJC Health PDF-to-HL7 service — covering the email automation, the manual web upload path, what gets imported into Genie, and how the audit log works. Built by SMEC AI for BJC Health.

> **Status (July 2026):** The conversion engine and the manual web-upload path are live in BJC's AWS account. The email-automation (PAD) flow is being built now, piloting on the **Parramatta fax mailbox** (`gofax.par@bjchealth.com.au`) via a dedicated "HL7 Testing" folder before going live on the full inbox and extending to the other fax mailboxes. The design below reflects the pilot agreement with BJC ops (Nicole, 22 Jul 2026). (BJC's existing PDF-to-Directory automation for consent forms is a separate PAD workflow — the email handling here deliberately mirrors it.)
>
> **Update (26 Aug 2026):** BJC has set the rollout to the other three fax mailboxes — **`gofaxcht@` on 1 Sep 2026, `gofaxbon@` and `gofaxbow@` on 8 Sep 2026** — and asked for one workflow change: an **Unlinked** folder beside Linked. Once built, every email the converter looks at but does not file moves to `Unlinked`, so reception works that folder as the manual queue instead of guessing whether an inbox email has been assessed yet. The general email mailboxes (admin@ etc.) are deferred until BJC's broader team is ready — likely a few months. Sections below marked *"from the 26 Aug change"* describe the new behaviour.

---

## What this service does

The PDF-to-HL7 service turns scanned and emailed patient PDFs into Genie-compatible HL7 messages so they appear directly in the right doctor's inbox. There are two ways a PDF reaches the service:

1. **Email automation** (in build — piloting) — A Power Automate Desktop (PAD) flow polls the fax mailbox every 15 minutes, sends each PDF attachment to the conversion service, and saves the resulting HL7 file to the Genie import folder. Successfully filed emails move to a **Linked** subfolder; everything else stays in the inbox for the team.
2. **Manual web upload** — Staff log into a secure web interface and drag PDFs (one or many) into the browser. The service converts each one and offers the HL7 file as a download.

Both paths use the same conversion engine and write to the same audit log.

---

## How it works (email automation — pilot design, agreed 22 Jul 2026)

```
Fax email with PDF arrives in gofax.par@bjchealth.com.au
        |
        v
Automation checks the polled folder every 15 minutes
(pilot: "HL7 Testing" subfolder; go-live: the Inbox)
        |
        v
PDF sent to SMEC AI conversion service (X-Source: email)
        |
        v
AI classifies document type, extracts patient details
        |
        v
Confident + safe -> HL7 file built with original PDF embedded,
saved to Genie import folder; email moved to the Linked subfolder
        |
Not confident / urgent / unreadable -> nothing is filed;
email stays in the inbox untouched for the team
        |
        v
One audit row written either way (metadata only, no patient data)
```

### Step by step

1. Fax PDFs arrive in the Parramatta fax mailbox, `gofax.par@bjchealth.com.au` — a mixed line: ~95% pathology/radiology results, plus correspondence and referrals. (Rollout later extends to the other GoFax location mailboxes.)
2. Every 15 minutes during business hours, the automation polls the folder and skips emails it has already assessed (it keeps its own processed list on the server — it never marks emails read or changes them in any way).
3. Each PDF attachment is sent to the SMEC AI cloud service. The AI reads the document, classifies it freely (pathology, radiology, referral, consult letter, correspondence — no restriction by mailbox, per Nicole), and extracts the patient details and any sender / addressee / CC names.
4. A Genie-compatible HL7 v2.4 message is built with the original PDF attached, plus the OBR-24 routing flag set so it lands in the correct Genie inbox:
   - Referrals / consult letters → **Incoming Letters**
   - Pathology → **Pathology** inbox
   - Radiology → **Radiology** inbox
5. The HL7 file is saved directly to the Genie import folder on the server, and the email moves to the **Linked** subfolder — exactly like the PD@ consent-form automation.
6. If the document is marked **urgent**, can't be read properly, or the AI isn't confident, **nothing is filed**: the email simply stays in the inbox, unchanged, for the team's normal processing. The reason appears on the dashboard (urgent items get a red badge). *From the 26 Aug change:* these emails move to the **Unlinked** subfolder instead of staying in the inbox — that folder becomes the team's manual queue.
7. One audit row is written to the cloud (metadata only — see "What's recorded" below).

---

## How it works (manual web upload)

Staff can convert PDFs at any time via the web interface — useful for documents that arrive outside the automation (e.g. a faxed letter, a one-off scan, a document that landed in the wrong inbox).

- Sign in with your BJC Microsoft account (`@bjchealth.com.au`).
- Drag-and-drop one or many PDFs onto the upload zone, or use Browse.
- Each PDF is detected (document type identified) in parallel as soon as it lands.
- Conversion runs sequentially for each file. The HL7 file becomes available to download as each conversion finishes.
- Override the document type, carrier, or doctor routing per-file before conversion.
- The **Reference data** page (`/reference`) manages the BJC Health doctor list used for AI addressee resolution (e.g. "Dear Rheumatologist" → "Dr Irwin Lim"). Any signed-in user can edit it; the web app sends the list with every conversion.
- The **Dashboard** (linked from the home page) shows live ops visibility: pie charts of document type / outcome / source, an audit table for the current month, and CSV export.

### Carrier

The **Carrier** field is a short label that travels with each HL7 message to tell Genie which system the document came from (specifically the HL7 MSH-3 Sending Application field). The default value `SMECAI` is correct for BJC and identifies SMEC AI as the source. BJC ops staff don't need to change this. The only reason to revisit it is if Medihost or Genie support specifically ask for a different source identifier for routing or audit purposes.

---

## What gets imported into Genie

For each document, Genie receives the original PDF embedded in the HL7 message, plus structured fields:

| Document type | HL7 type | OBR-24 | Genie destination | Patient match |
|---------------|----------|--------|-------------------|---------------|
| Specialist referral / GP referral | `REF^I12` | `PHY` | **Incoming Letters** of the resolved BJC doctor | Name + DOB + Medicare from the letter |
| Pathology result | `ORU^R01` | `LAB` | **Pathology** inbox | Name + DOB + Medicare from the report |
| Radiology result | `ORU^R01` | `RAD` | **Radiology** inbox | Name + DOB + Medicare from the report |
| BJC consent form | `ORU^R01` | (empty) | Genie default routing | Name + DOB from the form |
| Generic / unclassified | `ORU^R01` | (empty) | Genie default routing | Name + DOB |

Each message includes:

- **Patient details** — Name, DOB, sex, Medicare number, address (when present)
- **The original PDF** — Attached to the patient record exactly as received
- **Referring doctor** (referrals only) — Name, clinic, provider number if visible
- **Receiving doctor** (referrals only) — The BJC Health doctor resolved from the letter, including CC recipients

---

## What staff need to do

| Task | When | How |
|------|------|-----|
| Work the **inbox** as normal | Daily | Anything still in the inbox wasn't auto-filed — process it manually, exactly as today. Urgent items show with a red badge on the dashboard. *From the 26 Aug change:* work the **Unlinked** folder instead — that is the manual queue; the inbox only holds mail the converter hasn't reached yet. |
| Nothing for **Linked** emails | Never | Already in Genie. |
| Update the doctor list | When doctors join or leave BJC Health | Reference data page in the web app. |
| Check dashboard metrics | Weekly | Volume, success rate, outcome split per source, review reasons. |
| Manual upload | As needed | For one-off PDFs that didn't come through email. |

> **During the warranty period:** Staff should regularly spot-check that emails in the Linked folder have correctly appeared in the right Genie inbox.

---

## Email folder guide

| Folder | Meaning | Staff action |
|--------|---------|-------------|
| `Linked` (under the polled folder) | Processed successfully — HL7 file is in Genie | None |
| Inbox (assessed) | The automation looked at it and would not auto-file it (urgent / unreadable / low confidence) | Process manually — reason is on the dashboard |
| Inbox (new) | Not yet assessed | Will be picked up on the next 15-min run |

There is no Review folder and no Outlook categories — the automation never changes an email it can't file.

**From the 26 Aug change (requested by Nicole; in build for the 1 Sep rollout):**

| Folder | Meaning | Staff action |
|--------|---------|-------------|
| `Linked` | Processed successfully — HL7 file is in Genie | None |
| `Unlinked` | The automation looked at it and would not auto-file it (urgent / unreadable / low confidence / partly filed) | **Process manually — this is the queue.** Reason is on the dashboard; urgent items carry a red badge |
| Inbox | Not yet assessed, or the service was unreachable and it will be retried on the next run | Leave it. If mail sits here for more than a couple of runs, the service may be down — tell SMEC AI |

The same three folders exist in each fax mailbox as it goes live (`gofax.par@`, then `gofaxcht@` from 1 Sep, `gofaxbon@` and `gofaxbow@` from 8 Sep 2026).

---

## What's recorded (audit log)

Every conversion — whether from the email automation or the web interface — writes one row to the audit log (DynamoDB, Sydney). Plain-English: **we log that a conversion happened, what type, success or fail, and a hash of the filename. We do not log the patient's name, DOB, Medicare number, address, or document content.**

Each row contains:

- Timestamp (UTC)
- Document type (`pathology_result`, `referral`, etc.), routing decision, and — for manual review — the reason (urgent, low confidence, unreadable, …)
- Outcome (`ok` / `fail`)
- Source (`web` for manual upload / `email` for the PAD pipeline — set via the `X-Source` HTTP header)
- HL7 message type (`ORU^R01` / `REF^I12`)
- OBR-24 routing flag (`LAB` / `RAD` / `PHY` / empty)
- File size (bytes)
- Duration (milliseconds)
- Warning count
- File extension (`.pdf` only)
- A one-way SHA-256 hash of the original filename, truncated to 12 hex characters (so duplicate uploads can be spotted, but the original name cannot be recovered)

The dashboard at `/dashboard` surfaces these rows. Patient names, dates of birth, Medicare numbers, addresses, raw filenames, and PDF content are **never** stored.

---

## Data security

- **No document content is retained.** PDFs are processed in memory and discarded immediately after conversion. The conversion service does not store, log, or retain any patient documents or extracted patient data.
- **Only metadata and metrics are kept.** The audit log records what's listed above — nothing more.
- **All processing is in Australian data centres, in BJC's own AWS account.** The conversion service runs in BJC Health's AWS account in Sydney; the AI extraction (AWS Bedrock Claude Sonnet 4.6) runs on AWS Australia (Sydney + Melbourne data residency). BJC owns the account and is billed by AWS directly.
- **Encrypted in transit.** All communication uses HTTPS.
- **Microsoft sign-in.** The web interface uses BJC's Microsoft (Entra) accounts — only `@bjchealth.com.au` (and SMEC AI support) accounts can sign in. The email automation authenticates separately with a rotating secret token.
- **AWS Bedrock AI** is hosted in Australia, does not use submitted data for training, and is IRAP PROTECTED assessed.

---

## What Medihost needs to provide

> The PDF-to-HL7 PAD pipeline is not yet built; the statuses below predate the build and should be re-verified with Medihost before go-live.

| Requirement | Why it's needed | Status |
|-------------|-----------------|--------|
| Server capacity confirmation | This automation runs on the same Windows server already running PAD and PDF-to-Directory | Confirmed |
| Genie import folder access | The automation saves HL7 files directly to Genie's `LabRslts` folder (no Capricorn intermediary) | Confirmed |
| Internet access from server | The server needs to reach the SMEC AI cloud service (HTTPS only) | Confirmed |
| `Linked` subfolder in the polled folder | Successfully filed emails move here (no Review folder — unfiled emails stay in the inbox) | Pending |
| `Unlinked` subfolder beside `Linked` | *From the 26 Aug change:* unfiled emails move here. Needed in every fax mailbox before its go-live date; Nicole creates | Pending |
| Service account permissions | The PAD account needs Full Access to `gofax.par@bjchealth.com.au` (pilot) and the Genie folder. Rollout: Full Access to `gofaxcht@` before 1 Sep 2026 and to `gofaxbon@` + `gofaxbow@` before 8 Sep 2026 | Pending |
| **Confirm Genie REF V8 flag is enabled** | Without REF V8, Genie ignores the OBR-24 routing flag and dumps everything into Pathology / Radiology — referrals will not reach Incoming Letters. **This is the single biggest pre-go-live blocker.** Owned by Steven Hill (Medihost). | Pending |

---

## Reliability features

| Feature | What it does |
|---------|-------------|
| Automatic retry | If the cloud service is briefly unavailable, the automation retries twice, then leaves the email to be retried on the next run |
| Review visibility | Documents that weren't auto-filed appear on the dashboard with the reason (urgent = red badge); the email stays in the inbox. A configuration failure (rejected token) emails BJC ops. |
| Audit log | Every conversion is recorded (metadata only) — viewable on the dashboard |
| Crash recovery | If the server restarts, the automation resumes within ~10 minutes |
| Temp file cleanup | Leftover temp files are auto-cleaned on next startup |

---

## Code ownership

BJC Health owns the intellectual property in this automation. SMEC AI builds it under a contractor engagement; the complete codebase — this repository, the PAD flow, the infrastructure-as-code, and the operational documentation — belongs to BJC Health. The system runs in BJC's own AWS account (the converter) and on BJC's own server (the PAD flow), so BJC can continue running, maintaining, or re-vendoring it at any time with no dependency on SMEC AI. Engagement terms are set out in the SMEC AI contractor agreement.

---

## Relationship to existing automation

BJC Health currently has two automations running on the same Windows server:

- **PDF-to-Directory** (existing, live): Processes **consent forms** from the PD@ mailbox. Renames PDFs and saves them to a network folder for Genie auto-import. This is BJC's existing PAD automation and is unrelated to the PDF-to-HL7 pipeline.
- **PDF-to-HL7** (this service — PAD flow in build): Processes **results, referrals, and correspondence** from the GoFax fax mailboxes (pilot: Parramatta, `gofax.par@bjchealth.com.au`), converting PDFs to HL7 messages saved to the Genie import folder. Its email handling deliberately mirrors PDF-to-Directory: filed → `Linked`, everything else stays in the inbox.

Both automations run independently and do not interfere with each other. See `docs/engineering/sister-system-pdf-to-directory.md` for reference details on PDF-to-Directory.

---

*Prepared by SMEC AI | Last refreshed 26 Aug 2026 (pilot design per Nicole, 22 Jul 2026; rollout dates + Unlinked folder per Nicole, 26 Aug 2026)*
