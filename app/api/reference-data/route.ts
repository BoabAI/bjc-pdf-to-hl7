import { NextResponse } from "next/server";
import {
  deleteCarrier,
  deleteDoctor,
  listCarriers,
  listDoctors,
  putCarrier,
  putDoctor,
} from "@/lib/reference-data-store";
import type { Carrier, Doctor } from "@/lib/conversion-config";
import type { ReferenceDataResponse } from "@/lib/contracts/reference-data";
import { auth } from "@/lib/auth";
import { logOperationalError, logServerEvent } from "@/lib/server/logging";
import { sanitizeReferenceField } from "@/lib/text-sanitize";
import { validateProviderNumberForStorage } from "@/lib/provider-number";

export const runtime = "nodejs";

// We do NOT reject HL7 separator characters (| ^ ~ & \) at input — the HL7
// builder (escapeHL7 in lib/hl7-builder.ts) escapes them on output, so a name
// like "Dr Smith & Associates" is stored as-is and emitted safely. Rejecting
// them here was redundant and surfaced as a confusing "Save failed" for
// ordinary names. We only strip control characters (via sanitizeReferenceField)
// and enforce length caps. See lib/text-sanitize.ts.

// Sanity caps to prevent absurd payloads (a 297-char doctor name was accepted
// before this was added). The HL7 spec limits some of these fields, but we
// pick generous human-friendly bounds rather than tight HL7 lengths.
const MAX_DOCTOR_NAME_LEN = 100;
const MAX_CARRIER_VALUE_LEN = 20;
const MAX_CARRIER_LABEL_LEN = 60;

type ValidatedDoctor = { ok: true; value: Doctor } | { ok: false; error: string };
type ValidatedCarrier = { ok: true; value: Carrier } | { ok: false; error: string };

function unauthorized(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 }
  );
}

function isDoctorShape(value: unknown): value is Doctor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.name === "string" &&
    v.name.length > 0 &&
    // Provider number is optional: a string (possibly empty) or omitted.
    (typeof v.providerNumber === "string" || typeof v.providerNumber === "undefined")
  );
}

function validateDoctor(value: unknown): ValidatedDoctor {
  if (!isDoctorShape(value)) {
    return { ok: false, error: "Invalid doctor payload" };
  }
  const name = sanitizeReferenceField(value.name);
  // Provider number is optional — coalesce a missing value to "".
  const providerNumber = sanitizeReferenceField(
    typeof value.providerNumber === "string" ? value.providerNumber : ""
  );
  if (!name) {
    return { ok: false, error: "Doctor name is required." };
  }
  // Enforces the length cap AND rejects a fully Medicare-shaped number with a
  // bad check digit (a typo that would silently misroute a clinical document).
  // Placeholder/seed (…Z) and legacy spaced/hyphenated numbers pass through.
  const providerCheck = validateProviderNumberForStorage(providerNumber);
  if (!providerCheck.ok) {
    return { ok: false, error: providerCheck.reason };
  }
  if (name.length > MAX_DOCTOR_NAME_LEN) {
    return {
      ok: false,
      error: `Doctor name must be ${MAX_DOCTOR_NAME_LEN} characters or fewer.`,
    };
  }
  // Build an explicit, allowlisted object — never spread the raw client value,
  // which could smuggle extra attributes (or a `kind`) into the stored row.
  return { ok: true, value: { id: value.id, name, providerNumber } };
}

function isCarrierShape(value: unknown): value is Carrier {
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

function validateCarrier(value: unknown): ValidatedCarrier {
  if (!isCarrierShape(value)) {
    return { ok: false, error: "Invalid carrier payload" };
  }
  const carrierValue = sanitizeReferenceField(value.value);
  const label = sanitizeReferenceField(value.label);
  if (!carrierValue) {
    return { ok: false, error: "Invalid carrier payload: value is required" };
  }
  if (!label) {
    return { ok: false, error: "Invalid carrier payload: label is required" };
  }
  if (carrierValue.length > MAX_CARRIER_VALUE_LEN) {
    return {
      ok: false,
      error: `Invalid carrier payload: value must be ${MAX_CARRIER_VALUE_LEN} characters or fewer`,
    };
  }
  if (label.length > MAX_CARRIER_LABEL_LEN) {
    return {
      ok: false,
      error: `Invalid carrier payload: label must be ${MAX_CARRIER_LABEL_LEN} characters or fewer`,
    };
  }
  // Explicit allowlist (mirrors validateDoctor) — preserve isDefault only when
  // the client actually sent a boolean, and never spread unknown attributes.
  return {
    ok: true,
    value: {
      id: value.id,
      value: carrierValue,
      label,
      ...(value.isDefault !== undefined ? { isDefault: value.isDefault } : {}),
    },
  };
}

export const GET = auth(async (request) => {
  if (!request.auth) return unauthorized();

  const [doctors, carriers] = await Promise.all([
    listDoctors(),
    listCarriers(),
  ]);

  const body: ReferenceDataResponse = { success: true, doctors, carriers };
  return NextResponse.json(body);
});

export const PUT = auth(async (request) => {
  if (!request.auth) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { kind, item } = body as { kind?: unknown; item?: unknown };

  if (kind === "DOCTOR") {
    const result = validateDoctor(item);
    if (!result.ok) {
      // Log the rule that failed (never the raw value) so a recurring "Save
      // failed" in the UI is visible in CloudWatch — 400s were previously silent.
      logServerEvent("warn", "reference-data", "validation-reject", {
        kind: "DOCTOR",
        reason: result.error,
      });
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    try {
      await putDoctor(result.value);
    } catch (error) {
      logOperationalError("reference-data", error, { op: "putDoctor" });
      return NextResponse.json(
        { success: false, error: "Failed to persist reference data" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  if (kind === "CARRIER") {
    const result = validateCarrier(item);
    if (!result.ok) {
      logServerEvent("warn", "reference-data", "validation-reject", {
        kind: "CARRIER",
        reason: result.error,
      });
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    try {
      await putCarrier(result.value);
    } catch (error) {
      logOperationalError("reference-data", error, { op: "putCarrier" });
      return NextResponse.json(
        { success: false, error: "Failed to persist reference data" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  logServerEvent("warn", "reference-data", "validation-reject", {
    op: "PUT",
    reason: "Invalid kind. Expected DOCTOR or CARRIER.",
  });
  return NextResponse.json(
    { success: false, error: "Invalid kind. Expected DOCTOR or CARRIER." },
    { status: 400 }
  );
});

export const DELETE = auth(async (request) => {
  if (!request.auth) return unauthorized();

  const kind = request.nextUrl.searchParams.get("kind");
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing id parameter" },
      { status: 400 }
    );
  }

  if (kind === "DOCTOR") {
    try {
      await deleteDoctor(id);
    } catch (error) {
      logOperationalError("reference-data", error, { op: "deleteDoctor" });
      return NextResponse.json(
        { success: false, error: "Failed to persist reference data" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  if (kind === "CARRIER") {
    try {
      await deleteCarrier(id);
    } catch (error) {
      logOperationalError("reference-data", error, { op: "deleteCarrier" });
      return NextResponse.json(
        { success: false, error: "Failed to persist reference data" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { success: false, error: "Invalid kind. Expected DOCTOR or CARRIER." },
    { status: 400 }
  );
});
