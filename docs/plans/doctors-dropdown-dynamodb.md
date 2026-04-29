# Reference Data tab — doctors + carriers in DynamoDB

**Status:** Draft — awaiting approval
**Date:** 2026-04-29
**Path:** `/Users/sean/Projects/bjc-pdf-to-hl7/docs/plans/doctors-dropdown-dynamodb.md`

## Goal

1. Replace the free-text "Medicare Provider Number" input under **Send to specific doctor** with a **dropdown of BJC doctors**.
2. Each doctor record gains a **Medicare provider number** field.
3. Seed the 17 default BJC doctors with **fictional** provider numbers initially.
4. Rename the **Doctors** tab to **Reference Data** and put **both doctors and carriers** under it.
5. Move both lists off `localStorage` and onto **DynamoDB** so they're a single source of truth across users / browsers / the email pipeline.

## Current state (for reference)

- `lib/conversion-config.ts:17` — `DEFAULT_BJC_DOCTORS: string[]` (17 names)
- `lib/conversion-config.ts:37` — `CARRIER_OPTIONS` hardcoded array of 5 carriers (SMECAI, EMAIL, FAX, POST, HAND)
- `app/page.tsx:27-28` — `carrier` and `doctors` state, both persisted to `localStorage` (`hl7_carrier`, `bjc_doctors`)
- `app/components/DoctorsTab.tsx` — add/remove/reset UI on doctor names only
- `app/components/ConversionOptions.tsx:89-100` — carrier `<select>` reads from `CARRIER_OPTIONS` constant
- `app/components/ConversionOptions.tsx:131-141` — free-text input for `providerNumber`
- `app/page.tsx:176-178` — passes `carrier` and `orderingProvider` (typed string) to `/api/convert`
- `lib/hl7-builder.ts:228-233` — drops `orderingProvider` into PV1-9 as `<num>^^^AUSHICPR`
- `lib/vision-extractor.ts` — receives `bjcDoctors: string[]` for AI addressee resolution

## Data model

```ts
// lib/conversion-config.ts
export interface Doctor {
  id: string;              // UUID, stable across renames
  name: string;            // "Dr Irwin Lim"
  providerNumber: string;  // "2123456A" — 7 digits + 1 letter
}

export interface Carrier {
  id: string;              // UUID
  value: string;           // "SMECAI"  — goes on the wire (MSH-3)
  label: string;           // "SMECAI"  — shown in dropdown
  isDefault?: boolean;     // exactly one row carries this flag
}
```

### Provider-number format

Real Medicare provider numbers are **8 characters**: 6 digits + a numeric check digit + a location character (A–Z plus a few digits). For seeding we generate **clearly fictional** values that pass the basic visual format check but won't collide with real numbers — e.g. all start with `9` (an unused leading digit in real allocations) or use a `Z` location char. We will document seeded numbers as **"REPLACE BEFORE PRODUCTION"** in the seed script.

### Wire format to `/api/convert`

- `bjcDoctors` form field — keep as `string[]` of **names only** (vision extractor only needs names for AI addressee resolution; no change to Bedrock prompt).
- `orderingProvider` form field — unchanged (still the resolved provider-number string). The UI now derives it by looking up the selected doctor.

## DynamoDB table

**One** new table `bjc-pdf-to-hl7-reference-data` holds both doctors and carriers, partitioned by kind:

| Attribute       | Type | Role           |
|-----------------|------|----------------|
| `kind`          | S    | Partition key — `"DOCTOR"` or `"CARRIER"` |
| `id`            | S    | Sort key — UUID |
| `name`          | S    | (doctor) Display name |
| `providerNumber`| S    | (doctor) Medicare provider number |
| `value`         | S    | (carrier) MSH-3 wire value |
| `label`         | S    | (carrier) UI label |
| `isDefault`     | BOOL | (carrier) marks the default selection |
| `updatedAt`     | S    | ISO timestamp |

- `PAY_PER_REQUEST` billing (mirrors `audit` table)
- `Query` on `kind = "DOCTOR"` or `kind = "CARRIER"` returns each list in one call — no Scan
- Point-in-time recovery on (small table, operational data)
- Single table avoids a second IAM policy and second Terraform resource for the same access pattern

## Code changes

### Infra (Terraform)

**`infra/main.tf`**
- New `aws_dynamodb_table.reference_data` resource (PK `kind`, SK `id`)
- New `aws_iam_role_policy.reference_data_dynamodb` granting the Amplify compute role: `Query`, `PutItem`, `DeleteItem`, `BatchWriteItem` on the reference-data table
- New output `REFERENCE_DATA_DYNAMODB_TABLE`

### Library

