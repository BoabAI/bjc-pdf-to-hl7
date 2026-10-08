# Input mailboxes: guard rails (validation, warnings, toast, undo)

## Context
Settings → Input mailboxes (PR #33, live on staging) decides which mailboxes PAD polls and which folder it polls in each. There are no roles, so anyone who is signed in can edit it, and a slip has real consequences:
- Pointing Doctor@ at `Inbox` converts and files every PDF in that inbox into Genie.
- Disabling or removing the last enabled mailbox makes PAD poll nothing, and nothing visible flags it.
- Moving a fax mailbox off `Inbox` stops faxes from being picked up.

Hard validation already exists in `validateMailboxInput` (`lib/mailbox-config.ts`): address format, `Inbox` or one level under it, and linked ≠ source ≠ Inbox. This plan adds four things:
1. Blocks for the few changes that are always wrong.
2. Live warnings for risky but legitimate changes.
3. A toast confirming exactly what changed.
4. A one-click Undo.

Scope: the mailboxes panel only. The confidence slider in `SettingsPanel` already has its own "Saved." flash and is unchanged.

## Design

### 1. Pure helpers in `lib/mailbox-config.ts` (client-safe, TDD)
- **`describeMailboxChange(previous, next)`**
  - Moved here from `app/api/mailboxes/route.ts`, so the UI and the audit log use the same wording, e.g. "source Inbox → Inbox/HL7, disabled".
  - The route imports it, so the audit text is unchanged.
- **`leavesNoEnabledMailbox(all, change)`**
  - `change` is `{type:"put", value}` or `{type:"delete", id}`.
  - Returns true if, after the change, no mailbox would be enabled.
- **`mailboxWarnings(previous, next)`** returns a `string[]` of soft warnings:
  - **Non-fax mailbox (address not starting `gofax.`) on `Inbox`:** "Every email with a PDF attachment in this Inbox will be converted and filed into Genie. Use Inbox/HL7 if the team chooses what to upload."
  - **Fax mailbox moved off `Inbox`:** "Faxes arrive in the Inbox. The converter will stop picking them up."
  - **Address not `@bjchealth.com.au`:** "This isn't a BJC Health address. The converter can only read BJC mailboxes."
  - **Enabled → disabled:** "The converter will stop checking this mailbox."
  - **Source or linked folder changed, or a new mailbox:** "Check `<folder>` exists in the mailbox first. PAD skips the mailbox if it doesn't." This matches the ON ERROR → Next loop in `docs/operations/pad-mailbox-config.md`.
- **Duplicate address on Add:** a hard error in the UI (an id already in the list). Today the PUT is an upsert and would silently overwrite the existing row.

### 2. Server-side block (`app/api/mailboxes/route.ts`)
- **PUT** with `enabled:false` and **DELETE** both return **409** "At least one mailbox must stay enabled — otherwise the converter checks nothing." when `leavesNoEnabledMailbox` is true.
- PUT already reads the list for the audit message. DELETE will need one `listMailboxes()` read.
- If that read fails, allow the change. This matches the current "a read failure must not block the save" behaviour, so a DynamoDB hiccup can't lock the settings.

### 3. UI (`app/components/dashboard/MailboxesPanel.tsx`)
- **Editor:**
  - Below the fields, show a live "Changes: …" line from `describeMailboxChange`, so the user sees the diff before saving.
  - Show amber warnings (`var(--warning)`; I'll confirm the token exists, else use the existing amber style).
  - Save stays one click. It is labelled **"Save anyway"** when there are warnings.
  - Blocking errors still disable Save. These are the existing validation, a duplicate address, and disabling the last enabled mailbox.
- **Remove:**
  - The existing inline Keep/Remove confirm stays.
  - The Remove button is disabled, with a tooltip giving the reason, when this is the last enabled mailbox.
- **Toast** (new `app/components/ui/Toast.tsx`, no library):
  - A small fixed bottom-right card with `role="status"` and `aria-live="polite"`.
  - Auto-dismisses after 10 s, has an × close button, and an optional action button.
  - One toast at a time; a new toast replaces the old one.
  - Success examples: "gofax.par saved — source Inbox → Inbox/HL7. [Undo]", "doctor@… added. [Undo]", "gofax.bow removed. [Undo]".
  - Errors stay inline and persistent, as they are now, and are not toasts, so they can't vanish unread.
- **Undo** (client-side; the panel already holds the pre-change row):
  - Edit → PUT the previous row.
  - Add → DELETE the new id.
  - Remove → PUT the removed row.
  - Then reload and show the toast "Undone."
  - Undo goes through the normal API, so it writes its own audit row and is honest in the Log.
  - Available only while the toast is visible. PAD polls about every 15 minutes, so an undo within seconds normally lands before PAD sees the change. The toast copy won't promise that.

## Files
- `lib/mailbox-config.ts` + `lib/mailbox-config.test.ts`: three helpers plus tests, written first (red/green).
- `app/api/mailboxes/route.ts` + `route.test.ts`:
  - import `describeMailboxChange`
  - 409 last-enabled guard on PUT and DELETE
  - tests: block on disable-last, block on remove-last, allow when another is enabled, allow when the list read fails
- `app/components/ui/Toast.tsx`: new.
- `app/components/dashboard/MailboxesPanel.tsx`: warnings, change line, duplicate check, last-enabled disable, toast, undo.
- `docs/plans/2026-10-08-mailbox-settings-guardrails.md`: copy of this plan.

## Verification
- `bun run typecheck`, `bunx eslint --no-eslintrc -c .eslintrc.json <files>`, `bun test` (956 tests pass today, plus the new ones).
- Local server against the staging tables (`AWS_PROFILE=bjc REFERENCE_DATA_TABLE=…-staging DYNAMODB_TABLE=…-staging TEST_MODE=true … PORT=3001 bun dev`). In Playwright:
  1. Add `doctor@bjchealth.com.au` on `Inbox`: the Genie warning shows and the button reads "Save anyway". Save, then Undo: the row is gone.
  2. Edit gofax.par to `Inbox/HL7`: the fax warning and the change line show. Save: the toast shows the diff. Undo: back to Inbox.
  3. Disable all but one mailbox: the last one's Disable checkbox and Remove are blocked. A curl DELETE also returns 409.
  4. Remove, then Undo: the row is restored.
  5. Add a duplicate address: blocked.
  6. The Log page shows audit rows for each change and each undo.
  7. Leave staging data back at the 4 fax rows.
- Deploy to staging (push `staging`) and check on staging.d20i409xquw7x3. Prod stays untouched.
