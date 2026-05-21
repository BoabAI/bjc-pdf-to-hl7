# 2026-05-20 BJC PDF-to-Genie Meeting — Follow-up Plan (POC / in-repo)

Source transcript: `docs/transcripts/2026-05-20-bjc-pdf-to-genie-meeting-notes.md`
Sister plan (everything outside this repo): `docs/plans/2026-05-20-production-rollout.md`

## Context

Sean (SMEC AI) and Nicole Pyne (BJC Health) met on 2026-05-20 to align on the BJC PDF-to-HL7 converter's rollout. This plan covers the **in-repo / POC** work only: code changes to the Next.js app, tests, and docs that live in this repository. The mailbox watcher, PAD workflow, operational validation in Genie, and market scan all live in the sister plan.

The meeting confirmed that the existing classification and routing work is on track, identified one immediate blocker for Nicole's hands-on testing (reference-data saves), and authorised a small classifier simplification. Most code referenced here lives at HEAD on `prod`.

---

## Gap analysis: meeting actions vs codebase state

| #   | Meeting action                                          | Status              | Evidence / location                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅  | Doctor add/edit/delete UI + provider numbers            | Shipped             | `app/reference/page.tsx`, `app/components/ReferenceDataTab.tsx`, `app/components/useReferenceData.ts`, `lib/reference-data-store.ts`. Table `bjc-pdf-to-hl7-reference-data` is **ACTIVE in ap-southeast-2** with 22 items. Compute role policy `bjc-pdf-to-hl7-reference-data-dynamodb` grants Query/PutItem/DeleteItem/BatchWriteItem. |
| ✅  | Confidence threshold fallback                           | Shipped             | `lib/settings.ts` — runtime-tunable, default 75; `lib/extraction/eligibility.ts` routes sub-threshold extractions to `low_confidence` manual review.                                                                                                                                                                                    |
| ✅  | Mailbox-as-primary-signal routing                       | Shipped             | `lib/conversion-config.ts:44-53` maps `fax-pathology@`, `fax-radiology@`, `fax-vascular@`, `admin@bjchealth.com.au` to categories; `lib/extraction/eligibility.ts` constrains candidate doc types per category.                                                                                                                         |
| ✅  | Genie routing matrix (PHY / LAB / RAD / default)        | Shipped             | OBR-24 matrix in `lib/conversion-config.ts`; REF^I12 vs ORU^R01 by doc type in `lib/hl7-builder.ts`.                                                                                                                                                                                                                                    |
| ✅  | Classification of results, referrals, consult letters   | Shipped             | Six doc types including `consult_letter` (shipped 2026-05-14, per memory `project_mailbox_primary_signal.md`).                                                                                                                                                                                                                          |
| ⚠️  | Nicole can add/edit/delete doctors (live)               | **Reported broken** | Backend intact; root cause confirmed as provider-number validator. See Action 1.                                                                                                                                                                                                                                                        |
| ❌  | Collapse `referral_letter` + `gp_referral` → `referral` | Not done            | Authorised by meeting lines 6, 80, 90: both route to PHY → Incoming Letters, distinction is internal-accounting only. See Action 2.                                                                                                                                                                                                     |
| ❌  | Move "Auto-route confidence floor" to its own tab       | Not done            | Currently buried inside `/stats` (`app/stats/page.tsx:275`). Move to a dedicated `/settings` page surfaced in the top nav. See Action 3.                                                                                                                                                                                                |
| ⏸   | Confidence threshold re-tuning                          | Deferred            | Meeting decided no change now; lever exists via `lib/settings.ts`.                                                                                                                                                                                                                                                                      |
| →   | Multi-attachment splitting strategy                     | Out of scope        | See **production-rollout** plan, Action R1.                                                                                                                                                                                                                                                                                             |
| →   | Mailbox watcher / ingestion pipeline                    | Out of scope        | See **production-rollout** plan, Action R2.                                                                                                                                                                                                                                                                                             |
| →   | Fax-first cutover dry run                               | Out of scope        | See **production-rollout** plan, Action R3.                                                                                                                                                                                                                                                                                             |
| →   | Full-day fax validation in Genie                        | Out of scope        | See **production-rollout** plan, Action R4.                                                                                                                                                                                                                                                                                             |
| →   | Market scan (Digital Health Festival)                   | Out of scope        | See **production-rollout** plan, Action R5.                                                                                                                                                                                                                                                                                             |

