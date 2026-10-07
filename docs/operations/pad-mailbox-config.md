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
3. `GetEmailsV3 @folderPath: SourceFolder` (was the literal `'Inbox'`).
4. `MoveV2 @folderPath: LinkedFolder` (was `'Inbox/HL7_linked'`).
5. Ride along PR #24: call `convert.ps1 -Mailbox "%Mailbox%"` so the Log page labels
   each location correctly.

Paste rules from the bon/bow go-live still apply: paste tiny chunks, never the whole flow.

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
