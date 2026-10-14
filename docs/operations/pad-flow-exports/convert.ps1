param([string]$Mailbox = 'gofax.par@bjchealth.com.au')
$ErrorActionPreference = 'Stop'
$BaseUrl = 'https://prod.d20i409xquw7x3.amplifyapp.com'
$Dir     = 'C:\SMEC AI\pdf-to-hl7'
$Genie   = '\\192.168.47.20\Labrslts'
#$Genie   = 'C:\SMEC AI\pdf-to-hl7'
# Mailbox goes into an HTTP header: accept an address only, else use the default.
if ($Mailbox -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$') { $Mailbox = 'gofax.par@bjchealth.com.au' }
try {
    $sec   = Get-Content (Join-Path $Dir 'token.dat') | ConvertTo-SecureString
    $token = (New-Object System.Net.NetworkCredential('', $sec)).Password
    $resp  = & curl.exe -s --max-time 90 -X POST "$BaseUrl/api/convert" `
        -H "Authorization: Bearer $token" `
        -H "X-Source: email" `
        -H "X-Source-Mailbox: $Mailbox" `
        -F "pdf=@$Dir\temp.pdf"
    if (-not $resp) { Write-Output '{"action":"service_error"}'; exit }
    $json = $resp | ConvertFrom-Json
    if ($json.action -eq 'auto_routed' -and $json.filename -and $json.hl7Content) {
        $enc = [System.Text.Encoding]::GetEncoding(28591)
        [System.IO.File]::WriteAllText((Join-Path $Genie $json.filename), $json.hl7Content, $enc)
    }
    Write-Output $resp
} catch {
    Write-Output '{"action":"service_error"}'
}