**`lib/conversion-config.ts`**
- Replace `DEFAULT_BJC_DOCTORS: string[]` with `DEFAULT_BJC_DOCTORS: Doctor[]` (17 entries with fictional provider numbers)
- Replace `CARRIER_OPTIONS` with `DEFAULT_CARRIERS: Carrier[]` (5 entries; `SMECAI` flagged `isDefault: true`)
- Export `Doctor` and `Carrier` types
- Helper `doctorNames(doctors: Doctor[]): string[]` for the Bedrock prompt

**`lib/reference-data-store.ts`** (new)
- `listDoctors()` → `Query kind="DOCTOR"` → `Doctor[]`. On empty result, seeds defaults and returns them.
- `listCarriers()` → `Query kind="CARRIER"` → `Carrier[]`. Same seed-on-empty behaviour.
- `putDoctor`, `deleteDoctor`, `putCarrier`, `deleteCarrier` — single-item upsert / delete
- `seedDefaults()` → idempotent first-run; uses `BatchWriteItem` for both kinds
- Mirrors `lib/audit.ts` patterns: same region, same client construction, errors logged not thrown

**`lib/reference-data-store.test.ts`** (new) — TDD red/green
- Mocks DynamoDB client
- Cases per kind: list empty → seeds defaults; list populated → returns rows; put/delete shape; sad-path swallowing

### API

**`app/api/reference-data/route.ts`** (new) — protected by existing `middleware.ts`
- `GET` → `{ doctors: Doctor[]; carriers: Carrier[] }` (single round-trip on page load)
- `PUT` body `{ kind: "DOCTOR" | "CARRIER", item: Doctor | Carrier }` → upsert
- `DELETE ?kind=...&id=...` → remove

**`app/api/reference-data/route.test.ts`** (new) — request/response shape, auth pass-through, validation rejection paths

### UI

**`app/components/ReferenceDataTab.tsx`** (renames `DoctorsTab.tsx`)
- Two sections inside the tab: **Doctors** and **Carriers**
- Doctors section: name input + provider-number input + Add; list shows both fields per row with a remove button
- Carriers section: value input + label input + Add; list shows both per row with remove; "Set default" link per row
- "Reset to defaults" link per section

**`app/components/ConversionOptions.tsx`**
- Replace `providerNumber: string` prop with `selectedDoctorId: string` + `doctors: Doctor[]`; replace text input with a `<select>` of doctor names
- Replace import of `CARRIER_OPTIONS` constant with a `carriers: Carrier[]` prop
- `carrier` value type unchanged (still the wire string), but the option list now comes from props

**`app/page.tsx`**
- Tab label changes from `Doctors` to `Reference Data`; renders `<ReferenceDataTab>`
- Replace `useState<string[]>` + `localStorage` for both doctors and carriers with a single `useEffect` fetch from `/api/reference-data`
- Add/remove/reset handlers call the API instead of `localStorage`
- Drop `localStorage` blocks for `bjc_doctors` and `hl7_carrier` (silent migration: server is authoritative)
- Pass `bjcDoctors` to `/api/convert` as `JSON.stringify(doctors.map(d => d.name))`
- Pass `selectedDoctorId` and `carriers` into `<ConversionOptions>`; resolve `orderingProvider` from `selectedDoctorId` at submit time
- `carrier` initial value comes from `carriers.find(c => c.isDefault)?.value`

## Migration / rollout

1. Apply Terraform → table exists, IAM in place
2. Deploy code → first `GET /api/reference-data` seeds both kinds via `seedDefaults()`
3. Operators see the same 17 doctors with fictional Medicare numbers + the same 5 carriers; they edit values as they're confirmed against reality
4. Old `localStorage` keys (`bjc_doctors`, `hl7_carrier`) are silently ignored — server is authoritative

## Open questions

1. **Edit-in-place** of an existing doctor's name or provider number — include in v1, or add-only + delete-and-re-add? *(I lean v1 = add/delete only; edit can come next.)*
2. **Seeded provider numbers** — confirm we want **clearly fake** numbers (e.g. `9999991Z`) rather than realistic-looking ones, so no one mistakes them for real. *(Recommendation: yes, fake.)*
3. **Per-tenant later?** Today there's only BJC; the `tenant = "BJC"` PK leaves room for multi-tenant without a schema change.
4. **Auth scope** — `/api/doctors` is cookie-protected today; do we need a stricter admin role? *(For v1, same auth as the rest of the app is fine.)*

## Test plan (Red → Green)

1. `lib/reference-data-store.test.ts` — failing tests first for list/put/delete/seed across both kinds, then implement.
2. `app/api/reference-data/route.test.ts` — failing route shape tests, then implement.
3. Manual: `terraform apply`, `bun dev`, exercise both dropdowns end-to-end on a single PDF; confirm MSH-3 contains the selected carrier and PV1-9 contains the selected doctor's number.
4. `bun run check` (typecheck + lint + test) green.

## Out of scope

- Per-doctor delivery preferences (carrier, autoFile)
- Bulk import / CSV upload
- Audit-trail of reference-data edits
- In-place edit of existing doctor / carrier rows (v1 = add + delete only)
