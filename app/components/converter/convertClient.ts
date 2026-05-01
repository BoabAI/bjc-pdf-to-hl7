"use client";

import type { ConvertResponse } from "@/lib/contracts/convert";
import { isConvertResponse } from "@/lib/contracts/convert";
import type { DocumentTypeOption } from "@/lib/conversion-config";

export interface ConvertOptions {
  documentType: DocumentTypeOption;
  autoFile: boolean;
  carrier: string;
  orderingProvider?: string;
  /** Names from the BJC Health doctor list, used for AI addressee resolution. */
  bjcDoctors?: string[];
}

/**
 * POST a single PDF to `/api/convert` and return the parsed shared response.
 * Throws on network failure or malformed JSON. Non-2xx responses with a JSON
 * `{success:false,error}` body are returned as-is so the caller can display
 * the server's error string in the UI.
 */
export async function convertPdf(
  file: File,
  options: ConvertOptions
): Promise<ConvertResponse> {
  const formData = new FormData();
  formData.append("pdf", file);
  formData.append("documentType", options.documentType);
  formData.append("autoFile", options.autoFile.toString());
  formData.append("carrier", options.carrier);
  if (options.orderingProvider) {
    formData.append("orderingProvider", options.orderingProvider);
  }
  if (options.bjcDoctors && options.bjcDoctors.length > 0) {
    formData.append("bjcDoctors", JSON.stringify(options.bjcDoctors));
  }

  const response = await fetch("/api/convert", {
    method: "POST",
    body: formData,
  });

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return {
      success: false,
      error: `Server returned ${response.status} with no JSON body`,
    };
  }

  if (!isConvertResponse(json)) {
    return {
      success: false,
      error: "Malformed conversion response",
    };
  }

  return json;
}
