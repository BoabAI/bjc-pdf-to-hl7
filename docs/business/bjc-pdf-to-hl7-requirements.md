# Statement of Advice

## BJC PDF-TO-HL7 AUTOMATED WORKFLOW

Automated processing of patient PDFs — referrals, pathology results, radiology results, and correspondence letters — from email inbox to Genie, with zero manual handling for documents the AI can read. Built by SMEC AI for BJC Health.

Commercial terms (implementation fee, 30-day free trial, per-document pricing, ongoing support, intellectual property) are in the companion document _PDF-to-HL7 Automation — Pricing & Costs_.

---

## SCOPE

The service handles five document classifications:

1. **Pathology result** — Douglass Hanly Moir, Laverty, Sonic, etc.
2. **Radiology result** — PRP, I-MED, Lumus, etc.
3. **Referral letter** — Specialist and GP referrals
4. **Correspondence letter** — "Thanks for referring…" consult letters and clinic correspondence
5. **Unknown** — Anything that does not fit the above; routed to manual review

PDFs reach the service through two paths:

- **Email automation** — Power Automate Desktop (PAD) polls dedicated mailboxes every 15 minutes
- **Manual web upload** — Staff drag PDFs into a secure web interface (one or many at once)

Both paths use the same conversion engine and write to the same audit log.

---

## HOW IT WORKS — EMAIL AUTOMATION

```
Email with PDF arrives in shared mailbox
        |
        v
Automation checks every 15 minutes
        |
        v
Send PDF to SMEC AI conversion service
        |
        v
AI classifies document, extracts patient details, builds HL7
        |
        v
HL7 file saved to Genie import folder (routed to correct inbox)
        |
        v
Email moved to Linked (success) or Review (failure)
        |
        v
One audit row written (metadata only — no patient data)
```

### Step by step

1. PDF attachments arrive in the dedicated shared mailboxes:
   - **Pathology fax-email mailbox** (GoFax)
   - **Radiology fax-email mailbox** (GoFax)
   - **Other-results fax-email mailbox** (GoFax)
2. Every 15 minutes during business hours, the automation polls each mailbox
3. Each PDF attachment is sent to the SMEC AI cloud service. The AI reads the document, classifies it into one of the five types above, and extracts the patient details and any sender / addressee / CC names
4. A Genie-compatible HL7 v2.4 message is built with the original PDF embedded, and the OBR-24 routing flag is set so it lands in the correct Genie inbox
5. The HL7 file is saved directly to the Genie import folder on the server
6. The email is moved to **Linked** on success, or **Review** on failure (with a notification email to staff)
7. One audit row is written to the cloud (metadata only — see Data Security below)

### Rollout sequencing

- **Stage 1 (initial production)** — The 3 GoFax fax-email inboxes above. Lower-complexity cohort: ~200 documents/week, no password-protected files, minimal admin overlap
- **Stage 2 (later)** — The admin@ inbox. Higher-complexity cohort: mixed administrative traffic alongside referrals, requires the failure-handling UX to be finalised first

---

## HOW IT WORKS — MANUAL WEB UPLOAD

