# Infrastructure

Terraform config for the audit log used by `lib/audit.ts` and `/api/logs`.

## What This Provisions

- **DynamoDB table `bjc-pdf-to-hl7-audit`** — partition key `month` (`YYYY-MM`), sort key `ts`, PAY_PER_REQUEST, point-in-time recovery on. Stores metadata-only audit rows (no PHI).
- **Inline policy on the Amplify compute role** allowing `dynamodb:PutItem` and `dynamodb:Query` against this table.

## Apply

```bash
cd infra
terraform init
terraform plan
terraform apply
```

## Configure Amplify

Set the `DYNAMODB_TABLE` env var on the Amplify app to the table name (`bjc-pdf-to-hl7-audit`). The runtime uses `process.env.DYNAMODB_TABLE` and falls back to `bjc-pdf-to-hl7-audit` if unset.

## Compute Role Name

The default `amplify_compute_role_name` is `AmplifyComputeRole-ddv0o3k8wcjhr`. If the role has been recreated or renamed, override:

```bash
terraform apply -var="amplify_compute_role_name=AmplifyComputeRole-<new-id>"
```

Find the current name at: AWS Console → Amplify → app `bjc-pdf-to-hl7` → App settings → IAM roles → Compute role.

## Notes

- Permissions on the **compute role** (runtime), not the service role (build).
- DynamoDB region is `ap-southeast-2` (Sydney). Same region as the Amplify app.
- TTL attribute is configured but disabled. Enable later if audit rotation is desired.

## Auth (not in Terraform)

Authentication uses Microsoft Entra ID via Auth.js v5. The Entra app registration lives in Microsoft, not AWS, so it's outside this Terraform.

- **Tenant:** Boab AI Pty Ltd (`smecai.au`), tenant id `197609ee-9f62-4b85-b8b0-d3e2b6c1d4b4`
- **App display name:** `BJC PDF-to-HL7`
- **App (client) ID:** `9ca073d3-a123-46b0-a344-3822e51f36dc`
- **Sign-in audience:** `AzureADMultipleOrgs` (multi-tenant — BJC users sign in against their own tenant)
- **Redirect URIs:** `http://localhost:3000/api/auth/callback/microsoft-entra-id`, `https://prod.ddv0o3k8wcjhr.amplifyapp.com/api/auth/callback/microsoft-entra-id`, `https://main.ddv0o3k8wcjhr.amplifyapp.com/api/auth/callback/microsoft-entra-id`
- **Scopes (delegated, admin-consented in home tenant):** `openid profile email offline_access`
- **Optional ID-token claims:** `email`, `upn`
- **Domain allowlist:** enforced in `lib/auth.ts` via `AUTH_ALLOWED_DOMAINS` env var (`bjchealth.com.au,smecai.au`)
- **Client secret:** rotates every 24 months. Rotate via `az ad app credential reset --id 9ca073d3-a123-46b0-a344-3822e51f36dc --display-name "<purpose>" --end-date <ISO>`. After rotation update `AZURE_AD_CLIENT_SECRET` on Amplify and locally.
