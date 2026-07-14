# 2026-07-14 — Custom domain for the BJC app: convert.bjchealth.com.au

Give the BJC-account deployment (`d20i409xquw7x3`, currently
https://prod.d20i409xquw7x3.amplifyapp.com) a permanent address **before the
PAD cutover**, so the pipeline is pointed at its final URL exactly once.

## Why (decision, 2026-07-13/14)

The default URL encodes the Amplify app ID: recreate the app (as the SMEC→BJC
move just demonstrated) and every consumer breaks at once — PAD workflow
config, staff bookmarks, Entra redirect URIs. A custom domain decouples the
endpoint from the infrastructure. Secondary: staff and email-security tooling
trust `bjchealth.com.au`; a random `amplifyapp.com` subdomain reads as
phishing-adjacent.

Options considered and rejected for now:
- **Zone delegation** (`apps.bjchealth.com.au` NS-delegated to Route 53) —
  best long-term autonomy (no future BJC IT asks); bigger initial ask. Revisit
  if more BJC apps land in this account.
- **Interim SMEC subdomain** (`bjc-convert.smecai.au`) — instant but ties BJC
  production to a SMEC asset. Only if BJC DNS turnaround blocks the cutover.
- **New purchased domain** — lookalike-domain phishing pattern; rejected.
- **Do nothing** — workable fallback (see below), not the plan.

## Prerequisite decision (Nicole)

Confirm the subdomain name: **`convert.bjchealth.com.au`** (proposed).
Alternatives: `referrals.`, `hl7.`, `docs.`. Everything below assumes
`convert`.

## Steps

### 1. Terraform — create the domain association (SMEC, ~15 min)

Add to `infra/bjc/main.tf`:

```hcl
resource "aws_amplify_domain_association" "convert" {
  app_id      = aws_amplify_app.main.id
  domain_name = "convert.bjchealth.com.au"

  # Verification can't complete until BJC IT adds the DNS records.
  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.prod.branch_name
    prefix      = "" # bare convert.bjchealth.com.au
  }
}

output "domain_certificate_record" {
  description = "DNS record BJC IT must add for TLS certificate validation"
  value       = aws_amplify_domain_association.convert.certificate_verification_dns_record
}

output "domain_subdomain_records" {
  description = "CNAME(s) BJC IT must add to point the subdomain at the app"
  value       = [for s in aws_amplify_domain_association.convert.sub_domain : s.dns_record]
}
```

`terraform apply`, then capture the two outputs — the exact record
names/values only exist after this step.

### 2. Email BJC IT the two DNS records (external, unknown turnaround)

Send Nicole / whoever manages `bjchealth.com.au` DNS (draft below). The
domain association sits in `PENDING_VERIFICATION` until both records resolve;
check with:

```bash
aws --profile bjc --region ap-southeast-2 amplify get-domain-association \
  --app-id d20i409xquw7x3 --domain-name convert.bjchealth.com.au \
  --query "domainAssociation.domainStatus"
```

Status reaches `AVAILABLE` when cert + routing are live (can take up to a few
hours after the records are added).

### 3. Repoint auth at the new domain (SMEC, ~15 min)

Only after step 2 reaches `AVAILABLE`:

1. Terraform: change the `prod` branch env var
   `AUTH_URL = "https://convert.bjchealth.com.au"` and apply.
2. Entra: add redirect URI
   `https://convert.bjchealth.com.au/api/auth/callback/microsoft-entra-id`
   to app `9ca073d3-a123-46b0-a344-3822e51f36dc` (keep the amplifyapp.com URI
   as fallback — `az ad app update` replaces the list; include existing URIs).
3. Trigger a rebuild (`amplify start-job --job-type RELEASE`) — `AUTH_URL` is
   baked into `.env.production` at build time, so an env-var change alone does
   nothing.

### 4. Verify on the new domain

- `curl -sI https://convert.bjchealth.com.au/login` → 200 + `no-store` headers
- `/` unauthenticated → 307 to `/login`; SSO login round-trips on the new host
- PAD bearer + `X-Source: email` POST of a test PDF → HL7 + audit row
- The amplifyapp.com URL still works (it never goes away — that's the rollback)

### 5. PAD cutover (existing open item — now targets the new domain)

Update the PAD workflow on the BJC workstation: URL
`https://convert.bjchealth.com.au/api/convert` + the new `PAD_TOKEN` (in
`infra/bjc/terraform.tfvars`). One email through the pipeline end-to-end, then
watch the first real day.

## Fallback

If BJC IT's DNS turnaround threatens the cutover date: cut PAD over on
`https://prod.d20i409xquw7x3.amplifyapp.com` now and switch to the custom
domain later — PAD's URL is one config field, and steps 1–4 are unaffected by
order. Do NOT let the domain block the rollout.

## Draft email to BJC IT

> Subject: Two DNS records for convert.bjchealth.com.au (BJC document
> converter)
>
> Hi — to put the document-conversion app on a BJC address, could you add
> these two records to bjchealth.com.au DNS:
>
> 1. **Certificate validation (CNAME):** `<name from
>    domain_certificate_record>` → `<value>`
> 2. **Subdomain (CNAME):** `convert.bjchealth.com.au` → `<value from
>    domain_subdomain_records>`
>
> Nothing else changes on your side — the record targets are AWS-managed.
> Once they're in, TLS and routing activate automatically within a few hours.

## Open questions

- Subdomain name sign-off from Nicole (`convert` proposed).
- Whether BJC IT would rather delegate `apps.bjchealth.com.au` wholesale
  (kills all future DNS asks) — offer it in the same email if useful.
- After the domain is live and PAD is cut over: remove the amplifyapp.com
  Entra redirect URI, or keep it as a documented fallback?
