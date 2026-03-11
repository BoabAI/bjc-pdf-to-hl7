# Amplify WEB_COMPUTE + Bedrock: Credential & Permission Setup

## Problem

Vision extraction (Bedrock Claude Sonnet) worked locally but failed on Amplify staging. Two issues were encountered in sequence:

1. `CredentialsProviderError: Could not load credentials from any providers`
2. `AccessDeniedException` from the Amplify SSR runtime when invoking Bedrock

## Root Cause 1: Service Role vs Compute Role

Amplify has **two separate IAM roles**:

| Role | Purpose | When it runs |
|------|---------|-------------|
| **Service Role** | Build, deploy, create resources | Build time only |
| **Compute Role** | SSR Lambda runtime credentials | Runtime (your code) |

We had Bedrock permissions on the **Service Role** (`AmplifySSRLoggingRole`), but the SSR Lambda at runtime uses the **Compute Role** — which was `null` (not set).

Amplify WEB_COMPUTE injects credentials via a custom **credential listener** sidecar (not standard `AWS_ACCESS_KEY_ID` env vars). The AWS SDK only picks these up when a Compute Role is attached. Once attached, standard credential env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) appear in the runtime.

## Root Cause 2: Bedrock Resource Scope Was Too Narrow

After the Compute Role was attached, runtime credentials were present, but the role policy was still too narrow. The original allowlist targeted one specific foundation model ARN and one specific inference profile ARN.

In practice, widening the Bedrock resources for the Amplify runtime in **`ap-southeast-2`** resolved the production `AccessDenied` error. The working policy allows all Bedrock foundation-model and inference-profile resources in that region for invoke actions.

## Fix

### 1. Create a Compute Role with Bedrock permissions

```bash
aws iam create-role \
  --role-name "AmplifyComputeRole-ddv0o3k8wcjhr" \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "amplify.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

aws iam put-role-policy \
  --role-name "AmplifyComputeRole-ddv0o3k8wcjhr" \
  --policy-name "BedrockInvokeClaudeSydney" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": [
        "arn:aws:bedrock:ap-southeast-2::foundation-model/*",
        "arn:aws:bedrock:ap-southeast-2:843448676102:inference-profile/*"
      ]
    }]
  }'
```

### 2. Attach as the Compute Role on the Amplify app

```bash
aws amplify update-app \
  --app-id ddv0o3k8wcjhr \
  --compute-role-arn "arn:aws:iam::843448676102:role/AmplifyComputeRole-ddv0o3k8wcjhr"
```

### 3. Redeploy to force new Lambda instances

IAM policy changes are immediate, but the Compute Role attachment requires a redeploy for new Lambda instances to pick up the credentials.

## Key Takeaways

1. **Service Role != Compute Role**: Runtime AWS service calls (Bedrock, S3, DynamoDB) need the **Compute Role**, set via `App Settings > IAM Roles > Compute role` or `--compute-role-arn` on CLI.

2. **Avoid overly narrow Bedrock resource ARNs**: for this Amplify SSR runtime, a broader Bedrock invoke policy in `ap-southeast-2` was required to eliminate `AccessDenied`.

3. **Credential listener**: Amplify WEB_COMPUTE uses internal env vars (`AWS_AMPLIFY_CREDENTIAL_LISTENER_*`) to provide credentials. Once a Compute Role is attached, the standard `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN` env vars appear automatically.

4. **No static keys needed**: This app is **Bedrock-only** at runtime. No `OPENROUTER_*` secrets or static AWS keys should be added to Amplify env vars for PDF processing.

## Debugging Checklist

If Bedrock stops working on Amplify:

- [ ] Is the Compute Role attached? `aws amplify get-app --app-id ddv0o3k8wcjhr --query 'app.computeRoleArn'`
- [ ] Does the role have Bedrock permissions? `aws iam get-role-policy --role-name AmplifyComputeRole-ddv0o3k8wcjhr --policy-name BedrockInvokeClaudeSydney`
- [ ] Does the role allow Bedrock invoke actions on the required `ap-southeast-2` foundation-model and inference-profile resources?
- [ ] Check CloudWatch logs for the specific error: `aws logs get-log-events --log-group-name /aws/amplify/ddv0o3k8wcjhr ...`
