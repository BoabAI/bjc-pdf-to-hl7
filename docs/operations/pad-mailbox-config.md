# PAD: per-mailbox source folder from Settings

Status: **live since 14 Oct 2026.** App side is on prod (PR #33). The PAD flow on the
server was edited in place to read this config and published the same day. The exact
export is `docs/operations/pad-flow-exports/2026-10-14-desktop-pdf-to-hl7-doctor-live.txt`
(with `get-mailboxes.ps1` and `convert.ps1` alongside). The sections below are the
design and the lessons from that rollout.

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

## Flow edit (as built 14 Oct 2026)

Build and test on a **Copy** first; keep a backup of the original. A Copy is not live:
the scheduled task runs the *published* original by workflow ID, so **Save draft + Run**
in the editor never changes what the schedule runs and **Publish** is the go-live step.

1. Replace `Variables.CreateNewList` + the four `AddItemToList` lines with
   `Scripting.RunPowershellScript.RunScript … get-mailboxes.ps1 → MailboxConfigText`
   then `Text.SplitText.Split … StandardDelimiter: NewLine → MailboxList`.
2. Loop `LOOP FOREACH MailboxLine IN MailboxList`. First action: skip lines with no
   `@` (`IF (NOT Contains(MailboxLine, '@', True)) = True THEN NEXT LOOP END`).
   Then `Text.SplitText.SplitWithDelimiter Text: MailboxLine CustomDelimiter: '|'
   IsRegEx: False Result=> MailboxParts` and set `Mailbox = MailboxParts[0]`,
   `SourceFolder = MailboxParts[1]`, `LinkedFolder = MailboxParts[2]`.
3. `GetEmailsV3 @folderPath: SourceFolder`; `MoveV2 @folderPath: LinkedFolder`.
4. `GetEmailsV3` error handling: **On error → Continue flow run → Go to label →
   `SkipMailbox`**, with a `LABEL SkipMailbox` as the last action inside the mailbox
   loop (Robin: `ON ERROR / GOTO SkipMailbox / END`). Plain "Go to next action" is
   not enough: the next action loops over `GetEmailsV3Response`, which does not exist
   on the first pass (Doctor@ sorts first) and is stale from the previous mailbox on
   later passes. Without any handler a Doctor@ folder problem aborts the run before
   the fax mailboxes are polled.
5. `convert.ps1` takes `param([string]$Mailbox = 'gofax.par@bjchealth.com.au')` (the
   default keeps an old flow working) and the flow calls
   `& "C:\SMEC AI\pdf-to-hl7\convert.ps1" -Mailbox "%Mailbox%"`. It was hardcoded
   to `gofax.par`, so every Log row said "Fax · gofax.par". The app already stored
   and displayed `X-Source-Mailbox` (PR #24/#32). Rows logged earlier keep the old
   label; only new rows are right.

### Lessons (14 Oct 2026)

- **Robin action names are not guessable.** `Text.SplitText.SplitWithCustomDelimiter`
  and `Split … StandardDelimiter: Custom CustomDelimiter:` both fail. A custom
  delimiter is `Text.SplitText.SplitWithDelimiter Text: … CustomDelimiter: … IsRegEx:
  False Result=> …`. When unsure, build the action in the designer, select the row,
  Ctrl+C, paste into Notepad, and use that text.
- **A whole-flow paste worked once the syntax was right** (a bad argument still fails
  silently; see the bisect advice in `pad-flow-exports/README.md` on PR #27), but the
  cloud-connector `@folderPath` kept the
  literal `Inbox` until it was set by hand in the designer (custom value
  `%SourceFolder%`). After any paste, open `GetEmailsV3` and `MoveV2` and check the
  Folder field. A smoke test of 2–3 lines first shows syntax errors in the Errors list.
- **Script field escaping.** In the designer type the plain command
  (`& "C:\path\convert.ps1" -Mailbox "%Mailbox%"`). Typing or pasting the
  *exported* escaped text (`\"`, `\\`) gets escaped again, drops into PowerShell with
  literal backslashes, and returns a non-`auto_routed` response, so nothing files and
  nothing is logged. Compare against the `get-mailboxes.ps1` line in the export.
- **Test a script on its own before the flow:** with no `temp.pdf`,
  `& "…\convert.ps1" -Mailbox "doctor@…"` should print `{"action":"service_error"}`;
  a parse error means the script edit is wrong.
- **A breakpoint left in the flow pauses every scheduled run.** Remove it before Publish.
  A breakpoint on `LOOP FOREACH CurrentEmail` is a safe pre-flight: the Variables pane
  shows `Mailbox`, `SourceFolder`, `LinkedFolder` and the fetched emails before anything
  is converted.
- **`convert.ps1` writes HL7 straight to the live Genie share**
  (`\\192.168.47.20\Labrslts`). Any editor Run with a real email in a polled folder
  files for real, so ask the client to use harmless test documents.
- The BJC Amplify app (`d20i409xquw7x3`) is only visible with `aws --profile bjc`; the
  default profile is the SMEC account and returns "App not found".
- Keep PAD paste files and scripts in `docs/operations/pad-flow-exports/` (CRLF, enforced
  by `.gitattributes`) so they can be fetched onto the server from the repo.

## PAD compatibility review (8 Oct 2026, against the 16 Sep live export)

| Setting | PAD today | OK? |
|---|---|---|
| Mailbox address | `@mailboxAddress: Mailbox`, already a variable | ✅ same variable name reused |
| Source folder `Inbox` | `GetEmailsV3 @folderPath: 'Inbox'` | ✅ identical string |
| Source folder `Inbox/HL7` | the same `Inbox/<name>` path format `MoveV2` already resolves live | ✅ `GetEmailsV3` returned the two emails sitting in Doctor@ `Inbox/HL7` on 14 Oct 2026 (seen in the Variables pane) |
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
  errors are retried. (The 7 Oct draft said the opposite; it was superseded by the
  14 Oct reply to Nicole, which states this correctly.)
- **Only attachments whose name contains `pdf` are converted.** A forwarded email
  attached as an item (`.msg`), or a PDF inside one, is skipped. The email is logged as
  "no PDF" and left in `HL7`.
- **Unfiled emails stay in `HL7`** (manual review, urgent, no PDF), as they stay in the
  Inbox for fax today, until the parked Unlinked change ships.

## Verified / still to watch

- ✅ `GetEmailsV3` polls the nested `Inbox/HL7` folder (14 Oct 2026).
- ✅ Doctor@ has `Inbox/HL7` and `Inbox/HL7_linked` directly under the Inbox (Outlook
  folder tree seen 14 Oct 2026).
- ⬜ Mail left in `Inbox/HL7` (manual review / urgent) is not re-converted on the next
  run (`processed.log` dedupe). Watch two consecutive scheduled runs.
- ⬜ Nested folders deeper than one level (`Inbox/a/b`) are still untested for both
  actions; Settings shows an amber warning.
- ⬜ Check the Log page shows each new row under its own mailbox after the `convert.ps1`
  change.
