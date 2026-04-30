/**
 * Vision-based PDF extraction via AWS Bedrock (ap-southeast-2 / Sydney).
 *
 * Thin orchestrator: builds the Bedrock request from the prompt + tool schema,
 * sends it via the Converse API with a timeout, and hands the raw tool input
 * to the normalizer. Bedrock-specific failures route through `mapBedrockError`.
 *
 * Auth is handled via the AWS SDK default provider chain:
 * - Amplify SSR / Lambda runtime IAM role in production
 * - ~/.aws/credentials or AWS_* env vars locally
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  DocumentType,
  MailboxSource,
  PatientData,
  ReferralInfo,
} from "./domain/types";
import { mapBedrockError } from "./extraction/vision/errors";
import {
  emptyPatientData,
  isToolUseContentBlock,
  normalizeVisionToolInput,
} from "./extraction/vision/normalize";
import { buildVisionPrompt, SYSTEM_PROMPT } from "./extraction/vision/prompt";
import { EXTRACTION_TOOL } from "./extraction/vision/tool-schema";

const REGION = "ap-southeast-2";
const DEFAULT_MODEL = "au.anthropic.claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface VisionExtractionResult {
  success: boolean;
  data: PatientData;
  warnings: string[];
  model: string;
  documentType: DocumentType;
  referralInfo?: ReferralInfo;
  tokensUsed?: { input: number; output: number };
}

export async function extractPatientDataWithVision(
  pdfBuffer: Buffer,
  options?: {
    model?: string;
    timeoutMs?: number;
    documentTypeHint?: DocumentType;
    bjcDoctors?: string[];
    mailboxHint?: MailboxSource;
  }
): Promise<VisionExtractionResult> {
  const model = options?.model ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const documentTypeHint = options?.documentTypeHint;
  const bjcDoctors = options?.bjcDoctors;
  const mailboxHint = options?.mailboxHint;

  const client = new BedrockRuntimeClient({ region: REGION });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: model,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [
          {
            role: "user",
            content: [
              { text: buildVisionPrompt(documentTypeHint, bjcDoctors, mailboxHint) },
              {
                document: {
                  name: "medical-document",
                  format: "pdf",
                  source: { bytes: pdfBuffer },
                },
              },
            ],
          },
        ],
        toolConfig: {
          tools: [EXTRACTION_TOOL],
          toolChoice: { tool: { name: "extract_patient_data" } },
        },
      }),
      { abortSignal: controller.signal }
    );

    const content: unknown[] = response.output?.message?.content ?? [];
    const toolUseBlock = content.find(isToolUseContentBlock);

    if (!toolUseBlock?.toolUse?.input) {
      return {
        success: false,
        data: emptyPatientData(),
        warnings: ["Bedrock returned no tool use result"],
        model,
        documentType: documentTypeHint ?? "generic",
      };
    }

    const normalized = normalizeVisionToolInput(
      toolUseBlock.toolUse.input,
      documentTypeHint ?? "generic"
    );

    const hasName =
      normalized.data.firstName !== "UNKNOWN" &&
      normalized.data.lastName !== "PATIENT";

    const tokensUsed = response.usage
      ? {
          input: response.usage.inputTokens ?? 0,
          output: response.usage.outputTokens ?? 0,
        }
      : undefined;

    return {
      success: hasName,
      data: normalized.data,
      warnings: normalized.warnings,
      model,
      documentType: normalized.documentType,
      referralInfo: normalized.referralInfo,
      tokensUsed,
    };
  } catch (error) {
    const awsEnvKeys = Object.keys(process.env)
      .filter((key) => key.startsWith("AWS_"))
      .join(", ");
    console.error(
      `[vision-extractor] Error: ${
        error instanceof Error ? `${error.name}: ${error.message}` : error
      }`
    );
    console.error(
      `[vision-extractor] AWS env vars present: ${awsEnvKeys || "NONE"}`
    );

    return {
      success: false,
      data: emptyPatientData(),
      warnings: [mapBedrockError(error, { timeoutMs, model })],
      model,
      documentType: documentTypeHint ?? "generic",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
