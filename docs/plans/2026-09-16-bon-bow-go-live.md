# Bondi Junction + Bowral (`gofax.bon@`, `gofax.bow@`) go-live — Wed 16 Sep 2026, 1:30pm

Session runbook. Sean on TeamViewer to **MHS-SYD-APP47**, with Nicole (test faxes, Genie check) and Amol (mailbox permissions) on the Teams call.

Predecessor: `docs/plans/2026-09-01-chatswood-go-live.md`. Paste rules: `docs/operations/pad-flow-exports/README.md`.

Files ready on the Mac at `~/Desktop/bjc-bon-bow-2026-09-16/` (CRLF `.txt`, for TeamViewer File Transfer):

| File | Use |
|---|---|
| `2026-09-16-bon-bow-additemtolist.txt` | The 2-line in-place paste (primary path) |
| `2026-09-16-desktop-pdf-to-hl7-bon-bow-mailboxlist.txt` | Whole 76-line flow, for a fresh-Copy rebuild / rollforward |

Repo copies live in `docs/operations/pad-flow-exports/` (LF).

---

## ⚠️ Ask Nicole FIRST — Inbox backlog

The flow polls `Inbox` with `fetchOnlyUnread: False`, `top: 25`, every 10 minutes, deduped **only** against `processed.log`. So on the first scheduled run after publish, **any existing mail with a PDF attachment sitting in the bon/bow Inbox gets converted and filed into Genie** — potentially duplicating documents reception already handled by hand.

Before publishing, confirm with Nicole:

- Are the bon/bow Inboxes empty of old faxes?
- If not: she moves the backlog to another folder (anything except `Inbox` / `Inbox/HL7_linked`) **before** we publish.

This was never checked for Chatswood — the cht Inbox may simply have been empty. Don't assume the same for two more sites.

## Prerequisites to confirm on the call

1. **Amol** — `PAuto@bjchealth.com.au` has **Full Access** on `gofax.bon@` and `gofax.bow@`. (Sean believes done. Failure mode: `GetEmailsV3` errors on loop iteration 3 or 4.)
2. **Nicole** — `Inbox > HL7_linked` folder exists in **both** mailboxes. (Failure mode: document converts and files in Genie, but the email stays in the Inbox.)
3. **Nicole** — one test fax ready to send to each of the bon and bow fax numbers.

---

## Step 0 — Which flow does the schedule actually run? (do this before touching anything)

The 1 Sep plan left two options open ("re-paste into the original **or** repoint the task to the Copy") and only recorded "implemented". Resolve it before editing, because it decides what you edit and what you publish.

In an elevated PowerShell on the server:

```powershell
(Get-ScheduledTask -TaskName "SMEC AI BJC PDF-to-HL7").Actions | Format-List *
```

Record the `workflowid=` GUID from the `ms-powerautomate:/console/flow/run?workflowid=…` argument, then match it to a flow in the PAD console (flow → *Properties* shows its ID). **That flow is the live one** — it may be named `desktop-pdf-to-hl7 - Copy`.

