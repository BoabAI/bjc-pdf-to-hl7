# Archived test PDFs

This directory holds historical / superseded test fixtures kept locally for
reference. Nothing here is exercised by the active test suite, the
`/api/test-pdfs` zip download, or `scripts/test-*.ts` live Bedrock tests.

All directories here are gitignored — they may contain real or partially
real patient data and must never be committed.

## Active fixtures (kept under `docs/input PDF/`, not here)

| Directory | Used by |
|---|---|
| `referrals/` | `scripts/test-vision.ts`, `/api/test-pdfs` zip |
| `addressees/` | `scripts/test-addressee-scenarios.ts`, `/api/test-pdfs` zip |
| `results/` (top level + `results/redacted-style/`) | `scripts/test-result-scenarios.ts`, `/api/test-pdfs` zip |
| `originals/referral_dummy.pdf` | committed dummy in `/api/test-pdfs` zip |
| `originals/consent_form_real_sample.pdf` | `lib/hl7-builder.test.ts` (gitignored real consent form fixture) |

## What's here and why it was archived

| Directory | Why archived |
|---|---|
| `consent-forms/` | Synthetic consent-form variations from the old regex-based pipeline. Vision extraction handles these without dedicated fixtures. |
| `edge-cases/` (skewed/grainy/multicultural/minimal/states) | OCR / pdf-parse stress fixtures. Obsolete — Bedrock vision handles these natively. |
| `gp-referrals/` | Generic synthetic GP referrals. Superseded by `referrals/referral_{2,3}.pdf` which cover the same shape. |
| `redacted/` | Synthetic redacted-name variations. Not part of the active test suite. |
| `specialist-referrals/` | Generic synthetic specialist referrals. Superseded by `referrals/referral_{1,5}.pdf`. |
| `originals-real/` | Real PHI samples (`BP2026012137327.pdf`, `Referral_example.pdf`) from the very first iteration. Reference only — never run through the converter outside a controlled local test. |
| `results-real-samples/` | Real (redacted) result PDFs received from the field. Superseded by the synthetic `results/redacted-style/` set, which mirrors the same layouts without PHI. Reference only. |

## Regenerating

`scripts/generate-test-pdfs.ts` writes its 20+ test PDFs into this archive
directory rather than the top-level `docs/input PDF/`. If you regenerate, the
fixtures land here and won't pollute the active test set.

The active fixtures have their own focused generators:

- `scripts/generate-result-test-pdfs.ts` — pathology / radiology results
- `scripts/generate-addressee-test-pdfs.ts` — addressee resolution scenarios