---

## Recommended sequencing

1. **Action 1** — Diagnose & unblock Nicole's reference-data saves (today; ~5 LOC)
2. **Action 2** — Collapse `referral_letter` + `gp_referral` → `referral` (red/green TDD; pairs naturally with Action 1 in a single PR or as a near follow-up)
3. **Action 3** — Move "Auto-route confidence floor" out of `/stats` into a dedicated `/settings` tab (small UI move)

Once Actions 1–3 are merged the in-repo POC is complete and ready for the production-rollout plan to take over.

---

## Action 1 — Diagnose & unblock Nicole's reference-data saves

**Owner:** Sean.
**Why first:** Nicole reported she cannot edit doctors. The infrastructure is provably correct (table active, IAM policy attached, env vars set, code paths exercise the right APIs), so the failure is a one-line input-validation issue.

**What we already know (from this session's diagnostics):**

- DynamoDB table `bjc-pdf-to-hl7-reference-data` exists, ACTIVE, 22 items (seeded).
- IAM policy `bjc-pdf-to-hl7-reference-data-dynamodb` on `AmplifyComputeRole-ddv0o3k8wcjhr` includes Query / PutItem / DeleteItem / BatchWriteItem.
- `AUTH_ALLOWED_DOMAINS=bjchealth.com.au,smecai.au` is set on the Amplify app — Nicole's UPN (`*.@bjchealth.com.au`) is allowed.
- `AUTH_MODE=both` — Nicole can authenticate via shared password OR Entra SSO.
- UI surfaces a "Save failed: <error>" banner from `ref.error` whenever a PUT/DELETE returns non-2xx (`app/reference/page.tsx:30-37`).

**Root cause — confirmed by live test against local API on 2026-05-20:**

- **Provider number formatting rejection.** `app/api/reference-data/route.ts:30` enforces `^[A-Z0-9]{1,12}$`. Medicare provider numbers are conventionally displayed with a space before the location/check char (e.g. `123456 7Y`); the validator rejects whitespace AND hyphens.
- Verified end-to-end: `9876 543T` → HTTP 400 _"Invalid doctor payload: providerNumber must be 1-12 alphanumeric characters (no HL7 separators)"_. `9876-543T` → HTTP 400 (same). `9876543T` → HTTP 200.
- The UI banner surfaces the raw API error verbatim, which is not actionable for Nicole.

**Chosen fix (Sean, 2026-05-20): Option A — remove the provider-number format validation entirely.**

Reasons:

- Validating Medicare provider number shape is a downstream concern (Genie / Medicare itself), not ours. We just put the value in HL7 PV1-9 / PRD-7 and route it.
- The current `^[A-Z0-9]{1,12}$` regex is itself wrong: real Medicare provider numbers are exactly 8 chars (6 digits + check digit + 1-char location), but the regex accepts anything 1–12. So it gives a false sense of correctness while still rejecting the most common copy-paste shape (`123456 7Y`).
- Letting any non-separator string through keeps Nicole unblocked for one-off non-standard cases (locum stand-ins, transitional numbers) without code changes.

**Replacement safety net — explicitly extend the HL7-separator guard to `providerNumber`.** The existing `containsHL7SeparatorOrControl()` check in `validateDoctor()` only runs against `name` today (`app/api/reference-data/route.ts:77`). When we drop `PROVIDER_NUMBER_RE` the providerNumber field becomes effectively unvalidated — a stray `|` or `^` would corrupt the HL7 PV1-9 / PRD-7 segments. Add a second branch that runs `containsHL7SeparatorOrControl(value.providerNumber)` with a clear error message. Keep `MAX_*_LEN` length caps so absurd payloads are still rejected.

**Mirror the change in the extraction path.** `lib/extraction/vision/normalize.ts:97` has the **same** strict `PROVIDER_NUMBER_RE = /^[A-Z0-9]{1,12}$/i` regex applied to provider numbers parsed from referral PDFs (line 103 returns `undefined` on a fail, silently dropping the value). If `9876 543T` is valid in the reference-data UI, it must also survive vision extraction from a PDF, otherwise the same spaced number on a referral letter goes missing from the HL7 message we build. Replace the regex test with a non-empty-after-trim + HL7-separator/control-char check. Keep the length cap.

**Must also:** improve the UI's "Save failed" banner to surface a human-readable message instead of the raw API error string (`app/reference/page.tsx:30-37`). Recommend a typed `AuthExpiredError` thrown from `referenceDataClient` on 401 so the redirect path is explicit and testable rather than buried in error-text matching.

**Secondary fixes (independent of above):**

- **Stale session / expired cookie.** With `AUTH_MODE=both`, `session.maxAge = 8h` (`lib/auth.ts:69`). A walk-away-and-come-back yields `Unauthorized`. Detect 401 in `referenceDataClient`, throw `AuthExpiredError`, and have `useReferenceData` redirect to `/login` on catch. ~15 LOC + tests.
- **Discoverability.** Add a contextual link from the converter's doctor dropdown to `/reference` so Nicole doesn't need to find it in the top nav.

**Critical files to touch:**

- `app/api/reference-data/route.ts` — remove `PROVIDER_NUMBER_RE` + `isValidProviderNumber` + the regex validation branch; add a `containsHL7SeparatorOrControl(value.providerNumber)` branch so providerNumber keeps a hard safety guard.
- `app/api/reference-data/route.test.ts` — drop tests that assert regex rejection for spaced/hyphenated numbers; add tests asserting `9876 543T` and `123456 7Y` are accepted **and** that `|`, `^`, `~`, `&`, `\`, and ASCII control chars are still rejected for providerNumber.
- `lib/extraction/vision/normalize.ts` — replace `PROVIDER_NUMBER_RE` test with a non-empty-after-trim + HL7-separator check; preserve the length cap.
- `lib/extraction/vision/normalize.test.ts` — add tests: spaced/hyphenated extracted provider numbers pass through; HL7 separator chars are dropped.
- `app/components/referenceDataClient.ts` — throw `AuthExpiredError` on 401.
- `app/components/useReferenceData.ts` — catch `AuthExpiredError` and trigger a `/login` redirect; surface friendlier text for other errors.
- `app/components/referenceDataClient.test.ts` + `app/components/useReferenceData.test.ts` (add if missing) — cover the 401 redirect path and the friendlier-error path.
- `app/reference/page.tsx` — banner copy uses the friendlier error.

**Verification (engineering-done):**

- `bun run check` passes.
- Sean adds a doctor with a spaced provider number (`9876 543T`) end-to-end against the live Amplify env; row persists in DynamoDB with the space intact (`aws dynamodb get-item …`).
- Sean edits an existing doctor's provider number to `123456 7Y`; persists.
- Sean attempts to save a doctor with `provider|num` (HL7 separator) — UI shows a friendly rejection, no DDB write.
- Sean uploads a referral PDF whose provider number contains a space; the extracted value lands in PV1-9 / PRD-7 unchanged (was previously dropped).
- Sign out and back in; changes persist.
- Sign in, idle past session expiry, click Save — UI redirects to `/login` rather than showing a raw "Unauthorized" banner.

**Handoff acceptance (does not block merge):**

- Nicole repeats the add/edit/delete flow herself against the live env and signs off.

---

## Action 2 — Collapse `referral_letter` + `gp_referral` → `referral`

**Owner:** Sean. Ships as its own PR — not small. Action 1 is the unblocker PR.

**Scope reality check:** This touches `lib/domain/types.ts`, `lib/conversion-config.ts`, the classifier prompt, the tool schema, normalize, the HL7 builder, eligibility, the contracts, the API route, the manual-override UI dropdown, audit labels, scripts, docs, and at least nine test files. Conceptually safe but mechanically wide — keep it in its own PR with a clear diff.

**Why:** The meeting (transcript lines 6, 80, 90) supports collapsing the operational distinction between letter and referral when both route to the same Genie destination — paraphrased, *"correct routing in Genie, not strict differentiation between letters and referrals when both land in the same destination."* Today `gp_referral` and `referral_letter` both route to PHY → Incoming Letters, so the model is being asked to disambiguate two types that are downstream-identical, which (a) wastes a classification dimension on something nobody acts on and (b) creates borderline cases (hospital outpatient clinic letters that look GP-ish) that consume confidence headroom without changing the outcome. Display-layer code already collapses both → "Referral letter" (`app/components/auditShared.ts:129-130`), so users won't see any UI change.

**Back-compat principle:** Historical audit rows keep their legacy `gp_referral` / `referral_letter` strings untouched (no DDB migration). The display map already handles them. New extractions emit `referral` only.

**Single source of truth for legacy aliases.** Before touching anything else, extract the alias map to a new module `lib/domain/document-type-aliases.ts` with one exported constant and one helper:

```ts
export const LEGACY_DOC_TYPE_ALIASES: Readonly<Record<string, DocumentType>> = {
  gp_referral: "referral",
  referral_letter: "referral",
};
export function resolveDocumentTypeAlias(raw: string): DocumentType | undefined { … }
```

Every consumer that needs to accept legacy input — `normalize.ts`, the API route's `documentType` form-field parser, the manual-override dropdown's input parser — imports from here. No duplicated alias tables. This is item #5 of the review.

### Red phase — failing tests for the public contract first

Write the **contract-defining** tests first, get them red, then implement. Adjacent tests (the wider list below) get updated **as they break** during the green phase — don't try to make all of them fail upfront. That's brittle and slow.

**Contract tests (must be red before any production code):**

1. **`lib/domain/document-type-aliases.test.ts`** (new)
   - `resolveDocumentTypeAlias("gp_referral")` → `"referral"`.
   - `resolveDocumentTypeAlias("referral_letter")` → `"referral"`.
   - `resolveDocumentTypeAlias("referral")` → `"referral"` (idempotent).
   - `resolveDocumentTypeAlias("garbage")` → `undefined`.

2. **`lib/conversion-config.test.ts`**
   - `DOCUMENT_TYPES` contains `"referral"`, omits `"gp_referral"` and `"referral_letter"`.
   - `allowedDocTypesForCategory("letters")` returns `["referral", "consult_letter"]`.
   - `diagnosticServiceSectionFor("referral")` returns `"PHY"`.

3. **`lib/extraction/vision/normalize.test.ts`**
   - `normalizeDocumentType("referral")` → `"referral"`.
   - `normalizeDocumentType("gp_referral")` → `"referral"`.
   - `normalizeDocumentType("referral_letter")` → `"referral"`.
   - `normalizeDocumentType("garbage")` still falls back to `"generic"`.

4. **`lib/hl7-builder.test.ts`**
   - `documentType: "referral"` produces `REF^I12` with OBR-24 = `PHY`.
   - PRD-RP / PRD-RT populated when sender / addressee present.

5. **`app/api/convert/route.test.ts`**
   - `POST /api/convert` with `documentType=referral` is accepted.
   - `POST /api/convert` with `documentType=gp_referral` or `documentType=referral_letter` is accepted and silently mapped to `referral` (route should call `resolveDocumentTypeAlias` on input).

6. **`app/components/auditShared.test.ts`** (add if missing)
   - `prettifyDocType("referral")` → `"Referral letter"`.
   - `prettifyDocType("gp_referral")` / `("referral_letter")` → `"Referral letter"` (legacy back-compat).

Run `bun test` and confirm tests 1–6 fail. **Now start the green phase.**

**Adjacent tests (update as they break during green phase, not upfront):** `lib/domain/types.test.ts` (TS union shape), `lib/extraction/vision/tool-schema.test.ts`, `lib/extraction/vision/prompt.test.ts`, `lib/extraction/eligibility.test.ts`, `lib/audit/build-row.test.ts`, `lib/contracts/convert.test.ts`, `lib/genie-conformance.test.ts`. These will fail naturally as the production code changes; fix them inline rather than authoring 50+ assertions blind.

### Green phase — minimum code to turn each test green

Implement in this order; each step turns its corresponding red tests green:

1. **`lib/domain/document-type-aliases.ts`** (new) — exports `LEGACY_DOC_TYPE_ALIASES` map and `resolveDocumentTypeAlias()` helper.
2. **`lib/domain/types.ts`** — replace `| "referral_letter" | "gp_referral"` in the `DocumentType` union with `| "referral"`.
3. **`lib/conversion-config.ts`** — update `DOCUMENT_TYPES`, `allowedDocTypesForCategory("letters")`, `diagnosticServiceSectionFor` switch, and any `isReferralDocumentType`/`isResultDocumentType` arms.
4. **`lib/extraction/vision/tool-schema.ts`** — update the enum on `documentType` field (line 31 area).
5. **`lib/extraction/vision/prompt.ts`** — replace lines 36 + 41 (two definitions) with a single `referral` definition. Reword the Australian-convention paragraph (line 142 area) to talk about `referral` vs `consult_letter` only. Drop the GP-Best-Practice phrasing.
6. **`lib/extraction/vision/normalize.ts`** — call `resolveDocumentTypeAlias()` at the top of `normalizeDocumentType` before the `DOCUMENT_TYPES.includes` check.
7. **`lib/hl7-builder.ts`** — replace the two case arms (`referral_letter`, `gp_referral`) with a single `referral` arm. Behaviour identical.
8. **`app/components/auditShared.ts`** — add `referral: "Referral letter"` to `DOC_TYPE_LABELS`. Keep `gp_referral` and `referral_letter` keys for historical rows.
9. **`lib/contracts/convert.ts`** — update the documentType union to use `"referral"`.
10. **`app/api/convert/route.ts`** — call `resolveDocumentTypeAlias()` on the `documentType` form-field input before passing to convert service.
11. **`app/components/ConversionOptions.tsx`** — update the manual-override dropdown labels (remove the two old entries, add one `Referral` entry); parse user input via `resolveDocumentTypeAlias()` so a stale URL or saved preference still works.
12. **CLAUDE.md + README.md** — update the doc-types list and the OBR-24 routing matrix.
13. **`scripts/test-vision.ts`, `scripts/generate-test-pdfs.ts`, `scripts/seed-audit-warnings.ts`** — update any hardcoded type strings.

### Refactor phase — only if needed

If the prompt rewrite materially improves classifier accuracy, no further refactor required. (Alias deduplication is already handled upfront via `lib/domain/document-type-aliases.ts` — no extract-later step.)

### End-to-end verification

- `bun run check` — typecheck + lint + all tests green.
- `bun run scripts/test-vision.ts` — live Bedrock classification on mock referrals 1–5; confirm all five classify as `referral` (was previously `gp_referral` for 2-3-5 and `referral_letter` for 1).
- `bun run scripts/diagnose-pdfs.ts` — sanity scan across full test corpus.
- Manually generate one HL7 from each of: mock_referral1 (specialist), mock_referral2 (GP), mock_referral3 (GP), mock_referral4 (short), mock_referral5 (GP). All should produce `REF^I12` with OBR-24=`PHY`.
- **Historical audit bucket integrity:** Pick a month in `/stats` whose data includes pre-collapse rows (with `gp_referral` / `referral_letter`) and post-collapse rows (with `referral`). The "Document type" pie chart must show **one** "Referral letter" slice that aggregates all three string values — not a split into legacy buckets plus a new bucket. Same check on the `/log` page's documentType filter dropdown: only "Referral letter" should appear (no orphaned `gp_referral` option).
- Spot-check audit row in DDB after one live conversion: `documentType` field is `referral`.

### Risk

- **Risk:** A consumer outside the repo (Genie, downstream HL7 viewer) relies on the OBR-24 value or message type, both of which are unchanged — so external risk is effectively zero.
- **Risk:** Old audit rows in DDB still carry `gp_referral` / `referral_letter`. Mitigation: `prettifyDocType` keeps the legacy keys in the label map (already does — explicit test #9 covers this).
- **Risk:** Classifier confidence drops on borderline GP-vs-specialist letters because the model can no longer split them. Mitigation: this is the desired behaviour — Nicole's guidance is to stop disambiguating.

---

## Action 3 — Move "Auto-route confidence floor" to its own settings tab

**Owner:** Sean. Tiny UI move; pairs with Action 1 in the same PR or ships alone.

**Why:** The confidence-floor control lives inside `/stats` today (`app/stats/page.tsx:275` → `<SettingsPanel />`). Nicole has to dig past the stats charts to find it. A dedicated `/settings` tab in the top nav makes it discoverable and treats it as a first-class ops dial.

**Scope:**

- **NEW** `app/settings/page.tsx` — mirror the `/reference` page layout (AppNav + LogoStrip + card), render `<SettingsPanel />` inside the card with a heading "Runtime settings" and a one-line description. Reuse the existing `SettingsPanel` component verbatim — it's already self-contained and fetches via `/api/settings`.
- **EDIT** `app/components/AppNav.tsx` — add `{ href: "/settings", label: "Settings" }` to `ITEMS` (line 45-52). Place it after "Reference Data" so the order reads Converter → Log → Stats → Reference Data → Settings → Data Handling → Privacy.
- **EDIT** `app/stats/page.tsx` — remove the `<SettingsPanel />` line (line 275) and its import (line 19). Stats reverts to charts-only.
- **No backend change** — `/api/settings` already exists and serves the panel.

**Critical files:**

- `app/settings/page.tsx` (new)
- `app/components/AppNav.tsx`
- `app/stats/page.tsx`
- `app/components/dashboard/SettingsPanel.tsx` — consider moving to `app/components/settings/SettingsPanel.tsx` (path matches the new page); leave for a later refactor if not done now.

**Verification:**

- Top nav shows "Settings" link; clicking lands on `/settings` with the confidence-floor slider.
- Adjust the slider, save, reload — value persists (DynamoDB round-trip).
- Visit `/stats` — confidence-floor panel is gone; charts render as before.
- Auth: `/settings` requires sign-in (no new route guard needed — `middleware.ts` already gates everything except `/login` and `/api/auth`).
- **Nav layout — desktop and mobile.** `AppNav` already uses `flex-wrap`, so an extra item is technically safe, but verify visually at common widths (≥1280 desktop, ~768 tablet, ~390 mobile). Adding a 7th item ("Settings") next to "Reference Data" could push "Data Handling" or "Privacy" onto a second row in awkward ways. If wrap looks ugly, consider abbreviating "Reference Data" → "Doctors" or moving "Data Handling" / "Privacy" into a secondary menu before merging.
- `bun run check` passes.

**Risk:** Deep links to `/stats#settings` from external systems would break — verify with grep; none expected since this was only ever an inline panel.

---

## Critical files index

| File                                                | Used in                           |
| --------------------------------------------------- | --------------------------------- |
| `app/api/reference-data/route.ts`                   | Action 1                          |
| `app/api/reference-data/route.test.ts`              | Action 1                          |
| `app/components/useReferenceData.ts`                | Action 1                          |
| `app/components/useReferenceData.test.ts` (new)     | Action 1 (401 redirect coverage)  |
| `app/components/ReferenceDataTab.tsx`               | Action 1                          |
| `app/components/referenceDataClient.ts`             | Action 1 (AuthExpiredError)       |
| `app/components/referenceDataClient.test.ts`        | Action 1 (AuthExpiredError tests) |
| `app/reference/page.tsx`                            | Action 1 (banner copy)            |
| `lib/extraction/vision/normalize.ts`                | Action 1 (provider regex), Action 2 (alias resolution) |
| `lib/extraction/vision/normalize.test.ts`           | Action 1 + Action 2               |
| `lib/reference-data-store.ts`                       | Action 1 (read-only reference)    |
| `lib/auth.ts`                                       | Action 1 (session / 401 handling) |
| `lib/domain/document-type-aliases.ts` (new)         | Action 2 (single source)          |
| `lib/domain/document-type-aliases.test.ts` (new)    | Action 2                          |
| `lib/domain/types.ts`                               | Action 2                          |
| `lib/conversion-config.ts`                          | Action 2                          |
| `lib/extraction/vision/prompt.ts`                   | Action 2                          |
| `lib/extraction/vision/tool-schema.ts`              | Action 2                          |
| `lib/extraction/eligibility.ts`                     | Action 2 (test only)              |
| `lib/hl7-builder.ts`                                | Action 2                          |
| `lib/audit/build-row.ts`                            | Action 2 (test only)              |
| `lib/contracts/convert.ts`                          | Action 2                          |
| `app/api/convert/route.ts`                          | Action 2                          |
| `app/components/ConversionOptions.tsx`              | Action 2                          |
| `app/components/auditShared.ts`                     | Action 2                          |
| `app/settings/page.tsx` (new)                       | Action 3                          |
| `app/components/AppNav.tsx`                         | Action 3                          |
| `app/stats/page.tsx`                                | Action 3                          |
| `app/components/dashboard/SettingsPanel.tsx`        | Action 3 (moved/re-mounted)       |

## Verification (end-to-end)

After Actions 1–3 are merged the in-repo POC is considered complete when:

1. `bun run check` passes locally on `prod`.
2. Nicole independently adds, edits, and deletes a doctor against the live Amplify env using a spaced provider number.
3. Mock referrals 1–5 all classify as `referral` via `bun run scripts/test-vision.ts`.
4. Dashboard `/stats` and `/log` pages still render the correct "Referral letter" bucket across both historical and new audit rows.
5. The "Settings" link appears in the top nav and `/settings` shows the confidence-floor control; `/stats` no longer embeds it.

Handoff at this point goes to the **production-rollout** plan for everything beyond the repo.
