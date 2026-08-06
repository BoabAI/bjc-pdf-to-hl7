# ADR 0001 — Deterministic addressee resolution with Genie-format roster names

Date: 2026-08-06
Status: Accepted

## Context

Live PAD→Genie testing (Nicole, BJC Health, 6 Aug 2026) surfaced two addressee
failures:

1. A radiology result imported with the addressee "Dr Irwin Geok San Lim"
   (verbatim from the document). Genie's doctor address book uses
   "Dr I Lim" format, so the import did not link to the doctor record.
2. A letter addressed to a non-BJC doctor with a BJC doctor on the CC line
   imported with the external doctor as addressee.

Root cause: the PAD path ran with no doctor list at all (`BJC_DOCTORS` unset,
DynamoDB reference data never read by the conversion path), and addressee
resolution was prompt-only — nothing verified or corrected the model's output.
The Bedrock tool schema even contradicted the system-prompt resolution rules.

## Decision

1. **Roster names ARE the Genie address-book strings.** The doctor reference
   data on `/reference` holds "Dr I Lim", not "Dr Irwin Lim". This removes any
   need for format-derivation code or a per-doctor override field: the model
   returns the list entry verbatim and Genie gets its own string back.
2. **The server loads the roster itself** (`lib/convert/doctor-roster.ts`):
   request `bjcDoctors` → `BJC_DOCTORS` env (legacy) → DynamoDB reference
   data → seeded defaults. The PAD path (PDF-only requests) is covered by the
   DynamoDB step; roster edits take effect without any redeploy.
3. **A CC-line BJC doctor overrides an external primary recipient** — stated
   in the prompt and enforced in code.
4. **A slim deterministic backstop** (`lib/extraction/addressee-snap.ts`)
   runs in `convertPdf` after extraction and before the eligibility gate:
   surname + given-initial matching snaps the extracted addressee onto the
   roster entry, promotes a CC match when the primary is unmatched, and emits
   digit-free advisory warnings (matching none / matching ambiguously). Given
   names must be compatible — "Dr John Lim" never snaps to "Dr I Lim".

## Alternatives rejected

- **Prompt-only fix** — the model had already been observed keeping an
  external primary over a BJC CC doctor with a list present; no determinism.
- **Full resolution module + per-doctor `genieName` override field** — extra
  store/API/UI surface that Genie-format roster names make unnecessary.
- **Rewriting name formatting in `lib/hl7-builder.ts`** — would invalidate
  the byte-exact golden and Genie-conformance suites, which instead serve as
  the regression gate proving the builder is untouched.
- **`BJC_DOCTORS` env var as the roster source** — stale by design (needs a
  rebuild per roster change) and a second source of truth next to
  `/reference`.

## Consequences

- The `/reference` roster names must be maintained in Genie format; a doctor
  whose Genie initial differs from how documents name them (e.g. Genie
  "Dr G Kaur" vs a letterhead "Dr Simran Kaur") needs the roster entry to
  match the document-facing initial or the bridge fails — resolve with BJC.
- Every conversion without request-supplied names costs one DynamoDB query.
- The dashboard and UI display the snapped/promoted addressee, not the raw
  extraction; the promotion is traceable via the audit warning.
