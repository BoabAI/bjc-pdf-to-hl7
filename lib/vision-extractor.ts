/**
 * Vision-based PDF extraction via AWS Bedrock (ap-southeast-2 / Sydney).
 *
 * Uses Claude Sonnet 4.6 on Bedrock with the Converse API.
 * PDF classification and field extraction are both performed by the model.
 * Auth is handled via the AWS SDK default provider chain:
 * - Amplify SSR / Lambda runtime IAM role in production
 * - ~/.aws/credentials or AWS_* env vars locally
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { PatientData } from "./hl7-builder";

export type DocumentType =
  | "consent_form"
  | "referral_letter"
  | "gp_referral"
  | "generic";

const REGION = "ap-southeast-2";
const DEFAULT_MODEL = "au.anthropic.claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 30_000;
const DOCUMENT_TYPES: DocumentType[] = [
  "consent_form",
  "referral_letter",
  "gp_referral",
  "generic",
];

export interface VisionExtractionResult {
  success: boolean;
  data: PatientData;
  warnings: string[];
  model: string;
  documentType: DocumentType;
  tokensUsed?: { input: number; output: number };
}

const EXTRACTION_TOOL = {
  toolSpec: {
    name: "extract_patient_data",
    description:
      "Classify an Australian medical PDF and extract structured patient information",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          documentType: {
            type: "string",
            enum: DOCUMENT_TYPES,
            description:
              "Best-fit document type: consent_form, referral_letter, gp_referral, or generic",
          },
          firstName: {
            type: ["string", "null"],
            description:
              "Patient first name(s). Return null if redacted, blacked out, or unreadable.",
          },
          lastName: {
            type: ["string", "null"],
            description:
              "Patient surname/family name. Return null if redacted, blacked out, or unreadable.",
          },
          dob: {
            type: ["string", "null"],
            description:
              "Date of birth in DD/MM/YYYY format (Australian standard)",
          },
          sex: {
            type: "string",
            enum: ["M", "F", "U"],
            description:
              "M=Male, F=Female, U=Unknown. Infer from title (Mr=M, Mrs/Ms/Miss=F) or pronouns (he/him=M, she/her=F). Default U if unclear.",
          },
          phone: {
            type: ["string", "null"],
            description:
              "Phone/mobile number. Include spaces as they appear (e.g. 0412 345 678).",
          },
          address: {
            type: ["string", "null"],
            description: "Street address only (no suburb/state/postcode)",
          },
          suburb: {
            type: ["string", "null"],
            description: "Suburb or city name",
          },
          state: {
            type: ["string", "null"],
            description:
              "Australian state abbreviation: NSW, VIC, QLD, SA, WA, TAS, NT, ACT",
          },
          postcode: {
            type: ["string", "null"],
            description: "4-digit Australian postcode",
          },
          medicareNo: {
            type: ["string", "null"],
            description:
              "Medicare card number — 10 digits, may have spaces. Return digits only.",
          },
          medicareRef: {
            type: ["string", "null"],
            description:
              "Medicare reference number — single digit (1-9), often after a / or as IRN",
          },
        },
        required: [
          "documentType",
          "firstName",
          "lastName",
          "dob",
          "sex",
          "phone",
          "address",
          "suburb",
          "state",
          "postcode",
          "medicareNo",
          "medicareRef",
        ],
        additionalProperties: false,
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a medical document data extraction assistant specializing in Australian healthcare documents.

Classify the document and extract the patient's details.

Document type definitions:
- consent_form: patient registration, intake, information, or consent forms
- referral_letter: specialist referral letters or clinic letters about a patient
- gp_referral: GP/Best Practice referral letters
- generic: any other medical PDF or unclear case

Rules:
- Look for the PATIENT's details, not the doctor's, recipient's, or clinic's
- The patient is often named on the line starting with "RE:", "Re:", or "re."
- Names before the "Re:" line, in the letterhead, recipient block, or "Dear [Name]" salutation are often doctors
- If the patient name is redacted, blacked out, or unreadable, return null for firstName and lastName
- Date of birth must be DD/MM/YYYY
- Sex: infer from title or pronouns when possible; otherwise use U
- Medicare number: strip spaces and return digits only
- Address: extract the patient's residential address, not the clinic address
- State must be one of NSW, VIC, QLD, SA, WA, TAS, NT, ACT
- If a field cannot be determined, return null for that field
- Always call the extract_patient_data tool`;

const POSTCODE_TO_STATE: Record<string, string> = {
  "1": "NSW",
  "2": "NSW",
  "3": "VIC",
  "4": "QLD",
  "5": "SA",
  "6": "WA",
  "7": "TAS",
  "0": "NT",
};

function inferStateFromPostcode(postcode: string): string | undefined {
  if (!postcode || postcode.length !== 4) return undefined;
  return POSTCODE_TO_STATE[postcode[0]];
}

function convertDateToHL7(dateStr: string): string {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return "19000101";
  const [, day, month, year] = match;
  return `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
}

function normalizeDocumentType(
  value: unknown,
  fallback: DocumentType = "generic"
): DocumentType {
  return typeof value === "string" &&
    DOCUMENT_TYPES.includes(value as DocumentType)
    ? (value as DocumentType)
    : fallback;
}

function normalizeSex(value: unknown): "M" | "F" | "U" {
  return value === "M" || value === "F" || value === "U" ? value : "U";
}

function buildPrompt(documentTypeHint?: DocumentType): string {
  if (!documentTypeHint) {
    return "Classify this Australian medical PDF and extract the patient information using the extract_patient_data tool.";
  }

  return `A document type hint was provided: ${documentTypeHint}. Use that classification unless the PDF clearly contradicts it, then extract the patient information using the extract_patient_data tool.`;
}

export async function extractPatientDataWithVision(
  pdfBuffer: Buffer,
  options?: {
    model?: string;
    timeoutMs?: number;
    documentTypeHint?: DocumentType;
  }
): Promise<VisionExtractionResult> {
  const model = options?.model ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const documentTypeHint = options?.documentTypeHint;
  const warnings: string[] = [];

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
              { text: buildPrompt(documentTypeHint) },
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

    const content = response.output?.message?.content ?? [];
    const toolUseBlock = content.find((block: any) => block.toolUse !== undefined) as
      | { toolUse: { input: Record<string, unknown> } }
      | undefined;

    if (!toolUseBlock?.toolUse?.input) {
      warnings.push("Bedrock returned no tool use result");
      return {
        success: false,
        data: emptyPatientData(),
        warnings,
        model,
        documentType: documentTypeHint ?? "generic",
      };
    }

    const raw = toolUseBlock.toolUse.input;
    const documentType = normalizeDocumentType(
      raw.documentType,
      documentTypeHint ?? "generic"
    );

    if (raw.documentType !== undefined && raw.documentType !== documentType) {
      warnings.push(
        `Vision extraction returned an invalid document type; defaulted to ${documentType}`
      );
    }

    const data: PatientData = {
      firstName: (raw.firstName as string | null)?.trim() || "UNKNOWN",
      lastName: (raw.lastName as string | null)?.trim() || "PATIENT",
      dob: raw.dob ? convertDateToHL7(raw.dob as string) : "19000101",
      sex: normalizeSex(raw.sex),
      phone: raw.phone
        ? (raw.phone as string).replace(/[^\d ]/g, "").trim() || undefined
        : undefined,
      address: (raw.address as string | null)?.trim() || undefined,
      suburb: (raw.suburb as string | null)?.trim() || undefined,
      state: (raw.state as string | null)?.trim() || undefined,
      postcode: (raw.postcode as string | null)?.trim() || undefined,
      medicareNo:
        (raw.medicareNo as string | null)?.replace(/\s/g, "") || undefined,
      medicareRef: (raw.medicareRef as string | null)?.trim() || undefined,
    };

    if (!data.state && data.postcode) {
      data.state = inferStateFromPostcode(data.postcode);
    }

    const hasName =
      data.firstName !== "UNKNOWN" && data.lastName !== "PATIENT";

    if (!hasName) {
      warnings.push("Vision extraction could not determine patient name");
    }
    if (data.dob === "19000101") {
      warnings.push("Vision extraction could not determine date of birth");
    }

    const tokensUsed = response.usage
      ? {
          input: response.usage.inputTokens ?? 0,
          output: response.usage.outputTokens ?? 0,
        }
      : undefined;

    return {
      success: hasName,
      data,
      warnings,
      model,
      documentType,
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

    if (error instanceof Error && error.name === "AbortError") {
      warnings.push(`Vision extraction timed out after ${timeoutMs / 1000}s`);
    } else if (
      error instanceof Error &&
      (error.name === "AccessDeniedException" ||
        error.message.includes("AccessDenied"))
    ) {
      warnings.push(
        `Vision extraction failed: Bedrock access denied — ensure the runtime IAM role has bedrock:InvokeModel permission for ${model}`
      );
    } else if (
      error instanceof Error &&
      error.message.includes("Could not load credentials")
    ) {
      warnings.push(
        "Vision extraction failed: AWS credentials unavailable. In Amplify SSR, attach a compute role with Bedrock permissions; locally, configure AWS credentials."
      );
    } else {
      warnings.push(
        `Vision extraction error: ${
          error instanceof Error ? error.message : "Unknown"
        }`
      );
    }

    return {
      success: false,
      data: emptyPatientData(),
      warnings,
      model,
      documentType: documentTypeHint ?? "generic",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function emptyPatientData(): PatientData {
  return {
    firstName: "UNKNOWN",
    lastName: "PATIENT",
    dob: "19000101",
    sex: "U",
  };
}
