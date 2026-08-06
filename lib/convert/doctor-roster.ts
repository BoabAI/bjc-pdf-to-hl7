/**
 * Doctor roster for a conversion.
 *
 * Precedence: names supplied with the request (form field / BJC_DOCTORS env,
 * already coalesced by parseConvertFormData) → the DynamoDB reference-data
 * roster (managed on /reference — this is what the PAD pipeline uses, since
 * PAD can only send the PDF) → the seeded defaults. Never throws: a roster
 * problem must degrade addressee resolution, not fail the conversion.
 */

import { DEFAULT_BJC_DOCTORS } from "../conversion-config";
import { listDoctors } from "../reference-data-store";

export async function loadConversionRoster(
  requestDoctors?: string[]
): Promise<string[]> {
  if (requestDoctors && requestDoctors.length > 0) {
    return requestDoctors;
  }

  try {
    const doctors = await listDoctors();
    if (doctors.length > 0) {
      return doctors.map((d) => d.name);
    }
  } catch {
    // DDB unavailable — fall through to the seeded defaults.
  }

  return DEFAULT_BJC_DOCTORS.map((d) => d.name);
}
