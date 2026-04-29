import { NextRequest, NextResponse } from "next/server";
import {
  deleteCarrier,
  deleteDoctor,
  listCarriers,
  listDoctors,
  putCarrier,
  putDoctor,
} from "@/lib/reference-data-store";
import type { Carrier, Doctor } from "@/lib/conversion-config";

export const runtime = "nodejs";

function requireAuth(request: NextRequest): NextResponse | null {
  const isAuthenticated =
    request.cookies.get("app_authenticated")?.value === "true";
  if (!isAuthenticated) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  return null;
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauth = requireAuth(request);
  if (unauth) return unauth;

  const [doctors, carriers] = await Promise.all([
    listDoctors(),
    listCarriers(),
  ]);

  return NextResponse.json({ success: true, doctors, carriers });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const unauth = requireAuth(request);
  if (unauth) return unauth;

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
    if (!isDoctor(item)) {
      return NextResponse.json(
        { success: false, error: "Invalid doctor payload" },
        { status: 400 }
      );
    }
    await putDoctor(item);
    return NextResponse.json({ success: true });
  }

  if (kind === "CARRIER") {
    if (!isCarrier(item)) {
      return NextResponse.json(
        { success: false, error: "Invalid carrier payload" },
        { status: 400 }
      );
    }
    await putCarrier(item);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { success: false, error: "Invalid kind. Expected DOCTOR or CARRIER." },
    { status: 400 }
  );
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const unauth = requireAuth(request);
  if (unauth) return unauth;

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
}
