# BJC Health AWS account (375391317635) — full production environment.
#
# Unlike the SMEC module (../main.tf), which only bolts the audit tables onto a
# console-created Amplify app, this module provisions the ENTIRE stack: the
# Amplify app itself, both IAM roles, the DynamoDB tables, and the pipeline
# alerting. The BJC account starts empty, so nothing here imports or adopts
# existing resources.
#
# One-time account prerequisite NOT managed here (no Terraform resource exists
# for it): Bedrock model access for anthropic.claude-sonnet-4-6. Submitted via
# `put-use-case-for-model-access` + `create-foundation-model-agreement` on
# 2026-07-13. Verify with:
#   aws --profile bjc --region ap-southeast-2 bedrock get-foundation-model-availability \
#     --model-id anthropic.claude-sonnet-4-6

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.85" # compute_role_arn on aws_amplify_app
    }
  }
}

provider "aws" {
  region  = "ap-southeast-2"
  profile = var.aws_profile

  # STS in the BJC account must go via Sydney: ap-southeast-4 is enabled for
  # Bedrock but its STS endpoint is not, and the default-region fallback
  # produces a generic AccessDenied.
  default_tags {
    tags = {
      Project = "bjc-pdf-to-hl7"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  region = "ap-southeast-2"
}

# --- Variables ------------------------------------------------------------------

variable "aws_profile" {
  description = "AWS CLI profile that assumes smec-deployment-role in the BJC account"
  type        = string
  default     = "bjc"
}

variable "github_access_token" {
  description = "GitHub PAT with access to BoabAI/bjc-pdf-to-hl7 (repo scope + admin:repo_hook). Used once at app creation to install the webhook; not stored by Amplify."
  type        = string
  sensitive   = true
}

variable "app_password" {
  description = "APP_PASSWORD — fallback password login (AUTH_MODE=both keeps it alongside SSO)"
  type        = string
  sensitive   = true
}

variable "auth_secret" {
  description = "AUTH_SECRET for Auth.js JWT sessions. Generate fresh for this environment: openssl rand -base64 32"
  type        = string
  sensitive   = true
}

variable "azure_ad_client_secret" {
  description = "Client secret of the existing Entra app 9ca073d3-a123-46b0-a344-3822e51f36dc (BJC PDF-to-HL7, Boab AI tenant). Reused — same app registration serves both environments."
  type        = string
  sensitive   = true
}

variable "pad_token" {
  description = "Bearer token for the PAD email pipeline. Generate fresh for this environment: openssl rand -hex 32"
  type        = string
  sensitive   = true
}

variable "alarm_emails" {
  description = "Email addresses notified when the converter pipeline goes quiet (BJC ops + SMEC AI). Each subscriber must confirm via the AWS opt-in email."
  type        = list(string)
  default     = []
}

variable "silence_window_hours" {
  description = "Raise the pipeline-silence alarm if no PAD conversion is recorded for this many hours. Keep <= 24 — CloudWatch alarm periods cannot exceed one day."
  type        = number

  # 24h, not 6h. The pipeline only runs while the BJC server's scheduled task
  # is active (observed traffic: ~07:00-16:00 Sydney), so a 6h window fired
  # every single night — the alarm flapped OK/ALARM daily through Aug 2026 and
  # would have been muted as noise the moment anyone subscribed to it. At 24h
  # only a genuinely missed day fires.
  #
  # Known gap: a weekend still exceeds 24h of quiet (Fri ~16:00 -> Mon ~07:00),
  # so expect one alarm+OK pair per weekend until this is replaced with a
  # business-hours-aware composite alarm.
  default = 24
}

# --- DynamoDB -------------------------------------------------------------------

resource "aws_dynamodb_table" "audit" {
  name         = "bjc-pdf-to-hl7-audit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "month"
  range_key    = "ts"

  attribute {
    name = "month"
    type = "S"
  }

  attribute {
    name = "ts"
    type = "S"
  }

  ttl {
    attribute_name = "expires"
    enabled        = false # off by default; enable later if rotation needed
  }

  point_in_time_recovery {
    enabled = true
  }
}

# Reference data — BJC doctors and carriers. lib/reference-data-store.ts seeds
# the bundled defaults on first read of an empty table, so no data migration is
# required; export/import from the SMEC table only if staff have edited lists.
resource "aws_dynamodb_table" "reference_data" {
  name         = "bjc-pdf-to-hl7-reference-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "kind"
  range_key    = "id"

  attribute {
    name = "kind"
    type = "S"
  }

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

# --- IAM: Amplify compute role (SSR Lambda runtime) ------------------------------

resource "aws_iam_role" "amplify_compute" {
  name = "AmplifyComputeRole-bjc-pdf-to-hl7"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "amplify.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Bedrock is per-model, per-region: AU inference profiles (au.anthropic.*)
# route to ap-southeast-4 (Melbourne), so every model needs BOTH regions.
# Opus 4.7 ARNs are included for parity with the SMEC role (future re-attempt).
locals {
  bedrock_models  = ["anthropic.claude-sonnet-4-6", "anthropic.claude-opus-4-7"]
  bedrock_regions = ["ap-southeast-2", "ap-southeast-4"]
  bedrock_arns = flatten([
    for m in local.bedrock_models : [
      for r in local.bedrock_regions : [
        "arn:aws:bedrock:${r}::foundation-model/${m}",
        "arn:aws:bedrock:${r}:${data.aws_caller_identity.current.account_id}:inference-profile/au.${m}",
      ]
    ]
  ])
}

resource "aws_iam_role_policy" "bedrock_invoke" {
  name = "BedrockInvokeClaudeSydney"
  role = aws_iam_role.amplify_compute.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "BedrockInvokeClaude"
      Effect = "Allow"
      Action = [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ]
      Resource = local.bedrock_arns
    }]
  })
}

