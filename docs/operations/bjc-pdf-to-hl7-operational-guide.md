# BJC PDF-to-HL7 Operational Guide

Plain-English guide to the BJC Health PDF-to-HL7 service — covering the live email automation, the manual web upload path, what gets imported into Genie, and how the audit log works. Built by SMEC AI for BJC Health.

---

## What this service does

The PDF-to-HL7 service turns scanned and emailed patient PDFs into Genie-compatible HL7 messages so they appear directly in the right doctor's inbox. There are two ways a PDF reaches the service:

1. **Email automation** (live) — A Power Automate Desktop (PAD) flow polls dedicated mailboxes every 15 minutes, sends each PDF attachment to the conversion service, and saves the resulting HL7 file to the Genie import folder. 882 documents have been processed automatically since February 2026.
2. **Manual web upload** — Staff log into a secure web interface and drag PDFs (one or many) into the browser. The service converts each one and offers the HL7 file as a download.

Both paths use the same conversion engine and write to the same audit log.

---

## How it works (email automation)

```
Email with PDF arrives in shared mailbox
        |
        v
Automation checks every 15 minutes
        |
        v
PDF sent to SMEC AI conversion service (X-Source: email)
        |
        v
AI classifies document type, extracts patient details
        |
        v
HL7 file built with original PDF embedded; routed to the right Genie inbox
        |
        v
HL7 saved to Genie import folder; email moved to Linked / Review folder
        |
        v
One audit row written (metadata only, no patient data)
```

### Step by step

1. PDF attachments arrive in the shared mailboxes:
   - **Referrals mailbox** — specialist letters, GP referrals (~100/week)
   - **Pathology fax-email mailbox** — Douglass Hanly Moir, Laverty, Sonic results (~150/week)
   - **Radiology fax-email mailbox** — PRP, I-MED, Lumus reports (~50/week)
2. Every 15 minutes during business hours, the automation polls each mailbox.
3. Each PDF attachment is sent to the SMEC AI cloud service. The AI reads the document, classifies it (referral, pathology, radiology, consent form, generic), and extracts the patient details and any sender / addressee / CC names.
4. A Genie-compatible HL7 v2.4 message is built with the original PDF attached, plus the OBR-24 routing flag set so it lands in the correct Genie inbox:
   - Referrals → **Incoming Letters**
   - Pathology → **Pathology** inbox
   - Radiology → **Radiology** inbox
5. The HL7 file is saved directly to the Genie import folder on the server.
6. The email is moved to the **Linked** folder on success, or **Review** on failure (with a notification email to staff).
7. One audit row is written to the cloud (metadata only — see "What's recorded" below).

---

## How it works (manual web upload)

Staff can convert PDFs at any time via the web interface — useful for documents that arrive outside the automation (e.g. a faxed letter, a one-off scan, a document that landed in the wrong inbox).

- Log in with the shared password to receive a 7-day session cookie.
- Drag-and-drop one or many PDFs onto the upload zone, or use Browse.
- Each PDF is detected (document type identified) in parallel as soon as it lands.
- Conversion runs sequentially for each file. The HL7 file becomes available to download as each conversion finishes.
- Override the document type, carrier, or doctor routing per-file before conversion.
- The **Doctors** tab manages the BJC Health doctor list used for AI addressee resolution (e.g. "Dear Rheumatologist" → "Dr Irwin Lim"). The list lives in browser localStorage and is sent with every conversion.
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
| Check the **Review** folder | Daily | Failed conversions are moved here. Process manually. |
| Nothing for **Linked** emails | Never | Already in Genie. |
| Update the doctor list | When doctors join or leave BJC Health | Doctors tab in the web app. |
| Check dashboard metrics | Weekly | Volume, success rate, outcome split per source. |
| Manual upload | As needed | For one-off PDFs that didn't come through email. |

> **During the warranty period:** Staff should regularly spot-check that emails in the Linked folder have correctly appeared in the right Genie inbox.

---

## Email folder guide

| Folder | Meaning | Staff action |
|--------|---------|-------------|
| `Inbox/Linked` | Processed successfully — HL7 file is in Genie | None |
| `Inbox/Review` | Could not extract patient details, or another fault | Process manually |
| `Inbox` | Not yet processed | Will be picked up on the next 15-min run |

---

## What's recorded (audit log)

Every conversion — whether from the email automation or the web interface — writes one row to the audit log (DynamoDB, Sydney). Plain-English: **we log that a conversion happened, what type, success or fail, and a hash of the filename. We do not log the patient's name, DOB, Medicare number, address, or document content.**

Each row contains:

- Timestamp (UTC)
- Document type (`pathology_result`, `referral_letter`, etc.)
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
- **All processing is in Australian data centres.** The conversion service runs on AWS Sydney; the AI extraction (AWS Bedrock Claude Sonnet 4.6) runs on AWS Australia (Sydney + Melbourne data residency).
- **Encrypted in transit.** All communication uses HTTPS.
- **Password-protected access.** The web interface and conversion API are protected by a shared password and 7-day session cookies.
- **AWS Bedrock AI** is hosted in Australia, does not use submitted data for training, and is IRAP PROTECTED assessed.

---

## What Medihost needs to provide

| Requirement | Why it's needed | Status |
|-------------|-----------------|--------|
| Server capacity confirmation | This automation runs on the same Windows server already running PAD and PDF-to-Directory | Confirmed |
| Genie import folder access | The automation saves HL7 files directly to Genie's `LabRslts` folder (no Capricorn intermediary) | Confirmed |
| Internet access from server | The server needs to reach the SMEC AI cloud service (HTTPS only) | Confirmed |
| Create `Review` folder per mailbox | Failed extractions move here for staff to handle | Pending |
| Service account permissions | The PAD account needs access to each mailbox and the Genie folder | Pending |
| **Confirm Genie REF V8 flag is enabled** | Without REF V8, Genie ignores the OBR-24 routing flag and dumps everything into Pathology / Radiology — referrals will not reach Incoming Letters. **This is the single biggest pre-go-live blocker.** Owned by Steven Hill (Medihost). | Pending |

---

## Reliability features

| Feature | What it does |
|---------|-------------|
| Automatic retry | If the cloud service is briefly unavailable, the automation retries twice before failing |
| Failure notifications | Staff receive an email when a document can't be processed |
| Audit log | Every conversion is recorded (metadata only) — viewable on the dashboard |
| Crash recovery | If the server restarts, the automation resumes within ~10 minutes |
| Temp file cleanup | Leftover temp files are auto-cleaned on next startup |

---

## Code escrow

On termination of the SMEC AI engagement, the complete codebase — this repo, the PAD flow, infrastructure-as-code, and operational documentation — is delivered to BJC Health. This commitment lets BJC continue running and maintaining the service independently, or hand it to another vendor, without operational disruption. Specific terms (handover format, support window, dependency lists) are documented in the SMEC AI service proposal.

---

## Relationship to existing automation

BJC Health currently has two automations running on the same Windows server:

- **PDF-to-Directory** (live since 2025): Processes **consent forms** from the PD@ mailbox. Renames PDFs and saves them to a network folder for Genie auto-import.
- **PDF-to-HL7** (this service, live since Feb 2026): Processes **referrals, pathology, and radiology** from three dedicated mailboxes. Converts PDFs to HL7 messages and saves them to the Genie import folder.

Both automations run independently and do not interfere with each other. See `docs/engineering/sister-system-pdf-to-directory.md` for reference details on PDF-to-Directory.

---

*Prepared by SMEC AI | Last refreshed April 2026*
