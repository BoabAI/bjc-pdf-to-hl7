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
        "dynamodb:Query"
      ]
      Resource = aws_dynamodb_table.audit.arn
    }]
  })
}

output "DYNAMODB_TABLE" {
  value = aws_dynamodb_table.audit.name
}
