# PAD: per-mailbox source folder from Settings

Status: **app side built (branch `worktree-mailbox-source-folder`); PAD flow edit NOT yet made or tested.**

The converter's Settings page (`/settings` → *Input mailboxes*) now owns the list of
mailboxes PAD polls and, for each one, the folder it is polled from:

| Mailbox | Poll from | Move filed emails to |
|---|---|---|
| gofax.par / cht / bon / bow | `Inbox` | `Inbox/HL7_linked` |
| Doctor@ (from 14 Oct 2026) | `Inbox/HL7` (team drags ready emails in) | `Inbox/HL7_linked` |

PAD reads it at the start of each run from `GET /api/pad-config?format=lines`
(same bearer token + `X-Source: email` as `/api/convert`). Response: one
`address|sourceFolder|linkedFolder` line per **enabled** mailbox, CRLF-separated.

| HTTP | Meaning | PAD should |
|---|---|---|
| 200, lines | the configured list | poll exactly those |
| 200, empty body | every mailbox disabled in Settings | poll nothing |
| 401 | token wrong | fall back (and investigate) |
| 503 / timeout | config store unavailable | fall back to the built-in fax list |

## `C:\SMEC AI\pdf-to-hl7\get-mailboxes.ps1`

Same token handling as `convert.ps1`. Always prints a usable list: on any failure it
prints the four fax mailboxes on `Inbox` (exactly the pre-Settings behaviour), so a
config outage never stops the fax pipeline. Doctor@ is only polled when the config
call succeeds.

```powershell
$ErrorActionPreference = 'Stop'
$BaseUrl = 'https://prod.d20i409xquw7x3.amplifyapp.com'
$Dir     = 'C:\SMEC AI\pdf-to-hl7'
$Fallback = @(
    'gofax.par@bjchealth.com.au|Inbox|Inbox/HL7_linked',
    'gofax.cht@bjchealth.com.au|Inbox|Inbox/HL7_linked',
    'gofax.bon@bjchealth.com.au|Inbox|Inbox/HL7_linked',
    'gofax.bow@bjchealth.com.au|Inbox|Inbox/HL7_linked'
)
try {
    $sec   = Get-Content (Join-Path $Dir 'token.dat') | ConvertTo-SecureString
    $token = (New-Object System.Net.NetworkCredential('', $sec)).Password
    $body  = & curl.exe -s -f --max-time 30 "$BaseUrl/api/pad-config?format=lines" `
        -H "Authorization: Bearer $token" `
        -H "X-Source: email"
    if ($LASTEXITCODE -ne 0) { throw "pad-config HTTP failure ($LASTEXITCODE)" }
    # 200 with an empty body = everything disabled on purpose: print NOTHING
    # (not a blank line — PAD would split that into one empty mailbox).
    $text = ($body -join "`r`n").Trim()
    if ($text) { Write-Output $text }
} catch {
    Write-Output ($Fallback -join "`r`n")
}
```

`curl -f` turns 401/503 into a non-zero exit code, which takes the fallback branch.

## Flow edit (on a **Copy** of the live flow first)

1. Replace `Variables.CreateNewList` + the four `AddItemToList` lines with:
   *Run PowerShell script* `get-mailboxes.ps1` → `%MailboxConfigText%`, then
   *Split text* `%MailboxConfigText%` by new line → `%MailboxList%`, then skip blank
   items (an `IF MailboxLine IS EMPTY → NEXT LOOP` guard at the top of the loop).
2. Inside `LOOP FOREACH MailboxLine IN MailboxList`: *Split text* `%MailboxLine%` by
   custom delimiter `|` → `%MailboxParts%`; set
   `Mailbox = %MailboxParts[0]%`, `SourceFolder = %MailboxParts[1]%`,
   `LinkedFolder = %MailboxParts[2]%`.
3. `GetEmailsV3 @folderPath: SourceFolder` (was the literal `'Inbox'`). **Add
   `ON ERROR → Next loop`** to this action (it has no error handling today). Without
   it, a missing folder or no mailbox access on one mailbox aborts the whole run.
   `doctor@` sorts *before* `gofax.*` in the config, so a Doctor@ problem would stop
   all four fax mailboxes.