Staff can convert PDFs at any time via the web interface — useful for documents that arrive outside the automation (e.g. a faxed letter that didn't auto-process, a one-off scan, a document that landed in the wrong inbox).

- Sign in with your BJC Health Microsoft 365 account (your existing Microsoft security, including 2FA, applies)
- Drag-and-drop one or many PDFs onto the upload zone, or use Browse
- Each PDF is detected (document type identified) in parallel as soon as it lands
- Conversion runs sequentially. The HL7 file becomes available to download as each conversion finishes
- Override the document type, carrier, or doctor routing per-file before conversion
- The carrier defaults to **fax**

---

## WEB DASHBOARD

A secure web dashboard is available for staff to manage the automation, monitor its health, and view processing metrics.

**Features:**

- **Multi-file drag-and-drop upload** — Convert one or many PDFs in a single batch
- **Doctor list management** — Add, remove, and update the BJC Health doctor list used for AI addressee resolution. The AI uses this list to determine which BJC doctor (primary or CC addressee) should be assigned the document in Genie
- **Carrier configuration** — Set the default carrier value written into HL7 messages (defaults to **fax**)
- **Audit log** — Every conversion is logged. Default view is the current month; date-range filter and CSV export are built in
- **Processing metrics (stats)** — Pie charts showing volume by document type, outcome (Successful / Failed), and source (email vs web upload), plus trends over time
- **Health status** — At-a-glance view of whether the automation and conversion service are running normally, backed by an automatic email alert if the converter stops processing (so no one has to log in to notice an outage)

The dashboard is hosted on a SMEC AI subdomain (replacing the Amplify default URL) and is accessible from any web browser by anyone with a `bjchealth.com.au` email address.

---

## WHAT GETS IMPORTED INTO GENIE

For each document, Genie receives the original PDF embedded in the HL7 message, plus structured fields. The destination inbox is determined by the OBR-24 routing flag:

| Document type         | HL7 type  | OBR-24  | Genie destination                                                          |
| --------------------- | --------- | ------- | -------------------------------------------------------------------------- |
| Referral letter       | `REF^I12` | `PHY`   | **Incoming Letters** of the resolved BJC doctor                            |
| Pathology result      | `ORU^R01` | `LAB`   | **Pathology** inbox                                                        |
| Radiology result      | `ORU^R01` | `RAD`   | **Radiology** inbox                                                        |
| Correspondence letter | `ORU^R01` | `PHY` † | **Incoming Letters** of the resolved BJC doctor (or addressee if named) †  |
| Unknown               | `ORU^R01` | (empty) | Genie default routing — manual review                                      |

† **Stage 2.** At go-live (stage 1), correspondence letters route to Pathology default (`OBR-24` empty) — matching the shape of BJC's existing fax-correspondence drops. The `PHY`/Incoming Letters routing for correspondence is planned for stage 2, once Genie REF V8 is confirmed enabled and a small converter update adds correspondence-specific addressee resolution.

Each message includes:

- **Patient details** — Name, date of birth, sex, Medicare number, address (when present)
- **The original PDF** — Attached to the patient record exactly as received
- **Sender** (referrals and correspondence) — Name, clinic, provider number if visible
- **Receiving doctor** (referrals and correspondence) — The BJC Health doctor resolved from the letter
- **CC recipients** — Any doctors copied on the letter

Documents are filed automatically against the matching patient record in Genie based on name, DOB, and Medicare number.

> **Routing dependency:** The OBR-24 routing flag only takes effect when the **Genie REF V8 modifier** is enabled. Without it, all incoming HL7 messages dump into Pathology/Radiology regardless of OBR-24. Confirming Genie REF V8 is the single biggest pre-go-live blocker — see "What Medihost needs to provide" below.

---

## EMAIL FOLDER GUIDE

| Folder         | Meaning                                             | Staff action                             |
| -------------- | --------------------------------------------------- | ---------------------------------------- |
| `Inbox/Linked` | Processed successfully — HL7 file is in Genie       | None                                     |
| `Inbox/Review` | Could not extract patient details, or another fault | Process manually                         |
| `Inbox`        | Not yet processed                                   | Will be picked up on the next 15-min run |

> **Failure-handling UX:** The exact behaviour for failed conversions on the admin@ inbox (leave in inbox / tag / move to Failed folder) is to be confirmed during stage 1 rollout — see the 4 May 2026 action items. The fax-email inboxes use the simple Linked / Review model above.

---

## WHAT STAFF NEED TO DO

| Task                          | When                                  | How                                                    |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------ |
| Check the **Review** folder   | Daily                                 | Failed conversions are moved here. Process manually    |
| Nothing for **Linked** emails | Never                                 | Already in Genie                                       |
| Update the doctor list        | When doctors join or leave BJC Health | Doctors tab in the web dashboard                       |
| Check dashboard metrics       | Weekly                                | View processing volume, success rate, and any failures |
| Manual upload                 | As needed                             | For one-off PDFs that didn't come through email        |

> **During the warranty period:** Staff should regularly spot-check that emails in the Linked folder have correctly appeared in the right Genie inbox.

---

## DATA SECURITY

- **No document content is retained.** PDFs are processed in memory and discarded immediately after conversion. The SMEC AI cloud service does not store, log, or retain any patient documents or extracted patient data
- **Only metadata and metrics are kept.** The audit log records timestamp, document type, outcome (Successful / Failed), source (email / web), HL7 message type, routing flag, file size, duration, the patient's initials (e.g. "JM"), and a scrambled (one-way hashed) version of the filename. No document content, patient names, dates of birth, Medicare numbers, or addresses are stored in the cloud
- **Backups.** The audit log has continuous backup, restorable to any point within the previous 35 days. Documents themselves are never stored by SMEC AI — the original of each document stays in BJC Health's Microsoft 365 mailbox, under BJC Health's existing backup policy
- **All processing in Australian data centres.** The conversion service runs on AWS Sydney. AI extraction uses AWS Bedrock with data residency in Australia (Sydney + Melbourne)
- **Encrypted in transit.** All communication between the BJC server and the SMEC AI cloud service uses HTTPS encryption
- **Authenticated access.** Login uses Microsoft single sign-on with BJC Health's own Microsoft 365 accounts, so BJC Health's existing Microsoft security rules — including multi-factor authentication (2FA) — apply automatically. SMEC AI does not run a separate login of its own. Access is restricted to bjchealth.com.au accounts
- **AWS Bedrock AI** — The AI model used for extraction is hosted in Australia, does not store or use submitted data for training, and is IRAP PROTECTED assessed

---

## WHAT MEDIHOST NEEDS TO PROVIDE

These items are required before each stage can go live:

| Requirement                          | Why it's needed                                                                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirm server capacity              | The automation runs on the same Windows server already running PAD and PDF-to-Directory. BJC Health now has two Medihost servers — capacity confirmed adequate                                                          |
| Genie import folder access           | The automation saves HL7 files directly to Genie's `LabRslts` folder. BJC's setup is a direct LabRslts drop — no Capricorn intermediary — so the HL7 messages produced by the converter must be correct on their own    |
| Internet access from server          | The server needs to reach the SMEC AI cloud service over HTTPS                                                                                                                                                          |
| Create `Review` folder per mailbox   | Failed extractions move here for staff to handle                                                                                                                                                                        |
| Service account permissions          | The PAD account needs access to each mailbox and the Genie folder                                                                                                                                                       |
| Confirm Genie REF V8 flag is enabled | Without REF V8, Genie ignores the OBR-24 routing flag — referral letters will not reach Incoming Letters and will instead land in Pathology / Radiology. **This is the single biggest pre-go-live blocker for stage 1** |

---

## RELIABILITY FEATURES

| Feature               | What it does                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Automatic retry       | If the cloud service is briefly unavailable, the automation retries twice before marking as failed          |
| Failure notifications | Staff receive an email when a document can't be processed                                                   |
| Outage alert          | An automatic email is sent if the converter stops processing documents, so no one has to log in to notice it |
| Audit log             | Every conversion is logged in the cloud (metadata only — no document content) and viewable on the dashboard |
| Crash recovery        | If the server restarts, the automation resumes within ~10 minutes                                           |
| Temp file cleanup     | Leftover temporary files are automatically cleaned up                                                       |

---

## TRIAL, INTELLECTUAL PROPERTY, AND CODE ESCROW

- **30-day free trial.** SMEC AI deploys the full implementation at no charge. BJC Health uses the system in production for 30 days with no implementation fee, per-document fee, or retainer charged. If BJC Health is not satisfied at the end of the trial, the engagement ends with no fees payable and SMEC AI removes the system
- **Intellectual property.** SMEC AI retains all IP rights in the conversion service and AI extraction system. BJC Health is granted a non-exclusive licence to use the system for internal business purposes for so long as the commercial relationship is active
- **Source code on termination.** On termination by either party (other than termination by SMEC AI for material breach), SMEC AI provides BJC Health with a full copy of the source code for the BJC-specific automation: the Power Automate Desktop workflow, the web dashboard, and the conversion service code as deployed for BJC Health. BJC Health may host this code itself or engage another provider, ensuring operational continuity regardless of the future of the SMEC AI commercial relationship

Full commercial terms are in the companion _PDF-to-HL7 Automation — Pricing & Costs_ document.

---

## RELATIONSHIP TO EXISTING AUTOMATION

BJC Health currently has one automation running:

- **PDF-to-Directory** (live): Processes consent forms from the PD@ mailbox. Renames PDFs and saves them to a network folder for Genie auto-import

This new automation adds:

- **PDF-to-HL7** (proposed): Processes referrals and results from the 3 GoFax fax-email inboxes (stage 1) and the admin@ inbox (stage 2). Converts PDFs to HL7 messages and saves them to the Genie import folder

Both automations are fully independent and do not interfere with each other.

---

_Prepared by SMEC AI | May 2026_
