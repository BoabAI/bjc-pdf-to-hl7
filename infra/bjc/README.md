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

## Staging

A `staging` Amplify branch (`https://staging.d20i409xquw7x3.amplifyapp.com`)
tracks the `staging` git branch. It shares the app-level env (PAD_TOKEN, Entra
client) and the compute role, but writes to its own `-staging` audit and
reference-data tables via branch env vars that `amplify.yml` copies into
`.env.production`. Deploy a change there by pushing it to `staging`; merging to
`prod` still deploys production. PAD stays pointed at `prod`.

Only push commits that include the `amplify.yml` table lines to `staging` —
without them the staging build falls back to the prod tables.

The sibling module (`../main.tf`) manages the original SMEC-account
environment and is unaffected by this one.
