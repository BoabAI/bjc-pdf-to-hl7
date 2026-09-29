# Plan — Nicole's "unknown type" study reports (sleep / nerve conduction / eye exam)

## Context
Nicole (22 Sep 2026, "unknown type") sent 3 de-identified faxes that landed as **"Needs review — Unknown type"** and asked for a new "Study/Report" type routed to Genie **Incoming Letters**. Sean replied 23 Sep "will investigate feasibility" — she's waiting.

Established from code:
- "Unknown type" = `routingReason: unknown_doc_type`, fired **only** when the AI classifies `generic` (`lib/extraction/eligibility.ts:157-166`). Generic always → manual_review → PAD leaves the email in the Inbox.
- All `gofax.*` mailboxes resolve to category `none` (`lib/conversion-config.ts:44-60`) → no mailbox constraint; this is a pure classification miss.
- `consult_letter` already routes exactly where she wants: `REF^I12`, OBR-24 `PHY` → Incoming Letters (`isReferralDocumentType`, `diagnosticServiceSectionFor`).
- The prompt's consult_letter definition (`lib/extraction/vision/prompt.ts:~42-47`) only describes "Thanks for referring…" letters; study reports (tables, no "Dear Dr") don't match it, and they don't match pathology/radiology cues either → `generic`.
- Her copies have the patient blacked out → re-running them gives `extraction_failed`, not a reproduction.

**Decision (user, this session):** diagnose first, then widen `consult_letter` — no new DocumentType.

## Step 1 — Diagnose (read-only, before any code)
1. Query the audit table for Sept 2026 (and late Aug) rows with `routingReason = unknown_doc_type`: timestamp, `documentType`, `classificationConfidence`, `contentHash`, `warnings`. Use `listConversions` logic in `lib/audit.ts:257-321` (partition key `month`) via aws-mcp `run_script` read-only Query. Check whichever account PAD actually hits (SMEC `ddv0o3k8wcjhr` table and/or BJC `--profile bjc` table) — confirm first.
2. Match Nicole's 3 by fax timestamp (eye exam fax 25 Aug 04:08 UTC; sleep study 7 Sep 08:16 UTC; NCS visit 10/08). Confirm reason was `unknown_doc_type` (not `extraction_failed`/`low_confidence`).
3. List every other `unknown_doc_type` row → are there more document families beyond these 3 (echo, spirometry, ECG, physio, discharge summaries)? This sets the scope of the prompt change.

Outcome gates Step 2: if the 3 were **not** `generic`, stop and re-plan around the actual reason.

## Step 2 — Widen `consult_letter` (TDD, worktree off `origin/prod`)
Files:
- `lib/extraction/vision/prompt.ts`
  - Extend the consult_letter taxonomy entry: also covers **non-imaging diagnostic study / examination reports written back to the referring doctor** — sleep studies, nerve conduction / EMG, eye/optometry examination reports (and any other families found in Step 1). Visual cues: "Study Report", "Examination Report", "Referring Physician:" line, measurement tables, a Summary/Conclusion/Comment section, signed by the reporting clinician.
  - Add a discrimination bullet: imaging modality keywords → `radiology_result`; lab letterhead / reference ranges → `pathology_result`; otherwise a clinician's study/exam report → `consult_letter`. Keeps existing pathology/radiology behaviour intact.
  - Addressee rule: for these reports the addressee is the doctor on the "Referring Physician:" / "To:" line, resolved against BJC_DOCTORS (mirror the existing results rule).
- `lib/extraction/vision/prompt.test.ts` — red first: assert the new cue words and the discrimination bullet are present.
- Fixtures: generate **fictional-patient** replicas of the 3 layouts (sleep study, NCS, OPSM/Oculo eye report) under `docs/test-pdfs/letter-subtypes/` using the existing puppeteer generator pattern (`scripts/generate-test-pdfs.ts`). Never commit Nicole's real PDFs.
- `CLAUDE.md` + `docs/operations/pad-integration-guide.md` OBR-24 table: note consult_letter now includes study/exam reports.

No changes needed to `DOCUMENT_TYPES`, hl7-builder, routing, or dashboard labels.

Open risk to check during implementation: letters don't require an addressee in `checkRequiredFields` (`eligibility.ts:222-239`). A study report whose referring physician isn't on the roster would auto-file to Incoming Letters without a PV1/PRD doctor. Confirm with a fixture; if it matters, leave as-is and mention to Nicole rather than add a gate speculatively.

## Step 3 — Secondary: Bondi "processed but still in inbox" (16 Sep)
- Audit rows for Bondi around 16 Sep: if `auto_routed` but email stayed in Inbox → `Inbox/HL7_linked` likely missing/misnamed in `gofax.bon` (PAD `MoveV2` has empty ON ERROR). If `manual_review` → expected behaviour. Include the answer in the reply; no code change.

## Step 4 — Reply to Nicole
Draft via `/word-paste-html`, save to `docs/business/emails/2026-09-XX-unknown-type-reply.html`: no new type needed; these will now file to Incoming Letters (OBR-4 will read "Consult Letter"); ask her to forward any other unknown-type families. Sean sends.

## Verification
- `bun run check` (typecheck + lint + tests) green.
- Live Bedrock: `scripts/test-vision.ts` (or a small variant) against the 3 new fixtures → `consult_letter`, confidence ≥ floor, addressee resolved where roster matches.
- Regression: re-run live extraction on existing `docs/test-pdfs/results/`, `referrals/`, `letter-subtypes/` → no pathology/radiology/referral drift.
- End-to-end: `curl` `/api/convert` with a fixture on local dev (port 3001, PAD bearer + `X-Source: email`) → `auto_routed`, HL7 has `REF^I12` + OBR-24 `PHY`.
- Draft PR against `prod`; copy this plan to `docs/plans/`.

## Regression results (29 Sep 2026, live Bedrock Sonnet 4.6, 3 runs per doc per prompt)
Corpus: 69 PDFs — every committed fixture, the client's 3 de-identified samples, 9 new negative/borderline fixtures, and 25 local archive samples (consent forms, grainy/skewed scans, real result + referral samples). 414 classifications, 0 errors.

- **62/69 unchanged**, all stable 3/3 on both prompts: every referral, consult letter, pathology, radiology, consent form and urgent fixture. Urgent flag unchanged on all 69.
- **7 changed, all to `consult_letter`:** the 2 client samples and 2 fixtures that were previously `radiology_result`/`generic`, plus borderline ECG (was radiology_result), echo (was radiology_result) and spirometry (was pathology_result).
- **Must-stay-generic negatives** (Centrelink form, invoice, appointment letter, dispensing history): `generic` 3/3 on both prompts. Hospital discharge summary stays `generic` (manual review).
- **Stability:** old prompt flip-flopped on 2 docs; new prompt 0.
- Every new `consult_letter` result is ≥82% confidence; prod floor is 70.

Decision for the client: ECG / echo / spirometry would now go to Incoming Letters instead of Radiology/Pathology. ECG and spirometry were previously misfiled; echo is arguably imaging.
