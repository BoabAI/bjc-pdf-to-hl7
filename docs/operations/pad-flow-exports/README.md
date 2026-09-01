# PAD flow exports — `desktop-pdf-to-hl7`

Point-in-time Robin exports of the production PAD flow on `MHS-SYD-APP47`, plus what we learned pasting them. The authoritative narrative is `docs/operations/pad-integration-guide.md` §7; this folder holds the raw text that actually went in and out of the designer.

| File | What it is |
|---|---|
| `2026-09-01-desktop-pdf-to-hl7-pre-chatswood.robin` | Designer export ~14:40 AEST 1 Sep 2026, **before** the Chatswood change. Single mailbox `gofax.par@`, polling `Inbox`. Rollback target. |
| `2026-09-01-desktop-pdf-to-hl7-chatswood-mailboxlist.robin` | The text pasted successfully at ~15:00 AEST 1 Sep 2026: same body wrapped in `LOOP FOREACH Mailbox IN MailboxList` over `gofax.par@` + `gofax.cht@`. 41 actions, 0 errors on paste. |

Restore = paste the whole file (footer included) into an empty desktop flow. Add mailboxes on their go-live dates with one more `Variables.AddItemToList` line each (`gofax.bon@`, `gofax.bow@` — 8 Sep 2026).

## Paste learnings (PAD 2.68.237, verified 1 Sep 2026)

1. **`Variables.AddItemToList` has no `NewList=>` output.** It mutates the list in place. `Variables.AddItemToList Item: $'''x''' List: MailboxList NewList=> MailboxList` fails with `Unknown argument(s): 'NewList'`; drop the `NewList=> …`. `Variables.CreateNewList List=> MailboxList` is correct as written. (Guide §7 step 6 on PR #23 still shows the wrong form — fix before merge.)
2. **List literals don't paste.** `SET MailboxList TO %['a', 'b']%` is rejected. Use *Create new list* + *Add item to list*.
3. **A whole-flow paste with one bad line is rejected silently; a small paste with the same bad line lands as a red row with the error in the Errors list.** So bisect: paste 1–3 line chunks into a scratch/Copy flow until one fails, then read the Errors list. Each chunk must be IF/END-balanced. `LOOP FOREACH x IN y … END` pastes fine on its own, even when `y` isn't defined yet.
4. **Keep the export's layout for the body.** The `@@folderPath` / `@@connectionDisplayName` annotation lines and the `External.InvokeCloudConnector` line lose their indent inside nested blocks in the export; paste them back exactly that way. Whether the trailing `# [ControlRepository][PowerAutomateDesktop]` JSON footer is required for connector actions was not isolated — every successful paste included it, so include it.
5. **Transport the text as a CRLF `.txt` via TeamViewer File Transfer**, not the clipboard. Mac→server clipboard pastes need a server-side Notepad hop and long pastes still get corrupted; a file avoids both. (`sed -i '' 's/$/\r/'` on the Mac makes the CRLF copy.)
6. **Edit a *Copy*, not the live flow.** PAD console → right-click the flow → *Create a copy*. The designer only commits on Save/Publish, so closing without saving is also a rollback. ⚠️ The scheduled task `SMEC AI BJC PDF-to-HL7` launches the flow **by workflow ID** (`ms-powerautomate:/console/flow/run?workflowid=…`), so a change proven on the Copy must then be applied to the original (re-paste) or the task repointed to the Copy's ID — otherwise the schedule keeps running the old flow.
7. The export you paste back into chat is the backup — commit it here before editing.
