# BJC Mailbox-Primed Classification + No-Action Safety Net

Plan file: `/Users/sean/.claude/plans/users-sean-projects-bjc-pdf-to-hl7-docs-functional-reef.md`

## Context

**Trigger:** Nicole Pyne (BJC Ops) tested 17 PDFs through the converter (`docs/latest/email.txt`). 13 landed correctly in Genie; **4 referrals (3 via email, 1 via fax) were routed to Pathology/Radiology inboxes instead of Incoming Letters**. She attached 2 of the 4 in `docs/latest/` (real PHI — stays out of git):
- `testing example 1.pdf` — Cremorne Medical Practice GP → Dr Shirley Yu (BJC Chatswood). Review referral for ongoing osteoarthritis.
- `testing example 2.pdf` — Abermain Surgery GP → Dr Hugh Caterson (BJC Parramatta). Review referral for chronic urticaria management.

Both open with "Thank you for seeing [patient] for [follow-up / ongoing review]" — standard AU **review referral** phrasing, not a thank-you note. Both contain GP letterhead + "Dear Dr X" + provider-number signature. Bedrock misclassifies them as `pathology_result` / `radiology_result`, almost certainly because the body has dated problem-history lists (`2016 D-Dimer Elevation`, `09/09/2013 Osteoarthritis`) and tabular medication grids that visually resemble lab data.

**Architectural realisation (from the transcripts):** In production, PDFs don't arrive context-free. Per the 28 Apr meeting (`docs/transcripts/2026-04-28-bjc-next-steps.md`) and 4 May meeting (`docs/transcripts/2026-05-04-bjc-pdf-to-genie.md`):

| Mailbox | Source | Content (per Nicole) | Volume |
|---------|--------|----------------------|--------|
| 3 × fax-to-email inboxes | GoFax forwards each fax as a PDF attached to an email | **99% results** — pathology, radiology, vascular, etc. | ~200 docs/week |
| `admin@bjchealth.com.au` (Phase 2) | Direct inbound email | Referrals + consult letters + general correspondence + occasional spam + password-protected PDFs | Smaller volume, more mixed |

Phase 1 (imminent rollout, ~3 days dev time once signed off) connects only the 3 fax mailboxes. Phase 2 connects `admin@`. So **the mailbox tells us the doc category with very high prior** — the AI's job is sub-classification within the category, not pure free-form classification.

**Operating principle (set by Sean):** misroute is worse than no-action. Failed/disagreement docs stay in the source inbox for human handling (or are flagged in the audit log). Aim for ≥60% auto-route; the rest are reviewed by humans. This was also Nicole's explicit ask (4 May, ~14:07): "Those failed ones should be still in the inbox? Yes — no action on them."

**The new doc-type taxonomy (per Nicole, 4 May ~24:48):**
- `pathology_result`
- `radiology_result`
- `referral_letter` — initial / review referral, GP-to-specialist or specialist-to-specialist
- `consult_letter` — **new** — specialist-to-GP correspondence ("Dear Sean, thanks for referring Nicole to me, she's a lovely lady who I saw today…")
- `unknown` — fallback / no-action

