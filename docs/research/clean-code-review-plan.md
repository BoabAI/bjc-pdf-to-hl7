# Clean Code Review Plan

> **Status:** repo review draft. Created 30 Apr 2026.
> **Audience:** developer reference. No PHI.
>
> Scope is the current working tree, including uncommitted changes present
> during review. Product code was not changed as part of this review.

## Baseline

Quality gates are currently green:

| Check | Result |
|---|---:|
| `bun run typecheck` | pass |
| `bun run lint` | pass |
| `bun test` | 348 pass, 0 fail |

The previous archived plan in `docs/archive/refactor/clean-code-refactor-plan.md`
is partly stale. The current repo already has `lib/convert-service.ts`,
shared conversion config, extracted converter components, reference-data pages,
audit views, and broader test coverage.

## Current Shape

The codebase is in a workable state: tests are broad, the API route is thinner
than the archived plan described, and critical HL7 behaviours are pinned by
conformance tests. The remaining clean-code work is mostly about boundaries,
contracts, deterministic infrastructure, and keeping patient-data handling
explicit.

Largest current production modules:

| File | Approx. lines | Role |
|---|---:|---|
| `lib/vision-extractor.ts` | 535 | Bedrock prompt, tool schema, transport, normalization, error mapping |
| `app/components/ReferenceDataTab.tsx` | 505 | doctor/carrier editing UI |
| `lib/hl7-builder.ts` | 461 | ORU/REF HL7 segment generation |
| `app/page.tsx` | 399 | converter queue orchestration and page layout |
| `app/stats/page.tsx` | 317 | audit chart page |
| `app/components/useReferenceData.ts` | 246 | reference-data state and API persistence |

## Priority Findings

### 1. Domain types still point through integration modules

References:

- `lib/hl7-builder.ts:7`
- `lib/conversion-config.ts:1`
- `lib/pdf-parser.ts:9`

`ReferralInfo` and `DocumentType` live in `vision-extractor`, while HL7 and
conversion config import or re-export them from there. That makes the Bedrock
implementation the source of truth for domain concepts used throughout the app.

Plan:

- Add `lib/domain/types.ts` for `DocumentType`, `PatientData`, `ReferralInfo`,
  `MailboxSource`, `MessageType`, `DiagnosticServiceSection`, and result status
  aliases.
- Make `vision-extractor`, `hl7-builder`, `pdf-parser`, and
  `conversion-config` import domain types from this file.
- Keep Bedrock-specific metadata (`model`, `tokensUsed`, raw tool blocks) inside
  extraction modules only.

Acceptance criteria:

- No production module outside the extraction boundary imports domain types from
  `lib/vision-extractor.ts`.
- Existing tests pass without changed HL7 output.

### 2. Vision extraction is the main complexity hotspot

References:

- `lib/vision-extractor.ts:57`
- `lib/vision-extractor.ts:177`
- `lib/vision-extractor.ts:317`
- `lib/vision-extractor.ts:342`
- `lib/vision-extractor.ts:417`
- `lib/vision-extractor.ts:478`

`vision-extractor` mixes tool schema, prompt text, prompt assembly, Bedrock
transport, raw response parsing, patient normalization, referral normalization,
token accounting, and operational error mapping. This is cohesive by feature
but too broad for easy review.

Plan:

- Move prompt text to `lib/extraction/vision/prompt.ts`.
- Move Bedrock tool schema to `lib/extraction/vision/tool-schema.ts`.
- Move raw tool input normalization to `lib/extraction/vision/normalize.ts`.
- Move Bedrock error mapping to `lib/extraction/vision/errors.ts`.
- Keep `extractPatientDataWithVision` as a small orchestration wrapper.
- Add focused tests for `buildVisionPrompt`, `normalizeVisionToolInput`, and
  `mapBedrockError`.

Acceptance criteria:

- Transport code can be reviewed without scrolling through prompt text.
- Normalization tests run without mocking AWS SDK.
- Error mapping tests do not need a `ConverseCommand` mock.

### 3. HL7 builder should use deterministic context and safer segment helpers

References:

- `lib/hl7-builder.ts:84`
- `lib/hl7-builder.ts:100`
- `lib/hl7-builder.ts:222`
- `lib/hl7-builder.ts:248`
- `lib/hl7-builder.ts:348`
- `lib/hl7-builder.ts:457`

