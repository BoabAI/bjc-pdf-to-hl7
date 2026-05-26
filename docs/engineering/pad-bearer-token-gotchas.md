# Power Automate Desktop — Bearer Token + Multipart PDF Upload Gotchas

_Generated: 2026-04-30_ — research only, no code changes pending approval.

Audience: a developer adding `Authorization: Bearer <token>` to an existing PAD `Invoke web service` action that already POSTs a PDF as multipart/form-data, running unattended under a Windows service account on a single BJC Health server.

---

## TL;DR — top 3 traps

1. **Credential Manager is per-Windows-user.** If you add the credential while logged in as `sean@bjchealth` and PAD runs unattended as `bjc-rpa-svc` (or any other identity), the `Get credential` / "Get password from Windows Credentials" action returns nothing or errors. Add the credential while logged in **as the exact account the unattended PAD machine connection uses**, or via `runas`/`PsExec -u`.
2. **The default `Connection timeout` is 30 seconds.** Your `/api/convert` runs Bedrock vision (10–25 s typical). On a slow day a 30 s ceiling will start producing intermittent timeouts that look like "the bearer change broke things". **Bump the Advanced → Connection timeout to 90 s** while you're in the action. Unrelated to bearer auth, but you're editing the action anyway.
3. **Mark the bearer token variable as Sensitive *before* the first run.** If you don't, the value is written to `flow_logs` (`%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Logs`) in plaintext on every run. Right-click the variable → **Mark as sensitive**. Same for the `%PadToken%` you assign from the Credential Manager output.

Stop here if you only have five minutes.

---

## Gotchas

### 1. Use `Invoke web service` — not `Invoke SOAP web service`, not the "modern" cloud `HTTP` connector

**Symptom:** You wire it up against `Invoke SOAP web service` because the existing flow says "web service" and you grab the wrong one. The Custom headers field looks identical but you can't toggle `Upload attachments` (multipart) — the SOAP variant has no attachments parameter at all. Or: you reach for the cloud-flow `HTTP` premium connector, which uses different syntax (`$multipart`/`$content-type` JSON shape) and isn't a desktop action.

**Cause:** PAD has three superficially similar actions:

| Action | Group | Multipart? | Custom headers? |
|---|---|---|---|
| `Invoke web service` | Web (desktop) | **Yes** (Upload attachments toggle) | Yes |
| `Invoke SOAP web service` | Web (desktop) | No | Yes |
| `HTTP` (cloud connector) | Premium connector | Yes (`$multipart` JSON) | Yes |
| `Download from web` | Web (desktop) | No | **No custom headers** |

**Fix:** In the existing flow, confirm the action is `Invoke web service` from the **Web** action group (desktop). It's almost certainly already this — just confirm before editing.

**Verify:** Open the action; the parameters list includes `Upload attachments`, `Attachments`, `Method` (with PATCH/CONNECT/etc.) and `Encode request body`. SOAP version has `WSDL`, `Service`, `Port`, `Operation` instead.

---

### 2. The "Authorization header is not allowed" error is a **custom connector** thing — does not apply here

**Symptom:** You search "Power Automate Authorization Bearer" and find threads warning that PAD rejects the literal header name `Authorization` and demands you rename it to `Access-Token` and use a Template Policy. You panic.

**Cause:** That restriction is on the **cloud Custom Connector** designer (when you upload an OpenAPI spec and the platform reserves `Authorization` for a managed auth scheme). It does **not** apply to the desktop `Invoke web service` action's free-text Custom headers field. PAD's desktop action passes whatever you type straight through to the underlying `HttpClient`.

**Fix:** Type `Authorization: Bearer %PadToken%` in Custom headers as-is. No renaming needed.

**Verify:** First test request in dev — server logs show `Authorization: Bearer e38e…e537f` arriving exactly. If the API rejects with 401, the token's wrong, not the header name.

---

### 3. Custom headers field separator is **newline** (one header per line) — not CRLF, not semicolon

