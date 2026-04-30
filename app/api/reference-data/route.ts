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
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

// HL7 separator and control characters that would corrupt segments if injected
// into identifier fields. Field separator (|), component separator (^),
// repetition (~), subcomponent (&), escape (\), and ASCII control chars.
const HL7_SEPARATOR_OR_CONTROL = /[|^~&\\\x00-\x1f\x7f]/;

function containsHL7SeparatorOrControl(value: string): boolean {
  return HL7_SEPARATOR_OR_CONTROL.test(value);
}

// Provider numbers are intentionally permissive: real Medicare provider numbers
// are 8 chars (6 digits + check digit + location char), but seed/in-progress
// configurations may not yet match that strict shape. We only require that
// the value cannot corrupt HL7 segments.
const PROVIDER_NUMBER_RE = /^[A-Z0-9]{1,12}$/i;

function isValidProviderNumber(value: string): boolean {
  return PROVIDER_NUMBER_RE.test(value);
}

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
    typeof v.providerNumber === "string" &&
    v.providerNumber.length > 0
  );
}

function validateDoctor(value: unknown): ValidatedDoctor {
  if (!isDoctorShape(value)) {
    return { ok: false, error: "Invalid doctor payload" };
  }
  if (!isValidProviderNumber(value.providerNumber)) {
    return {
      ok: false,
      error:
        "Invalid doctor payload: providerNumber must be 1-12 alphanumeric characters (no HL7 separators)",
    };
  }
  if (containsHL7SeparatorOrControl(value.name)) {
    return {
      ok: false,
      error:
        "Invalid doctor payload: name must not contain HL7 separators or control characters",
    };
  }
  return { ok: true, value };
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
  if (containsHL7SeparatorOrControl(value.value)) {
    return {
      ok: false,
      error:
        "Invalid carrier payload: value must not contain HL7 separators or control characters",
    };
  }
  if (containsHL7SeparatorOrControl(value.label)) {
    return {
      ok: false,
      error:
        "Invalid carrier payload: label must not contain HL7 separators or control characters",
    };
  }
  return { ok: true, value };
}

export const GET = auth(async (request) => {
  if (!request.auth) return unauthorized();

  const [doctors, carriers] = await Promise.all([
    listDoctors(),
    listCarriers(),
  ]);

  return NextResponse.json({ success: true, doctors, carriers });
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
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    await putDoctor(result.value);
    return NextResponse.json({ success: true });
  }

  if (kind === "CARRIER") {
    const result = validateCarrier(item);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    await putCarrier(result.value);
    return NextResponse.json({ success: true });
  }

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
    await deleteDoctor(id);
    return NextResponse.json({ success: true });
  }

  if (kind === "CARRIER") {
    await deleteCarrier(id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { success: false, error: "Invalid kind. Expected DOCTOR or CARRIER." },
    { status: 400 }
  );
});
