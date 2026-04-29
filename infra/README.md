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
