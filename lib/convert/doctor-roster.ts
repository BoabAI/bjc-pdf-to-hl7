/**
 * Doctor roster for a conversion.
 *
 * Precedence: names supplied with the request (form field / BJC_DOCTORS env,
 * already coalesced by parseConvertFormData) → the DynamoDB reference-data
 * roster (managed on /reference — this is what the PAD pipeline uses, since
 * PAD can only send the PDF) → the seeded defaults. Never throws:
 * listDoctors() logs DynamoDB failures and resolves to [], which falls
 * through to the defaults.
 *
 * The DynamoDB roster is cached in-memory for 30 seconds (same as
 * lib/settings.ts) to keep `/api/convert` hot. Empty results are not cached
 * so a DynamoDB blip is retried on the next conversion. /reference edits take
 * up to the TTL to reach a warm instance.
 */

import { DEFAULT_BJC_DOCTORS } from "../conversion-config";
import { listDoctors } from "../reference-data-store";

const DEFAULT_CACHE_TTL_MS = 30_000;

let cached: { names: string[]; expiresAtMs: number } | null = null;

/** Clear the in-memory roster cache. Used by tests. */
export function clearRosterCache(): void {
  cached = null;
}

export async function loadConversionRoster(
  requestDoctors?: string[],
  options?: {
    /** Override the cache TTL (ms). Tests use 0 to disable caching. */
    cacheTtlMs?: number;
  }
): Promise<string[]> {
  if (requestDoctors && requestDoctors.length > 0) {
    return requestDoctors;
  }

  const now = Date.now();
  if (cached && cached.expiresAtMs > now) {
    return cached.names;
  }

  const doctors = await listDoctors();
  if (doctors.length > 0) {
    const names = doctors.map((d) => d.name);
    cached = {
      names,
      expiresAtMs: now + (options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS),
    };
    return names;
  }

  return DEFAULT_BJC_DOCTORS.map((d) => d.name);
}
