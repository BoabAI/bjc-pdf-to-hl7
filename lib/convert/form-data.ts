import {
  MAX_PDF_SIZE_BYTES,
  parseDocumentTypeOption,
  type DocumentTypeOption,
  type MailboxCategory,
} from "../conversion-config";
import type { MailboxSource } from "../domain/types";

export interface ConvertRequest {
  pdfBuffer: Buffer;
  detectOnly: boolean;
  documentType: DocumentTypeOption;
  autoFile: boolean;
  orderingProvider?: string;
  carrier?: string;
  bjcDoctors?: string[];
  /** Legacy upstream mailbox label. Soft prior — preserved for back-compat. */
  mailboxHint?: MailboxSource;
  /** New: mailbox category derived from `x-source-mailbox`. The eligibility
   *  gate uses this to decide whether the AI's pick is in-scope for the
   *  source mailbox. */
  mailboxCategory?: MailboxCategory;
}

export type ParseConvertFormDataResult =
  | { data: ConvertRequest; originalFilename: string }
  | { error: string; status: number };

function parseDoctorList(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;

    const doctors = parsed.filter((name): name is string => typeof name === "string");
    return doctors.length > 0 ? doctors : undefined;
  } catch {
    return undefined;
  }
}

function parseEnvDoctorList(value: string | undefined): string[] | undefined {
  const doctors = value?.split(",").map((name) => name.trim()).filter(Boolean);
  return doctors && doctors.length > 0 ? doctors : undefined;
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function parseConvertFormData(
  formData: FormData,
  bjcDoctorsEnv = process.env.BJC_DOCTORS
): Promise<ParseConvertFormDataResult> {
  const file = formData.get("pdf");

  if (!(file instanceof File)) {
    return { error: "No PDF file provided", status: 400 };
  }

  if (file.type !== "application/pdf") {
    return { error: "File must be a PDF", status: 400 };
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return { error: "File size exceeds 10MB limit", status: 400 };
  }

  const bjcDoctors =
    parseDoctorList(formData.get("bjcDoctors")) ??
    parseEnvDoctorList(bjcDoctorsEnv);

  return {
    data: {
      pdfBuffer: Buffer.from(await file.arrayBuffer()),
      detectOnly: formData.get("detectOnly") === "true",
      documentType: parseDocumentTypeOption(formData.get("documentType")),
      autoFile: formData.get("autoFile") !== "false",
      orderingProvider: optionalString(formData.get("orderingProvider")),
      carrier: optionalString(formData.get("carrier")),
      bjcDoctors,
    },
    originalFilename: file.name,
  };
}