Sanity check it's the right one: open it and confirm line 3 is `Variables.AddItemToList Item: $'''gofax.cht@bjchealth.com.au'''`. If the live flow has no cht line, Chatswood was never actually on the schedule — stop and reassess before adding two more mailboxes.

## Step 1 — Back up the live flow

In the PAD designer: select all (Ctrl+A) → copy → paste into the Teams/Claude chat. Save it as
`docs/operations/pad-flow-exports/2026-09-16-desktop-pdf-to-hl7-pre-bon-bow.robin` and commit before editing. (README rule 7.)

## Step 2 — Make a Copy and paste the two lines

PAD console → right-click the **live** flow → *Create a copy*. Edit the Copy, never the live flow (README rule 6).

1. Transfer `2026-09-16-bon-bow-additemtolist.txt` via **TeamViewer File Transfer** (not the clipboard — README rule 5).
2. Open it in Notepad on the server, Ctrl+A, Ctrl+C.
3. In the designer, click the `gofax.cht@…` *Add item to list* row to select it, then Ctrl+V. The paste lands **below** the selection.
4. Expect the list block to read par → cht → bon → bow, and the flow to total **43 actions, 0 errors**.

If the paste is rejected: it's silent on a whole-flow paste but shows a red row + Errors-list message on a small one (README rule 3). The known trap is `NewList=> MailboxList` — the prepared file correctly omits it.

## Step 3 — Manual run of the Copy (access check only — **no test faxes yet**)

Run it **off the scheduled minutes**: not `:x0` (our HL7 slot) and not `:x5` (the PD@ consent-form flow's slot — same O365 connection, and overlapping runs silently contended back in Aug). **Use `:x2`** — `:x7` risks colliding with a PD@ run still in progress.

> ⚠️ **Hold Nicole's test faxes until after publish (Step 4).** `processed.log` is shared by the Copy and the live flow. If a test fax is converted by the Copy here, the live flow will skip it as already-processed and the `:x0` run produces no rows — leaving the scheduled path unproven, which is exactly the gap 1 Sep left open. An empty run at this step is a *pass*.

Watch for:

- The outer `LOOP FOREACH Mailbox` reaching **iteration 3 (bon)** and **iteration 4 (bow)**.
- `GetEmailsV3` not erroring on either → confirms Amol's Full Access. This is the only thing this run needs to prove.

## Step 4 — Publish into the flow the schedule runs, then send the test faxes

Save/publish the Copy only proves the change. Then **apply it to the flow identified in Step 0**: re-paste the same two lines into that flow (same procedure as Step 2) and save. Alternatively repoint the task's `workflowid=` to the Copy — but re-pasting keeps one canonical flow and is preferred.

**Now** Nicole sends one test fax to each of the bon and bow numbers. On the next `:x0` slot expect:

- Two new `service:pad-pipeline` audit rows.
- Each test email moved to `Inbox/HL7_linked` in **its own** mailbox. `MoveV2` uses `@mailboxAddress: Mailbox`, so this is per-mailbox and correct — a failure here means the folder is missing, not a flow bug.

If you'd rather not wait a full slot for the access check and the end-to-end test separately, split it: Nicole sends the **bon** fax before Step 3 (proves end-to-end on the Copy) and the **bow** fax after publish (proves the scheduled flow). Don't use the same fax for both.

## Step 5 — Verify with Nicole

**PR #24 (source-mailbox on audit rows) is not deployed**, and `convert.ps1` still hardcodes `X-Source-Mailbox: gofax.par@`. So **every row on `/log` will say par**, including bon and bow. Do not try to fix this mid-session — it's parked.

Discriminate instead by:

- **Timestamp** — the minute Nicole's test fax arrived.
- **Content hash** — each test fax has its own PDF content hash on the row.
- **Mailbox state** — the email moved to `Inbox/HL7_linked` in bon / bow.
- **Genie** — Nicole confirms each test document landed in the right inbox against the right patient.

## Step 6 — Dedupe bar

Leave one unfiled email in a bon or bow Inbox, let **two consecutive** scheduled runs pass, and confirm **zero** new audit rows for it.

---

## After the session

- Commit `…-pre-bon-bow.robin` and flip this file's status line.
- Update `docs/operations/pad-flow-exports/README.md` — new restore target.
- `pad-integration-guide.md` §7: mark bon/bow ✅ with the time and what was verified (PR #23).
- Short note to Nicole + Amol: all four mailboxes live; unfiled mail stays in each Inbox until the Unlinked-folder change ships.

## Follow-up: `processed.log` has no prune (docs claim otherwise)

Checked on the server during the 16 Sep session: **35,648 bytes / 488 lines** (~73 bytes per entry) — a non-issue, no action needed. It needs ~14,000 entries to reach 1 MB.

But a repo-wide search across all 35 refs found **no pruning, rotation, or size-cap anywhere**, while the docs say there is one:

- `pad-integration-guide.md` §"Phase 1: Startup Housekeeping" says *"prune entries older than 30 days"* and leaves a bare `# (prune: rewrite ProcessedLog …)` comment — never implemented, not even in the pseudocode.
- Its verification checklist still lists the 30-day prune as testable behaviour.
- The note that recorded this as a deferred v1 gap existed on `worktree-pad-as-built` and has since been **dropped** from the current guide — so the only surviving text now asserts a prune that doesn't exist.

Fix the guide (fold into PR #23, which already edits that file): delete the prune claim from Phase 1 and the checklist, or mark it explicitly Not implemented.

⚠️ **Never prune by deleting the file.** The as-built flow dropped the design's create-if-missing guard, so its first action errors if `processed.log` is absent — see `incident-2026-07-28-duplicate-imports-runbook.md`. Truncating also discards all dedupe state, re-exposing every email still sitting in an Inbox. A safe prune rewrites the file keeping recent lines. Entries *are* dated so age-pruning stays retrofittable, but the as-built writes a locale-formatted `DateAndTime`, not the design's `yyyy-MM-dd` — a parser would have to handle that.

## Explicitly out of scope today

`convert.ps1` mailbox parameter / PR #24 deploy · the Unlinked-folder change (parked) · the weekly PAD restart task (PR #25, parked) · the Genie carrier mis-attribution (Genie-side fix).
