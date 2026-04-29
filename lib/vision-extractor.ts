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
import { DOCUMENT_TYPES } from "./conversion-config";

export type DocumentType =
  | "consent_form"
  | "referral_letter"
  | "gp_referral"
  | "pathology_result"
  | "radiology_result"
  | "generic";

const REGION = "ap-southeast-2";
const DEFAULT_MODEL = "au.anthropic.claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ReferralInfo {
  senderName?: string;
  senderClinic?: string;
  senderProviderNumber?: string;
  addresseeName?: string;
  addresseeClinic?: string;
  ccNames?: string[];
}

export interface VisionExtractionResult {
  success: boolean;
  data: PatientData;
  warnings: string[];
  model: string;
  documentType: DocumentType;
  referralInfo?: ReferralInfo;
  tokensUsed?: { input: number; output: number };
}

type ExtractionToolInput = Record<string, unknown>;

interface ToolUseContentBlock {
  toolUse: {
    input: ExtractionToolInput;
  };
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
              "Best-fit document type: consent_form, referral_letter, gp_referral, pathology_result, radiology_result, or generic",
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
          senderName: {
            type: ["string", "null"],
            description:
              "Name of the referring doctor or letter author (e.g. 'Dr John Smith'). Only for referral/GP referral letters.",
          },
          senderClinic: {
            type: ["string", "null"],
            description:
              "Clinic or practice name of the sender/referring doctor. Only for referral/GP referral letters.",
          },
          senderProviderNumber: {
            type: ["string", "null"],
            description:
              "Medicare provider number of the sender/referring doctor (if visible in the document).",
          },
          addresseeName: {
            type: ["string", "null"],
            description:
              "Name of the doctor or specialist the patient is being referred TO. Often in the salutation ('Dear Dr...') or recipient block.",
          },
          addresseeClinic: {
            type: ["string", "null"],
            description:
              "Clinic or practice name of the addressee/recipient doctor.",
          },
          ccNames: {
            type: "array",
            items: { type: "string" },
            description:
              "Names of any CC/carbon copy recipient doctors (from 'CC:', 'cc:', 'Copy to:', 'c/o:' lines). Empty array if no CC line exists.",
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

Classify the document and extract the patient's details, plus sender/addressee info for referral letters.

Document type classification guide:

- consent_form: Patient registration, intake, information, or consent forms.
  Visual cues: checkboxes, signature lines, "I consent to...", patient declaration sections,
  "Patient Information" in the title, BJC Health branding, intake questionnaires.

- gp_referral: Referral letters written by a GP, typically from Best Practice or Medical Director software.
  Visual cues: "re." or "RE:" line with patient name, "Dear Dr..." addressing a specialist,
  GP clinic letterhead, Medicare provider number, reason for referral, medication lists,
  "Yours sincerely" sign-off from a GP. The sender is a general practitioner.

- referral_letter: Letters from specialists, hospital clinics, or allied health about a patient.
  Visual cues: specialist clinic letterhead (e.g. cardiology, rheumatology, orthopaedics),
  "RE:" line with patient name, clinical findings, investigation results, management plan,
  letter addressed to the referring GP or another specialist. The sender is a specialist.

- pathology_result: Pathology / laboratory test results.
  Visual cues: pathology lab letterhead (e.g. Douglass Hanly Moir, Laverty, Sonic Healthcare,
  Sullivan Nicolaides, 4Cyte), reference ranges and units (mmol/L, g/L, x10^9/L), tabular
  numeric results, "Specimen received" / "Collected" / "Reported" timestamps, NATA accreditation
  marks, organism / susceptibility tables for microbiology. The sender is a pathologist or lab.

- radiology_result: Radiology / imaging reports.
  Visual cues: imaging provider letterhead (e.g. PRP Diagnostic Imaging, I-MED, Lumus Imaging,
  Capital Radiology), modality keywords in the title (CT, MRI, X-ray, Ultrasound, DEXA, PET),
  "Findings", "Impression", and "Conclusion" sections, a "Referrer:" / "Referring Doctor:" line
  near the top of the report. The sender is a radiologist.

- generic: Any other medical document that does not fit the above categories.
  Use ONLY when the document is clearly not a consent form, referral, pathology, or radiology report.

Classification priority: If the document is a letter from one doctor to another about a patient,
it is almost always a referral (gp_referral or referral_letter), NOT generic.
Pathology lab reports go to pathology_result; imaging / radiology reports go to radiology_result.
Use generic only for residual cases (discharge summaries, hospital admission notes,
miscellaneous correspondence) that don't fit any of the above categories.

Patient extraction rules:
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

Sender/Addressee rules:
- senderName: the doctor who WROTE/SIGNED the letter (usually in the letterhead, signature, or "From:" line)
- senderClinic: the clinic or practice of the sender (usually in the letterhead)
- senderProviderNumber: the Medicare provider number of the sender (if visible)
- ccNames: list of doctors on CC, "Copy to", "c/o", or carbon copy lines. Empty array if none.
- addresseeName: the BJC Health doctor who should receive this document. Use these rules in priority order:
  1. If "BJC Health" (or similar) appears as the clinic for either the primary recipient ("Dear Dr...") or a CC recipient, use that doctor
  2. If a BJC_DOCTORS list is provided in the user prompt, check both the primary recipient and CC recipients against it — use the matching doctor
  3. If neither clinic name nor doctor list resolves it, prefer the CC recipient (CC is more likely the local receiving doctor)
  4. If no CC exists, use the primary recipient (assumed to be the BJC doctor)
- addresseeClinic: the clinic of the resolved addressee
- For pathology_result and radiology_result documents, the addressee is the referring doctor named on the report — usually after a "Reported to:", "Copy to:", "Referrer:", or "Referring Doctor:" label, or in the recipient block at the top. Resolve against BJC_DOCTORS the same way as for referrals.
- For consent_form and generic documents, return null for all sender/addressee fields

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isToolUseContentBlock(value: unknown): value is ToolUseContentBlock {
  return (
    isRecord(value) &&
    isRecord(value.toolUse) &&
    isRecord(value.toolUse.input)
  );
}

function nullableString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanPhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/[^\d ]/g, "").trim() || undefined;
}

