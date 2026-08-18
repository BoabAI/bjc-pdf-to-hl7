import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { logOperationalError } from "./server/logging";

const REGION = "ap-southeast-2";

/**
 * Custom namespace for pipeline-health metrics. Kept out of the `AWS/*`
 * reserved namespaces so CloudWatch accepts our own PutMetricData calls.
 */
export const METRIC_NAMESPACE = "BJC/PdfToHl7";

/**
 * One datapoint per conversion attempt, dimensioned by where the document
 * came from. `Source=email` is the PAD pipeline; `Source=web` is a staff
 * upload through the UI.
 *
 * This exists because the pipeline-silence alarm previously watched
 * `AWS/DynamoDB ConsumedWriteCapacityUnits` on the audit table, which only
 * answers "did anything write" — a web upload or a settings PUT would clear
 * the alarm while the PAD pipeline was dead. Dimensioning by source lets the
 * alarm watch the PAD path specifically.
 */
export const CONVERSIONS_METRIC = "Conversions";

export type ConversionSource = "web" | "email";

/**
 * Emit one `Conversions` datapoint. Errors are logged and swallowed — metric
 * emission must never fail a conversion. Awaited by the caller rather than
 * fire-and-forget, because Lambda freezes pending work between requests.
 */
export async function recordConversionMetric(
  source: ConversionSource
): Promise<void> {
  try {
    const client = new CloudWatchClient({ region: REGION });
    await client.send(
      new PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: [
          {
            MetricName: CONVERSIONS_METRIC,
            Dimensions: [{ Name: "Source", Value: source }],
            Value: 1,
            Unit: "Count",
          },
        ],
      })
    );
  } catch (error) {
    logOperationalError("pipeline-metrics", error, {
      op: "putMetricData",
      source,
    });
    // Swallow — never fail the conversion because of metrics infra.
  }
}
