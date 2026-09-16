terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-southeast-2"
}

variable "amplify_compute_role_name" {
  description = "Name of the Amplify compute role for the bjc-pdf-to-hl7 app"
  type        = string
  default     = "AmplifyComputeRole-ddv0o3k8wcjhr"
}

variable "alarm_emails" {
  description = "Email addresses notified when the converter pipeline goes quiet (BJC ops + SMEC AI). No subscriptions are created if empty; each subscriber must confirm via the AWS opt-in email."
  type        = list(string)
  default     = []
}

variable "silence_window_hours" {
  description = "Raise the pipeline-silence alarm if no PAD conversion is recorded for this many hours. Set comfortably longer than the longest expected quiet stretch (overnight/weekends). Keep <= 24 — CloudWatch alarm periods cannot exceed one day."
  type        = number

  # 24h, not 6h — see the matching comment in infra/bjc/main.tf. A 6h window
  # fires every night against a pipeline that only runs in business hours.
  default = 24
}

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

  tags = {
    Project = "bjc-pdf-to-hl7"
  }
}

resource "aws_iam_role_policy" "audit_dynamodb" {
  name = "bjc-pdf-to-hl7-audit-dynamodb"
  role = var.amplify_compute_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:Query",
        # GetItem: lib/settings.ts reads the runtime-settings singleton
        # (month="settings", ts="runtime") from this table via GetItem.
        "dynamodb:GetItem"
      ]
      Resource = aws_dynamodb_table.audit.arn
    }]
  })
}

# Reference data table — stores BJC doctors and carriers as a single source of
# truth across users / browsers / the email pipeline. PK `kind` is one of
# "DOCTOR" or "CARRIER"; SK `id` is a UUID. A Query on `kind` returns each
# list in a single call, so no Scan is needed.
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

  tags = {
    Project = "bjc-pdf-to-hl7"
  }
}

resource "aws_iam_role_policy" "pipeline_metrics" {
  name = "bjc-pdf-to-hl7-pipeline-metrics"
  role = var.amplify_compute_role_name

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
  role = var.amplify_compute_role_name

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

# --- Pipeline health alerting -------------------------------------------------
# Answers BJC clarification Q5 ("auto notification when not running properly, or
# do you have to log in to see?"). Push instead of pull.
#
# Every conversion attempt writes exactly one row to the audit table — success
# and failure alike (recordConversion -> PutItem, called on both code paths in
# app/api/convert/route.ts). So write activity on the audit table is a proxy for
# "the pipeline is alive". If the conversion service, the PAD workflow, the BJC
# server, or the mailbox auth dies, documents stop flowing, no rows are written,
# and this alarm fires.
#
# This deliberately does NOT alarm on per-document extraction failures: those are
# handled gracefully (manual_review -> Review folder) and still write an audit
# row, so they are "running properly" for the purpose of this alarm.

resource "aws_sns_topic" "pipeline_alerts" {
  name = "bjc-pdf-to-hl7-pipeline-alerts"

  tags = {
    Project = "bjc-pdf-to-hl7"
  }
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

  # See the matching comment in infra/bjc/main.tf: this watches the app's own
  # Conversions metric (Source=email) rather than DynamoDB write capacity, so
  # a web upload can no longer mask a dead PAD pipeline. The app must be
  # deployed and emitting before this alarm is applied.
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
  ok_actions    = [aws_sns_topic.pipeline_alerts.arn] # notify on recovery too

  tags = {
    Project = "bjc-pdf-to-hl7"
  }
}

output "PIPELINE_ALERTS_TOPIC_ARN" {
  value = aws_sns_topic.pipeline_alerts.arn
}

output "DYNAMODB_TABLE" {
  value = aws_dynamodb_table.audit.name
}

output "REFERENCE_DATA_DYNAMODB_TABLE" {
  value = aws_dynamodb_table.reference_data.name
}
