# Genie addressee resolution — slim version (roster + prompt + small backstop)

## Context

Nicole (BJC Health, 6 Aug 2026) reported two issues from live PAD→Genie testing:

1. **Format mismatch** — a radiology result imported with addressee "Dr Irwin Geok San Lim" (verbatim from the document). Genie's doctor address book uses "Dr I Lim" format, so the import doesn't link to their doctor record.
2. **CC not honoured** — a letter addressed to non-BJC "Dr Brendan Cantwell" with BJC's Dr Herman Lau on the CC line imported with the external doctor as addressee. BJC wants the CC'd BJC doctor to become the addressee.

Root causes (verified):
- **The PAD path runs with no doctor list at all**: PAD sends only the PDF, `BJC_DOCTORS` env is unset everywhere, and the DynamoDB doctor reference data (`/reference`) is never read by the conversion path — so the Bedrock prompt gets no `BJC_DOCTORS` block and echoes the document's name verbatim.
- The tool schema (`lib/extraction/vision/tool-schema.ts:101-116`) describes `addresseeName` as the salutation name, contradicting the system-prompt resolution rules; the prompt never says "return the list entry verbatim" or that a CC match overrides an external primary.
- No code verifies or corrects the model's addressee. The `redacted_5` live fixture shows the model keeping an external primary over a BJC CC doctor even with a list present.

**Key simplification**: the reference-data doctor names are edited (on `/reference`, no code) to be the **exact Genie address-book strings** ("Dr I Lim", "Dr H Lau", …). The model matches against and returns those verbatim, so no format-derivation code, no `genieName` field, no UI change, and no web-client change (the web UI already sends names from the same table). `lib/hl7-builder.ts` is untouched — `parseDoctorName` turns "Dr I Lim" into `^Lim^I^^^DR` already; byte-exact goldens stay the regression gate.

## Implementation order — red/green TDD

Every code step lands as a red/green pair: write the failing tests, run `bun test <file>` and confirm they fail for the expected reason, then implement to green. No implementation before its red test exists.

1. **RED** `lib/extraction/addressee-snap.test.ts` (full case list in Step 2) → fails: module doesn't exist. **GREEN**: implement `lib/extraction/addressee-snap.ts`.
2. **RED** `lib/convert/doctor-roster.test.ts` (precedence + fallback, mocked `@/lib/reference-data-store`) → fails. **GREEN**: implement `lib/convert/doctor-roster.ts`.
3. **RED** new integration tests in `app/api/convert/route.test.ts` (PAD request receives the DDB roster; "Dr Irwin Geok San Lim" → `^Lim^I^^^DR` in `hl7Content`; Cantwell + Lau-CC → `Lau^H` + promotion warning) → fail: `convertPdf` neither loads the roster nor snaps. **GREEN**: wire roster load + snap into `lib/convert-service.ts`. The store `mock.module` lands in the same commit so existing tests don't hit real DynamoDB.
4. **RED** extend `lib/extraction/vision/prompt.test.ts` + the injection assertions in `lib/vision-extractor.test.ts` for the new prompt sentences → fail. **GREEN**: edit `prompt.ts` + `tool-schema.ts`.
5. **Regression gate**: `bun run check` — hl7-builder, golden, and genie-conformance suites pass with zero modifications.

Live scripts (Step 5) are post-implementation verification, not part of the TDD loop — they need AWS credentials and real Bedrock calls.

## Step 1 — Server-side roster load (closes the PAD gap)

**New `lib/convert/doctor-roster.ts`**:

```ts
export async function loadConversionRoster(requestDoctors?: string[]): Promise<string[]>
```
1. `requestDoctors` (form field ?? env `BJC_DOCTORS`, already coalesced by `parseConvertFormData` — unchanged) → use as-is.
2. Else `listDoctors()` from `lib/reference-data-store` → map to names. Convert route runs nodejs runtime with the compute role — same IAM path `/api/reference-data` already uses at runtime.
3. `[]`/error → `DEFAULT_BJC_DOCTORS` names. Never throws, never fails a conversion.