(`consent_form`, `gp_referral`, `generic` remain internally but Nicole's UI labels collapse to the 5 above.)

## Approach

Three-layer pipeline. The mailbox prior is the load-bearing signal; AI does fine-grained typing inside it; the eligibility gate is the safety net.

### Layer 1 — Mailbox prior (deterministic)

PAD posts every PDF with an `x-source-mailbox` header (e.g. `fax-pathology@bjchealth.com.au`, `admin@bjchealth.com.au`). The API maps each mailbox to a **category prior**:

| Mailbox category | Allowed doc types | Default doc type |
|------------------|-------------------|------------------|
| `results` (fax mailboxes) | `pathology_result`, `radiology_result`, `unknown` | by AI sub-type |
| `letters` (admin mailbox) | `referral_letter`, `consult_letter`, `unknown` | by AI sub-type |
| `none` (web upload, no header) | all | AI free classification (current behaviour) |

The mapping lives in `lib/conversion-config.ts` so BJC can add new mailboxes later without code changes. When a doc arrives in a typed mailbox, the AI is asked to choose **only within the allowed set** — the prompt is rewritten to take a mailbox category as input and constrain the candidate doc types accordingly.

### Layer 2 — AI sub-classification (constrained by mailbox)

The Bedrock prompt is restructured so the mailbox category narrows the candidate set:
- Results mailbox → choose between `pathology_result` / `radiology_result` / `unknown`. Extract patient, ordering provider (OBR-16), result section.
- Letters mailbox → choose between `referral_letter` / `consult_letter` / `unknown`. Extract sender, addressee, patient. Distinguish referral (GP→specialist, "Thank you for seeing X for [reason]") from consult letter (specialist→GP, "Thanks for referring X, I saw her…").
- Free / no mailbox → full taxonomy, current behaviour.

Existing `letterSubtype` enum is retired in favour of the explicit `consult_letter` type — simpler and matches the BJC mental model.

### Layer 3 — Eligibility gate (no-action safety net)

Before emitting HL7, run `evaluateAutoRouteEligibility(extracted, mailboxCategory)`. If any check fails → return `{ action: "manual_review", reason }`; no HL7. Checks:

- `docTypeInMailboxCategory` — the AI's pick is within the mailbox-allowed set (catches AI confidently picking a referral from a fax-results mailbox)
- `docTypeSupported` — known doc type
- `requiredFieldsPresent` — per-type required fields (reuse `STRICT_REQUIRED_FIELDS`)
- `confidenceFloor` — `classificationConfidence ≥ 75` (configurable env)
- `mailboxHintAgrees` — already exists as `detectMailboxDisagreement` in `lib/audit/build-row.ts`, formalise the contract

PAD reads the response `action` field. If `manual_review`, the email stays in the inbox (Nicole's preferred default) and the audit log records `routingDecision = manual_review` + `routingReason`.

### Why this is much simpler than the original plan

- The 2 PDFs in `docs/latest/` arrive at `admin@` in Phase 2 → letters mailbox → candidate set excludes `pathology_result` and `radiology_result` → misclassification structurally impossible.
- Phase 1 (fax-only) misroutes drop close to zero because referrals just don't arrive at fax mailboxes.
- Bedrock's self-reported confidence stays as a soft floor, not the primary control.
- We don't need a "structural doctor-letter override" — the mailbox prior subsumes that signal.

## Changes

### 1. Doc type taxonomy

**Files:** `lib/conversion-config.ts`, `lib/extraction/vision/types.ts` (or wherever the doc-type enum lives)

- Add `consult_letter` to the enum. Map it to OBR-24 = `PHY` (Incoming Letters — same as referrals).
- Confirm internal types `consent_form`, `gp_referral`, `generic` still exist; add a display-name mapping for the dashboard/UI that collapses them per Nicole's labels:
  - `pathology_result` → "Pathology result"
  - `radiology_result` → "Radiology result"
  - `referral_letter`, `gp_referral` → "Referral letter"
  - `consult_letter` → "Consult letter"
  - everything else → "Unknown"

### 2. Mailbox category mapping

**File:** `lib/conversion-config.ts`

- New export: `MAILBOX_CATEGORIES: Record<string, "results" | "letters">`
- Seed with the production mailbox addresses (placeholders until Nicole confirms exact addresses):
  ```ts
  {
    "fax-pathology@bjchealth.com.au": "results",
    "fax-radiology@bjchealth.com.au": "results",
    "fax-vascular@bjchealth.com.au": "results",
    "admin@bjchealth.com.au": "letters",
    // sentinels used by the web UI to simulate
    "simulated:fax": "results",
    "simulated:admin": "letters",
  }
  ```
- Helper `mailboxCategoryFor(hint: string | undefined): "results" | "letters" | "none"`.
- Helper `allowedDocTypesForCategory(category)` returning the constrained candidate set used by the prompt + eligibility gate.

### 3. Bedrock prompt restructure

**File:** `lib/extraction/vision/prompt.ts`

- Accept a `mailboxCategory` argument. Three prompt branches:
  - `results` — "This document came from a fax-to-email inbox used exclusively for pathology / radiology / clinical results. Choose between `pathology_result`, `radiology_result`, or `unknown`. Do not consider referral or consult-letter categories."
  - `letters` — "This document came from an inbound correspondence mailbox. Choose between `referral_letter`, `consult_letter`, or `unknown`. Reaffirm Aussie GP convention: an opening like 'Thank you for seeing [patient] for [follow-up/ongoing review]' is a **referral letter** (GP→specialist), not a consult letter. A letter opening with 'Thanks for referring [patient], I saw her today…' is a **consult letter** (specialist→GP)."
  - `none` — current full-taxonomy prompt.
- Retire the `letterSubtype` enum and its prompt scaffolding (the new explicit doc types subsume it). Confirm no other code path consumes `letterSubtype` before removing — grep first.

### 4. Mailbox-aware normalize

**File:** `lib/extraction/vision/normalize.ts`

- Remove the bulk of the `letterSubtype` demotion gates (lines 192–330 in current code).
- Add a mailbox-aware safety net: if the model returned a doc type outside `allowedDocTypesForCategory(category)` (because we asked it to constrain and it didn't), do **not** silently coerce — let the eligibility gate fail it for human review.
- Keep state-inference / postcode extraction unchanged.

### 5. Auto-route eligibility gate

**File:** new `lib/extraction/eligibility.ts` + `lib/extraction/eligibility.test.ts`

- Export `evaluateAutoRouteEligibility(extracted, mailboxCategory): { eligible, reason?, checks }`.
- Checks:
  - `docTypeInMailboxCategory` — only enforced if mailboxCategory ≠ `none`
  - `docTypeSupported`
  - `requiredFieldsPresent` — reuse existing `STRICT_REQUIRED_FIELDS` checks
  - `confidenceFloor` — `classificationConfidence ≥ MIN_CLASSIFICATION_CONFIDENCE` (env, default 75)
- Returns the failing check name as `reason`.

### 6. Convert-service / API contract

**File:** `lib/convert-service.ts`, `app/api/convert/route.ts`

- `convertPdf` accepts `mailboxHint` (already plumbed) → derive `mailboxCategory` → pass to vision extraction → pass to eligibility gate.
- API: existing `x-source-mailbox` header is the source of truth. If absent → category = `none` → free classification.
- New response shape:
  - Success: `{ action: "auto_routed", hl7, extractedFields, audit }` (existing shape with `action` added)
  - Manual review: `{ action: "manual_review", reason, reasonDetail?, suggestedCategory, extractedFields, audit }` — **no HL7**
- HTTP status remains 200 in both cases. PAD reads `action`.

**Manual-review reason taxonomy** — the API returns one of these so PAD can tag the source email with an Outlook category (visible per-message in the inbox; Nicole's team triages by colour):

| `reason` | `suggestedCategory` (Outlook category PAD applies) | Meaning |
|----------|----------------------------------------------------|---------|
| `low_confidence` | `Needs review — Low confidence` (yellow) | `classificationConfidence` under the configured floor |
| `missing_fields` | `Needs review — Missing fields` (orange) | Required field for the picked doc type is empty (patient DOB, provider number, etc.) |
| `mailbox_mismatch` | `Needs review — Wrong inbox` (red) | AI picked a doc type outside the mailbox category's allowed set (e.g. referral arriving at fax mailbox) |
| `unknown_doc_type` | `Needs review — Unknown type` (purple) | AI returned `unknown` |
| `extraction_failed` | `Needs review — Extraction failed` (black) | Bedrock timeout / IAM / credential / parsing error |

The mapping from `reason` → Outlook category name lives in PAD config (so BJC ops can rename without code change). Our API returns both: `reason` (stable machine identifier for code logic and audit filtering) and `suggestedCategory` (human-readable default label PAD can use directly).

**Email itself stays in the source inbox** (Nicole's preferred default, confirmed 4 May ~14:07). Folder-moving is not implemented in this iteration — leave as a future option if BJC decides Outlook categories aren't prominent enough. The audit log captures the same `reason` so the dashboard can filter / chart by failure mode.

### 7. UI — inbox selector on the upload page

**File:** `app/page.tsx` (or wherever the upload form lives — check first)

- Add a dropdown labelled **"Simulate inbox"** above the drag-and-drop area, with options:
  - "None — let AI decide (web upload)" (default; current behaviour)
  - "Fax inbox (results expected)"
  - "Admin inbox (referrals / consult letters expected)"
- Selection persists in localStorage alongside `carrier` and `bjcDoctors`.
- On upload, the client sends `x-source-mailbox: simulated:fax` / `simulated:admin` / (no header) based on the selection.
- Each row in the queue UI shows the resolved category badge so Nicole sees what's being used per file.
- When the API returns `action: "manual_review"`, the row renders a clear "Manual review — `<reason>`" badge instead of a download link.

### 8. Runtime settings (dashboard-configurable confidence floor)

**Why:** the confidence minimum that gates auto-route vs manual-review is the dial Nicole will want to tune over time (start cautious ≈ 85, relax as the system proves itself). Env vars require a redeploy; localStorage is per-browser and doesn't affect server logic. Needs to live server-side and be editable from `/dashboard`.

**Files:**
- `lib/settings.ts` (new) — `getSettings()` / `updateSettings({ minClassificationConfidence })` backed by DynamoDB. In-memory cache with short TTL (e.g. 30 s) so it doesn't add latency to every `/api/convert` call. Schema: `{ minClassificationConfidence: number /* 0–100 */, updatedAt, updatedBy }`. Stored as a single well-known PK (e.g. `settings#runtime`) in the existing audit table or a new `bjc-pdf-to-hl7-settings` table — reuse the audit table to avoid Terraform churn.
- `lib/settings.test.ts` (new) — unit coverage including bounds validation (0–100 integer), default fallback (75) when no record exists, cache invalidation on update.
- `app/api/settings/route.ts` (new) — `GET` returns current settings; `PUT` updates them. Requires authenticated session (uses existing Auth.js middleware). Logs change to audit with `updatedBy = session.user.email`.
- `app/dashboard/page.tsx` — new "Settings" section (or a small panel above the donuts) containing a slider + numeric input for the confidence minimum (0–100). On save, calls `PUT /api/settings` and re-renders the metric.
- `lib/extraction/eligibility.ts` — `confidenceFloor` check reads from `getSettings()` instead of an env var. Keep `MIN_CLASSIFICATION_CONFIDENCE` env var as a *bootstrap default* used only when the settings record is empty.

**Audit:** every settings change writes an audit row with action `settings_updated`, the changed field, old and new value, and `updatedBy`.

**Future-proofing:** settings is a single record with named fields so adding `defaultCarrier`, `enabledDoctorList`, etc. is a one-field-at-a-time extension — no schema migrations.

### 9. Dashboard — manual-review visibility

**Files:** `app/dashboard/page.tsx`, `lib/audit/build-row.ts`, `lib/audit.ts`

- New audit fields: `mailboxCategory` (results / letters / none), `routingDecision` (auto_routed / manual_review), `routingReason` (one of the reason enum values when manual_review).
- Dashboard:
  - Update the existing doc-type donut to use Nicole's collapsed labels (5 categories).
  - Add a new donut: **"Auto-routed vs Manual review"** — the operational KPI Sean cares about (≥60% auto).
  - Add a new donut or stacked bar: **"By mailbox category"** so BJC sees per-mailbox volume.
  - Add a new donut: **"Manual review reasons"** — segments by `routingReason` (`low_confidence`, `missing_fields`, `mailbox_mismatch`, `unknown_doc_type`, `extraction_failed`). Tells BJC at a glance which knob to turn (lower the confidence floor? add a missing GP to the doctor list? fix a misconfigured mailbox?).
  - Audit table — new columns visible alongside existing time / patient initials / document type / source:
    - **Mailbox** — shows the source mailbox category (Fax / Admin / Web) so Nicole sees where each doc came in
    - **Routing** — colour-coded badge: green "Auto-routed" or amber "Manual review"
    - **Review reason** — when routing = manual review, shows a colour-matched badge using the same palette as the new donut (yellow Low confidence, orange Missing fields, red Wrong inbox, purple Unknown type, black Extraction failed). Blank when auto-routed.
    - Filter on the audit-table toolbar: filter rows by routing decision and by review reason.
  - CSV export includes `mailboxCategory`, `routingDecision`, `routingReason`, and `suggestedCategory` so BJC can pivot externally if they want.
  - Rename "Outcome" filter "Okay" → "Successful" per Nicole's 4 May ~23:45 feedback.

### 10. Live-validation fixtures (fictional, derived from real BJC failures)

The two PDFs in `docs/latest/` contain real patient data — **must stay out of git**. Generate Puppeteer-rendered fictional analogs preserving the structural failure pattern.

**Structural elements to preserve** (the bits that trip Bedrock):
- GP practice letterhead block (practice name, address, phone/fax/email/ABN)
- Date, addressee block, "Dear Dr [Name]" salutation
- Opening: "Thank you for seeing [patient], age [N]yrs, for [follow-up / ongoing reviews and management as needed] in relation to her [condition]…"
- Past History / Current Problems with date-prefixed rows (the layout that fools the model)
- Current Medications tabular grid
- "Yours sincerely" + signature + AHPRA/provider number
- Healthlink / Medical Objects EDI footer

**Fictional content (clinically plausible, fully invented):** patient name, DOB, address, Medicare; GP name, practice, suburb, phone/fax/email/ABN; BJC addressee from the existing default doctor list in `lib/conversion-config.ts` (Dr Irwin Lim, Dr Herman Lau, etc.); conditions/medications/dates.

**Implementation order:**

1. New script `scripts/generate-review-referral-pdfs.ts` (Puppeteer + HTML templates), modelled on `scripts/generate-test-pdfs.ts`.
2. Generate to scratch (`/tmp/...`) first; **confirm the fictional PDFs reproduce the misclassification** under the *unmodified* prompt (run `scripts/test-vision.ts` against them before applying the prompt changes). If they don't reproduce, iterate until they do — otherwise we're not locking the real bug.
3. Apply prompt + normalize + eligibility + API + UI changes.
4. Re-run `scripts/test-vision.ts` with the fictional PDFs under two mailbox categories:
   - `letters` → expect `referral_letter`, eligible, OBR-24 = `PHY`, message type `REF^I12`
   - `none` (free) → with the new prompt, should also classify as `referral_letter`
5. Move the fictional PDFs to `docs/test-pdfs/review-referrals/`, commit alongside HTML templates + code changes.

### 11. .gitignore safety

- Verify `docs/latest/` is in `.gitignore`; add if missing. This directory contains real PHI from Nicole's testing — **must not** ever be tracked.
- Run `git check-ignore docs/latest/testing\ example\ 1.pdf` as a guardrail before any commit.

### 12. Captured-but-not-implemented (reply to Nicole)

Draft `docs/latest/reply-draft.md` covering:

- **Multi-attachment emails** (Nicole's Q1): `/api/convert` accepts one PDF per POST. PAD splits multi-attachment emails upstream and posts each attachment separately — already the design; explicit confirmation.
- **Folder-within-inbox monitoring** (Nicole's Q2): the API already accepts `x-source-mailbox`. PAD will need to be extended (or a second PAD job set up) to poll a specific Microsoft Graph subfolder of `admin@` for Phase 2.
- **Outcome of her 4 misrouted docs:** explain that the production rollout will use the mailbox-as-primary-signal architecture, so the failure pattern she observed should not recur once Phase 1 PAD is wired with the `x-source-mailbox` header. Ask for the other 2 misrouted PDFs for regression coverage.
- **Manual review path:** failed / no-action docs stay in the source inbox (consistent with Nicole's expectation). They appear in the dashboard's new manual-review donut.

## Critical files

| File | Change |
|------|--------|
| `lib/conversion-config.ts` | Add `consult_letter` doc type + `MAILBOX_CATEGORIES` + `mailboxCategoryFor` + `allowedDocTypesForCategory` |
| `lib/extraction/vision/types.ts` (or where enum lives) | Add `consult_letter`; retire `letterSubtype` after grep |
| `lib/extraction/vision/prompt.ts` | Mailbox-category-conditioned prompt; remove letterSubtype scaffolding |
| `lib/extraction/vision/normalize.ts` | Remove letterSubtype demotion; keep state-inference & misc normalisation |
| `lib/extraction/vision/normalize.test.ts` | Update tests for retired logic |
| `lib/extraction/eligibility.ts` (new) | Auto-route eligibility gate; reads confidence floor from `lib/settings.ts` |
| `lib/extraction/eligibility.test.ts` (new) | Per-check coverage |
| `lib/settings.ts` (new) | Runtime settings (DynamoDB-backed, cached) — `minClassificationConfidence` etc. |
| `lib/settings.test.ts` (new) | Unit coverage including bounds + cache invalidation |
| `app/api/settings/route.ts` (new) | `GET`/`PUT` settings; authenticated session required; writes audit row |
| `lib/convert-service.ts` | Branch on eligibility; emit HL7 or `manual_review` |
| `lib/convert-service.test.ts` | Lock in both response shapes |
| `app/api/convert/route.ts` | Plumb mailboxHint → category through to service; return new shape |
| `app/page.tsx` (upload page) | Mailbox dropdown; queue UI badges; manual-review row state |
| `app/dashboard/page.tsx` | New donuts; new audit columns; rename "Okay" → "Successful"; Settings panel with confidence-floor slider |
| `lib/audit/build-row.ts` | New `mailboxCategory`, `routingDecision`, `routingReason` fields |
| `lib/audit.ts` | Audit row schema update |
| `lib/hl7-builder.ts` | Confirm `consult_letter` routes correctly (OBR-24 = `PHY`, message type `REF^I12` or whatever Genie expects for consult letters — verify with Steven) |
| `scripts/generate-review-referral-pdfs.ts` (new) | Puppeteer generator |
| `scripts/review-referral-templates/*.html` (new) | HTML templates |
| `docs/test-pdfs/review-referrals/` (new) | Generated fictional PDFs (committed) |
| `scripts/test-vision.ts` | Add fictional fixtures + per-mailbox-category expectations |
| `docs/latest/reply-draft.md` (new) | Draft reply to Nicole |
| `.gitignore` | Ensure `docs/latest/` excluded |

## Reuse / do not duplicate

- `detectMailboxDisagreement` in `lib/audit/build-row.ts:65–68` — folded into the eligibility gate as `mailboxHintAgrees` check.
- `STRICT_REQUIRED_FIELDS` env-var checks from commit `3905546` — reused in `requiredFieldsPresent`.
- `diagnosticServiceSectionFor()` in `lib/conversion-config.ts` — extend to map `consult_letter` → `PHY`.
- localStorage carrier/doctor-list pattern in `app/page.tsx` — mirror for mailbox selector.
- Existing donut chart components on `/dashboard` — reuse for new metrics.

## Open questions captured (not blockers)

- **HL7 message type for `consult_letter`:** Nicole described it as a letter that goes in Incoming Letters → likely `REF^I12` with OBR-24 = `PHY`, same as referrals. Confirm with Steven Hill (Medihost) whether Genie accepts that or needs a different MSH-9.
- **Real production mailbox addresses:** the `MAILBOX_CATEGORIES` map is seeded with assumed addresses (`fax-pathology@bjchealth.com.au` etc.). Confirm with Nicole what the actual GoFax forwarding addresses are; substitute before Phase 1 cutover.
- **PHI in fixtures:** resolved — real PDFs stay out of git; we commit Puppeteer-generated fictional analogs.
- **Other 2 misclassified PDFs from Nicole:** request via reply draft so we have regression coverage for the full failure class.
- **PAD changes:** Power Automate Desktop must be updated to populate `x-source-mailbox` on every POST. Out of this repo. Captured in reply draft.

## Execution

Implement on a new git worktree + branch off `main`. Run `bun run check` (typecheck + lint + tests) as the regression gate.

**Ordered steps inside the worktree:**

1. Verify `.gitignore` excludes `docs/latest/`; add if missing. Assert with `git check-ignore`.
2. Add `consult_letter` doc type + `MAILBOX_CATEGORIES` config.
3. Restructure prompt + remove `letterSubtype`. Update tests.
4. Build `settings.ts` (DynamoDB-backed, cached) + tests; add `/api/settings` GET/PUT.
5. Build `eligibility.ts` + tests — confidence floor reads from settings.
6. Update `convert-service` + API route for new response shape.
7. Update UI: mailbox dropdown, queue badges, manual-review state.
8. Update dashboard donuts + audit fields + Settings panel (slider + numeric input for confidence floor).
9. Generate fictional PDFs to `/tmp/`; confirm they reproduce the bug under the **previous** prompt; iterate HTML until they do.
10. Run `bun run check` — all unit tests green.
11. Run `scripts/test-vision.ts` against fictional PDFs under each mailbox category. Confirm correct routing + eligibility.
12. Live sanity check against `docs/latest/testing example 1.pdf` and `…example 2.pdf` (both under `letters` category) — confirm correct routing.
13. Smoke-test the Settings panel: change confidence floor via dashboard → confirm `/api/settings` audit row + behaviour change on the next conversion.
14. Move fictional PDFs to `docs/test-pdfs/review-referrals/`; commit alongside HTML + code.
15. `git status` + `git diff` review; no `docs/latest/*` in the diff.
16. Copy plan to `docs/plans/` per `CLAUDE.md`.
17. Report: tests pass/fail, eligibility-gate auto-route rate across all existing fixtures (KPI baseline target ≥60%), plus draft `docs/latest/reply-draft.md` ready for Sean to send.
