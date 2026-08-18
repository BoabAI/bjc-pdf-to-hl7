# 2026-07-13 — Deployment to the BJC Health AWS account

Move the production app from the SMEC AI account (843448676102, Amplify app
`ddv0o3k8wcjhr`) into the BJC Health account (**375391317635**), per the BYO
AWS account / contractor model: BJC owns the account and pays AWS directly.

Everything AWS-side is codified in **`infra/bjc/`** (Terraform). This runbook
covers what was verified up front, the values you need before applying, the
apply itself, verification, and cutover.

## ✅ Executed 2026-07-13

Deployed and verified live the same day this plan was written:

- `terraform apply`: 13 resources, no errors. App ID **`d20i409xquw7x3`**,
  URL https://prod.d20i409xquw7x3.amplifyapp.com
- Entra redirect URI registered; no-store headers set via
  `amplify update-app` (this repo's `customHttp.yml` takes over once merged)
- Build job #1 SUCCEED; verification battery **7/7 pass**: middleware
  redirect, public /login, no-store headers, PAD auth gate (requires bearer
  **and** `X-Source: email`), end-to-end referral → `REF^I12` HL7 via Bedrock
  (~7 s, addressee resolved), urgent fixture → `manual_review`/no HL7, both
  audit rows in the BJC table
- Terraform state + tfvars live at `infra/bjc/` in the working checkout
  (gitignored, secrets inside — back up accordingly; state is NOT remote)

Still open: SNS email confirmation (sean@smecai.au), first `/reference` visit
seeds the doctor/carrier defaults, PAD cutover (pipeline still points at the
SMEC app), custom-domain decision, SMEC decommission timing.

## Account state (verified 2026-07-13)

| Check | Result |
|---|---|
| Access | `aws --profile bjc` assumes `smec-deployment-role` with **AdministratorAccess** |
| Region `ap-southeast-4` (Melbourne) | **ENABLED** (required — AU Bedrock inference profiles route there) |
| Inference profile `au.anthropic.claude-sonnet-4-6` | ACTIVE in ap-southeast-2 |
| Bedrock model access (Anthropic use-case form + agreement) | Submitted + accepted 2026-07-13 via CLI; **live converse test passed same day** |
| Existing resources | None (no Amplify apps, no DynamoDB tables) — clean slate |

Re-verify any time (expect `agreementAvailability.status: AVAILABLE` and a
real reply from the converse test):

```bash
aws --profile bjc --region ap-southeast-2 bedrock get-foundation-model-availability \
  --model-id anthropic.claude-sonnet-4-6

aws --profile bjc --region ap-southeast-2 bedrock-runtime converse \
  --model-id au.anthropic.claude-sonnet-4-6 \
  --messages '[{"role":"user","content":[{"text":"Say OK"}]}]' \
  --inference-config '{"maxTokens":5}'
```

Gotchas that already bit us once:
- **Pin all cross-account CLI calls to `--region ap-southeast-2`.** STS in
  ap-southeast-4 is not enabled in the BJC account; the default-region fallback
  produces a generic AccessDenied.
- The use-case form API rejects human-readable values; the accepted schema uses
  `"intendedUsers": "2"` and `"industryOption": "HealthCare"` (already done —
  only relevant if it ever needs resubmitting).

## What Terraform provisions (`infra/bjc/`)

- Amplify app `bjc-pdf-to-hl7` (WEB_COMPUTE) connected to
  `BoabAI/bjc-pdf-to-hl7`, branch **`prod`** (this project's integration
  branch), auto-build on. Build spec from `amplify.yml`, headers from
  `customHttp.yml` (both in-repo).
- Compute role `AmplifyComputeRole-bjc-pdf-to-hl7`: Bedrock invoke for
  Sonnet 4.6 + Opus 4.7 in **both** ap-southeast-2 and ap-southeast-4, plus
  DynamoDB access to the two tables. Service role for SSR log push.
- DynamoDB `bjc-pdf-to-hl7-audit` + `bjc-pdf-to-hl7-reference-data`
  (same schema as SMEC; names match the code defaults so no env vars needed).
- SNS topic + pipeline-silence CloudWatch alarm (no audit writes for 6h ⇒ email).

Deliberate differences from the SMEC environment:
- `NEXT_PUBLIC_TEST_MODE=false` — no auth bypass in BJC production.
- Fresh `AUTH_SECRET` and `PAD_TOKEN` (don't share secrets across accounts).
- Only the `prod` branch is wired up (SMEC also had `main`).
- No legacy `bjc-pdf-to-hl7-dynamodb` policy/table (dead — nothing reads it).

## Prerequisites (gather before applying)

1. **GitHub PAT** for `BoabAI/bjc-pdf-to-hl7` — classic token with `repo` +
   `admin:repo_hook`, org-authorized; or fine-grained including this repo.
   Used once to install the Amplify webhook.
2. **Entra client secret** — the existing secret for app
   `9ca073d3-a123-46b0-a344-3822e51f36dc` (same registration serves both
   environments; value is in the SMEC Amplify env vars if not on hand).
3. Generate `auth_secret` (`openssl rand -base64 32`) and `pad_token`
   (`openssl rand -hex 32`), pick `app_password`.
4. Decide `alarm_emails` (BJC ops + SMEC).

## Deploy

```bash
cd infra/bjc
cp terraform.tfvars.example terraform.tfvars   # fill in (gitignored)
terraform init
terraform plan
terraform apply
```

Then:

1. **Register the Entra redirect URI** (from `terraform output entra_redirect_uri`):

   ```bash
   az ad app show --id 9ca073d3-a123-46b0-a344-3822e51f36dc --query "web.redirectUris"
   az ad app update --id 9ca073d3-a123-46b0-a344-3822e51f36dc \
     --web-redirect-uris <existing URIs...> \
       "https://prod.<APP_ID>.amplifyapp.com/api/auth/callback/microsoft-entra-id"
   ```

   (`az ad app update` replaces the list — include the existing URIs.)

2. **Trigger the first build** (webhook only fires on new pushes):

   ```bash
   aws --profile bjc --region ap-southeast-2 amplify start-job \
     --app-id <APP_ID> --branch-name prod --job-type RELEASE
   ```

3. **Confirm the SNS subscription emails** (each recipient gets an opt-in link).

## Verify

- `curl https://prod.<APP_ID>.amplifyapp.com/api/convert` → health JSON.
- Sign in via Microsoft SSO with a `bjchealth.com.au` or `smecai.au` account.
- Convert a test PDF in the UI end-to-end; download the HL7.
- Audit row landed: dashboard shows the conversion (or
  `aws --profile bjc --region ap-southeast-2 dynamodb query` on the audit table).
- `/reference` lists the default doctors/carriers (auto-seeded on first read).
- PAD path: `curl -X POST -H "Authorization: Bearer <pad_token>" -H "X-Source: email" -F "pdf=@test.pdf" https://prod.<APP_ID>.amplifyapp.com/api/convert`.
- An **urgent** fixture (docs/test-pdfs/urgent/) routes to manual_review, not HL7.

Optional — copy reference data from SMEC if staff have edited the lists beyond
the bundled defaults (check `/reference` on the SMEC app first; seed happens
only into an empty table, so import **before** anyone opens `/reference` on the
BJC app, or delete the seeded rows first):

```bash
aws dynamodb scan --region ap-southeast-2 \
  --table-name bjc-pdf-to-hl7-reference-data --output json > ref-data.json
# then batch-write the items with --profile bjc
```

## Cutover

1. Update the PAD workflow on the BJC workstation: new URL + new `PAD_TOKEN`.
2. Smoke-test one email through PAD → BJC app → HL7 in Genie's import folder.
3. Leave the SMEC app running as fallback during the validation window
   (rollback = point PAD back at the old URL).
4. Decommission the SMEC app once BJC volume has validated (separate decision —
   also remove the SMEC-side tables/roles and the old Entra redirect URIs).

## Open questions

- **Custom domain** (e.g. `convert.bjchealth.com.au`)? Needs a DNS delegation
  decision with BJC IT; would also change `AUTH_URL` + the Entra redirect URI.
- ~~Keep `AUTH_MODE=both` (SSO + password) or go SSO-only once BJC staff are
  onboarded?~~ Resolved 2026-08-18: SSO-only (`AUTH_MODE=oauth`), shared
  password login removed.
- Timing for decommissioning the SMEC environment, and whether historical
  audit rows should be exported across before it goes.
