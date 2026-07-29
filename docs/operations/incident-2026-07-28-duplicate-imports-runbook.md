# Runbook — resolving the 28–29 Jul 2026 duplicate-import incident

> **Status: OPEN.** Work through the phases in order and tick steps off as you go.
> Phase 0 is containment and comes before everything else, including replying to Nicole.
>
> Full incident write-up and root cause: [`pad-integration-guide.md` §7](pad-integration-guide.md).
> The flow fix is documented in PR #14 (`fix/pad-processed-log-ordering`, based on PR #13).

## What happened (one paragraph)

The PAD flow's `Add-Content` to `processed.log` sat *after* the always-failing
`MoveV2`, and the On-error→continue setting skipped the rest of the loop iteration —
so the processed-ID log was never written and every 12-minute run re-converted the
same three pilot fixtures. From 14:38 on 28 Jul to 08:14 on 29 Jul (Sydney): **271
conversions, 269 HL7 files imported into live Genie** (90 × Incoming Letters,
90 × Pathology, 89 × Radiology — three fictional test patients, no real records).
Nicole stopped it by moving the email out of the polled folder. The loop is
**dormant, not fixed**: anything landing in `HL7 Testing` restarts it until Phase 1
is done. The audit table was cleaned on 29 Jul (July back to 10 legitimate rows);
the Genie-side cleanup is Phase 3.

**"Resolved" means all five:** the loop can't recur (Phase 0–1), the fix is proven
across two scheduled runs (Phase 2), Genie is clean (Phase 3), Nicole is informed
(Phase 0), and the docs land (Phase 5). Phase 4 is a separate, non-blocking track.

