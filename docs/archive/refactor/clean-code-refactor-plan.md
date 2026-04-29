# Clean Code Refactor Plan

Date: 2026-04-28

## Scope

Review target: the current Next.js PDF-to-HL7 application, especially the conversion API, Bedrock extraction layer, HL7 builder, and main client UI.

This plan focuses on clean code, maintainability, testability, and reducing change risk. It does not propose changing product behaviour unless explicitly called out.

## Executive Summary

The codebase is small and reasonably well covered by focused Bun tests, but the main responsibilities are concentrated in a few large files:

- `app/page.tsx` mixes UI layout, local persistence, upload state, detection, conversion, result display, doctor-list management, and inline SVG icons in one 700+ line component.
- `app/api/convert/route.ts` handles request parsing, validation, doctor config parsing, extraction orchestration, HL7 policy decisions, response shaping, and error handling in one route handler.
- `lib/vision-extractor.ts` contains prompt/schema definitions, Bedrock transport, normalization, validation, referral mapping, logging, and error mapping in one module.
- `lib/hl7-builder.ts` is mostly cohesive, but it would benefit from segment builders, a field-padding helper, injectable clock/id generation, and less hidden coupling to extraction-layer types.

Recommended approach: refactor around existing tests first, keeping behaviour stable. Extract pure helpers and typed contracts before moving UI and Bedrock code.

## Key Findings

### 1. Main page has too many responsibilities

Reference: `app/page.tsx:48`

`Home` owns the full converter workflow and all UI rendering. This makes local changes risky because upload handling, doctor persistence, conversion API calls, and result rendering are tightly coupled.

Problems:

- Large component is hard to scan and test.
- Inline SVGs are repeated across badges, buttons, status panels, and footer.
- Browser storage access is embedded in page logic.
- API request/response typing is local to the component, while the server returns the same contract.

Refactor direction:

- Extract `components/converter/UploadZone.tsx`.
- Extract `components/converter/ConversionOptions.tsx`.
- Extract `components/converter/ConversionResultPanel.tsx`.
- Extract `components/doctors/DoctorListEditor.tsx`.
- Move localStorage handling to `hooks/usePersistedState.ts` or `hooks/useDoctorList.ts`.
- Move shared API types to `lib/contracts/convert.ts`.

### 2. Conversion API route is orchestration-heavy

Reference: `app/api/convert/route.ts:10`

The POST handler performs validation, parsing, business rules, extraction, HL7 generation, display-data shaping, and error formatting.

Problems:

- Validation and parsing logic are not reusable outside the route.
- `documentType`, `carrier`, `orderingProvider`, and `bjcDoctors` are accepted as raw form values for too long.
- Mapping from document type to HL7 message type and display label is embedded in the route.
- Response shape is assembled ad hoc.

Refactor direction:

- Add `lib/convert/request.ts` for `parseConvertRequest(formData)` and `validatePdfFile(file)`.
- Add `lib/convert/service.ts` for `convertPdfToHL7(input)`.
- Add `lib/convert/policy.ts` for document-type to HL7 policy mapping.
- Keep the route as a thin adapter: parse request, call service, return JSON.

### 3. Bedrock extractor mixes schema, prompt, transport, normalization, and error mapping

Reference: `lib/vision-extractor.ts:52`, `lib/vision-extractor.ts:172`, `lib/vision-extractor.ts:279`

This module is the most important integration boundary. It currently contains the tool schema, large prompt, Bedrock client call, raw tool-use parsing, normalization, validation, referralInfo extraction, token usage mapping, and AWS error messages.

Problems:

- Changes to prompt wording sit next to transport and normalization code.
- Raw model output is cast directly from `Record<string, unknown>`.
- `content.find((block: any) => ...)` weakens strict TypeScript at a critical boundary.
- Error logging includes all `AWS_*` key names. That is not patient data, but it is still operationally noisy and can leak environment shape.

Refactor direction:

- Move prompt and tool schema to `lib/extraction/vision/prompt.ts` and `lib/extraction/vision/tool-schema.ts`.
- Add `lib/extraction/vision/normalize.ts` for raw tool output to domain output.
- Add small type guards for Bedrock tool-use blocks instead of `any`.
- Add `mapBedrockError(error, model, timeoutMs)` and test it directly.
- Consider injecting `BedrockRuntimeClient` or a small `VisionClient` interface to simplify unit tests.

### 4. Domain types are coupled across layers

Reference: `lib/hl7-builder.ts:7`

`hl7-builder` imports `ReferralInfo` from `vision-extractor`, which makes HL7 generation depend on the extraction implementation.

Problems:

- The domain model is defined in integration-specific modules.
- Replacing Bedrock extraction or adding another extractor would ripple into HL7 generation.

Refactor direction:

- Add `lib/domain/types.ts` containing `PatientData`, `ReferralInfo`, `DocumentType`, and possibly `ConversionOptions`.
- Import domain types from there in extraction, parsing, conversion, and HL7 modules.
- Keep extractor-specific result metadata, such as model and tokens, in extractor-specific types.

