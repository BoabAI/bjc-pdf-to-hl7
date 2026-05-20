"use client";

import type { Carrier, Doctor } from "@/lib/conversion-config";
import { isReferenceDataResponse } from "@/lib/contracts/reference-data";

const ENDPOINT = "/api/reference-data";

/**
 * Thrown when the API returns 401 (session expired / not signed in). Callers
 * should catch this specifically and trigger a `/login` redirect rather than
 * showing a generic "Unauthorized" string in the save-failed banner.
 */
export class AuthExpiredError extends Error {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.length > 0) {
      return data.error;
    }
  } catch {
    // Body wasn't JSON — fall through to status text.
  }
  return response.statusText || `Request failed (${response.status})`;
}

async function throwForResponse(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new AuthExpiredError();
  }
  throw new Error(await readErrorMessage(response));
}

/**
 * Fetch the full reference-data set. Throws `AuthExpiredError` on 401, or a
 * generic Error on other non-2xx responses / network errors / malformed JSON.
 */
export async function getReferenceData(): Promise<{
  doctors: Doctor[];
  carriers: Carrier[];
}> {
  const response = await fetch(ENDPOINT, { cache: "no-store" });
  if (!response.ok) {
    await throwForResponse(response);
  }
  const json: unknown = await response.json();
  if (!isReferenceDataResponse(json) || !json.success) {
    throw new Error(
      isReferenceDataResponse(json) && json.error
        ? json.error
        : "Malformed reference-data response"
    );
  }
  return {
    doctors: json.doctors ?? [],
    carriers: json.carriers ?? [],
  };
}

async function putRow(kind: "DOCTOR" | "CARRIER", item: Doctor | Carrier): Promise<void> {
  const response = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, item }),
  });
  if (!response.ok) {
    await throwForResponse(response);
  }
}

export async function putDoctor(doctor: Doctor): Promise<void> {
  return putRow("DOCTOR", doctor);
}

export async function putCarrier(carrier: Carrier): Promise<void> {
  return putRow("CARRIER", carrier);
}

async function deleteRow(kind: "DOCTOR" | "CARRIER", id: string): Promise<void> {
  const params = new URLSearchParams({ kind, id });
  const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await throwForResponse(response);
  }
}

export async function deleteDoctor(id: string): Promise<void> {
  return deleteRow("DOCTOR", id);
}

export async function deleteCarrier(id: string): Promise<void> {
  return deleteRow("CARRIER", id);
}
