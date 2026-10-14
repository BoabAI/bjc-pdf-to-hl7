# Per-mailbox source folder (Inbox vs HL7), configured in Settings

## Context
Doctor@ (go-live Wed 14 Oct 2026) must be polled from `Inbox/HL7` (team drags mail in), while the four fax mailboxes (gofax.par/cht/bon/bow) stay on `Inbox`. Today the mailbox list (`MailboxList`) and the polled folder (`GetEmailsV3 @folderPath: 'Inbox'`) and linked folder (`MoveV2 'Inbox/HL7_linked'`) are hardcoded in the PAD flow on the BJC server; the app exposes nothing to PAD except `/api/convert`. Goal: the app owns a per-mailbox config (address, source folder, linked folder, enabled), editable on the Settings tab, which PAD reads each run.

## Design
**Data:** new reference-data `kind: "MAILBOX"` in the existing `bjc-pdf-to-hl7-reference-data` table (`id` = lowercase address; fields `sourceFolder`, `linkedFolder`, `enabled`, `updatedAt`). No Terraform/IAM change (Query/Put/Delete already granted). Seed defaults on empty partition: 4 fax mailboxes -> `Inbox` / `Inbox/HL7_linked`. Doctor@ is added via the UI (address unconfirmed).
Rejected: extending `RuntimeSettings` (scalar singleton, whole-record put, extra validator/hydration churn).

**Source folder values:** constrained to a small allowlist rather than free text: `Inbox` or `Inbox/<single segment matching [A-Za-z0-9 _-]+>`; linked folder same rule. UI offers a dropdown "Inbox" / "Inbox > HL7" plus custom.

**PAD read path:** new `GET /api/pad-config` returning `{ mailboxes: [{address, sourceFolder, linkedFolder}] }` (enabled only). Bearer + `X-Source: email` via existing `isPadAuthenticated` (`lib/pad-auth.ts`); add it to the PAD path allowlist in `middleware.ts` (currently single `PAD_PATH`) and re-check in the route handler (existing defence-in-depth pattern).

**PAD flow (server-side, outside repo):** replace the `AddItemToList` lines with a PowerShell step (`get-mailboxes.ps1`, reuses DPAPI `token.dat` like `convert.ps1`) that outputs `address|source|linked` lines into `MailboxList`; split inside the loop; bind `GetEmailsV3` and `MoveV2` folder paths to the per-mailbox variables. On fetch failure, fall back to the four fax mailboxes with `Inbox`/`Inbox/HL7_linked` (never blank the list). Ride the pending `-Mailbox` param work (PR #24) in the same flow edit. Build on a Copy, per the repo's PAD paste rules (tiny chunks, CRLF .txt).

**Open risk:** polling a nested folder via `GetEmailsV3` has never been exercised live (only MoveV2 nesting is proven). Test on a Copy before 14 Oct; don't claim it works until verified. Folder must be directly under Inbox (Bondi nesting lesson).

## Code changes (red/green TDD)
1. `lib/conversion-config.ts`: `MailboxConfig` type, `DEFAULT_MAILBOXES`.
2. `lib/reference-data-store.ts`: `listMailboxes` (seeds via its own kind-scoped `seedMailboxes`, NOT the shared `seedDefaults`, which would overwrite curated doctors/carriers), `putMailbox`, `deleteMailbox`. `listMailboxes` throws on DDB error so PAD can fall back. Tests in `lib/reference-data-store.test.ts`.
3. (As built) client-safe `lib/mailbox-config.ts` holds the type, defaults and `validateMailboxInput`; reference-data contract untouched.
4. (As built) separate session route `app/api/mailboxes/route.ts` rather than extending `/api/reference-data`: `validateMailbox` (address must be a valid email, lowercased, folder allowlist, sanitise); add `settings_updated`-style audit row for mailbox edits (repointing a mailbox is operationally sensitive and there are no roles). Tests in route.test.ts.
5. `app/api/pad-config/route.ts` + `middleware.ts` + tests (bearer ok, session-only rejected, missing X-Source rejected, disabled mailboxes omitted).
6. UI: add a "Mailboxes" section to the Settings tab (`app/components/dashboard/SettingsPanel.tsx`), reusing `useReferenceData` / `referenceDataClient` (extend for mailboxes); table with address, source folder select, linked folder, enabled toggle, add/remove. Show a note that changes apply on PAD's next run (~15 min).
7. Docs: update `docs/operations/pad-integration-guide.md` (stale single-mailbox version), CLAUDE.md routes/data-flow, add flow export + `get-mailboxes.ps1` under `docs/operations/pad-flow-exports/`; copy this plan to `docs/plans/`.

## Verification
- `bun run check` (typecheck, lint, tests).
- Local dev server: add/edit mailbox in Settings; `curl -H "Authorization: Bearer $PAD_TOKEN" -H "X-Source: email" localhost:3001/api/pad-config` returns the list; same call without bearer is 401/redirect. Note localhost edits hit the PROD reference table, so use staging table via `REFERENCE_DATA_TABLE` for testing.
- Staging app (`staging.d20i409xquw7x3`) end-to-end config read.
- PAD: run the Copy of the flow against Doctor@ `Inbox/HL7` with a dragged-in test email; confirm it converts, moves to `Inbox/HL7_linked`, and the fax mailboxes are unaffected across two scheduled runs (dedupe via `processed.log`).

## Sequencing / deadline
Agree walkthrough with Nicole Mon 12/Tue 13 Oct; app changes must be deployed (git `prod` deploys both SMEC + BJC apps) before the flow edit. Fallback if time-boxed: hardcode Doctor@ -> `Inbox/HL7` in the flow for 14 Oct, ship the settings-driven version after.
