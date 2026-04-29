# Genie Results Routing — Sample Diff Findings

> **Status:** A1 Layer 1 deliverable (Sean's desk diff). Updated 29 Apr 2026.
> **Audience:** developer reference. No PHI.
>
> The 7 working sample HL7 files this analysis is based on live in
> `samples/genie-results-hl7-examples/` (gitignored). They were extracted
> from BJC Health's PAD pipeline drops into Genie's `LabRslts\` folder
> and represent the exact shape Genie at BJC accepts today.

## What we have

7 HL7 files Nicole confirmed are working:

| File | Message type | Has CC / referrer in PV1-9 |
|---|---|---|
| `Harris_Catherine_…` | ORU^R01 | no |
| `Long_Elizabeth_…` | ORU^R01 | yes (Dr Ng) |
| `Pala_Vanita_…` | ORU^R01 | no |
| `Tadepalli_Vinay_…` | ORU^R01 | no |
| `VAN_TILBURG_ALICE_…` | ORU^R01 | yes (Dr Celkys) |
| `Walker_Brian_…` | ORU^R01 | yes (Dr Celkys) |
| `Xiao_Laibing_…` | REF^I12 | yes (Dr Lau, addressee) |

These are not "pathology results" or "radiology results" in the strict sense — they are **fax-delivered correspondence** routed to Genie. All 6 of the ORU samples use the same OBR-4 label (`Correspondence`) regardless of the underlying document type.

## Where our converter MATCHES the working samples

These are pinned in `lib/genie-conformance.test.ts`:

- **MSH structural constants**: `^~\&` encoding, `BJCHEALTH` sending facility, `GENIE` / `CLINIC` receivers, `AL` / `NE` / `AUS` / `8859/1` ack/country/charset.
- **MSH-12** version: plain `2.4` for ORU; the AU REF-simplified profile string for REF.
- **MSH-9** message type: `ORU^R01` for results/correspondence, `REF^I12` for referrals.
- **Segment terminator**: CR only, no LF. Trailing CR after the final segment (matches the sample tail bytes `0d`).
- **Segment ordering**:
  - ORU: `MSH → PID → PV1 → OBR → OBX`
  - REF: `MSH → RF1 → PRD(s) → PID → OBR → OBX → PV1`
- **PID** layout: empty external/alternate IDs, `LastName^FirstName`, `YYYYMMDD` DOB, `M/F/U` sex, `street^^suburb^state^postcode^AUS` address.
- **PV1**: `PV1|1|O` when no doctor; `^LastName^FirstName^^^DR` in PV1-9 when the addressee/referrer is named.
- **OBR**: `RPT{ts}^{carrier}` filler order, `PDF^{label}^L` universal service id, timestamp in OBR-7 and OBR-22, result status `F` in OBR-25.
- **OBR-24** for REF: `PHY` (matches `Xiao_Laibing`).
- **OBR-16** for REF: provider number + `LastName^FirstName^^^DR^^^AUSHICPR` (matches `Xiao_Laibing`).
- **PRD** for REF: two segments — `RP~AP` (sender) with `^AUSHICPR^UPIN` provider IDs, `RT~IR` (addressee).
- **OBX**: `OBX|1|ED|PDF^Display format in PDF^AUSPDI||^application^pdf^Base64^…|||||||F`.
- **RF1**: empty 1–6, timestamp in RF1-7.

## Where our converter DIVERGES from the working samples

Two divergences, both intentional from PR 1. They are encoded as failing-on-regression tests in the **"Intentional divergences"** describe block in `lib/genie-conformance.test.ts`.

### 1. OBR-4 label for result types

| Document type | Working samples | Our converter (PR 1+) |
|---|---|---|
| `consent_form`, `generic` | `PDF^Correspondence^L` | `PDF^Correspondence^L` ✓ |
| `referral_letter`, `gp_referral` | `PDF^Referral^L` (Xiao only) | `PDF^Referral^L` ✓ |
| `pathology_result` | n/a (samples all use `Correspondence`) | **`PDF^Pathology Result^L`** |
| `radiology_result` | n/a (samples all use `Correspondence`) | **`PDF^Radiology Result^L`** |

### 2. OBR-24 for result types

| Document type | Working samples | Our converter (PR 1+) |
|---|---|---|
| `consent_form`, `generic` | empty | empty ✓ |
| `referral_letter`, `gp_referral` | `PHY` (Xiao only) | `PHY` ✓ |
| `pathology_result` | n/a (samples all empty for ORU) | **`LAB`** |
| `radiology_result` | n/a (samples all empty for ORU) | **`RAD`** |

### Why the divergence exists

PR 1 (Workstream A2–A6 of the rollout plan) introduced the `pathology_result` / `radiology_result` document types so that result PDFs land in Genie's **Pathology** / **Radiology** inboxes via OBR-24, instead of dumping into the generic Incoming Letters bucket alongside referrals.

The working samples can't validate this routing because:
- All 6 ORU samples are tagged as `Correspondence`, not as pathology/radiology results.
- BJC's PAD pipeline today doesn't classify by document type — it treats everything as correspondence.
- The samples therefore can't confirm whether Genie at BJC honours OBR-24 = `LAB` / `RAD` for ORU, or ignores it.

Per the operational guide: **without REF V8 enabled in Capricorn, OBR-24 routing is ignored and everything dumps into Pathology** (Steven Hill / Medihost owns this confirmation). If REF V8 isn't on at BJC, our `LAB` / `RAD` is silently dropped and the result still lands somewhere — but possibly the wrong inbox.

### What this means for Nicole's UI test (A1 Layer 2)

When Nicole drops a `pathology_result` or `radiology_result` HL7 from our converter into Genie:

| Outcome | Interpretation |
|---|---|
| Lands in Genie's Pathology / Radiology inbox | REF V8 is on; OBR-24 routing works; our PR 1 design is correct as shipped. |
| Lands in Pathology for everything regardless of `LAB` / `RAD` | REF V8 is off, or Genie ignores OBR-24 for ORU. Recommend disabling our diagnosticServiceSection routing for ORU and falling back to the working-sample shape (`Correspondence` + empty OBR-24). |
| Lands in Incoming Letters | Unexpected. Suggests Genie is treating the message as a referral despite `ORU^R01` MSH-9. Investigate further. |
| Does not import (unmatched / failed queue) | The patient match failed. Compare PID-3, PID-5, PID-7 against what Genie expected. Most likely the patient name format or apostrophe handling. |

Iterate forward-fix. Three or four rounds should be enough to converge.

## File extension and encoding

- **Extension**: working samples use `.hl7` (lowercase). Our `generateHL7Filename` in `lib/hl7-builder.ts` already produces `.hl7` ✓.
- **Encoding**: bytes are 7-bit ASCII for the HL7 envelope; the OBX-5 PDF payload is Base64 (also 7-bit safe). Charset declared as `8859/1` in MSH-18 ✓.
- **Line endings**: CR only. Confirmed via `xxd` on the trailing bytes of every sample (`0d` only, no `0a`).

## Patient identity in PID

The working samples **do not** include Medicare numbers in PID-3 — assigning authority is empty. Patient match is happening via `LastName^FirstName` + DOB + (sometimes) address. Our converter writes Medicare into PID-3 when present (`{number}-{ref}^^^AUSHIC^MC`), which is additive — Genie should still match by name + DOB even when our PID-3 is richer than the samples' empty field.

If Nicole reports patient-match failures, the first thing to check is whether our `LastName^FirstName` is being escaped / encoded differently than the samples (apostrophe in `O'Brien`, hyphen in `Mc-Donald`, diacritics in `Müller`). Look at `escapeHL7` in `lib/hl7-builder.ts`.

## Next steps

1. **No code change before Nicole tests.** The plan explicitly says "forward-fix on issues that surface from Nicole's UI testing post-deploy."
2. If Nicole reports OBR-24 routing isn't working for results: revert the PR 1 OBR-24 / OBR-4 routing for `pathology_result` and `radiology_result` to match the samples' `Correspondence` + empty pattern. Make the divergent behaviour conditional on a `BJC_USE_REF_V8` env flag so it can be flipped back when Capricorn is upgraded.
3. If patient match misses on apostrophe / hyphen / diacritic surnames: tighten `escapeHL7` and add focused regression tests.
4. Generate synthetic equivalents of any edge case Nicole reports, save under `docs/input PDF/results/`, and add to the conformance test.
