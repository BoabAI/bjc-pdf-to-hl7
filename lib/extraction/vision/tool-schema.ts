/**
 * Bedrock Converse tool schema for vision-based PDF extraction.
 *
 * Pure data — no transport, no AWS SDK. The schema constrains Claude's tool
 * output so the orchestrator can normalize a known shape into domain types.
 */

import { DOCUMENT_TYPES } from "../../conversion-config";

export type ExtractionToolInput = Record<string, unknown>;

export interface ToolUseContentBlock {
  toolUse: {
    input: ExtractionToolInput;
  };
}

export const EXTRACTION_TOOL = {
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
              "Best-fit document type: consent_form, referral, consult_letter, pathology_result, radiology_result, or generic",
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
              "Name of the referring doctor or letter author (e.g. 'Dr John Smith'). Only for referral letters.",
          },
          senderClinic: {
            type: ["string", "null"],
            description:
              "Clinic or practice name of the sender/referring doctor. Only for referral letters.",
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
          classificationConfidence: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description:
              "Self-reported confidence in the document type classification, as an integer from 0 (no confidence) to 100 (certain). Lower this value when (a) the document is ambiguous, (b) multiple types could apply, or (c) image quality is poor.",
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
          "classificationConfidence",
        ],
        additionalProperties: false,
      },
    },
  },
};
