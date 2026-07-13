# BJC Health account environment

Terraform root module for the full production stack in the BJC Health AWS
account (375391317635): Amplify app + `prod` branch, compute/service IAM roles,
DynamoDB tables, and pipeline alerting.

State is local and gitignored, applied via the `bjc` CLI profile
(`smec-deployment-role`). Secrets go in `terraform.tfvars` (gitignored) — see
`terraform.tfvars.example`.

**Runbook:** `docs/plans/2026-07-13-bjc-aws-deployment.md` — account
prerequisites (Bedrock model access), apply steps, Entra redirect URI,
verification checklist, and PAD cutover.

The sibling module (`../main.tf`) manages the original SMEC-account
environment and is unaffected by this one.