4. `MoveV2 @folderPath: LinkedFolder` (was `'Inbox/HL7_linked'`). It already has an
   empty `ON ERROR`, so a missing linked folder fails silently and the email stays put.
5. Ride along PR #24: call `convert.ps1 -Mailbox "%Mailbox%"` so the Log page labels
   each location correctly. (Today `convert.ps1` hardcodes `gofax.par`, so Doctor@
   rows would be logged as Parramatta.)

Build steps 1–2 by dragging the actions in the designer (Text → *Split text*, Loops →
*Next loop*), not by pasting Robin: the Split text and ON ERROR syntax has never been
pasted on this server. Paste rules from the bon/bow go-live still apply for anything
pasted (tiny chunks, never the whole flow). You can test the Copy **before PR #33
reaches prod** by pointing `$BaseUrl` in `get-mailboxes.ps1` at
`https://staging.d20i409xquw7x3.amplifyapp.com`. Staging accepts the same PAD token and
serves the staging mailbox list. `convert.ps1` still posts to prod.

## PAD compatibility review (8 Oct 2026, against the 16 Sep live export)

| Setting | PAD today | OK? |
|---|---|---|
| Mailbox address | `@mailboxAddress: Mailbox`, already a variable | ✅ same variable name reused |
| Source folder `Inbox` | `GetEmailsV3 @folderPath: 'Inbox'` | ✅ identical string |
| Source folder `Inbox/HL7` | the same `Inbox/<name>` path format `MoveV2` already resolves live | ⚠️ never tested for **GetEmailsV3** |
| Linked folder `Inbox/HL7_linked` | `MoveV2 @folderPath: 'Inbox/HL7_linked'` | ✅ identical string |
| Folder charset `[A-Za-z0-9 _-]`, any depth under `Inbox` | no `|` (the line delimiter), no `%` (PAD variable marker), no quotes | ✅ |
| Nested folder, e.g. `Inbox/HL7_linked/done` | only one level (`Inbox/HL7_linked`) has been seen to resolve | ⚠️ never tested for **either** action. The Settings page warns when one is saved |
| Disabled / removed mailbox | not in the list → loop never visits it | ✅ |

**Behaviours the team needs to know for Doctor@** (they come from the flow as built, not
from the new setting):

- **Only the newest 25 emails in the folder are checked** (`@top: 25`, newest first by
  *received* date). A dragged-in email keeps its original received date. So if more
  than 25 newer emails sit in `HL7` (manual-review or no-PDF leftovers), an older email
  dragged in later is never seen. The team must clear leftovers out of `HL7`.
- **Dragging an email back into `HL7` does not reconvert it.** `processed.log` remembers
  every assessed `internetMessageId` (filed, manual review, or no PDF). Only service
  errors are retried. ⚠️ The 7 Oct reply draft to Nicole says the opposite ("would
  convert and file it into Genie a second time"). Correct it before sending.
- **Only attachments whose name contains `pdf` are converted.** A forwarded email
  attached as an item (`.msg`), or a PDF inside one, is skipped. The email is logged as
  "no PDF" and left in `HL7`.
- **Unfiled emails stay in `HL7`** (manual review, urgent, no PDF), as they stay in the
  Inbox for fax today, until the parked Unlinked change ships.

## Must verify before go-live (none of this is proven yet)

- `GetEmailsV3` polling a **nested** folder (`Inbox/HL7`). Until now only `MoveV2` has
  been seen to resolve `Inbox/...` paths. Test on the Copy against Doctor@ with one
  dragged-in test email.
- Mail left in `Inbox/HL7` (manual review / urgent) is not re-converted on the next run
  (`processed.log` dedupe on `internetMessageId`). Watch two consecutive scheduled runs.
- Fax mailboxes behave exactly as before on the Copy. Then stop the Copy and swap the
  live flow.
- Doctor@ must have `Inbox/HL7` and `Inbox/HL7_linked` directly under the Inbox (get
  Nicole's screenshot of the folder tree).