The HL7 builder is well tested, but it still calls `new Date()` and
`Math.random()` internally and manually pads arrays for field positions. Tests
currently compensate with regex expectations and field counts.

Plan:

- Introduce a `HL7BuildContext` containing one timestamp and one message ID per
  message.
- Let `buildHL7Message` create the context, with optional test overrides.
- Replace field-padding loops with a helper such as
  `segment(name, fieldsByNumber)` where indexes are HL7 field numbers.
- Keep `escapeHL7` at the segment boundary and export it only if tests need it.
- Consider `crypto.randomUUID()` for message IDs, with an injectable fallback
  for browser/test compatibility if this logic is reused.

Acceptance criteria:

- MSH, OBR, RF1, and filename timestamp behaviour is deterministic in tests.
- HL7 segment field-position tests become simpler, not broader.
- Generated HL7 fixtures remain byte-equivalent except for expected IDs and
  timestamps.

### 4. Conversion route still owns audit policy and duplicated routing policy

References:

- `app/api/convert/route.ts:29`
- `app/api/convert/route.ts:76`
- `app/api/convert/route.ts:78`
- `app/api/convert/route.ts:89`
- `lib/convert-service.ts:123`
- `lib/convert-service.ts:156`

The API route is thinner than before, but it still builds audit rows, repeats
message-type policy, casts `result.documentType`, and recalculates mailbox
disagreement after the service has already done it.

Plan:

- Add `lib/convert/policy.ts` for `messageTypeForDocumentType`,
  `diagnosticServiceSectionFor`, and mailbox disagreement helpers.
- Add `lib/audit/build-row.ts` or a pure `buildConversionAuditRow` helper that
  accepts request metadata, parsed request data, conversion result, and timing.
- Make `/api/convert` a thin adapter: authenticate, parse source headers, parse
  form data, call service, record audit row, return JSON.
- Make `ConvertResult.documentType` typed as `DocumentType` instead of `string`.

Acceptance criteria:

- Audit-row construction has direct unit tests without `NextRequest`.
- Route tests shrink to adapter-level behaviours.
- No `as DocumentType` cast is needed in the route.

### 5. Client/server contracts are duplicated and weakly validated

References:

- `lib/convert-service.ts:31`
- `app/components/ConversionResultPanel.tsx:3`
- `app/components/useReferenceData.ts:51`
- `app/components/useReferenceData.ts:54`
- `app/api/reference-data/route.ts:22`
- `app/api/reference-data/route.ts:35`

The server `ConvertResult` contract and the client `ConversionResult` contract
are separate. Client reference-data loading casts JSON directly to `Doctor[]`
and `Carrier[]`, while the server has separate validation logic.

Plan:

- Add `lib/contracts/convert.ts` and `lib/contracts/reference-data.ts` with
  shared response types and small runtime guards safe for client bundles.
- Include `warnings` and `mailboxDisagreement` in the client conversion result
  type so important operational warnings are not dropped.
- Validate `/api/reference-data` responses in `useReferenceData` before setting
  state.
- Use the same guard functions in `app/api/reference-data/route.ts` where
  practical, keeping AWS-only code out of client bundles.

Acceptance criteria:

- Client and server import the same public response contracts.
- Failed or malformed reference-data responses fall back intentionally and set
  an inspectable error state.
- Mailbox/content mismatch warnings can be surfaced in the UI.

### 6. Reference-data mutations are optimistic but not resilient

References:

- `app/components/useReferenceData.ts:98`
- `app/components/useReferenceData.ts:108`
- `app/components/useReferenceData.ts:128`
- `app/components/useReferenceData.ts:137`
- `app/components/useReferenceData.ts:148`
- `app/components/useReferenceData.ts:158`
- `app/components/useReferenceData.ts:184`
- `app/components/useReferenceData.ts:202`

The hook updates local state before persistence and logs failures without
rollback or user-visible error state. The low-level `fetch` helpers also do not
check `response.ok`, so a server 400/500 can look like success.

Plan:

- Add a small reference-data API client with `getReferenceData`, `putReferenceRow`,
  and `deleteReferenceRow` that checks HTTP status and response body.
- Add `saving` and `error` state to `useReferenceData`.
- Either rollback failed optimistic updates or switch to pessimistic saves for
  reference-data edits.
- Move duplicate `newId()` logic to one client-safe utility.

Acceptance criteria:

- Failed saves are visible to the page and tests.
- `fetch` returning HTTP 500 is treated as failure.
- The active carrier cannot point at a deleted or failed-to-save carrier.