resource "aws_iam_role_policy" "audit_dynamodb" {
  name = "bjc-pdf-to-hl7-audit-dynamodb"
  role = aws_iam_role.amplify_compute.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:Query",
        # GetItem: lib/settings.ts reads the runtime-settings singleton
        # (month="settings", ts="runtime") from this table.
        "dynamodb:GetItem"
      ]
      Resource = aws_dynamodb_table.audit.arn
    }]
  })
}

resource "aws_iam_role_policy" "pipeline_metrics" {
  name = "bjc-pdf-to-hl7-pipeline-metrics"
  role = aws_iam_role.amplify_compute.name

  # lib/pipeline-metrics.ts emits one BJC/PdfToHl7 Conversions datapoint per
  # conversion. PutMetricData cannot be scoped to a resource ARN; the
  # namespace condition is the only available restriction.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "cloudwatch:PutMetricData"
      Resource = "*"
      Condition = {
        StringEquals = {
          "cloudwatch:namespace" = "BJC/PdfToHl7"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "reference_data_dynamodb" {
  name = "bjc-pdf-to-hl7-reference-data-dynamodb"
  role = aws_iam_role.amplify_compute.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:Query",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:BatchWriteItem"
      ]
      Resource = aws_dynamodb_table.reference_data.arn
    }]
  })
}

# --- IAM: Amplify service role (build/deploy + SSR log push) ---------------------