Server sessions are TeamViewer to **MHS-SYD-APP47** as **`BJC\medihost`**
(disconnect, don't log off — the scheduled task needs the session).

---

## Phase 0 — Containment (first, ~2 minutes)

- [ ] **Disable the scheduled task.** Task Scheduler → `SMEC AI BJC PDF-to-HL7` →
      right-click → **Disable**. This kills both triggers (12:50 daily / 12-min
      repeat, and the boot trigger). Until this is done the loop is only dormant
      because the polled folder happens to be empty.
- [ ] **Confirm `HL7 Testing` is empty** (as PAuto in OWA, or via the next manual
      run's GetEmails result). Anything sitting there converts the moment the flow
      runs.
- [ ] **Send Nicole the reply** (draft prepared 29 Jul). It states the automation
      is off — only true after the first box is ticked.

## Root cause — corrected 29 Jul after live debugging

The ordering fault below was real, but it was **not** the whole story, and on its own
it would not have caused the incident. There were **two independent faults, either of
which alone breaks dedupe**:

**Fault 1 — ordering.** The `processed.log` append sat after the always-failing
`MoveV2`, inside the same block. Latent; bites whenever the move fails.

**Fault 2 — file permissions (the actual cause).** `C:\SMEC AI\pdf-to-hl7\processed.log`
inherited an ACL granting `BUILTIN\Users` only `ReadAndExecute`. The flow runs as
`BJC\medihost`, a plain domain user, **non-elevated** — so every `Add-Content` to that
file failed with access-denied. It looked fine because **PAD's *Run PowerShell script*
action silently swallows non-terminating PowerShell errors**: the action reported
success, the flow carried on, and nothing was ever written. That is why the log stayed
empty through 90 consecutive batches with no error anywhere.

Diagnosing this was confusing because an *elevated* PowerShell window writes the file
fine (it matches the `Administrators` FullControl entry), so manual testing appeared to
prove the path and permissions were good. The split-token difference between an admin
console and the non-elevated PAD process is the whole gap.

**Consequences for how this flow should be built:**

1. **Do not use `Run PowerShell script` for anything whose failure matters.** It cannot
   be trusted to surface errors. Use PAD's native `File` actions — they raise real,
   visible errors (that is how the permission fault was finally found).
2. **Write the log as UTF-8, not `Unicode`** (PAD's `Unicode` is UTF-16). A UTF-16 ID
   appended to a plain-text file cannot be substring-matched on read, so dedupe fails
   even when the write succeeds.
3. **Grant `BJC\medihost` modify rights on the working folder**, so files created there
   inherit them:
   `icacls "C:\SMEC AI\pdf-to-hl7" /grant "BJC\medihost:(OI)(CI)M"`
   Re-grant on the file itself after recreating it from an elevated session, otherwise
   it picks the restrictive inherited ACL straight back up.

## Phase 1 — Fix the flow in PAD (~10 minutes)

- [ ] Open the PAD console → flow **`desktop-pdf-to-hl7`** → Edit.
- [ ] Find the **Run PowerShell script** action whose script is:

      Add-Content "C:\SMEC AI\pdf-to-hl7\processed.log" "%CurrentEmail.id%"

      It currently sits near the end of the loop, after **Move email message (V2)**.
- [ ] **Drag it up** so it is the *first* action inside
      `If Contains(Assessed, 'yes')` — above the `If HasPdf` block and therefore
      above MoveV2. Check indentation: nested one level under the `Assessed` If
      only, **not** under `AllFiled`. The log means *"assessed"*, not *"moved"* —
      nothing that can fail may stand between the assessment and the append.
- [ ] **Re-check MoveV2's error handling:** On error → **Continue flow run →
      Go to next action**. Whatever sub-option was active on the 28th skipped the
      rest of the loop iteration — that is what starved the log. The reordering
      makes this harmless, but set it correctly anyway.
- [ ] **Replace the PowerShell `Add-Content` with the native `File → Write text to
      file`** action: path `C:\SMEC AI\pdf-to-hl7\processed.log`, *If file exists*
      **Append**, *Append new line* **Yes**, Encoding **UTF-8** (⚠️ *not* `Unicode` —
      that is UTF-16 and breaks the substring match on read).
      Text to write: `%CurrentDateTime% %EmailId%`.
- [ ] The message ID must be lifted into a plain variable first — `%CurrentEmail.id%`
      is unreliable inside an action's text field. Add `SET EmailId TO CurrentEmail.id`
      immediately before the write.
- [ ] `%CurrentDateTime%` is **not** a built-in. Add `Date time → Get current date and
      time` once near the top of the flow, outside the email loop. The date prefix is
      optional today but cannot be retrofitted — undated entries can never be pruned
      by age (see Phase 4 note on pruning).
- [ ] **Replace the PowerShell `Get-Content` read with the native `File → Read text
      from file`**: same path, Encoding **UTF-8**, *Store content as* **single text
      value**, into `ProcessedIds`. Both ends must be native and both UTF-8, or the
      write and the read disagree.
- [ ] Save the flow.
- [ ] Recreate the log clean so no UTF-16 fragments survive, and re-grant rights
      (a file created from an elevated session inherits the restrictive ACL):

      $log = "C:\SMEC AI\pdf-to-hl7\processed.log"
      Remove-Item $log -Force
      New-Item $log -ItemType File | Out-Null
      icacls $log /grant "BJC\medihost:(M)"

- [ ] Confirm the file exists afterwards — the flow's first action reads it and errors
      if it is missing (the as-built flow dropped the original design's create-if-missing
      guard).

## Phase 2 — Prove it (~30 minutes, no Genie pollution)

- [ ] **Dry-run setup:** in `C:\SMEC AI\pdf-to-hl7\convert.ps1` set
      `$Genie = 'C:\SMEC AI\pdf-to-hl7'` so HL7 output lands locally instead of
      importing into live Genie.
- [ ] Put one test email back: drag one fixture from `HL7 Testing/Linked` into
      `HL7 Testing`. (Its Graph message ID changes on the move, so it counts as
      new — expected, and its old ID was never logged anyway.)
- [ ] **Run A (manual):** run the flow from the PAD console. Expect one
      conversion, an `.hl7` in the local folder, MoveV2 fails-and-continues, and —
      **the check that was skipped on 28 Jul** — open `processed.log` and confirm
      the email's ID is now in it. That single line is the whole fix.
- [ ] **Run B (manual):** run again immediately. Expect **zero** conversions and a
      clean finish (no new audit row).
- [ ] **Re-enable the scheduled task** and let **two full scheduled cycles**
      (~25 min) pass with the email still in the folder. Expect zero new audit
      rows. This is the ≥2-consecutive-scheduled-runs bar from §13 of the
      integration guide — the 28 Jul verification checked only minutes after one
      batch, which is exactly how the loop went unseen. The schedule stays on only
      if this passes.
- [ ] **Restore:** flip `$Genie` back to `\\192.168.47.20\Labrslts`, delete the
      dry-run `.hl7` from the local folder, move the test email back to `Linked`.
      Optionally delete Run A's audit row to keep the July dashboard pristine.

## Phase 3 — Genie cleanup (Nicole, any time)

- [ ] Nicole deletes the three fictional test patients (**Mitchell, James /
      J.M.**, **R.F.**, **M.T.**) *and all their documents* — that clears the ~90
      copies in each of Incoming Letters, Pathology and Radiology in one go,
      rather than clearing inboxes item by item. No urgency: the copies are inert.
- [ ] Nothing to do on the audit table — the 265 runaway rows were deleted on
      29 Jul (pre-delete snapshot retained; July is back to 10 legitimate rows).

## Phase 4 — MoveV2 defect (separate track, NOT a restart blocker)

With dedupe fixed, filed emails staying in `HL7 Testing` is harmless — this is a
quality-of-life fix, not a restart blocker.

**We now have the folder ID**, which is the workaround Microsoft's own connector
documentation prescribes for this exact bug: *"Forward slash symbol `/` isn't
supported for folder names in case of custom input value for `Folder` parameter.
As a workaround, use file picker, or provide `folder Id` value."* Harvested from the
OWA URL of the `Linked` folder in `gofax.par@bjchealth.com.au` (29 Jul):

```
AAMkADJmZDQwMGVmLThhYTUtNDY1Ni05ODhjLTQzNTZmYjA2NzYyNwAuAAAAAABBTiEqEfpcQIx1ZkdLVa9NAQAv0aRqlVw8TKT9Alf/v6ybAAhlMDN4AAA=
```

(That is the URL-decoded form — the raw URL has `%2F` for `/` and `%3D` for the
trailing `=`. Use the decoded string above.)

- [ ] **Confirm the folder is the right one.** The ID came from a URL, so it is
      definitely in the `gofax.par` mailbox, but the ID alone does not reveal where
      the folder sits. Check the breadcrumb in OWA: is this `Linked` under
      `HL7 Testing`, under `Inbox`, or at the mailbox root? Worth knowing regardless —
      it also settles whether `HL7 Testing` is at the root, which the guide got wrong.
- [ ] **Swap the ID into MoveV2's `Folder` parameter**, replacing the
      `HL7 Testing/Linked` path. In the Robin script that is the `@folderPath`
      argument on the `MoveV2` line:

      @folderPath: $'''AAMkADJmZDQwMGVmLThhYTUtNDY1Ni05ODhjLTQzNTZmYjA2NzYyNwAuAAAAAABBTiEqEfpcQIx1ZkdLVa9NAQAv0aRqlVw8TKT9Alf/v6ybAAhlMDN4AAA='''

- [ ] **Test with one email** and confirm it lands in `Linked`.

> ⚠️ **Known risk with this specific ID:** it contains a `/` of its own (`…Alf/v6yb…`)
> because standard base64 uses `/` in its alphabet. If the connector's slash-rejection
> is a naive string check rather than genuine path parsing, this ID may fail exactly
> the way the path did. That would be a connector bug, not a mistake on our side.
> If it fails, try the base64url variant (`/` → `_`, `+` → `-`) once, then stop
> guessing and go to the Graph fallback below.

**Fallback if the ID is rejected:** use the connector's `HttpRequest` operation and
call Graph directly — `POST /users/gofax.par@bjchealth.com.au/messages/{id}/move`
with body `{"destinationId": "<folder id>"}`. This bypasses the `Folder` parameter
and its slash handling entirely.

- [ ] Do not chase `MoveV3` — it does not exist in the connector.

### Everything tried against the `Folder` parameter (29 Jul) — all failed

| Attempt | Result |
|---|---|
| `HL7 Testing/Linked` (path with slash) | `NotFound` — connector rejects `/` in custom text |
| `Linked` (bare display name) | `NotFound` |
| Folder ID from the OWA URL (`AAMk…`) | Action runs, email does not move |
| Folder picker dropdown | *"Failed to retrieve the available data"* — cannot enumerate |
| Graph via connector `HttpRequest` | Blocked: `Argument 'Body' must be binary` — the JSON body needs writing to a file → Base64 → binary data, three extra actions |

The picker failing to enumerate is the significant one: it suggests the connection cannot
list folders in the shared mailbox at design time at all, which is why no value we supply
by hand is accepted either. Before the Graph route, confirm **Original Mailbox Address**
holds the *literal* `gofax.par@bjchealth.com.au` (not `%Mailbox%` — the design-time picker
cannot resolve a variable) and that the Folder field is **empty** when the dropdown is
opened.

**This is a genuine go-live blocker, but not a pilot blocker.** With dedupe working,
emails accumulating in `HL7 Testing` is cosmetic *at pilot volume only*. At production
volume it is not: `GetEmailsV3` uses `@top: 25`, so once more than 25 emails accumulate
the flow only ever sees a 25-email window and newly arrived faxes may never be converted
— silently, with no error. Either the move works or `top` is raised before this points at
a real inbox.

## Phase 5 — Paperwork

- [ ] Merge **PR #14** into its base branch (folds it into **PR #13**), then merge
      #13 into `prod` — the guide then matches the server.
- [ ] Tell Nicole testing can resume (re-send or drag fixtures in). Folder
      expectations until Phase 4 lands: one document = one conversion; emails
      remaining in `HL7 Testing` simply haven't moved because the Linked move is
      still pending.

---

## Quick reference

| Thing | Value |
|---|---|
| Server | MHS-SYD-APP47, TeamViewer, sign in as `BJC\medihost` (disconnect, don't log off) |
| Scheduled task | `SMEC AI BJC PDF-to-HL7` (calendar 12:50 daily / 12-min repeat + boot trigger) |
| PAD flow | `desktop-pdf-to-hl7` (PAD 2.68.237.26118) |
| Working dir | `C:\SMEC AI\pdf-to-hl7\` (`convert.ps1`, `token.dat`, `processed.log`, `temp.pdf`) |
| Genie import share | `\\192.168.47.20\Labrslts` (`$Genie` in convert.ps1) |
| Polled folder | `HL7 Testing` (mailbox root of `gofax.par@bjchealth.com.au`); successes → `HL7 Testing/Linked` (move currently broken) |
| Audit table | `bjc-pdf-to-hl7-audit`, `ap-southeast-2`, BJC account 375391317635 (`aws --profile bjc`) |
| Dashboard | https://prod.d20i409xquw7x3.amplifyapp.com/dashboard |
