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
- [ ] Save the flow.
- [ ] Confirm `C:\SMEC AI\pdf-to-hl7\processed.log` exists (it should — it is
      just empty; the flow's first action reads it and errors if it is missing).

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

With dedupe fixed, filed emails staying in `HL7 Testing` is harmless. When next on
the server:

- [ ] Point MoveV2's folder at **`HL7 Testing` itself** (definitely exists, no
      slash — the connector rejects `/` in custom-text folder paths, and bare
      `Linked` also returned `NotFound`).
- [ ] If that **succeeds** → the defect is display-name resolution at depth → use
      `Linked`'s **folder ID** instead of its name.
- [ ] If that **also fails** → the shared-mailbox write path is the problem →
      switch to Graph via the connector's `HttpRequest` operation
      (`POST /users/gofax.par@bjchealth.com.au/messages/{id}/move`).
- [ ] Do not chase `MoveV3` — it does not exist in the connector.

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
