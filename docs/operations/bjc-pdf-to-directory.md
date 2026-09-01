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
| **Host** | Windows server `MHS-SYD-APP47` (confirmed live 3 Aug 2026 — corrects a stale hostname previously recorded here; this box also runs PDF-to-HL7) |
| **Service account** | `CORP\demonstration` / `PAuto@bjchealth.com.au` |
| **Mailbox** | `PD@bjchealth.com.au` (shared) |
| **Network folder** | `\\192.168.47.10\PracticeData\Genie Scans\PD` |
| **Temp folder** | `C:\SMEC AI\` (local) |
| **PAD connection** | Office 365 Outlook (`pdftodirectory-09a24`) |
| **Schedule** | Daily, starts 12:45 PM, repeat every 10 minutes; At-startup trigger, no delay (confirmed live 3 Aug 2026 — corrects a stale "every 15 min" figure previously recorded here). Must stay offset 5 minutes from PDF-to-HL7's schedule — see "Shared-Server Scheduling" below. |
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

## Shared-Server Scheduling (added 3 Aug 2026)

PDF-to-Directory and PDF-to-HL7 run on the same Windows server (`MHS-SYD-APP47`) and authenticate through the same shared O365 connection (`PAuto@bjchealth.com.au`). Their Task Scheduler triggers must be kept offset from each other or they contend for that connection.

**Incident:** `SMEC AI BJC PDF-to-HL7` was cloned from this task's own Task Scheduler XML on 28 Jul 2026 and ended up on a near-identical schedule. On 3 Aug 2026 Nicole reported PD@ had silently stopped filing consent forms since the previous Friday — Task Scheduler still showed `(0x0)` success on every run, which hid the real cause: the two flows contending for the shared connection.

**Fix (live 3 Aug 2026):**
- `SMEC AI BJC PDF-to-directory` (this task): Daily trigger 12:45 PM start, repeat every 10 minutes (unchanged — this is the anchor). At-startup trigger: no delay.
- `SMEC AI BJC PDF-to-HL7`: Daily trigger 12:50 PM start, repeat every 10 minutes (offset 5 minutes on a matching period). At-startup trigger: 5-minute delay added — startup triggers fire at the same instant on both tasks with no time-of-day to offset, so they need their own delay setting, not just the Daily trigger's start-time offset.

If either task's schedule is edited in future, re-verify this 5-minute offset still holds on **both** the Daily and At-startup triggers.

**Weekly runtime restart (Sep 2026):** a third task, `SMEC AI BJC PAD Weekly Restart` (Sunday 03:07), kills the PAD console/robin processes and restarts the Power Automate Service — this restarts PD@'s runtime too. It is deliberately placed between PD@'s `:05` and PDF-to-HL7's `:10` slots and does not modify either flow task. See `pad-integration-guide.md` §14.

---

## Genie Import Mechanism (observed 3 Aug 2026 — not yet confirmed with Medihost)

The Architecture diagram above ends at "Genie auto-imports from this folder" — investigating the 3 Aug 2026 incident surfaced more detail, though it hasn't been formally confirmed with Medihost:

- Files are removed from `\\192.168.47.10\PracticeData\Genie Scans\PD` and archived into a dated subfolder, `PD\Processed\YYYYMMDD\`, once imported — the archive date reflects when Genie processed the file, not when PAD created it (a file sitting unprocessed for days gets archived under the date it's finally picked up).
- `Medical-Objects Capricorn` was observed running on `MHS-SYD-APP47` and is the likely component performing this import/archive step, though this hasn't been verified directly (e.g. via its own logs or a Medihost confirmation).
- During the 3 Aug 2026 investigation, this import step appeared to have its own independent stall, separate from the PAD scheduling issue above — a multi-day backlog was processed in a burst between roughly 9:45–11:46 AM, then nothing for 3+ hours despite new files continuing to land. If consent forms are ever reported missing from Genie again despite PD@ writing files correctly to the network folder, check Capricorn's service status/logs before assuming it's a PAD problem.

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
| Amy Johnson | Business owner (BJC Health) |
| Nicole | End user / tester (Reception) |
| Errol Lim | BJC Health principal |

---

## Source Repository

`bjc-pdf-to-directory` — contains the PAD Robin flow scripts, production implementation guide, and deployment documentation.

*Last updated from source docs: 24 February 2026*
