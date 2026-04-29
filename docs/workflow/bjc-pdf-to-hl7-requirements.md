# BJC PDF-to-HL7 Automated Workflow

Automated processing of referral letter PDFs — from email inbox to Genie — with zero manual handling for emails able to be processed using AI. Built by SMEC AI for BJC Health.

---

## How It Works

```
Email with referral PDF
        |
        v
Automation checks every 15 minutes
        |
        v
Send PDF to SMEC AI conversion service
        |
        v
Patient details extracted, HL7 file created
        |
        v
HL7 file saved to Genie import folder
        |
        v
Email moved to "Linked" folder
```

### Step by Step

1. Referral letter emails with PDF attachments arrive in a dedicated shared mailbox (separate from the PD@ consent form mailbox)
2. Every 15 minutes during business hours, the automation checks for new emails
3. Each PDF attachment is sent to the SMEC AI cloud service, which reads it using AI
4. The service identifies the patient (name, DOB, sex, Medicare), the referring doctor, and the BJC Health doctor who should receive it
5. A Genie-compatible HL7 file is created with the patient details and the original PDF attached
6. The HL7 file is saved directly to the Genie import folder on the server
7. The email is moved to the **Linked** folder (success)
8. If the system cannot read the patient details, the email is moved to the **Review** folder and a notification email is sent
9. Every processed email is recorded in a cloud-based audit log (metadata only — no patient data)

---

## Web Dashboard

A secure web dashboard is available for staff to manage the automation, monitor its health, and view overall metrics.

**Features:**

- **Doctor list management** — Add, remove, and update the BJC Health doctor list used for addressee resolution. The AI sometime uses this list to determine which doctor (primary addressee or CC addressee) should be assigned the document in Genie.
- **Health status** — At-a-glance view of whether the automation and conversion service are running normally.
- **Processing metrics** — Volume of emails processed, success/failure rates, and trends over time.

The dashboard can be accessed from any web browser by anyone with a bjchealth.com.au email address.


---

## What Staff Need To Do

| Task | When | How |
|------|------|-----|
| Check the **Review** folder | Periodically (daily recommended) | Emails here couldn't be processed automatically. |
| Nothing for **Linked** emails | Never | These were processed successfully. The document is already in Genie. |
| Update the doctor list | When doctors join or leave BJC Health | Update via the web dashboard. |
| Check dashboard metrics | As needed | View processing volume, success rates, and any failures. |

> **During the warranty period:** Staff should regularly check that emails in the Linked folder have correctly appeared in Genie.

---

## Email Folder Guide

| Folder | Meaning | Staff Action |
|--------|---------|-------------|
| **Inbox/Linked** | Processed successfully — HL7 file is in Genie | None |
| **Inbox/Review** | Could not extract patient details | Process manually |
| **Inbox** | Not yet processed | Will be picked up on the next run |

---

## What Gets Imported Into Genie

For each referral letter, Genie receives:

- **Patient details**: Name, date of birth, sex, Medicare number
- **The original PDF**: Attached to the patient record exactly as received
- **Referring doctor**: Who sent the referral (name, clinic, provider number if visible)
- **Receiving doctor**: Which BJC Health doctor should see it (resolved from the letter automatically)
- **CC recipients**: Any doctors copied on the letter

Documents appear in the receiving doctor's **Incoming Letters** inbox in Genie and are automatically filed to the matching patient record.

---

## Data Security

- **No document content is retained** — PDFs are processed in-memory and discarded immediately after conversion. The SMEC AI cloud service does not store, log, or retain any patient documents or extracted patient data.
- **Only metadata and metrics are kept** — The service records processing metadata only (timestamp, document type, success/fail, file name) for the dashboard and audit log. No clinical content, patient names, or PDF content is stored in the cloud.
- **All processing in Australian data centres** — The conversion service and AI extraction run in AWS Sydney. Patient data does not leave Australia.
- **Encrypted in transit** — All communication between the BJC server and the SMEC AI cloud service uses HTTPS encryption.
- **Password-protected access** — The web dashboard and conversion service are protected by authentication. Only authorised staff can access them.
- **AWS Bedrock AI** — The AI model used for extraction (AWS Bedrock) is hosted in Sydney, does not store or use submitted data for training, and is IRAP PROTECTED assessed.

---

## What Medihost Needs To Provide

These items are required before the automation can go live:

| Requirement | Why It's Needed |
|-------------|-----------------|
| Confirm server capacity | This automation runs on the same Windows server already running PAD and PDF-to-Directory |
| Genie import folder access | The automation saves HL7 files directly to the Genie LabRslts folder |
| Internet access from server | The server needs to reach the SMEC AI cloud service (HTTPS only) |
| Create "Review" email folder | Failed extractions are moved here for staff to handle |
| Service account permissions | The automation account needs access to the new mailbox and the Genie folder |
| Confirm Genie REF is enabled | Genie needs the REF modifier to correctly route referral letters to Incoming Letters (without it, everything goes to Pathology/Radiology) |

---

## Reliability Features

| Feature | What It Does |
|---------|-------------|
| **Automatic retry** | If the cloud service is temporarily unavailable, the automation retries twice before marking as failed |
| **Failure notifications** | Staff receive an email when a document can't be processed |
| **Audit log** | Every processed email is logged in the cloud (timestamp, document type, success/fail, file name). Metadata only — no document content stored. Viewable via the web dashboard. |
| **Crash recovery** | If the server restarts, the automation resumes within ~10 minutes |
| **Temp file cleanup** | Leftover temporary files are automatically cleaned up |

---

## Relationship to Existing Automation

BJC Health currently has one automation running:

- **PDF-to-Directory** (live): Processes **consent forms** from the PD@ mailbox. Renames PDFs and saves them to a network folder for Genie auto-import.

This new automation adds:

- **PDF-to-HL7** (proposed): Processes **referral letters** from a separate dedicated mailbox. Converts PDFs to HL7 messages and saves them to the Genie import folder.

Both automations run on the same Windows server with PAD already installed. Each monitors its own mailbox — they are fully independent and do not interfere with each other.

---

*Prepared by SMEC AI | March 2026*
