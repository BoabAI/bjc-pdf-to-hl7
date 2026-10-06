# Plan: show the source mailbox in the audit log UI

**Status:** proposed 2026-08-28 — docs only, no code until approved.
**Why now:** `gofax.cht@` goes live Tue 1 Sep 2026, `gofax.bon@` + `gofax.bow@` 8 Sep. Today every PAD row shows Source = "Email"; with four mailboxes ops can't tell which location a document came from.

## Current behaviour (verified)

| Layer | What happens to the mailbox |
|---|---|
| `convert.ps1` (as-built, PR #14 branch) | Sends `X-Source-Mailbox: $Mailbox` — but `$Mailbox` is a **hardcoded** `'gofax.par@bjchealth.com.au'` |
| `app/api/convert/route.ts:54-56` | Header → `mailboxHint` (legacy enum, undefined for an address) + `mailboxCategory` (`MAILBOX_CATEGORIES` lookup → `"none"` for all `gofax*`). Raw address discarded |
| `lib/audit.ts` `AuditRow` | Fields `mailboxHint?`, `mailboxDisagreement?`, `mailboxCategory?` — no address |
| `app/log/page.tsx:36-39` `mailboxDisplay()` | `results`→"Fax (results)", `letters`→"Admin (letters)", else `source==="email"`→"Email" |
| `app/log/page.tsx` CSV | exports `mailboxCategory` (= `none`) |
| `app/stats/page.tsx:221` | mailbox pie keyed on `mailboxCategory` → one "none" slice |

## Requirements

Functional requirements with acceptance criteria. Each maps to a test in the "Tests" section.

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **R1** | Every conversion request from the PAD pipeline records the mailbox it was polled from | Given `X-Source: email` and `X-Source-Mailbox: GoFax.Par@bjchealth.com.au`, when the request is processed (auto_routed, manual_review, 400/422, or thrown error), then the audit row has `mailboxAddress = "gofax.par@bjchealth.com.au"` (trimmed, lower-cased) |
| **R2** | Legacy header values are not stored as addresses | Given `X-Source-Mailbox: results` (or `referrals`, `simulated:fax`, `simulated:admin`), then `mailboxAddress` is undefined and `mailboxHint` / `mailboxCategory` behave exactly as today |
| **R3** | Missing header is tolerated | Given no `X-Source-Mailbox` header, then `mailboxAddress` is undefined and the request succeeds (no 4xx) |
| **R4** | Web uploads never carry a mailbox | Given a browser (`X-Source: web` / cookie) upload, then `mailboxAddress` is undefined even if the header is present |
| **R5** | Existing mailbox-category behaviour is unchanged | `gofax*` mailboxes remain unmapped → `mailboxCategory = "none"`, no `mailbox_mismatch` gate, no change to the Bedrock candidate set. All existing route/eligibility tests still pass |
| **R6** | Audit row validation accepts the new field *(defensive only — see F3)* | `isAuditRow` accepts a row with `mailboxAddress: string` and with it absent; rejects a non-string value. Rows written before this change still validate and load |
| **R7** | The `/log` Source column identifies the mailbox | Given a row with `mailboxAddress`, then the column shows the local part (`gofax.par`, `gofax.cht`, `gofax.bon`, `gofax.bow`) with the full address in the cell `title`. Given a legacy email row without it, the column still shows "Email"; web rows show "Web"; mapped categories keep their existing labels |
| **R8** | Rows can be filtered by mailbox | A "Mailbox" dropdown lists "All" plus every distinct `mailboxAddress` in the loaded month (sorted); selecting one hides other rows and composes with the existing routing/reason filters. *(Amended per F5: the KPI header counts the unfiltered month today — unchanged, out of scope.)* |
| **R9** | CSV export includes the mailbox | The CSV has a `mailboxAddress` column immediately after `source`; empty string for rows without one; header row updated |
| **R10** | `/stats` breaks down volume per mailbox | The mailbox pie is keyed on `mailboxAddress ?? mailboxCategory`; the legend shows local parts; ≥5 distinct colours so four mailboxes plus legacy "none" are distinguishable |
| **R11** | No PHI leakage | `mailboxAddress` is a BJC service mailbox, never a patient or staff address; it is not written to operational logs (`logOperationalError`) beyond what `source` already is |
| **R12** | One PAD flow serves all mailboxes | `convert.ps1` takes the mailbox as a parameter (no hardcoded `$Mailbox`); the Robin `LOOP FOREACH` passes the current mailbox to both the O365 connector calls and the script, so the header always matches the polled mailbox. Verified by one row per mailbox on `/log` after the first scheduled run across ≥2 mailboxes |
| **R13** | Documentation matches behaviour | PAD guide §5/§8/§12, functional spec, operational guide and `CLAUDE.md` describe `mailboxAddress`; the incorrect "recorded in the audit log" claim is replaced |

**Non-functional**
- No schema migration: DynamoDB is schemaless; the field is optional and additive. No backfill.
- No new env vars, IAM, or Terraform changes.
- Deployed to `prod` and verified with a curl (`X-Source-Mailbox: gofax.cht@…` → row visible on `/log`) **before 1 Sep 2026 13:00 AEST**.

## Review findings (verification pass, 2026-08-31)

Codex was unavailable (its configured backend `claude-code-router` on `127.0.0.1:3456` is not installed/running), so this pass was done directly against the code. Six corrections — two of them shrink the work.

**F1 — the plan threads the field through the wrong module (simplification).** Audit rows are not built in `convert-service.ts`. They are built in `lib/audit/build-row.ts` by `buildConversionAuditRow()` (`app/api/convert/route.ts:136`) and `buildFailureAuditRow()` (`:162`), both taking a single `AuditRowMeta` (`lib/audit/build-row.ts:66`), and written by `safeRecord()` (`route.ts:33`). `convertPdf()` never touches the audit table. **Therefore `mailboxAddress` must NOT be added to `ConvertRequest` / `lib/convert/form-data.ts` — it only needs to reach `AuditRowMeta`.** Delete that half of Change §1.

**F2 — R1's "every outcome" is satisfied for free.** Because both call sites pass the same meta object, one field on `AuditRowMeta` covers auto_routed, manual_review, thrown errors *and* the 422 strict path — the strict path writes its row at `route.ts:152` **before** returning 422 at `:155`. No separate 422 work.

**F3 — `isAuditRow` is not exported and does not reject unknown fields** (`lib/audit.ts:352`, a positive whitelist; `listConversions` filters through it at `:272`). Rows carrying `mailboxAddress` load correctly even if the guard is left untouched, so R6 is defensive-only, not a blocker. It also cannot be unit-tested directly — follow the existing indirect pattern via `listConversions` (`lib/audit.test.ts:476,497`).

**F4 — `/api/logs` needs no change.** It returns rows wholesale (`app/api/logs/route.ts:41`); there is no projection or field list. Drop it from consideration.

**F5 — R8 is wrong about KPI counts.** The header KPIs are computed from `rows`, not `filteredRows` (`app/log/page.tsx:142-151`, `count={rows.length}` at `:204`), so the *existing* routing/reason filters already do not change them. R8 is amended: the mailbox filter must compose with the other filters over `filteredRows`; leaving the KPI header on the unfiltered month is pre-existing behaviour and out of scope (raise separately if ops want filtered KPIs).

**F6 — live bug that R10 incidentally fixes.** `app/stats/page.tsx:221-228` labels every row whose `mailboxCategory` is neither `results` nor `letters` as **"Web upload"** — which today includes *every* PAD fax row, since `gofax*` is deliberately unmapped. The stats pie is currently mislabelling Parramatta fax conversions as web uploads. Keying on `mailboxAddress ?? mailboxCategory` fixes it; also fix the fallback so an email-source row without an address reads "Email (unknown mailbox)", not "Web upload".

**Existing tests at risk:** none identified. All changes are additive optional fields; no existing assertion reads the mailbox fields except the category tests, which are untouched (R5). `app/log/page.tsx` CSV column-order assertions (if any) will need the new header.

**Revised ordered task list**
1. `lib/audit.ts` — add `mailboxAddress?: string` to `AuditRow` (+ optional guard line).
2. `lib/audit/build-row.ts` — add `mailboxAddress: string | undefined` to `AuditRowMeta`; emit conditionally in both builders (same `...(x !== undefined ? {x} : {})` style used for `mailboxCategory` at `:149`/`:189`).
3. `app/api/convert/route.ts` — derive `mailboxAddress` from the header next to `mailboxHint`/`mailboxCategory` (`:54-56`): keep only when it contains `@` and `source === "email"`; pass in both meta objects.
4. Route tests (R1–R5).
5. `app/log/page.tsx` — `mailboxDisplay`, Mailbox filter over `filteredRows`, CSV column after `source`.
6. `app/stats/page.tsx` — re-key the pie, fix the "Web upload" fallback (F6), extend `MAILBOX_COLORS`.
7. Docs (R13) + `bun run check`.

**Timing:** go-live is 1 Sep 13:00 AEST — tomorrow. Steps 1-4 are the part that must ship first; without them Chatswood's first day is unattributable in the log. Steps 5-7 can follow same-week.

## Change

### 1. Persist the address — `lib/audit.ts`, `lib/convert/form-data.ts`, `app/api/convert/route.ts`
- `AuditRow.mailboxAddress?: string` — normalised (`trim().toLowerCase()`) value of `X-Source-Mailbox` **only when it contains `@`** (skip the legacy enum values and `simulated:*` sentinels). Add to `isAuditRow` validator.
- `ConvertRequest.mailboxAddress?: string`; route sets it from the header alongside `mailboxHint`/`mailboxCategory` and passes it to both the success path (`convertPdf` → audit) and `buildFailureAuditRow`.
- Unknown addresses are stored as-is — no allowlist. The address is not PHI; it's BJC's own mailbox.

### 2. Display — `app/log/page.tsx`
- `mailboxDisplay(row)`: if `row.mailboxAddress`, show the **local part** (`gofax.par`, `gofax.cht`) — category suffix only when category ≠ none. Else existing behaviour (so pilot rows still read "Email").
- Add a **Mailbox filter** dropdown next to the routing/reason filters, populated from distinct `mailboxAddress` values in the loaded month (+ "All").
- CSV: add `mailboxAddress` column after `source`.

### 3. Stats — `app/stats/page.tsx`
- Key the mailbox pie on `mailboxAddress ?? mailboxCategory` so it becomes a per-location breakdown. Extend `MAILBOX_COLORS` to ≥5 entries.

### 4. Docs
- `docs/operations/pad-integration-guide.md` §5/§8/§12: `X-Source-Mailbox` is now recorded verbatim in the audit log (was: "recorded" — untrue); `convert.ps1` must take the mailbox as a **parameter** from the LOOP FOREACH variable, not a constant.
- `CLAUDE.md` / functional spec: new audit field.
- Operational guide: "Source" column now names the fax mailbox.

### 5. PAD side (not in this repo's code — done on the server with the Unlinked change)
- `convert.ps1`: `param([string]$Mailbox)` (or read from an env/arg PAD passes) — one script for all four mailboxes.
- Robin: `LOOP FOREACH Mailbox IN [...]`; GetEmailsV3 / MoveV2 `@mailboxAddress: Mailbox`; pass `Mailbox` into the Run PowerShell script call.

## Tests (red → green) — each cites the requirement it proves
- `lib/audit.test.ts`: `isAuditRow` accepts/rejects `mailboxAddress` (R6).
- `app/api/convert/route.test.ts`: mixed-case `X-Source-Mailbox: GoFax.Par@…` → row has `mailboxAddress: "gofax.par@bjchealth.com.au"` (R1); `results` → undefined + `mailboxHint: "results"` (R2); header absent → undefined, 200 (R3); web-source request ignores header (R4); failure/422 path row carries it (R1); existing category tests untouched (R5).
- `app/log` CSV builder: column present after `source`, empty for legacy rows (R9); `mailboxDisplay` unit cases for address / legacy email / web / mapped category (R7); filter composition (R8).
- Manual: `/stats` pie shows one slice per mailbox (R10); post-deploy curl → `/log` row (non-functional).
- Server: after LOOP FOREACH build, `/log` shows distinct mailboxes (R12).

## Out of scope
- Backfilling historical rows (pilot rows are all `gofax.par@` — leave as "Email").
- Mapping `gofax*` into `MAILBOX_CATEGORIES` (Nicole wants no restriction — unchanged).
- Genie-side carrier attribution (separate open issue).

## Sequence
1. Code + tests (this repo, ~½ day), PR to `prod`, deploy before 1 Sep.
2. Server: parameterise `convert.ps1` + LOOP FOREACH — same TeamViewer session as the Unlinked-folder build.
3. Verify: first Chatswood row on `/log` shows `gofax.cht`.
