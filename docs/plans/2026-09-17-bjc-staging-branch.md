# BJC staging branch — setup and rollback

**Status:** applied 2026-09-17. The rollback was tested the same day (destroy, then
re-apply) and prod config was byte-identical to the pre-change baseline afterwards.

## What exists

| Change | Where | Touches prod? |
|---|---|---|
| Amplify branch `staging` (BETA, auto-build) → `https://staging.d20i409xquw7x3.amplifyapp.com` | `infra/bjc/main.tf` `aws_amplify_branch.staging` | No — new branch; app-level env and `prod` branch unchanged |
| Tables `bjc-pdf-to-hl7-audit-staging`, `bjc-pdf-to-hl7-reference-data-staging` | `aws_dynamodb_table.*_staging` | No |
| Inline policy `bjc-pdf-to-hl7-staging-dynamodb` on `AmplifyComputeRole-bjc-pdf-to-hl7` (staging tables only) | `aws_iam_role_policy.staging_dynamodb` | Adds a policy to the shared role; existing policies unchanged |
| `amplify.yml`: writes `DYNAMODB_TABLE` / `REFERENCE_DATA_TABLE` to `.env.production` **only when set** | repo | No-op on prod (vars unset there) |
| Entra app `9ca073d3-…` redirect URI `https://staging.d20i409xquw7x3.amplifyapp.com/api/auth/callback/microsoft-entra-id` | Azure (not Terraform) | Additive; existing 5 URIs kept |
| Git branch `staging` | GitHub | No — `prod` is untouched |

Staging shares the app-level `PAD_TOKEN`, Entra client and the compute role (Bedrock).
PAD stays pointed at `prod`.

**Pre-change state backup:** `infra/bjc/pre-staging-2026-09-17.tfstate` (gitignored, local).

## Deploying to staging

Push a branch based on a commit that already has the `amplify.yml` table lines (this
PR, or `prod` once it's merged) to `staging`. Anything older falls back to the prod
tables, because the compute role can reach them.

## Rollback

Run from `infra/bjc/` with the `bjc` profile. Each step is independent.

1. **AWS resources** (tested 2026-09-17: `4 destroyed`, prod snapshot identical):
   ```bash
   AWS_PROFILE=bjc terraform destroy \
     -target=aws_amplify_branch.staging \
     -target=aws_dynamodb_table.audit_staging \
     -target=aws_dynamodb_table.reference_data_staging \
     -target=aws_iam_role_policy.staging_dynamodb
   ```
   Then revert the staging commit so the config matches (or a later full apply re-creates them).
   Staging tables have no PITR, so staging audit rows are gone for good. Prod tables are not targeted.
2. **Entra redirect URI** — remove the staging URI and keep the rest:
   ```bash
   az ad app update --id 9ca073d3-a123-46b0-a344-3822e51f36dc --web-redirect-uris \
     "https://prod.d20i409xquw7x3.amplifyapp.com/api/auth/callback/microsoft-entra-id" \
     "https://feature-automation-workflow.ddv0o3k8wcjhr.amplifyapp.com/api/auth/callback/microsoft-entra-id" \
     "https://main.ddv0o3k8wcjhr.amplifyapp.com/api/auth/callback/microsoft-entra-id" \
     "https://prod.ddv0o3k8wcjhr.amplifyapp.com/api/auth/callback/microsoft-entra-id" \
     "http://localhost:3000/api/auth/callback/microsoft-entra-id"
   ```
3. **Git** — `git push origin --delete staging`.
4. **`amplify.yml`** — only matters once merged to `prod`, and it's a no-op there. If needed, `git revert` the commit.

**Last resort for Terraform state:** if state is ever corrupted, restore
`pre-staging-2026-09-17.tfstate` → `terraform.tfstate`. Then delete the 4 staging
resources by hand (`aws amplify delete-branch`, `dynamodb delete-table` ×2,
`iam delete-role-policy`), since the restored state no longer tracks them.

## Verifying isolation

After a staging conversion (curl with `Authorization: Bearer $PAD_TOKEN`,
`X-Source: email`, `X-Source-Mailbox: gofax.cht@bjchealth.com.au`):
- the row is in `bjc-pdf-to-hl7-audit-staging`
- the newest `ts` in `bjc-pdf-to-hl7-audit` is unchanged
