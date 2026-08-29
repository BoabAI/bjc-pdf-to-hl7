# BJC AWS Account — Access & Regions

How SMEC AI accesses BJC Health's own AWS account (the BYO-account model), which
regions are in play, and the cross-account gotchas learned while setting it up
(July 2026).

## The account

| | |
|---|---|
| **Account ID** | `375391317635` |
| **Owner** | BJC Health (root email is a BJC shared mailbox, MFA-secured) |
| **Set up by** | Nicole Pyne (BJC), following the [AWS account setup guide](../business/bjc-aws-account-setup-guide.md) |
| **Deployment access** | `arn:aws:iam::375391317635:role/smec-deployment-role` |
| **Trusted principal** | `arn:aws:iam::843448676102:user/sean` only (SMEC AI's account) |
| **Role permissions** | `AdministratorAccess` (build-phase; revocable — see below) |

BJC owns the account, the IP, and the bill. SMEC AI's access is a single
cross-account role that BJC can revoke at any time by deleting it
(IAM → Roles → `smec-deployment-role` → Delete). Every action the role takes is
recorded in the account's CloudTrail log, which BJC owns.

## Using the role

A `bjc` profile assumes the role automatically (in `~/.aws/config`):

```ini
[profile bjc]
role_arn = arn:aws:iam::375391317635:role/smec-deployment-role
source_profile = default
region = ap-southeast-2
role_session_name = smec-deploy
```

```bash
aws sts get-caller-identity --profile bjc   # should show assumed-role/smec-deployment-role
```

## Regions

- **Deploy everything to Sydney (`ap-southeast-2`)** — Amplify app, DynamoDB,
  IAM, alarms. Same as the SMEC-account setup.
- **Melbourne (`ap-southeast-4`) is enabled but hosts nothing.** It's an opt-in
  region, enabled 2026-07-08, purely because the `au.anthropic.*` Bedrock
  inference profiles route requests across Sydney *and* Melbourne. IAM policies
  for Bedrock must allow both regions (see
  [amplify-bedrock-credentials.md](amplify-bedrock-credentials.md)).
- **Bedrock works out of the box** — verified 2026-07-08 with a live `converse`
  call on `au.anthropic.claude-sonnet-4-6` from Sydney. No model-access grant
  step was required in this account.

## Gotcha: opt-in regions break cross-account AssumeRole (silently)

**Symptom:** `aws sts assume-role` into the BJC account fails with a generic
`AccessDenied` that looks exactly like a trust-policy error — even when the
trust policy is correct.

**Cause:** the AWS CLI sends STS calls to the endpoint of your *default region*.
If that default is an **opt-in** region (SMEC's default is `ap-southeast-4`,
Melbourne), cross-account STS requires the region to be enabled in **both**
accounts. BJC's account started with Melbourne disabled, so every assume-role
attempt through the Melbourne endpoint was denied — while the trust policy was
right all along. Three support round-trips were spent "fixing" a trust policy
that was never broken.

**Rules of thumb:**

1. When diagnosing cross-account access, pin STS to an always-on region first:
   `aws sts assume-role --region ap-southeast-2 …`
2. `aws iam simulate-principal-policy` proves whether the *caller* side allows
   the call — if it says `allowed` and you still get `AccessDenied`, stop
   blaming identity policies; it's the trust policy or the endpoint.
3. The `bjc` profile above pins `region = ap-southeast-2`, so this can't recur
   through the profile. It only bites on bare `aws sts assume-role` calls that
   inherit the default region. (Melbourne is now enabled in the BJC account, so
   both endpoints work — but the rule stands for the next fresh account.)

## Supporting a non-technical account owner

Patterns that worked (and didn't) when walking BJC through console/CLI steps by
email:

- **CloudShell beats console navigation.** "Click the `>_` icon, paste one
  line" has far fewer failure modes than multi-step IAM wizard instructions.
  The console Create Role wizard defaults to trusting *This account*, which
  silently produces a useless trust policy if the custom-policy step is missed.
- **Email mangles quotes.** Outlook autocorrect turns straight quotes into curly
  ones, which breaks pasted JSON invisibly. Encode policy documents as base64 so
  the command contains no quote characters at all:
  `echo <base64> | base64 -d > trust.json && aws iam update-assume-role-policy … --policy-document file://trust.json`
- **Build in an unmissable success signal.** End chained commands with
  `&& echo IT WORKED - TELL SEAN` — otherwise a silent CLI error reads as
  success to a non-technical user.
- **Ask for screenshots of a diagnostic, not descriptions.** This one-liner
  (quote-free, safe through email) shows which account they're really in and
  what the trust policy actually says:
  `aws sts get-caller-identity && aws iam get-role --role-name smec-deployment-role --query Role.AssumeRolePolicyDocument`