### 5. HL7 builder would benefit from deterministic dependencies

Reference: `lib/hl7-builder.ts:78`, `lib/hl7-builder.ts:94`

The HL7 builder calls `new Date()` and `Math.random()` internally.

Problems:

- Tests rely on regexes rather than deterministic expectations.
- Generated timestamps can differ between segments when calls cross a second boundary.
- `Math.random()` is adequate for a display filename, but message IDs are cleaner with `crypto.randomUUID()` or injectable ID generation.

Refactor direction:

- Add an optional internal dependency object: `{ now?: Date; messageId?: string }` or a builder context.
- Generate one timestamp per message and pass it to segment builders.
- Use `crypto.randomUUID()` or a deterministic injectable ID source.

### 6. Field construction in HL7 segments is manual and fragile

Reference: `lib/hl7-builder.ts:216`, `lib/hl7-builder.ts:242`

The builder manually pads arrays to place values in HL7 fields.

Problems:

- Field index correctness depends on loops and comments.
- Adding a new field risks off-by-one errors.
- Some field values, such as provider number and state/postcode, are not consistently escaped or normalized at the segment boundary.

Refactor direction:

- Add helper functions such as `segment(name, fieldsByNumber)` or `padFieldsUntil(fields, targetFieldNumber)`.
- Add tests that assert field positions by semantic helper, not only string contains.
- Escape all free-text values at the segment boundary.

### 7. Shared constants are duplicated or embedded in UI/API

References: `app/page.tsx:7`, `app/api/convert/route.ts:7`, `lib/vision-extractor.ts:17`

Defaults and enums are scattered across modules.

Problems:

- Document-type options are repeated in UI, API validation, and extraction schema.
- Default doctor list lives in client code, while the API has a separate `BJC_DOCTORS` fallback.
- Max file size exists only in the route and UI copy.

Refactor direction:

- Add `lib/config/constants.ts` for document types, max file size, carrier options, and default doctors.
- Derive UI options and API validation from the same constants.
- Keep environment parsing in server-only code, but normalize into the same domain shape.

### 8. Frontend error and loading states are too thin

Reference: `app/page.tsx:102`, `app/page.tsx:163`

The UI silently ignores detection failures and only shows a generic network error for conversion failures.

Problems:

- Detection failure leaves the user with `auto` without explaining what happened.
- API failure details such as warnings are discarded in some client paths.
- `alert()` is used for non-PDF upload validation.

Refactor direction:

- Add explicit `detectionError` and `conversionError` state.
- Replace `alert()` with an inline status message.
- Preserve API warnings in `ConversionResult` and display them in a collapsed/details section when useful.

### 9. Privacy/compliance claims should be protected by logging policy

References: `lib/vision-extractor.ts:417`, `app/api/convert/route.ts:82`, `app/api/convert/route.ts:145`

The current logs avoid printing extracted patient data directly, but error objects and warning arrays can drift over time.

Problems:

- There is no central logger or redaction boundary.
- Future warning strings could accidentally include PHI.
- AWS environment key-name logging is not necessary for normal operation.

Refactor direction:

- Add `lib/server/logging.ts` with structured `logOperationalError()` and `logWarning()` helpers.
- Make the default logging policy exclude request payloads, extracted fields, and file names.
- Remove or gate AWS environment key-name logging behind an explicit debug flag.

## Proposed Target Structure

```text
app/
  api/convert/route.ts
  page.tsx
components/
  converter/
    UploadZone.tsx
    ConversionOptions.tsx
    ConversionResultPanel.tsx
  doctors/
    DoctorListEditor.tsx
hooks/
  usePersistedState.ts
  useDoctorList.ts
lib/
  config/
    constants.ts
  contracts/
    convert.ts
  convert/
    policy.ts
    request.ts
    service.ts
  domain/
    types.ts
  extraction/
    index.ts
    vision/
      client.ts
      errors.ts
      normalize.ts
      prompt.ts
      tool-schema.ts
  hl7/
    builder.ts
    escape.ts
    segments.ts
    timestamp.ts
  server/
    logging.ts
```

This can be introduced incrementally. The folder names are less important than the boundaries: domain contracts, conversion orchestration, extraction integration, HL7 generation, and UI components.

## Implementation Plan

### Phase 0: Safety Net

Goal: make refactoring behaviour-preserving.

Tasks:

- Run `bun test` and record current baseline.
- Add a TypeScript check script, for example `typecheck: tsc --noEmit`, if missing.
- Add high-value tests before moving code:
  - conversion policy mapping for document type to message type/title;
  - request parsing for `documentType`, `autoFile`, `carrier`, `bjcDoctors`;
  - HL7 field-position tests for PV1-9, OBR-16, OBR-24, OBR-25;
  - vision normalization tests independent of Bedrock transport.

Acceptance criteria:

- Existing tests pass before refactor.
- New pure helper tests pass.
- No production code moved until baseline is known.

### Phase 1: Shared Domain And Constants

