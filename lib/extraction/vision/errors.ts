/**
 * Bedrock error → operational warning mapping.
 *
 * Pure helpers — no AWS SDK imports, no transport. The orchestrator catches
 * a Bedrock failure and asks this module to translate the error into a
 * user-facing warning string. Privacy-sensitive details (raw error objects,
 * stack traces) stay in the orchestrator's structured server log; only the
 * mapped warning is surfaced to callers.
 */

export interface BedrockErrorContext {
  /** Per-request timeout in ms — used to format the timeout warning. */
  timeoutMs: number;
  /** Model ID — used to point at the missing IAM permission. */
  model: string;
}

/**
 * Map an unknown error caught from a Bedrock Converse call into a warning
 * string suitable for inclusion in `VisionExtractionResult.warnings`.
 *
 * Recognised cases:
 * - `AbortError` → timeout warning (mentions the configured timeout in seconds).
 * - `AccessDeniedException` or message containing "AccessDenied" → IAM warning
 *   referencing the model that needs `bedrock:InvokeModel` permission.
 * - Message containing "Could not load credentials" → AWS credentials warning
 *   pointing at Amplify compute role / local credential setup.
 * - Anything else → generic "Vision extraction error: <message>" warning.
 */
export function mapBedrockError(
  error: unknown,
  context: BedrockErrorContext
): string {
  const { timeoutMs, model } = context;

  if (error instanceof Error && error.name === "AbortError") {
    return `Vision extraction timed out after ${timeoutMs / 1000}s`;
  }

  if (
    error instanceof Error &&
    (error.name === "AccessDeniedException" ||
      error.message.includes("AccessDenied"))
  ) {
    return `Vision extraction failed: Bedrock access denied — ensure the runtime IAM role has bedrock:InvokeModel permission for ${model}`;
  }

  if (
    error instanceof Error &&
    error.message.includes("Could not load credentials")
  ) {
    return "Vision extraction failed: AWS credentials unavailable. In Amplify SSR, attach a compute role with Bedrock permissions; locally, configure AWS credentials.";
  }

  return `Vision extraction error: ${
    error instanceof Error ? error.message : "Unknown"
  }`;
}
