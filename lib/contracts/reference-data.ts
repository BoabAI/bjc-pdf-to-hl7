/**
 * Shared HTTP contract for `/api/reference-data`.
 *
 * Client-safe: imported by both the API route and React components. No AWS
 * SDK or Node-only imports allowed in this module.
 */

import type { Carrier, Doctor } from "../conversion-config";

export interface ReferenceDataResponse {
  success: boolean;
  doctors?: Doctor[];
  carriers?: Carrier[];
  error?: string;
}

function isDoctor(value: unknown): value is Doctor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.name === "string" &&
    v.name.length > 0 &&
    typeof v.providerNumber === "string" &&
    v.providerNumber.length > 0
  );
}

function isCarrier(value: unknown): value is Carrier {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.value === "string" &&
    v.value.length > 0 &&
    typeof v.label === "string" &&
    v.label.length > 0 &&
    (v.isDefault === undefined || typeof v.isDefault === "boolean")
  );
}

/**
 * Runtime guard for `/api/reference-data` JSON. Validates that:
 * - The envelope has a boolean `success`.
 * - When present, `doctors` is an array of Doctor shape.
 * - When present, `carriers` is an array of Carrier shape.
 * - When present, `error` is a string.
 */
export function isReferenceDataResponse(
  value: unknown
): value is ReferenceDataResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.success !== "boolean") return false;
  if (v.error !== undefined && typeof v.error !== "string") return false;
  if (v.doctors !== undefined) {
    if (!Array.isArray(v.doctors)) return false;
    if (!v.doctors.every(isDoctor)) return false;
  }
  if (v.carriers !== undefined) {
    if (!Array.isArray(v.carriers)) return false;
    if (!v.carriers.every(isCarrier)) return false;
  }
  return true;
}
