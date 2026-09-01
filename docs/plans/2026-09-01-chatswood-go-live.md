# Chatswood (`gofax.cht@`) go-live — 1 Sep 2026 status

**Status: 🔄 flow change pasted into a Copy, not yet run/published (15:00 AEST).** Related: `pad-integration-guide.md` §7 step 6 (PR #23), `docs/operations/pad-flow-exports/` (exports + paste learnings), PR #24 (dashboard mailbox column).

## Decision (Sean, 1 Sep 2026 morning)

`gofax.cht@bjchealth.com.au` goes live on the **existing proven flow** — `MailboxList` wrap only. The Unlinked-folder change and `gofax.bon@`/`gofax.bow@` (8 Sep) are parked. Until Unlinked ships, unfiled cht emails stay in the cht Inbox (dedupe skips them) and reception handles them by hand.

## What the audit table showed today (AEST, `bjc-pdf-to-hl7-audit`, `month=2026-09`)

| Time | Rows | Read |
|---|---|---|
| 11:49, 12:55 | 3 web rows (Nicole) | Her manual test uploads |
| 12:43 | 4 PAD rows (same content hashes as her uploads) | Manual go-live test run against par `Inbox` |
| 13:32 | 3 radiology | `:30` scheduled slot — par live on `Inbox` |
| 14:07 | 1 radiology | Our weekly-restart smoke run (`Start-ScheduledTask`) |
| 14:20 | 1 consult letter | `:20` slot — flow survived the 14:06 runtime restart |

All rows show as par: `convert.ps1` hardcodes `X-Source-Mailbox: gofax.par@` and PR #24 isn't deployed, so cht rows are indistinguishable until both change.

## Timeline of the flow edit

- ~14:40 — Sean pasted the live export into chat → saved as `pad-flow-exports/2026-09-01-desktop-pdf-to-hl7-pre-chatswood.robin` (backup). Flow was still `SET Mailbox TO gofax.par@`, already polling `Inbox`.
- 14:45–14:58 — three whole-flow text pastes rejected silently. Bisect in the Copy: `Variables.CreateNewList` ✅, `LOOP FOREACH … END` ✅, `SET x TO %['a','b']%` ❌, `Variables.AddItemToList … NewList=> MailboxList` ❌ `Unknown argument(s): 'NewList'`.
- ~15:00 — corrected text (`pad-flow-exports/2026-09-01-desktop-pdf-to-hl7-chatswood-mailboxlist.robin`, delivered as CRLF `.txt` via TeamViewer file transfer) pasted successfully into `desktop-pdf-to-hl7 - Copy`: 41 actions, 0 errors.

## Remaining steps

1. **Run the Copy once manually** (not at a `:x0` minute). Watch the outer loop reach iteration 2 (`gofax.cht@`); `GetEmailsV3` must not error — if it does, PAuto lacks Full Access on cht (Amol). A cht test fax should convert (new `service:pad-pipeline` audit row) and move to cht's `Inbox/HL7_linked` — if it stays in Inbox, the folder doesn't exist in cht yet (Nicole).
2. **Publish**, then make the schedule run it: re-paste the same text into the original `desktop-pdf-to-hl7` (the task launches by workflow ID), or repoint the task's `workflowid=` to the Copy. Confirm the next `:x0` slot produces rows.
3. **Dedupe bar (§13):** one unfiled email left in either Inbox, two consecutive scheduled runs, zero new audit rows.
4. **Genie verification with Nicole:** the 13:32 / 14:20 documents and the first cht fax landed in Radiology / Incoming Letters with the right patient.
5. **Dashboard:** `param($Mailbox)` + `-H "X-Source-Mailbox: $Mailbox"` in `convert.ps1`, call becomes `& "…\convert.ps1" -Mailbox "%Mailbox%"`; merge/deploy PR #24. Until then `/log` says par for everything.
6. **Docs:** on PR #23 — fix §7 step 6's `AddItemToList` lines (drop `NewList=> MailboxList`), flip the 🔄 cht rollout row to ✅ with time + what was verified, note the Copy/workflow-ID caveat; merge #23. Then 8 Sep prep: Amol Full Access on bon/bow, Nicole creates `Inbox/HL7_linked` in both, two more `AddItemToList` lines.
7. **Comms:** short note to Nicole + Amol — cht live, unfiled mail stays in the Inbox until Unlinked ships, 8 Sep prerequisites.