### 7. Converter page still owns queue orchestration and some presentational detail

References:

- `app/page.tsx:19`
- `app/page.tsx:54`
- `app/page.tsx:84`
- `app/page.tsx:144`
- `app/page.tsx:162`
- `app/page.tsx:186`
- `app/page.tsx:267`
- `app/page.tsx:360`

The main page is much smaller than it was, but it still owns file queue state,
pre-detection, conversion request building, sequential conversion, download
logic, supported-format badges, and the primary page layout.

Plan:

- Extract `useConverterQueue` for entries, detection, sequential conversion,
  remove/reset, and counts.
- Add a `convertClient.ts` helper for building form data and parsing responses.
- Derive supported-format badges from shared document-type metadata instead of
  hard-coded repeated SVG spans.
- Replace `alert()` on skipped non-PDF files with inline queue feedback.
- Move download creation to a tiny `downloadTextFile` client utility.

Acceptance criteria:

- `app/page.tsx` mostly composes hooks and components.
- Queue rules are unit-testable without rendering the full page.
- Non-PDF skip feedback is testable and does not block the browser.

### 8. Audit UI has duplicated date/filter scaffolding

References:

- `app/components/auditShared.ts:27`
- `app/components/auditShared.ts:119`
- `app/components/auditShared.ts:187`
- `app/log/page.tsx:61`
- `app/stats/page.tsx:184`
- `app/api/logs/route.ts:9`

The log and stats pages now share data-fetching hooks, which is good. They
still duplicate date-picker headers, loading/error/empty state layout, and the
Sydney month logic exists in both client and API code.

Plan:

- Extract an `AuditDateRangeHeader` component shared by log and stats pages.
- Extract `AuditPageState` for loading/error/empty wrappers.
- Move Sydney date helpers to a small shared date module that is safe for both
  server and client imports.
- Keep the client-side `AuditRow` type decoupled from AWS SDK imports, but make
  it a deliberate public contract rather than a local mirror.

Acceptance criteria:

- Log and stats pages no longer duplicate date controls.
- API and UI use the same date formatting/parsing helper where possible.
- Client bundles do not pull AWS SDK modules.

### 9. Logging and privacy boundaries should be centralized

References:

- `lib/vision-extractor.ts:479`
- `lib/vision-extractor.ts:482`
- `lib/vision-extractor.ts:487`
- `lib/convert-service.ts:143`
- `app/api/convert/route.ts:123`
- `lib/auth.ts:78`

The repo has strong tests around audit rows not leaking patient identifiers.
Operational logging is less centralized. Some logs print raw error objects, AWS
environment key names, or rejected sign-in claim values. These are not HL7
payloads, but they are still privacy and operations policy decisions scattered
across modules.

Plan:

- Add `lib/server/logging.ts` with `logOperationalError`, `logAuditFailure`,
  and `logAuthRejection`.
- Redact known sensitive fields by default and avoid logging request payloads,
  extracted patient fields, filenames, or raw document metadata.
- Remove AWS environment key-name logging or gate it behind an explicit debug
  environment flag.
- Convert user-facing warning strings and log strings into separate concepts so
  warnings cannot accidentally include PHI and then be returned to the browser.

Acceptance criteria:

- Production code uses one logging helper for server-side operational errors.
- Tests cover redaction for representative error-like objects.
- Privacy page claims stay aligned with actual logging behaviour.

### 10. Large fixture scripts should be treated as tooling debt, not product debt

References:

- `scripts/generate-test-pdfs.ts`
- `scripts/generate-redacted-style-test-pdfs.ts`
- `scripts/pdf_to_hl7.py`
- `scripts/generate-result-test-pdfs.ts`

Several script files are large, but they appear to be fixture and diagnostic
tools rather than runtime code. Refactoring them before the product boundaries
would create churn with little user-facing benefit.

Plan:

- Leave scripts alone unless actively changing fixture generation.
- When touched, add a short module header documenting purpose, inputs, outputs,
  and whether generated files are committed.
- Prefer extracting repeated PDF drawing primitives only when multiple scripts
  need the same change.

Acceptance criteria:

- Runtime clean-code phases do not include script rewrites.
- Any future script change is documented enough for repeatable fixture work.

## Phased Implementation Plan

### Phase 0: Guardrails

Goal: keep behaviour stable while moving boundaries.

Tasks:

- Commit or stash unrelated work before refactoring, or clearly isolate each
  phase in its own branch/PR.
