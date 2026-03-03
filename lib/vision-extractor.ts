/**
 * Vision LLM-based PDF extraction via OpenRouter.
 *
 * Sends the raw PDF as base64 to a vision model (default: Gemini 2.5 Flash)
 * and extracts structured patient data using JSON schema response format.
 *
 * Used as a fallback when pdf-parse text extraction fails (image-based PDFs,
 * garbled text layers, scanned documents).
 */

import type { PatientData } from "./hl7-builder";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface VisionExtractionResult {
  success: boolean;
  data: PatientData;
  warnings: string[];
  model: string;
  tokensUsed?: { input: number; output: number };
}

/**
 * JSON schema for structured output — enforces PatientData shape.
 * Fields the model can't determine should be null.
 */
const PATIENT_DATA_SCHEMA = {
  name: "patient_data",
  strict: true,
  schema: {
    type: "object",
    properties: {
      firstName: {
        type: "string",
        description: "Patient first name(s). If multiple given names, include all.",
      },
      lastName: {
        type: "string",
        description: "Patient surname/family name",
      },
      dob: {
        type: ["string", "null"],
        description: "Date of birth in DD/MM/YYYY format (Australian standard)",
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
          "Medicare card number — 10 digits, may have spaces (e.g. 2143 67890 1). Return digits only.",
      },
      medicareRef: {
        type: ["string", "null"],
        description: "Medicare reference number — single digit (1-9), often after a / or as IRN",
      },
    },
    required: [
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
};

const SYSTEM_PROMPT = `You are a medical document data extraction assistant specializing in Australian healthcare documents.

Extract patient information from this PDF document. It may be a GP referral letter, specialist referral letter, or patient consent form.

Rules:
- Look for the PATIENT's details, not the doctor's or clinic's
- The patient is usually named after "RE:", "Re:", "re.", or "Dear Dr... RE:" lines
- Date of birth MUST be in DD/MM/YYYY format (Australian standard)
- Sex: Infer from title (Mr=M, Mrs/Ms/Miss=F, Dr=U) or pronouns (he/him=M, she/her=F)
- Medicare number: strip spaces, return 10 digits only. Reference number is separate (1 digit)
- Phone: return as-is with spaces (e.g. "0412 345 678")
- Address: extract the PATIENT's residential address, not the clinic/doctor address
- State: Australian state abbreviation (NSW, VIC, QLD, SA, WA, TAS, NT, ACT)
- If a field cannot be determined from the document, return null for that field`;

/**
 * Postcode-to-state mapping (first digit)
 */
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

/**
 * Convert DD/MM/YYYY → YYYYMMDD for HL7
 */
function convertDateToHL7(dateStr: string): string {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return "19000101";
  const [, day, month, year] = match;
  return `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
}

/**
 * Send PDF to OpenRouter vision model and extract structured patient data.
 */
export async function extractPatientDataWithVision(
  pdfBuffer: Buffer,
  options?: { model?: string; timeoutMs?: number }
): Promise<VisionExtractionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      data: emptyPatientData(),
      warnings: ["Vision extraction unavailable: OPENROUTER_API_KEY not configured"],
      model: "",
    };
  }

  const model = options?.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const timeoutMs = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
  const warnings: string[] = [];

  // Base64-encode the PDF
  const pdfBase64 = pdfBuffer.toString("base64");

  // Build request body
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the patient information from this Australian medical document. Return the structured JSON.",
          },
          {
            type: "file",
            file: {
              filename: "document.pdf",
              file_data: `data:application/pdf;base64,${pdfBase64}`,
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: PATIENT_DATA_SCHEMA,
    },
    temperature: 0.1,
    max_tokens: 500,
  };

  // Make request with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://medihost.bjchealth.com.au",
        "X-Title": "Medihost PDF-to-HL7 Converter",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      if (response.status === 429) {
        warnings.push("Vision extraction rate-limited, try again shortly");
      } else {
        warnings.push(`Vision extraction failed: HTTP ${response.status} - ${errorText}`);
      }
      return { success: false, data: emptyPatientData(), warnings, model };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      warnings.push("Vision extraction returned empty response");
      return { success: false, data: emptyPatientData(), warnings, model };
    }

    // Parse the JSON response
    const raw = JSON.parse(content);

    // Build PatientData from LLM response
    const data: PatientData = {
      firstName: raw.firstName?.trim() || "UNKNOWN",
      lastName: raw.lastName?.trim() || "PATIENT",
      dob: raw.dob ? convertDateToHL7(raw.dob) : "19000101",
      sex: (["M", "F", "U"].includes(raw.sex) ? raw.sex : "U") as "M" | "F" | "U",
      phone: raw.phone?.replace(/[^\d ]/g, "").trim() || undefined,
      address: raw.address?.trim() || undefined,
      suburb: raw.suburb?.trim() || undefined,
      state: raw.state?.trim() || undefined,
      postcode: raw.postcode?.trim() || undefined,
      medicareNo: raw.medicareNo?.replace(/\s/g, "") || undefined,
      medicareRef: raw.medicareRef?.trim() || undefined,
    };

    // Infer state from postcode if missing
    if (!data.state && data.postcode) {
      data.state = inferStateFromPostcode(data.postcode);
    }

    // Validate minimum required fields
    const hasName = data.firstName !== "UNKNOWN" && data.lastName !== "PATIENT";

    if (!hasName) {
      warnings.push("Vision extraction could not determine patient name");
    }
    if (data.dob === "19000101") {
      warnings.push("Vision extraction could not determine date of birth");
    }

    // Track token usage if available
    const tokensUsed = result.usage
      ? { input: result.usage.prompt_tokens, output: result.usage.completion_tokens }
      : undefined;

    return {
      success: hasName, // Name is the minimum for a useful extraction
      data,
      warnings,
      model,
      tokensUsed,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      warnings.push(`Vision extraction timed out after ${timeoutMs / 1000}s`);
    } else if (error instanceof SyntaxError) {
      warnings.push("Vision extraction returned malformed JSON");
    } else {
      warnings.push(
        `Vision extraction error: ${error instanceof Error ? error.message : "Unknown"}`
      );
    }
    return { success: false, data: emptyPatientData(), warnings, model };
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
