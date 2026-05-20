# 2026-05-20 BJC Production Rollout & Integration Plan

Sister plan to `docs/plans/2026-05-20-meeting-followup.md`. This file holds the actions that live **outside** the `bjc-pdf-to-hl7` repo — mailbox watcher infrastructure, PAD workflow on BJC workstations, operational validation in Genie, and external scanning. Anything that ends up as code in this repo stays in the sibling plan.

## Context

The converter itself (this repo) is the POC and is largely done — see the sibling plan's "already shipped" table. What's left to take it from POC to live production is the **ingestion pipeline** (email → converter → Genie) and the **operational validation** of that pipeline. Both live outside the Next.js codebase.

The meeting (`docs/transcripts/2026-05-20-bjc-pdf-to-genie-meeting-notes.md`) decided to start with fax processing only, treat each email attachment independently, and keep human review available throughout. No firm dates were agreed.

---

## Action R1 — Multi-attachment splitting strategy decision

**Owner:** Sean (design); confirm with Nicole.
**Repo impact:** None expected if Option A is chosen.

**Two options:**

**Option A — Split upstream (recommended).** PAD (or whichever email runner we pick) iterates attachments and POSTs each PDF to `/api/convert` independently with the same `x-source-mailbox` header. Partial failures are per-attachment by construction. Aligns with the meeting decision to "treat each attachment separately." Zero changes to `/api/convert`.

**Option B — Multipart endpoint.** `/api/convert` accepts an array of PDFs and returns an array of results. More invasive — touches `lib/contracts/convert.ts`, `lib/convert-service.ts`, all tests, and the UI's progress state. No real benefit over Option A.

**Recommendation:** Option A. Document it in `docs/workflow/bjc-pdf-to-hl7-operational-guide.md` (in-repo doc) and treat it as the contract for Action R2.

**Deliverable:** One-paragraph decision note appended to the operational guide; no production code in this action.

---

## Action R2 — Mailbox-watching / ingestion pipeline

**Owner:** Sean (build); Nicole (operational validation).
**Repo impact:** Minimal — `/api/convert` and `lib/pad-auth.ts` already exist and are wired for the bearer-token path. The actual watcher/pipeline is external.

**Two architectural options — confirm with Nicole before building:**

**Option α — Microsoft Graph mailbox subscription (server-side).**
- Server-side polling or webhook against the BJC shared mailbox (Graph `/mail/messages`).
- Runs on a schedule (EventBridge → Lambda) or via Graph change-notifications.
- Pros: no workstation dependency, single source of truth, easy to monitor in CloudWatch.
- Cons: requires Entra app permissions on the BJC tenant (Mail.Read at minimum), tenant-admin consent, ongoing token management.

**Option β — PAD (Power Automate Desktop) on a BJC workstation.**
- PAD flow polls mailbox / folder every N minutes, calls `/api/convert` with `PAD_TOKEN` bearer auth, drops the HL7 into Genie's import folder, moves the email to a "Linked" subfolder.
- Pros: matches the reception "ready for conversion" folder workflow precisely; HL7 file landing in Genie's drop folder is a local file operation; no tenant-admin asks.
- Cons: workstation must be on; failure modes are silent unless we add notifications.

`docs/plans/automation-workflow.md` already drafted Option β as an 8-phase plan. PAD_TOKEN auth is already plumbed (`PAD_TOKEN` env var live on Amplify; `lib/pad-auth.ts` validates it). **Default to Option β unless Nicole explicitly prefers Option α.**

**External work for Option β (per `docs/plans/automation-workflow.md`):**
- Phase 2: confirm `/api/convert` accepts the PAD bearer token end-to-end (already wired but never exercised against a real mailbox).
- Phase 8: write the PAD workflow itself + onboarding doc. This is the bulk of the remaining work and lives outside the Next.js repo.

**Re-use, do not rebuild (already shipped in repo):**
- `lib/conversion-config.ts:44-53` mailbox→category mapping.
- `lib/extraction/eligibility.ts` gates the result.
- `lib/audit.ts` records every conversion.

**Verification:**
- A test email with a single PDF attachment, sent to `fax-pathology@bjchealth.com.au`, results in: (a) HL7 file in Genie's import folder, (b) audit row with `source=email` / `userEmail=fax-pathology@…`, (c) email moved to the "Linked" subfolder. Repeat for `fax-radiology@`, `fax-vascular@`, `admin@`.
- A test email with three attachments produces three audit rows (per Action R1 / Option A).
- A non-PDF attachment is left in the inbox with a clear "not converted" indicator (e.g., flag or moved to "Review").

---

## Action R3 — Fax-first cutover dry run

**Owner:** Nicole, with Sean on standby.
**Repo impact:** None.
**Scope:** Once Action R2 is live in staging, enable the watcher for the three fax inboxes only (`fax-pathology@`, `fax-radiology@`, `fax-vascular@`). Leave `admin@` disabled.
**Verification:** A handful of real fax-originated emails over a single afternoon. Inspect each in Genie: correct queue, correct patient, correct doctor.

---

## Action R4 — Full-day fax validation in Genie

**Owner:** Nicole.
**Repo impact:** None.
**Scope:** Run a full business day of real fax volume through the live pipeline. Inspect outcomes in Genie at end of day.
**Pass criteria (suggested, confirm with Nicole):** ≥ 95 % of results route to the correct queue with no human re-routing; zero results misrouted to correspondence; ≤ 5 % flagged to manual_review for genuine ambiguity (not bugs).
**On pass:** proceed to enable `admin@bjchealth.com.au` (referrals + consult letters); plan multi-attachment email rollout.
**On fail:** Sean triages, fixes, re-runs.

---

## Action R5 — Market scan (Digital Health Festival)

**Owner:** Nicole + Sean.
**Repo impact:** None.
**Scope:** Awareness only. Capture relevant alternative tooling in `docs/research/`.

---

## Sequencing

1. **R1** decides the API contract (today).
2. **R2** builds the watcher (multi-week external work).
3. **R3** cuts over to fax-only in staging.
4. **R4** validates against real volume in Genie.
5. **R5** runs in parallel, no dependencies.

R3, R4 cannot start until the in-repo prerequisites land (sibling plan: Actions 1, 2, 9). Specifically: Nicole must be able to maintain the doctor list herself before live cutover.