**Wire in `lib/convert-service.ts` `convertPdf`**: `const roster = options?.doctors ?? await loadConversionRoster(request.bjcDoctors)`; pass `roster` to `extractPatientData` (:52-57) instead of `request.bjcDoctors`. Add `doctors?: string[]` to `ConvertPdfOptions` as the test seam (mirrors the existing `settings` seam at :40-44).

## Step 2 — Slim deterministic backstop (~40 lines)

**New `lib/extraction/addressee-snap.ts`** (pure):

```ts
export function snapAddressee(
  referralInfo: ReferralInfo | undefined,
  rosterNames: string[]
): { referralInfo: ReferralInfo | undefined; warnings: string[] }
```

- No referralInfo / empty roster → pass-through, no warnings.
- Addressee already exactly a roster name (case-insensitive, trimmed) → done.
- Else match addressee against roster: normalize candidate (cut at first comma; drop tokens from the first digit-containing token onward — CC lines embed addresses/phones; strip leading titles dr/dr./prof/prof./a-prof/mr/mrs/ms). Surname = roster entry's last token, must equal a candidate token exactly (case-insensitive). Given-name compatible = either side has no givens, full first-given equality, or first-initial equality with dots stripped ("Irwin Geok San" vs "I" ✓; "John" vs "I" ✗). Exactly one compatible roster entry → snap `addresseeName` to that roster name; 2+ → ambiguous, leave as-is + warning.
- Addressee unmatched (or absent) → scan `ccNames` in order with the same matcher; first match → set `addresseeName` to the roster name, delete `addresseeClinic` (it described the demoted external primary), warning "Addressee promoted from CC line: <name>".
- Still unmatched with an addressee present → pass through verbatim + warning "Addressee not matched to BJC doctor list". Warnings stay digit-free so `redactWarning` (lib/audit.ts) doesn't drop them.
- Never mutates input; never touches sender fields or `ccNames`.

**Wire in `convertPdf`**: after the `!extraction.success` early-return, before `evaluateAutoRouteEligibility` (:102): `resolved = { ...extraction, referralInfo: snapped.referralInfo }`, merge warnings, and use `resolved` for eligibility, `buildHL7Message` (:152), the `obr16Missing` check (:159-161), and both `formatExtractedData` calls. A CC-promoted addressee then satisfies the result-doc presence check with no eligibility change.

**`lib/extraction/addressee-snap.test.ts`** (written FIRST — red; focused, ~10 tests): the two exact repros ("Dr Irwin Geok San Lim" + roster "Dr I Lim" → "Dr I Lim"; Cantwell + CC "Dr Herman Lau Level 1, 17-21 Hunter Street, PARRAMATTA NSW 2150 0283826809, 0298907655" → "Dr H Lau", clinic cleared), dotted-initial match, wrong-given rejection, ambiguity (two same-surname entries), null-addressee CC promotion, "Dear Rheumatologist" pass-through + warning, empty roster, input immutability, no-digits-in-warnings canary.

## Step 3 — Prompt + tool-schema text fixes

- `lib/extraction/vision/prompt.ts` — system rules (:105-117) and the `BJC_DOCTORS` block (:145-147): add "return the matching list entry VERBATIM as addresseeName", "a match on a CC/copy line overrides a non-BJC primary recipient", and "ccNames: names only — exclude address/phone/clinic text following the name".
- `lib/extraction/vision/tool-schema.ts` (:101-116): rewrite `addresseeName` description to match the resolution rules (currently contradicts them); extend `ccNames` description (names only).
- Update `lib/extraction/vision/prompt.test.ts` and the prompt-injection assertions in `lib/vision-extractor.test.ts` (:424-455).

## Step 4 — Data change (no code)

Ask Nicole for the **full Genie doctor list**, then edit the names on `/reference` to those exact strings ("Dr I Lim", "Dr H Lau", "Dr G Kaur", …). Flag the Kaur discrepancy: our seed says "Dr Simran Kaur" but Genie shows "Dr G Kaur" — confirm with Nicole what name appears on her documents; the roster entry's initial must match how documents name her, or neither the model nor the backstop can bridge it. Also note Genie lists doctors we don't have (e.g. Dr F Kullock). Leave `DEFAULT_BJC_DOCTORS` seeds unchanged (they only matter as a DDB-failure fallback).