resource "aws_iam_role" "amplify_service" {
  name = "AmplifySSRLoggingRole-bjc-pdf-to-hl7"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "amplify.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ssr_logging" {
  name = "AmplifySSRLoggingPolicy"
  role = aws_iam_role.amplify_service.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PushLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${local.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/amplify/*:log-stream:*"
      },
      {
        Sid      = "CreateLogGroup"
        Effect   = "Allow"
        Action   = "logs:CreateLogGroup"
        Resource = "arn:aws:logs:${local.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/amplify/*"
      },
      {
        Sid      = "DescribeLogGroups"
        Effect   = "Allow"
        Action   = "logs:DescribeLogGroups"
        Resource = "arn:aws:logs:${local.region}:${data.aws_caller_identity.current.account_id}:log-group:*"
      }
    ]
  })
}

# --- Amplify app ------------------------------------------------------------------

resource "aws_amplify_app" "main" {
  name         = "bjc-pdf-to-hl7"
  repository   = "https://github.com/boabai/bjc-pdf-to-hl7"
  access_token = var.github_access_token
  platform     = "WEB_COMPUTE" # required for Next.js SSR

  iam_service_role_arn = aws_iam_role.amplify_service.arn
  compute_role_arn     = aws_iam_role.amplify_compute.arn

  # Build spec comes from amplify.yml in the repo; custom headers (no-store,
  # so CloudFront never caches past middleware auth) from customHttp.yml.

  environment_variables = {
    AMPLIFY_DIFF_DEPLOY      = "true"
    AUTH_ALLOWED_DOMAINS     = "bjchealth.com.au,smecai.au"
    AUTH_MODE                = "both"
    NEXT_PUBLIC_AUTH_MODE    = "both"
    AUTH_TRUST_HOST          = "true"
    AZURE_AD_CLIENT_ID       = "9ca073d3-a123-46b0-a344-3822e51f36dc"
    AZURE_AD_TENANT_ID       = "common"
    NEXT_PUBLIC_TEST_MODE    = "false" # unlike SMEC: no auth bypass in BJC prod
    NEXT_TELEMETRY_DISABLED  = "1"
    PUPPETEER_SKIP_DOWNLOAD  = "true"
    APP_PASSWORD             = var.app_password
    AUTH_SECRET              = var.auth_secret
    AZURE_AD_CLIENT_SECRET   = var.azure_ad_client_secret
    PAD_TOKEN                = var.pad_token
  }
}

# prod is this project's integration/production branch (not main).
resource "aws_amplify_branch" "prod" {
  app_id            = aws_amplify_app.main.id
  branch_name       = "prod"
  stage             = "PRODUCTION"
  enable_auto_build = true
  framework         = "Next.js - SSR"

  environment_variables = {
    AUTH_URL = "https://prod.${aws_amplify_app.main.id}.amplifyapp.com"
  }
}

# --- Pipeline health alerting -----------------------------------------------------
# Every conversion attempt emits one BJC/PdfToHl7 Conversions datapoint
# (lib/pipeline-metrics.ts), dimensioned Source=web|email. The alarm watches
# Source=email — the PAD pipeline — so no datapoints for silence_window_hours
# means PAD has stopped delivering.
#
# This replaces an earlier alarm on AWS/DynamoDB ConsumedWriteCapacityUnits
# for the audit table, which could only answer "did anything write at all":
# a staff web upload or a settings PUT cleared it while PAD was dead.
#
# ORDERING: the app must be deployed and emitting this metric BEFORE applying
# a change to this alarm. treat_missing_data = "breaching" means an alarm
# pointed at a metric nothing publishes sits in ALARM immediately.

resource "aws_sns_topic" "pipeline_alerts" {
  name = "bjc-pdf-to-hl7-pipeline-alerts"
}

resource "aws_sns_topic_subscription" "pipeline_alerts_email" {
  for_each  = toset(var.alarm_emails)
  topic_arn = aws_sns_topic.pipeline_alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "pipeline_silence" {
  alarm_name        = "bjc-pdf-to-hl7-pipeline-silence"
  alarm_description = "No documents converted via the PAD pipeline for ${var.silence_window_hours}h. Check the scheduled task on MHS-SYD-APP47 (is BJC\\medihost still signed in?), the PAD flow, mailbox auth, and the conversion service."

  namespace   = "BJC/PdfToHl7"
  metric_name = "Conversions"
  dimensions = {
    Source = "email"
  }

  statistic           = "Sum"
  period              = var.silence_window_hours * 3600
  evaluation_periods  = 1
  comparison_operator = "LessThanOrEqualToThreshold"
  threshold           = 0

  # The metric is only published when a conversion happens, so "no datapoints"
  # is exactly the silent-pipeline condition we want to catch.
  treat_missing_data = "breaching"

  alarm_actions = [aws_sns_topic.pipeline_alerts.arn]
  ok_actions    = [aws_sns_topic.pipeline_alerts.arn]
}

# --- Outputs ----------------------------------------------------------------------

output "amplify_app_id" {
  value = aws_amplify_app.main.id
}

output "app_url" {
  description = "Production URL — also the base of the Entra redirect URI to register"
  value       = "https://prod.${aws_amplify_app.main.id}.amplifyapp.com"
}

output "entra_redirect_uri" {
  description = "Add to Entra app 9ca073d3-a123-46b0-a344-3822e51f36dc before first login"
  value       = "https://prod.${aws_amplify_app.main.id}.amplifyapp.com/api/auth/callback/microsoft-entra-id"
}

output "compute_role_name" {
  value = aws_iam_role.amplify_compute.name
}

output "dynamodb_table" {
  value = aws_dynamodb_table.audit.name
}

output "reference_data_table" {
  value = aws_dynamodb_table.reference_data.name
}

output "pipeline_alerts_topic_arn" {
  value = aws_sns_topic.pipeline_alerts.arn
}