function cleanMedicareNumber(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/\s/g, "") || undefined;
}

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .map((item) => nullableString(item))
    .filter((item): item is string => Boolean(item));
  return strings.length > 0 ? strings : undefined;
}

function buildPrompt(documentTypeHint?: DocumentType, bjcDoctors?: string[]): string {
  let prompt: string;
  if (!documentTypeHint) {
    prompt = "Classify this Australian medical PDF and extract the patient information using the extract_patient_data tool.";
  } else {
    prompt = `A document type hint was provided: ${documentTypeHint}. Use that classification unless the PDF clearly contradicts it, then extract the patient information using the extract_patient_data tool.`;
  }

  if (bjcDoctors && bjcDoctors.length > 0) {
    prompt += `\n\nBJC_DOCTORS list (doctors at the receiving clinic): ${bjcDoctors.join(", ")}.\nUse this list to determine which doctor (primary addressee or CC) is from BJC Health and set that doctor as the addresseeName.`;
  }

  return prompt;
}

export async function extractPatientDataWithVision(
  pdfBuffer: Buffer,
  options?: {
    model?: string;
    timeoutMs?: number;
    documentTypeHint?: DocumentType;
    bjcDoctors?: string[];
  }
): Promise<VisionExtractionResult> {
  const model = options?.model ?? DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const documentTypeHint = options?.documentTypeHint;
  const bjcDoctors = options?.bjcDoctors;
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
              { text: buildPrompt(documentTypeHint, bjcDoctors) },
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
      firstName: nullableString(raw.firstName) || "UNKNOWN",
      lastName: nullableString(raw.lastName) || "PATIENT",
      dob: typeof raw.dob === "string" ? convertDateToHL7(raw.dob) : "19000101",
      sex: normalizeSex(raw.sex),
      phone: cleanPhone(raw.phone),
      address: nullableString(raw.address),
      suburb: nullableString(raw.suburb),
      state: nullableString(raw.state),
      postcode: nullableString(raw.postcode),
      medicareNo: cleanMedicareNumber(raw.medicareNo),
      medicareRef: nullableString(raw.medicareRef),
    };

    if (!data.state && data.postcode) {
      data.state = inferStateFromPostcode(data.postcode);
    }

    // Parse referral info (optional, only present for referral letters)
    const referralInfo: ReferralInfo = {};
    const senderName = nullableString(raw.senderName);
    const senderClinic = nullableString(raw.senderClinic);
    const senderProviderNumber = nullableString(raw.senderProviderNumber);
    const addresseeName = nullableString(raw.addresseeName);
    const addresseeClinic = nullableString(raw.addresseeClinic);
    const ccNames = cleanStringArray(raw.ccNames);

    if (senderName) referralInfo.senderName = senderName;
    if (senderClinic) referralInfo.senderClinic = senderClinic;
    if (senderProviderNumber) referralInfo.senderProviderNumber = senderProviderNumber;
    if (addresseeName) referralInfo.addresseeName = addresseeName;
    if (addresseeClinic) referralInfo.addresseeClinic = addresseeClinic;
    if (ccNames) referralInfo.ccNames = ccNames;
    const hasReferralInfo = Object.keys(referralInfo).length > 0;

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
      referralInfo: hasReferralInfo ? referralInfo : undefined,
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
