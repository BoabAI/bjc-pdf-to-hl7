# BJC PDF-to-Directory Workflow

Reference documentation for the **PDF-to-Directory** automation — the sister system to PDF-to-HL7. Both serve BJC Health's goal of eliminating manual PDF filing into the Genie patient management system.

---

## System Overview

| | PDF-to-Directory | PDF-to-HL7 |
|---|---|---|
| **Scope** | Fixed format consent forms only | Referrals, consent forms, GP letters, generic |
| **Platform** | Power Automate Desktop (Windows) | Next.js on AWS Amplify |
| **AI** | OCR + Python regex | Bedrock Claude Sonnet (vision) |
| **Output** | Renamed PDF file on network folder | HL7 v2.4 message (download) |
| **Genie import** | Auto-linked via filename convention | Imported via HL7 message |
| **Trigger** | Task Scheduler (every 15 min) | Manual upload via web UI |
| **Data flow** | Email inbox -> network folder | Browser upload -> HL7 download |

---

## Architecture

```
Outlook Shared Mailbox (PD@bjchealth.com.au)
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
        |     |     +-- Save to temp file (C:\SMEC AI\temp.pdf)
        |     |     +-- Extract text from PDF (built-in PAD action)
        |     |     +-- Python regex: parse Last Name, First Name, DOB
        |     |     +-- Build filename: {LastName};{FirstName};{DDMMYYYY};PD.pdf
        |     |     +-- Save original PDF to network folder with new name
        |     |     +-- Delete temp file
        |     |
        |     +-- Move email to Inbox/Linked folder
        |
        v
Network Folder: \\192.168.47.10\PracticeData\Genie Scans\PD
        |
        v
Genie auto-imports from this folder
```

---

## Filename Convention

```
{LastName};{FirstName};{DDMMYYYY};PD.pdf
```

| Component | Example | Notes |
|-----------|---------|-------|
| LastName | `Pyne` | Extracted from "Last Name *" field |
| FirstName | `Nicole` | Extracted from "First Name *" field |
| DDMMYYYY | `04061997` | DOB with slashes removed |
| PD | `PD` | Source mailbox identifier |

**Full example:** `Pyne;Nicole;04061997;PD.pdf`

Semicolons are mandatory — this is the format Genie expects for auto-linking files to patient records.

---

## Extraction Logic (Robin/Python)

The PAD flow uses built-in PDF text extraction followed by Python 3 regex parsing:

```python
import re

def grab(pattern, s):
    m = re.search(pattern, s, re.IGNORECASE)
    return m.group(1).strip() if m else ""

first = grab(r"First Name\s*\*\s*\r?\n\s*([^\r\n]+)", text)
last  = grab(r"Last Name\s*\*\s*\r?\n\s*([^\r\n]+)", text)
dob   = grab(r"(?:Preferred Name\s+)?Date of Birth\s*\*\s*\r?\n\s*([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})", text)

dob_safe = dob.replace("/", "")
filename = "{};{};{};PD.pdf".format(last, first, dob_safe) if (first and last and dob_safe) else ""
```

The regex matches the BJC Health Patient Information and Consent Form layout where field labels are followed by values on the next line.

---

## Email Status

| Location | Meaning | Staff Action |
|----------|---------|-------------|
| **Inbox/Linked** folder | Processed successfully | None — file is in network folder |
| **Inbox** (no move) | Failed or pending | Manual review required |

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Extraction returns empty (no name/DOB) | Skip attachment, email stays in inbox |
| Network folder unavailable | Temp file saved locally, retried next run |
| Leftover temp file from crash | Auto-deleted on next startup |
| Scanned/image-only PDF | Text extraction returns empty, skipped |
| Task Scheduler missed run (server restart) | Startup trigger resumes within ~10 min |

---

## Infrastructure

| Component | Detail |
|-----------|--------|
| **Host** | Windows server (`WSAMZN-TA1F82A8`) |
| **Service account** | `CORP\demonstration` / `PAuto@bjchealth.com.au` |
| **Mailbox** | `PD@bjchealth.com.au` (shared) |
| **Network folder** | `\\192.168.47.10\PracticeData\Genie Scans\PD` |
| **Temp folder** | `C:\SMEC AI\` (local) |
| **PAD connection** | Office 365 Outlook (`pdftodirectory-09a24`) |
| **Schedule** | Every 15 min during business hours + on startup |
| **Registry fix** | `DisableExternalFlowConfirmationDialog = 1` (HKCU) |

### Licensing

| Component | Licence |
|-----------|---------|
| Power Automate Desktop | Free with Windows |
| Power Automate Premium | Required (assigned to service account) |
| AI Builder | Not required (uses built-in PAD text extraction) |

---

## Reliability Improvements (Feb 2026)

Five fixes applied after the 19 Feb 2026 outage:

1. **Temp file moved to local drive** — avoids network lock issues
2. **Cleanup on startup** — removes leftover temp files before processing
3. **Empty result protection** — skips unreadable PDFs instead of failing
4. **Unattended execution fix** — registry key bypasses confirmation dialog
5. **Server restart recovery** — startup trigger catches up on missed runs

---

## Relationship to PDF-to-HL7

Both systems target the same goal — getting patient documents into Genie — but via different paths:

**PDF-to-Directory** handles the simple, high-volume case:
- Consent forms arrive by email automatically
- Fixed form layout = regex extraction is reliable
- Output is a renamed PDF file that Genie auto-imports from a watched folder

**PDF-to-HL7** handles the complex, varied case:
- Referral letters, GP letters, and other clinical documents
- Variable layouts require AI vision (Bedrock Claude) for extraction
- Output is an HL7 v2.4 message with embedded PDF, sender/addressee metadata, and Genie routing fields
- Supports document classification, CC addressee resolution, and provider number routing

The two systems are complementary — PDF-to-Directory is fully automated (no human in the loop), while PDF-to-HL7 is staff-assisted (upload via web UI, review extracted data, download HL7).

---

## Stakeholders

| Name | Role |
|------|------|
| Sean O'Reilly | Technical lead (SMEC AI) |
| Amy Johnson | Operations Manager (BJC Health) |
| Nicole Pyne | Reception (BJC Health) |
| Errol Lim | Managing Director (BJC Health) |

---

## Source Repository

`bjc-pdf-to-directory` — contains the PAD Robin flow scripts, production implementation guide, and deployment documentation.

*Last updated from source docs: 24 February 2026*