## Step 5 — Live scripts (align + tighten)

- `scripts/test-result-scenarios.ts`: flip `redacted_5_imed_dexa_letter.pdf` expectation from external "Dhabuwala" to BJC "Habib" (it currently contradicts both `test-addressee-scenarios.ts` scenario 2 and Nicole's requirement).
- Both scripts: switch their rosters to Genie-format names (mirroring prod data), run `snapAddressee` on each extraction, and assert **exact** final strings ("Dr I Lim", "Dr H Lau", "Dr P Habib", …) — the current surname-substring assertions would pass "Dr Irwin Geok San Lim" for "Lim" and can never catch issue 1. Print raw + snapped addressee.

## Test changes (existing files)

| File | Change |
|---|---|
| `app/api/convert/route.test.ts` | **must land with Step 1**: `mock.module("@/lib/reference-data-store")` declared before the route import, else every test attempts a real DynamoDB call. New tests: PAD request (bearer + X-Source, no form field) → extraction receives the mocked DDB roster; DDB failure → defaults; e2e mocked-extraction addressee "Dr Irwin Geok San Lim" with roster ["Dr I Lim", …] → `hl7Content` contains `^Lim^I^^^DR`; Cantwell + Lau-CC → PRD/PV1-9 contain `Lau^H` + promotion warning. Existing `BJC_DOCTORS` env test (:683-700) unchanged. |
| **New** `lib/convert/doctor-roster.test.ts` | precedence: request names bypass DDB; DDB roster when absent; defaults on `[]`/error |
| `lib/hl7-builder.test.ts`, `lib/hl7/golden.test.ts`, `lib/genie-conformance.test.ts` | **no changes — regression gate** (builder untouched) |

## Docs (light)

- `docs/engineering/functional-spec.md`: addressee-resolution section — new roster precedence (form → env → DynamoDB → defaults), verbatim-list-entry output, CC-overrides-external rule, snap backstop.
- `docs/operations/pad-integration-guide.md` §6: the "doctor list not configured for PAD" gap is closed — server reads the DynamoDB roster automatically; `BJC_DOCTORS` env is a legacy override.
- `CLAUDE.md`: Addressee Resolution section + `BJC_DOCTORS` env row.
- Short ADR `docs/adr/0001-addressee-resolution.md` (first ADR, convention per `docs/agents/domain.md`): Genie-format names live in reference data; CC overrides external primary; slim code backstop over full matcher (and over prompt-only).
- Copy this plan to `docs/plans/` in the repo.

## Deliberately cut (vs the full plan)

`genieName` override field + store/API/contracts/UI changes, web-client change (`app/page.tsx` keeps sending names — same table, identical behavior), full matching module with exhaustive edge-case matrix, `doctorNames` widening. All can be layered on later without rework if live testing shows drift; the snap backstop occupies the same insertion point a fuller resolver would.

## Risks

- Genie's linking semantics are undocumented — Nicole must confirm linkage after deploy.
- If a doctor's Genie initial doesn't match how documents name them (the Kaur question), neither layer bridges it — resolved by data, with Nicole.
- Same-surname external doctors: the backstop requires given-name compatibility, so "Dr John Lim" never snaps to "Dr I Lim" — those stay unlinked with a warning (correct failure mode).
- Dashboard/UI now show the snapped/promoted addressee rather than the raw extraction — mention to Nicole.
- One extra DynamoDB Query per PAD conversion — negligible.

## Verification

1. `bun run check` — full suite; goldens + genie-conformance byte-identical.
2. Live Bedrock (AWS creds; ap-southeast-2 + ap-southeast-4): `bun scripts/test-addressee-scenarios.ts` and `bun scripts/test-result-scenarios.ts` — exact-string assertions green, incl. flipped redacted_5 → "Dr P Habib".
3. `bun dev` smoke: convert docs reproducing both issues; check `extractedData.addressee` and PV1-9/OBR-16/PRD in the HL7.
4. Ask Nicole to: (a) re-send the radiology result — confirm Genie links to the existing **Dr I Lim** record; (b) re-send the Cantwell letter — confirm it files under **Dr H Lau**; (c) send the full Genie doctor list (and confirm the Kaur name) so `/reference` can be updated.
