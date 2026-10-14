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