**Symptom:** You concatenate `X-Source: email; Authorization: Bearer xyz` thinking semicolons separate headers (HTTP cookies use `;` so it's an easy mistake) → `Invalid header in custom headers` exception, or the whole thing goes through as a single malformed `X-Source` value.

**Cause:** PAD's Custom headers textbox is parsed line-by-line. Each line is a single `Name: value` pair. Internally PAD normalises to CRLF, but you enter plain newlines (Enter key). The parser raises `Invalid header in custom headers` if a line doesn't contain a colon or has empty name/value.

**Fix:** Each header on its own line:

```
X-Source: email
X-Source-Mailbox: %MailboxName%
Authorization: Bearer %PadToken%
```

No leading whitespace before the name. Single space after the colon is conventional (and safe). Don't quote the value. Don't URL-encode it.

**Verify:** PAD's action editor previews multiple lines visibly. After save, reopen the action — each header is on its own row. Run the flow and check the API receives all three.

---

### 4. Long header values (`Authorization: Bearer <64 hex>` = 71 chars) — fine, but watch for trailing whitespace

**Symptom:** Server returns 401 with `invalid bearer token`. Token visually matches when you stare at it. Re-typing fixes it.

**Cause:** Two real-world causes here, both well-documented in PAD community threads:
1. PAD's **trim-whitespaces** logic only applies to *response bodies*, not header *inputs*. If you copy the token from a notepad line that ends in a space or invisible CR, that whitespace is sent as part of the header value. Server-side trim usually saves you, but Express by default trims `Authorization` header values inconsistently if there's a CR mid-value.
2. Variable interpolation from `Get credential` actions has historically pulled a trailing CR on Windows when the credential was created by pasting from a non-Windows clipboard.

**Fix:** When you store the token in Credential Manager, type or paste with **no trailing newline**. In Robin, after retrieving, run `Text.Trim Text: %PadTokenRaw% TrimOption: BothSides` and assign to `%PadToken%`. Use `%PadToken%` in the header.

**Verify:** Add a temporary `Display message` or log step (with the variable **NOT** marked sensitive yet, in dev only) showing `[%PadToken%]` with brackets — verify no spaces inside the brackets. Then mark sensitive and remove the debug step.

---

### 5. Variable interpolation in headers: `%PadToken%` works; nested expressions don't

**Symptom:** You write `Authorization: Bearer %{PadToken}%` or `Authorization: Bearer ${PadToken}` — get `Invalid header in custom headers` or the literal text gets sent.

**Cause:** PAD's only variable syntax is `%VariableName%`. Curly-brace, dollar-prefix, and Logic Apps `@{...}` syntaxes do not work in the desktop `Invoke web service` action.

**Fix:** Plain `%PadToken%`. Concatenation is implicit — `Bearer %PadToken%` produces `Bearer abc123`.

**Verify:** Run the flow once with a deliberately wrong token (e.g. `xxx`) and confirm the API logs `Authorization: Bearer xxx` — proves interpolation worked.

---

### 6. Credential Manager is per-Windows-user, encrypted with that user's DPAPI key

**Symptom:** You add `BJC-PAD-Token` to Credential Manager from your interactive RDP session. The flow runs fine in dev (you triggered it manually). Production unattended run fails with `The specified credential could not be found` or `Get password from Windows Credentials` returns empty.

**Cause:** Credential Manager entries under "Generic Credentials" are stored encrypted with **DPAPI keyed to the user account that created them**. An entry created as `bjchealth\sean` is invisible to `bjchealth\bjc-rpa-svc`. PAD machine connections for unattended runs spawn a session as the configured connection user, **not** as you. ([Credentials Processes in Windows Authentication](https://learn.microsoft.com/en-us/windows-server/security/windows-authentication/credentials-processes-in-windows-authentication))

**Fix:** Find which Windows account the PAD machine connection uses (Power Automate portal → Monitor → Machines → your machine → connection). RDP to the server **as that account** (or `runas /user:<svc>` cmd → `control /name Microsoft.CredentialManager`) and add the credential there. Alternative: `PsExec -i -u <svc> rundll32.exe keymgr.dll, KRShowKeyMgr`.

**Verify:** Sign out of all other accounts. Sign in as the connection user. Open Credential Manager → Windows Credentials → your `BJC-PAD-Token` entry should be visible. Run the flow attended once from this session — `Get credential` action returns the token.

---

### 7. Domain-joined gMSA accounts can't store Credential Manager entries interactively

**Symptom:** The PAD machine connection uses a Group Managed Service Account (`bjchealth\rpa-svc$`). You can't RDP into a gMSA — there's no interactive logon. You can't add the credential.

**Cause:** gMSA accounts have no password and no interactive session. DPAPI per-user encryption requires an interactive logon to bootstrap the master key.

**Fix (in priority order):**
1. **Don't use a gMSA for PAD unattended runs** if you need Credential Manager. Use a normal domain user with `Log on as a service` rights and a long randomised password stored in the connection. This is what Microsoft's PAD docs assume.
2. If you're stuck with a gMSA, fall back to **PAD environment variables** (encrypted in Dataverse, not Windows DPAPI) or pivot to the Azure Key Vault path (Gotcha 14).

**Verify:** Check Services.msc or `whoami` from a scheduled task running as the PAD account — if it's a `$`-suffixed name, it's gMSA.

---

### 8. PAD logs the action's full Custom headers field by default — including your Bearer token

**Symptom:** You ship the change. Three weeks later you run a routine PAD log audit and find the bearer token in plaintext on disk in `%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Logs\*.txt` and in the Dataverse run history (visible to anyone with PAD console access on that machine, plus anyone with Power Platform admin on the tenant).

**Cause:** PAD logs *input parameter values* of every action by default. The Custom headers field is just a text input — its contents are logged. Sensitive variables are the only mechanism that suppresses this. ([Sensitive variables in Power Automate Desktop](https://learn.microsoft.com/en-us/power-platform-release-plan/2021wave2/power-automate/sensitive-variables-power-automate-desktop))

**Fix:**
1. Right-click `%PadToken%` (and the raw output of `Get credential`) → **Mark as sensitive**.
2. PAD's logger detects sensitive variables embedded in expressions and treats the **whole expression as sensitive** — so `Bearer %PadToken%` gets masked in the Custom headers log entry. ([Manage variables and the variables pane](https://learn.microsoft.com/en-us/power-automate/desktop-flows/manage-variables))
3. Do **not** hardcode the token literal in the Custom headers field even temporarily for testing — that text is visible in the flow definition (Dataverse) regardless of sensitive marking, and it persists in version history.

**Verify:** After marking sensitive and one run, open `%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Logs` → grep for `Bearer ` — you should see `Bearer ***` or the line entirely absent. Also check the Power Automate cloud portal → flow run details → the Custom headers value should show `***`.

---

### 9. `Upload attachments` toggle handles multipart Content-Type automatically — don't override it

**Symptom:** You add `Content-Type: multipart/form-data` to the Custom headers field "to be safe" → server gets a request with no boundary parameter (`Content-Type: multipart/form-data` without `; boundary=...`) and rejects with 400 `unable to parse multipart body`.

**Cause:** When `Upload attachments` is on, PAD's HTTP layer constructs the multipart body and sets the full `Content-Type: multipart/form-data; boundary=----PADBoundary…` header itself. If you also put a `Content-Type` line in Custom headers, behaviour is undefined depending on PAD version — historically the manual one wins and the auto-generated boundary is lost.

**Fix:** **Leave `Content type` field and Custom headers `Content-Type` alone.** Only set the **`Content type`** action parameter (the dedicated field, not Custom headers) if you're sending a non-multipart body. For multipart with attachments, neither field needs touching.

**Verify:** Server logs (or `tcpdump` / a request bin) show `Content-Type: multipart/form-data; boundary=----something`. If boundary is missing, you've doubled it up.

---

### 10. `Encode request body` defaults to **True** — usually a non-issue with multipart, but worth knowing

**Symptom:** Body arrives URL-encoded when you didn't ask for it.

**Cause:** PAD's `Invoke web service` has an `Encode request body` flag (default True). For multipart-with-attachments, PAD bypasses encoding for the binary part — but if you ever swap to a JSON body, leaving this True percent-encodes the JSON and breaks the API.

**Fix:** For your current multipart flow, leave default. If you ever change body shape, recheck this flag.

**Verify:** N/A unless you're modifying body shape.

---

### 11. TLS — Amplify's CloudFront cert chain is in the Windows trust store by default

**Symptom:** `The underlying connection was closed: Could not establish trust relationship for the SSL/TLS secure channel.`

**Cause:** Rare on a fully-patched modern Windows Server (CloudFront uses Amazon Trust Services certs which chain to roots in the Microsoft Trusted Root Program). Most likely cause if you see this: server has been air-gapped from Windows Update for >12 months OR is on Windows Server 2012 with no manual root cert refresh.

**Fix:** Run Windows Update. **Do not** flip `Accept untrusted certificates` to True — that disables cert validation entirely, including hostname verification, and defeats the bearer auth's point (anyone on the network path can MITM you and harvest the bearer).

**Verify:** From the PAD server, in PowerShell: `Invoke-WebRequest -Uri https://<your-amplify>.amplifyapp.com/api/convert -Method GET` should return a 401 (auth required) without any TLS warning. If TLS errors appear here, fix the trust store before touching the flow.

---

### 12. Connection timeout default is 30 s — Bedrock vision can take 10–25 s

**Symptom:** Intermittent failures only on large/complex PDFs: `Invoke web service error: The operation has timed out`. Was working "fine" before bearer auth was added → red herring, just exposed by new variance.

**Cause:** PAD's default `Connection timeout: 30` is the **total** request budget (connect + send + server processing + response receive), not just handshake. Bedrock vision extraction normally finishes in 10–25 s but can spike past 30 s on first cold-start of a Lambda or large multi-page PDFs. ([Dealing with HTTP timeouts in Power Automate Desktop](https://www.serverlessnotes.com/docs/dealing-with-http-timeouts-in-power-automate-desktop))

**Fix:** While you're editing the action for the bearer header, set Advanced → **Connection timeout: 90**. Auth adds <1 ms; this is purely for headroom against Bedrock variance.

**Verify:** Trigger a flow against a large 5-page referral PDF. Should complete cleanly. Check `/api/logs` for the row's `processingMs` to know your real distribution.

---

### 13. Token rotation — PAD does *not* cache `Get credential` output across runs

**Symptom:** You wonder whether rotating the token quarterly requires republishing the flow.

**Cause:** Each run executes `Get credential from Windows Credentials` fresh — there's no caching layer between runs. The Credential Manager entry is read at action execution time.

**Fix:** Rotation procedure:
1. Generate new token (`openssl rand -hex 32`).
2. Update Amplify env var → wait for build & propagation.
3. On the PAD server, signed in as the connection user, open Credential Manager → edit `BJC-PAD-Token` → paste new value → save.
4. Next scheduled run picks it up. **No flow republish needed.**

**Risk window:** Between step 2 and step 3, the in-flight requests still using the old token will 401. Either: (a) accept ~15 min of failures (the polling cadence retries naturally on next email), or (b) implement dual-token validation server-side for a 24 h overlap (`PAD_TOKEN` + `PAD_TOKEN_PREVIOUS`). For quarterly rotations the simple path is fine.

**Verify:** After step 3, check the next run's `/api/logs` row succeeds. Do NOT delete the old token from Amplify until you've confirmed at least one production success.

---

### 14. Don't confuse `Get credential` (cloud flow / Key Vault) with `Get password from Windows Credentials` (desktop)

**Symptom:** You read MS Learn docs on the new "Get credential" action and start configuring CyberArk or Azure Key Vault before realising it's a different action that requires Power Automate cloud connections, Dataverse permissions, and a vault provisioning project.

**Cause:** Microsoft has shipped *two* actions with similar names: ([Secure credential retrieval in Power Automate for Desktop](https://learn.microsoft.com/en-us/power-platform/release-plan/2024wave2/power-automate/secure-credential-retrieval-power-automate-desktop))

| Action | Backed by | When to use |
|---|---|---|
| **Get password from Windows Credentials** (desktop, "Credentials" group) | Windows Credential Manager via DPAPI | Single Windows server, simple, no cloud dependency |
| **Get credential** (Power Automate "secret variables" group) | Azure Key Vault / CyberArk via Dataverse | Enterprise rollout across many machines |

For a single BJC server, the first one is the right answer. Robin name on disk: `Credentials.GetPasswordFromWindowsCredentials`.

**Fix:** Use the Windows Credentials action, not the Key Vault one.

**Verify:** In the PAD action picker, the right action lives under **Credentials** (or "Workstation" depending on PAD version) → "Get password from Windows Credentials". Its inputs are `Target name` (the Credential Manager entry name) and outputs `UserName` + `Password`.

---

### 15. Header name capitalisation — `Authorization` (capital A), not `authorization`

**Symptom:** Works in dev but fails in some proxy environments.

**Cause:** HTTP/1.1 spec says header names are case-insensitive. Node/Express normalises to lowercase. **However**, some HTTP/2 stacks and intermediate proxies (rare in CloudFront → Lambda but not impossible if you ever route through API Gateway) historically had quirks with non-canonical casing. CloudFront itself preserves case as sent.

**Fix:** Use canonical `Authorization: Bearer ...` (capital A). Costs nothing, avoids any future surprise.

**Verify:** N/A — preventive.

---

## Recommended secret storage path for this deployment

**Use Windows Credential Manager via the `Get password from Windows Credentials` PAD action.** Single source. No new dependencies.

Justification:
- **Single Windows server, single tenant, single flow.** The complexity of Azure Key Vault (App Registration, vault provisioning, network egress to vault.azure.net, Dataverse cloud-flow round-trip on every PAD run, additional licensing surface) is not warranted.
- **Power Automate Premium licensing is present** but the premium vault path adds **end-to-end latency** to every run (cloud-flow hop) and a new failure mode (vault unreachable → flow halts) for marginal security gain over DPAPI on a hardened domain-joined server.
- **Aligns with the AU medical security baseline** (`docs/engineering/au-medical-security-baseline.md`): "shared bearer token in `Authorization: Bearer <token>` … secret in Amplify env. Rotate quarterly. Combine with… HMAC-signed body." Credential Manager + sensitive variables satisfies the "consumer stores in its own secret store" clause.
- **DPAPI is the right tool for the threat model.** The threat is not "nation-state extracts token from disk" — it's "junior admin browses the flow definition or run logs". DPAPI ties decryption to the service account; sensitive variables suppress logs. Both threats covered.
- **Rotation is simple** (Gotcha 13).

Reject:
- **Plaintext variable in flow** — token in Dataverse flow JSON forever, in version history.
- **Machine-level environment variable** — readable by any local admin, not encrypted.
- **PAD environment variable (Dataverse)** — encrypted at rest but visible to any maker with environment access; harder to audit who accessed it. Reasonable second choice if Credential Manager is genuinely off the table (e.g. forced gMSA), but adds Dataverse coupling.
- **Azure Key Vault** — overkill here; revisit if you ever scale to >3 PAD machines or multi-region.

---

## Robin snippet (recommended path)

Paste-into-flow shape. Action display names may render slightly differently per PAD version — Robin function names below are stable.

```robin
# 1. Pull the bearer token from Credential Manager
# (Credential entry created on the PAD server while signed in as the connection user)
Credentials.GetPasswordFromWindowsCredentials.GetPasswordFromWindowsCredentials TargetName: $'''BJC-PAD-Token''' UserName=> CredUserName Password=> PadTokenRaw

# 2. Trim any stray whitespace from paste artefacts (Gotcha 4)
Text.Trim Text: PadTokenRaw TrimOption: Text.TrimOption.BothSides TrimmedText=> PadToken

# 3. Mark PadTokenRaw and PadToken as sensitive in the Variables pane
#    (right-click → Mark as sensitive). This must be done in the designer; no Robin keyword.

# 4. Build the multi-line custom headers value
SET CustomHeaders TO $'''X-Source: email
X-Source-Mailbox: %MailboxName%
Authorization: Bearer %PadToken%'''

# 5. Invoke the API with the existing multipart attachment
Web.InvokeWebService.InvokeWebService Url: $'''https://<amplify-app>.amplifyapp.com/api/convert''' Method: Web.Method.Post Accept: $'''application/json''' ContentType: $'''application/octet-stream''' CustomHeaders: CustomHeaders RequestBody: $'''''' ConnectionTimeout: 90 FollowRedirection: True ClearCookies: False FailOnErrorStatus: True IncludeAttachments: True Attachments: { ^[ Name: $'''pdf''' AttachmentFilePath: $'''C:\\SMEC AI\\temp.pdf''' AttachmentType: Web.AttachmentType.File ] } EncodeRequestBody: True UserAgent: $'''Mozilla/5.0''' Encoding: Web.Encoding.AutoDetect AcceptUntrustedCertificates: False Authentication: False ResponseHeaders=> WebServiceResponseHeaders Response=> WebServiceResponse StatusCode=> StatusCode
```

Notes on the Robin shape:
- `TargetName` is the **Internet or network address** field shown in Credential Manager when you create the entry. Use a stable, descriptive name (e.g. `BJC-PAD-Token`).
- The triple-quote `$'''...'''` is PAD's verbatim string literal — line breaks inside are preserved as the multi-line custom-headers value.
- `Authentication: False` keeps `User name` / `Password` *Basic auth* fields off (you're authenticating via the bearer header, not HTTP Basic).
- `IncludeAttachments: True` is the Robin name for the `Upload attachments` toggle. PAD generates `Content-Type: multipart/form-data; boundary=…` automatically — do not also set it in CustomHeaders (Gotcha 9).
- `ContentType: application/octet-stream` here is the *part* content type for the inline body (which is empty since the file is in attachments). Some PAD versions ignore this when attachments are on; others use it for the part header. Safe default.

---

## Pre-flight checklist (before editing the flow)

Run these on the BJC Windows server, signed in as your normal admin account first to gather facts, then sign out and back in as the PAD connection user where indicated.

1. **Confirm PAD version.** PAD console → top-right gear → About. Anything ≥ 2.40 (released 2024) supports current Custom headers behaviour and `Get password from Windows Credentials`. If you're on < 2.30, upgrade before changing anything.
2. **Identify the unattended runtime account.** Power Automate portal → Monitor → Machines → click your registered machine → "Connections". Note the exact `DOMAIN\username`. This is who must own the Credential Manager entry.
3. **Confirm it's not a gMSA.** Run `Get-ADServiceAccount -Identity <name>` from any domain-joined PowerShell — if it returns a `MSA_*` object, it's gMSA → re-evaluate Gotcha 7.
4. **Test current flow runs as that account.** Look at the most recent successful run's host details — confirm the Windows session user matches step 2. If the flow has been running attended-only against your interactive session, **the production unattended path may not have ever worked** and rolling out bearer auth is the wrong time to discover that.
5. **Verify the PAD log location and current redaction behaviour.** Open `%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Logs\` for the connection user. Look at recent run logs — confirm sensitive variables (any password fields you currently use) are masked. If they're in plaintext, your sensitive marking isn't working and the bearer will leak too.
6. **Confirm TLS to the API works.** As the connection user: `Invoke-WebRequest -Uri https://<amplify>.amplifyapp.com/api/convert -Method GET` returns 401, no TLS error.
7. **Check current request latency.** Tail your `/api/logs` endpoint for the last 24 h — what's the p95 of `processingMs`? If it's >25000 ms you have <5 s headroom on the default 30 s timeout already; bump to 90 s before flipping bearer on.
8. **Generate and pre-position the new token.** Token generated and saved in Amplify env var `PAD_TOKEN`. Server-side change deployed (current `prod` branch). Confirm a manual `curl` from the BJC server with the bearer header succeeds end-to-end **before** opening PAD. This isolates "does the token work at all" from "did I configure PAD correctly".

---

## Sources

- [HTTP actions reference — Microsoft Learn](https://learn.microsoft.com/en-us/power-automate/desktop-flows/actions-reference/web) — canonical parameter list for `Invoke web service`, including `Upload attachments`, `Custom headers`, `Connection timeout` (default 30 s), `Encode request body`, and the `Invalid header in custom headers` exception.
- [Sensitive variables in Power Automate Desktop — Microsoft Learn](https://learn.microsoft.com/en-us/power-platform-release-plan/2021wave2/power-automate/sensitive-variables-power-automate-desktop) — confirms sensitive vars are not stored in flow run logs.
- [Manage variables and the variables pane — Microsoft Learn](https://learn.microsoft.com/en-us/power-automate/desktop-flows/manage-variables) — confirms expressions containing a sensitive variable are treated as sensitive in logs.
- [Secure credential retrieval in Power Automate for Desktop — Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/release-plan/2024wave2/power-automate/secure-credential-retrieval-power-automate-desktop) — describes the newer `Get credential` action backed by Key Vault/CyberArk (distinct from the desktop Windows Credentials action).
- [Run unattended desktop flows — Microsoft Learn](https://learn.microsoft.com/en-us/power-automate/desktop-flows/run-unattended-desktop-flows) — explains that unattended runs spawn a session as the connection user.
- [Invalid credentials error running desktop flows — Microsoft Learn](https://learn.microsoft.com/en-us/troubleshoot/power-platform/power-automate/desktop-flows/invalid-credentials-errors-running-desktop-flows) — troubleshooting context for credential-mismatch failures.
- [Credentials Processes in Windows Authentication — Microsoft Learn](https://learn.microsoft.com/en-us/windows-server/security/windows-authentication/credentials-processes-in-windows-authentication) — DPAPI per-user encryption guarantees.
- [Considerations and known issues when using Credential Guard — Microsoft Learn](https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/considerations-known-issues) — relevant if Credential Guard is enabled on the BJC server.
- [Dealing with HTTP timeouts in Power Automate Desktop — serverlessnotes.com](https://www.serverlessnotes.com/docs/dealing-with-http-timeouts-in-power-automate-desktop) — confirms 30 s is the full request budget and how to raise it.
- [How to protect your App Secrets in Power Automate Desktop — Veronique's Blog](https://veronicageek.com/2024/protect-app-secrets-in-powerautomate-desktop/) — comparison of secret-storage options, recommends Key Vault for scale (we don't need that scale).
- [Walkthrough: Invoke Web Service with multipart form data — Power Platform Community](https://community.powerplatform.com/t5/Power-Automate-Desktop/Walkthrough-How-to-use-Invoke-Web-Service-with-multipart-form/td-p/981388) — community walkthrough referenced for the `Upload attachments` toggle handling Content-Type automatically.
- [Power Platform Community — Custom headers in Invoke web service](https://community.powerplatform.com/t5/Power-Automate-Desktop/how-to-set-custom-headers-in-invoke-web-service/td-p/968952) — multi-header newline syntax discussion.
- [Authorization Bearer in Header — Custom Connector — Power Platform Community](https://powerusers.microsoft.com/t5/Using-Connectors/Authorization-Bearer-in-Header-Custom-Connector/td-p/51541) — the cloud-Custom-Connector "Authorization not allowed" restriction (referenced to clarify it does NOT apply to the desktop action).