Goal: remove duplicated enums/defaults and cross-layer type coupling.

Tasks:

- Create `lib/domain/types.ts` for `PatientData`, `ReferralInfo`, `DocumentType`, and `HL7MessageType`.
- Create `lib/config/constants.ts` for `DOCUMENT_TYPES`, `MAX_PDF_FILE_SIZE_BYTES`, `DEFAULT_BJC_DOCTORS`, and carrier options.
- Update UI, route, extractor, and HL7 builder imports.
- Remove `hl7-builder` dependency on `vision-extractor`.

Acceptance criteria:

- No domain module imports from `app/` or integration-specific extraction modules.
- `lib/hl7-builder.ts` or its replacement imports only domain/config utilities.
- Tests pass.

### Phase 2: Thin Conversion Route

Goal: turn `app/api/convert/route.ts` into an adapter.

Tasks:

- Extract `parseConvertRequest(formData)` into `lib/convert/request.ts`.
- Extract doctor-list parsing and validation with tests.
- Extract document-to-HL7 policy into `lib/convert/policy.ts`.
- Extract `convertPdfToHL7(input)` into `lib/convert/service.ts`.
- Keep `POST` responsible only for form parsing, service invocation, and status code mapping.

Acceptance criteria:

- Route handler is short enough to read end-to-end without scrolling.
- Business rules are covered by pure unit tests.
- Route tests still cover HTTP-level validation and response shape.

### Phase 3: Split Vision Extraction Boundary

Goal: isolate LLM prompt/schema and normalize model output through typed helpers.

Tasks:

- Move `SYSTEM_PROMPT` and `EXTRACTION_TOOL` out of `vision-extractor.ts`.
- Add `isToolUseBlock()` and avoid `any` in production code.
- Extract `normalizeVisionToolInput(raw, fallbackDocumentType)` with direct tests.
- Extract `mapBedrockError()`.
- Replace direct `console.error` calls with logging helper.

Acceptance criteria:

- `extractPatientDataWithVision()` reads as: build request, call client, extract tool input, normalize, return.
- Normalization can be tested without mocking AWS SDK.
- No production `any` remains in extraction code.

### Phase 4: Harden HL7 Builder

Goal: reduce field-index fragility and make generation deterministic.

Tasks:

- Move HL7 helpers into `lib/hl7/escape.ts`, `lib/hl7/timestamp.ts`, and `lib/hl7/segments.ts`.
- Generate one timestamp per message and pass it into all segment builders.
- Add a segment field helper to place values by HL7 field number.
- Escape every externally supplied text field at segment boundaries.
- Add optional deterministic builder dependencies for tests.

Acceptance criteria:

- Tests can assert exact HL7 output for a fixed clock and ID.
- Existing REF and ORU segment-order tests still pass.
- Field placement tests use helper functions and verify critical Genie routing fields.

### Phase 5: Decompose Client UI

Goal: make the main page a composition root instead of a large workflow component.

Tasks:

- Extract upload, options, result, and doctor-list components.
- Extract conversion API calls to `lib/client/convert-api.ts` or a hook.
- Extract persistent settings to hooks.
- Replace repeated inline SVGs with small local icon components or an icon package already accepted by the project.
- Replace `alert()` with inline validation state.

Acceptance criteria:

- `app/page.tsx` mostly wires state and renders components.
- Components receive typed props and have minimal side effects.
- Client response types are imported from shared contracts.

### Phase 6: Logging And Operational Hygiene

Goal: align code with privacy and compliance claims.

Tasks:

- Create a server logging helper that redacts or avoids PHI-bearing fields.
- Remove routine AWS environment key-name logging.
- Ensure conversion failures return user-safe messages while logs retain enough non-PHI context.
- Add tests for request parsing edge cases that could otherwise leak malformed data into logs.

Acceptance criteria:

- Logs do not include PDF filenames, extracted names, DOBs, Medicare numbers, addresses, or raw model output.
- Debug-only diagnostics are gated behind an explicit environment flag.

## Suggested Order Of Pull Requests

1. Add domain constants/types and policy/request parsing tests.
2. Extract conversion service while preserving route behaviour.
3. Split vision prompt/schema/normalization/error mapping.
4. Refactor HL7 builder internals with deterministic clock/ID support.
5. Decompose client page into components and hooks.
6. Add logging helper and remove direct integration logs.

## Verification Checklist

Run after each phase:

```bash
bun test
bunx tsc --noEmit
```

For UI-facing phases:

```bash
bun run build
```

Manual smoke test:

- Upload a consent PDF and confirm ORU output downloads.
- Upload a GP referral and confirm REF output downloads.
- Verify `autoFile=false` maps to `OBR-25 = P`.
- Verify doctor routing via provider number and extracted addressee.
- Confirm failed extraction shows a useful user-facing error without exposing raw service errors.

## Non-Goals

- Replacing Bedrock or changing the extraction model.
- Changing HL7 profile semantics.
- Adding persistent storage.
- Redesigning the visual style.
- Reworking authentication beyond logging and route cleanliness.