- Keep `bun run check` green at the start and end of each phase.
- Do not change Genie routing, segment order, OBR labels, OBR-24 policy, auth
  policy, or audit row semantics without an explicit product decision.

Done when:

- Current baseline is reproducible.
- Each phase can be reviewed independently.

### Phase 1: Domain and Contracts

Goal: make domain concepts independent from Bedrock and UI components.

Tasks:

- Add `lib/domain/types.ts`.
- Add `lib/contracts/convert.ts`.
- Add `lib/contracts/reference-data.ts`.
- Update imports and remove integration-owned domain type exports.

Done when:

- No domain type imports flow from `vision-extractor` into HL7, config, API, or
  UI modules.
- Convert and reference-data response contracts are shared by server and client.

### Phase 2: Vision Extraction Boundary

Goal: make Bedrock extraction reviewable in small pieces.

Tasks:

- Split prompt, tool schema, prompt assembly, normalization, and error mapping.
- Add focused tests for each pure helper.
- Keep `extractPatientDataWithVision` public behaviour unchanged.

Done when:

- `lib/vision-extractor.ts` is primarily orchestration.
- Existing `lib/vision-extractor.test.ts` plus new helper tests pass.

### Phase 3: HL7 Builder Boundary

Goal: reduce field-index fragility and nondeterministic tests.

Tasks:

- Add a deterministic build context.
- Introduce segment field helpers.
- Refactor MSH, PV1, OBR, RF1, PRD, PID, and OBX incrementally.

Done when:

- Conformance tests still pass.
- Segment builders are easier to inspect for exact HL7 field positions.

### Phase 4: Convert Route and Audit

Goal: make `/api/convert` an adapter, not a policy container.

Tasks:

- Move audit-row construction to a pure helper.
- Move remaining message-type policy to shared conversion policy.
- Make failure audit rows use the same builder path.

Done when:

- Route tests focus on auth, form parsing, service delegation, audit delegation,
  and response status.
- Audit policy has direct unit tests.

### Phase 5: Client State and UI Contracts

Goal: make UI workflows testable and failure-aware.

Tasks:

- Add a converter API client and `useConverterQueue`.
- Add a reference-data API client and resilient save states.
- Display conversion warnings, especially mailbox/content mismatches.
- Extract audit page shared date controls and page states.

Done when:

- Main pages are mostly composition.
- User-visible failures are represented in state, not only `console.error`.

### Phase 6: Logging Policy

Goal: make operational logs align with privacy/compliance claims.

Tasks:

- Add a central server logger with redaction.
- Replace scattered direct error logging in server-side runtime paths.
- Gate debug-only environment diagnostics behind an explicit flag.

Done when:

- Redaction tests pass.
- A reviewer can audit logging policy in one place.

## Suggested Target Structure

```text
lib/
  contracts/
    convert.ts
    reference-data.ts
  convert/
    policy.ts
  domain/
    types.ts
  extraction/
    vision/
      client.ts
      errors.ts
      normalize.ts
      prompt.ts
      tool-schema.ts
  hl7/
    builder.ts
    escape.ts
    segment.ts
    timestamp.ts
  server/
    logging.ts
app/
  components/
    audit/
      AuditDateRangeHeader.tsx
      AuditPageState.tsx
    converter/
      useConverterQueue.ts
      convertClient.ts
    reference-data/
      referenceDataClient.ts
```

This structure is illustrative. The important rule is directional dependency:
domain types and contracts at the bottom, integrations at the edge, UI and API
adapters depending inward.

## Non-goals

- Do not rewrite the app into a new framework or state library.
- Do not change Bedrock model choice, Genie routing policy, or HL7 segment
  semantics as part of clean-code work.
- Do not refactor generated fixtures or diagnostic scripts before runtime
  boundaries are cleaned up.
- Do not add broad abstractions unless they reduce existing duplication or make
  a risky boundary directly testable.

## Recommended First PR

Start with Phase 1 only:

1. Add `lib/domain/types.ts`.
2. Move `DocumentType`, `PatientData`, and `ReferralInfo` into it.
3. Update imports in `vision-extractor`, `pdf-parser`, `hl7-builder`,
   `conversion-config`, and API/UI files.
4. Add shared convert/reference-data contracts only if the type move stays small;
   otherwise make contracts PR 2.
5. Run `bun run check`.

This gives immediate dependency-direction improvement with low behavioural risk.
