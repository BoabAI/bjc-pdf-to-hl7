import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const listDoctorsMock = mock();
const listCarriersMock = mock();
const putDoctorMock = mock();
const putCarrierMock = mock();
const deleteDoctorMock = mock();
const deleteCarrierMock = mock();
const originalConsoleError = console.error;

mock.module("@/lib/reference-data-store", () => ({
  listDoctors: listDoctorsMock,
  listCarriers: listCarriersMock,
  putDoctor: putDoctorMock,
  putCarrier: putCarrierMock,
  deleteDoctor: deleteDoctorMock,
  deleteCarrier: deleteCarrierMock,
}));

// Mock Auth.js: auth() becomes a passthrough that injects request.auth from
// a test header. Lets us cover the unauthed branch without a real session.
mock.module("@/lib/auth", () => ({
  auth: (handler: (req: NextRequest & { auth: unknown }) => unknown) =>
    async (req: NextRequest) => {
      const email = req.headers.get("x-test-auth");
      const augmented = Object.assign(req, {
        auth: email ? { user: { email } } : null,
      });
      return handler(augmented as NextRequest & { auth: unknown });
    },
}));

// Mock the server logger so we can assert validation rejections are logged
// (400s were previously silent) without writing to the console during tests.
const logServerEventMock = mock();
const logOperationalErrorMock = mock();
mock.module("@/lib/server/logging", () => ({
  logServerEvent: logServerEventMock,
  logOperationalError: logOperationalErrorMock,
}));

const routeModule = await import("./route");
const GET = routeModule.GET as unknown as (req: NextRequest) => Promise<Response>;
const PUT = routeModule.PUT as unknown as (req: NextRequest) => Promise<Response>;
const DELETE = routeModule.DELETE as unknown as (req: NextRequest) => Promise<Response>;

function makeRequest(
  path: string,
  opts: {
    method?: "GET" | "PUT" | "DELETE";
    body?: unknown;
    authed?: boolean;
  } = {}
): NextRequest {
  const url = `http://localhost:3000/api/reference-data${path}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.authed !== false) {
    headers["x-test-auth"] = "alice@bjchealth.com.au";
  }
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => {
  listDoctorsMock.mockReset().mockResolvedValue([]);
  listCarriersMock.mockReset().mockResolvedValue([]);
  putDoctorMock.mockReset().mockResolvedValue(undefined);
  putCarrierMock.mockReset().mockResolvedValue(undefined);
  deleteDoctorMock.mockReset().mockResolvedValue(undefined);
  deleteCarrierMock.mockReset().mockResolvedValue(undefined);
  logServerEventMock.mockReset();
  logOperationalErrorMock.mockReset();
  console.error = (() => {}) as typeof console.error;
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("GET /api/reference-data", () => {
  test("returns 401 without session", async () => {
    const response = await GET(makeRequest("", { authed: false }));
    expect(response.status).toBe(401);
  });

  test("returns both lists in one response", async () => {
    listDoctorsMock.mockResolvedValue([
      { id: "d1", name: "Dr Test", providerNumber: "9123456Z" },
    ]);
    listCarriersMock.mockResolvedValue([
      { id: "c1", value: "SMECAI", label: "SMECAI", isDefault: true },
    ]);

    const response = await GET(makeRequest(""));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.doctors).toHaveLength(1);
    expect(body.carriers).toHaveLength(1);
    expect(body.doctors[0].name).toBe("Dr Test");
    expect(body.carriers[0].isDefault).toBe(true);
  });
});

describe("PUT /api/reference-data", () => {
  test("returns 401 without session", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        authed: false,
        body: { kind: "DOCTOR", item: { id: "x", name: "y", providerNumber: "z" } },
      })
    );
    expect(response.status).toBe(401);
  });

  test("upserts a doctor", async () => {
    const doctor = { id: "d1", name: "Dr New", providerNumber: "9999999Z" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "DOCTOR", item: doctor } })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledTimes(1);
    expect(putDoctorMock).toHaveBeenCalledWith(doctor);
    expect(putCarrierMock).not.toHaveBeenCalled();
  });

  test("upserts a carrier", async () => {
    const carrier = { id: "c1", value: "POST", label: "Post" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "CARRIER", item: carrier } })
    );
    expect(response.status).toBe(200);
    expect(putCarrierMock).toHaveBeenCalledWith(carrier);
    expect(putDoctorMock).not.toHaveBeenCalled();
  });

  test("rejects invalid kind", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: { kind: "BANANA", item: { id: "x" } },
      })
    );
    expect(response.status).toBe(400);
    expect(putDoctorMock).not.toHaveBeenCalled();
    expect(putCarrierMock).not.toHaveBeenCalled();
  });

  test("rejects malformed doctor body (missing fields)", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: { kind: "DOCTOR", item: { id: "x" } }, // missing name, providerNumber
      })
    );
    expect(response.status).toBe(400);
    expect(putDoctorMock).not.toHaveBeenCalled();
  });

  test("rejects malformed carrier body (missing fields)", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: { kind: "CARRIER", item: { id: "x", value: "P" } }, // missing label
      })
    );
    expect(response.status).toBe(400);
    expect(putCarrierMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/reference-data — input sanitisation & caps", () => {
  // HL7 separator chars (| ^ ~ & \) are NOT rejected at input — the HL7 builder
  // (escapeHL7, covered in lib/hl7-builder.test.ts) escapes them on output, so
  // storing them raw is safe. Rejecting them surfaced as a confusing "Save
  // failed" for ordinary names. Only control characters are stripped; the
  // length caps remain.

  test("accepts a doctor name with an ampersand (escaped to \\T\\ on output)", async () => {
    const doctor = {
      id: "d1",
      name: "Dr Smith & Associates",
      providerNumber: "9000001Z",
    };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "DOCTOR", item: doctor } })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith(doctor);
  });

  test("accepts a doctor name with a caret (preserved, escaped on output)", async () => {
    const doctor = {
      id: "d1",
      name: "Dr Smith ^Jones",
      providerNumber: "9000001Z",
    };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "DOCTOR", item: doctor } })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith(doctor);
  });

  test("accepts a carrier value with an HL7 separator (escaped on output)", async () => {
    const carrier = { id: "c1", value: "MYCO|CO", label: "OK" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "CARRIER", item: carrier } })
    );
    expect(response.status).toBe(200);
    expect(putCarrierMock).toHaveBeenCalledWith(carrier);
  });

  test("accepts a carrier label with a backslash", async () => {
    const carrier = { id: "c1", value: "OK", label: "Email\\Bad" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "CARRIER", item: carrier } })
    );
    expect(response.status).toBe(200);
    expect(putCarrierMock).toHaveBeenCalledWith(carrier);
  });

  test("strips control characters from doctor fields (e.g. pasted newline/tab)", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "DOCTOR",
          item: { id: "d1", name: "Dr Smith\n", providerNumber: "9000001Z\t" },
        },
      })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith({
      id: "d1",
      name: "Dr Smith",
      providerNumber: "9000001Z",
    });
  });

  test("strips a control character embedded in a carrier label", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "CARRIER",
          //  (bell) — the kind of invisible char a paste can carry in.
          item: { id: "c1", value: "OK", label: "OKBell" },
        },
      })
    );
    expect(response.status).toBe(200);
    expect(putCarrierMock).toHaveBeenCalledWith({
      id: "c1",
      value: "OK",
      label: "OKBell",
    });
  });

  test("accepts a doctor with an empty providerNumber (optional)", async () => {
    const doctor = { id: "d1", name: "Dr Smith", providerNumber: "" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "DOCTOR", item: doctor } })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith({
      id: "d1",
      name: "Dr Smith",
      providerNumber: "",
    });
  });

  test("accepts a doctor with no providerNumber field at all", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: { kind: "DOCTOR", item: { id: "d1", name: "Dr Smith" } },
      })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith({
      id: "d1",
      name: "Dr Smith",
      providerNumber: "",
    });
  });

  test("rejects a doctor whose name is only control characters", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "DOCTOR",
          item: { id: "d1", name: "\n\t", providerNumber: "9000001Z" },
        },
      })
    );
    expect(response.status).toBe(400);
    expect(putDoctorMock).not.toHaveBeenCalled();
  });

  test("accepts a doctor with a seed-style providerNumber", async () => {
    const doctor = { id: "d1", name: "Dr Smith", providerNumber: "9000001Z" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "DOCTOR", item: doctor } })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith(doctor);
  });

  test("accepts a doctor with a spaced provider number (Medicare convention)", async () => {
    // Real Medicare provider numbers are conventionally displayed with a space
    // before the location/check char (e.g. `123456 7Y`). Staff copy them in
    // that shape; the API must not reject it.
    const doctor = { id: "d1", name: "Dr Smith", providerNumber: "123456 7Y" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "DOCTOR", item: doctor } })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith(doctor);
  });

  test("accepts a doctor with a hyphenated provider number", async () => {
    const doctor = { id: "d1", name: "Dr Smith", providerNumber: "9876-543T" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "DOCTOR", item: doctor } })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith(doctor);
  });

  test("accepts a fully-valid Medicare provider number", async () => {
    // 2426621B is a real, check-digit-valid provider number.
    const doctor = { id: "d1", name: "Dr Smith", providerNumber: "2426621B" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "DOCTOR", item: doctor } })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith(doctor);
  });

  test("rejects a Medicare-shaped number with a bad check digit", async () => {
    // 2426621A is well-formed but the check digit should be B — a likely typo
    // that would silently misroute a clinical document.
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "DOCTOR",
          item: { id: "d1", name: "Dr Smith", providerNumber: "2426621A" },
        },
      })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/check digit/i);
    expect(putDoctorMock).not.toHaveBeenCalled();
  });

  test("strips unexpected attributes from the stored doctor (mass assignment)", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "DOCTOR",
          item: {
            id: "d1",
            name: "Dr Smith",
            providerNumber: "9000001Z",
            // Hostile extras that must NOT reach the store.
            kind: "CARRIER",
            updatedAt: "1999-01-01T00:00:00.000Z",
            role: "admin",
          },
        },
      })
    );
    expect(response.status).toBe(200);
    expect(putDoctorMock).toHaveBeenCalledWith({
      id: "d1",
      name: "Dr Smith",
      providerNumber: "9000001Z",
    });
  });

  test("rejects a doctor name over the length cap", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "DOCTOR",
          item: { id: "d1", name: "D".repeat(101), providerNumber: "9000001Z" },
        },
      })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/100 characters or fewer/);
    expect(putDoctorMock).not.toHaveBeenCalled();
  });

  test("rejects a provider number over the length cap", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "DOCTOR",
          item: { id: "d1", name: "Dr Smith", providerNumber: "9".repeat(21) },
        },
      })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/20 characters or fewer/);
    expect(putDoctorMock).not.toHaveBeenCalled();
  });

  test("rejects a carrier value over the length cap", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "CARRIER",
          item: { id: "c1", value: "V".repeat(21), label: "OK" },
        },
      })
    );
    expect(response.status).toBe(400);
    expect(putCarrierMock).not.toHaveBeenCalled();
  });

  test("rejects a carrier label over the length cap", async () => {
    const response = await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "CARRIER",
          item: { id: "c1", value: "OK", label: "L".repeat(61) },
        },
      })
    );
    expect(response.status).toBe(400);
    expect(putCarrierMock).not.toHaveBeenCalled();
  });

  test("logs a structured warning when a save is rejected (no raw value)", async () => {
    await PUT(
      makeRequest("", {
        method: "PUT",
        body: {
          kind: "DOCTOR",
          item: { id: "d1", name: "D".repeat(101), providerNumber: "9000001Z" },
        },
      })
    );
    expect(logServerEventMock).toHaveBeenCalledTimes(1);
    const [level, category, message, context] = logServerEventMock.mock.calls[0];
    expect(level).toBe("warn");
    expect(category).toBe("reference-data");
    expect(message).toBe("validation-reject");
    expect(context).toMatchObject({ kind: "DOCTOR" });
  });
});

describe("PUT /api/reference-data — store error propagation", () => {
  test("returns 500 when putDoctor rejects", async () => {
    putDoctorMock.mockRejectedValueOnce(new Error("DDB throttled"));
    const doctor = { id: "d1", name: "Dr New", providerNumber: "9999999Z" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "DOCTOR", item: doctor } })
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: "Failed to persist reference data",
    });
    // Don't leak raw error details
    expect(JSON.stringify(body)).not.toContain("DDB throttled");
    expect(putDoctorMock).toHaveBeenCalledTimes(1);
  });

  test("returns 500 when putCarrier rejects", async () => {
    putCarrierMock.mockRejectedValueOnce(new Error("DDB unavailable"));
    const carrier = { id: "c1", value: "POST", label: "Post" };
    const response = await PUT(
      makeRequest("", { method: "PUT", body: { kind: "CARRIER", item: carrier } })
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: "Failed to persist reference data",
    });
    expect(JSON.stringify(body)).not.toContain("DDB unavailable");
    expect(putCarrierMock).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/reference-data", () => {
  test("returns 401 without session", async () => {
    const response = await DELETE(
      makeRequest("?kind=DOCTOR&id=d1", { method: "DELETE", authed: false })
    );
    expect(response.status).toBe(401);
  });

  test("deletes a doctor by id", async () => {
    const response = await DELETE(
      makeRequest("?kind=DOCTOR&id=d1", { method: "DELETE" })
    );
    expect(response.status).toBe(200);
    expect(deleteDoctorMock).toHaveBeenCalledWith("d1");
    expect(deleteCarrierMock).not.toHaveBeenCalled();
  });

  test("deletes a carrier by id", async () => {
    const response = await DELETE(
      makeRequest("?kind=CARRIER&id=c1", { method: "DELETE" })
    );
    expect(response.status).toBe(200);
    expect(deleteCarrierMock).toHaveBeenCalledWith("c1");
    expect(deleteDoctorMock).not.toHaveBeenCalled();
  });

  test("rejects missing id", async () => {
    const response = await DELETE(
      makeRequest("?kind=DOCTOR", { method: "DELETE" })
    );
    expect(response.status).toBe(400);
    expect(deleteDoctorMock).not.toHaveBeenCalled();
  });

  test("rejects invalid kind", async () => {
    const response = await DELETE(
      makeRequest("?kind=BANANA&id=x", { method: "DELETE" })
    );
    expect(response.status).toBe(400);
    expect(deleteDoctorMock).not.toHaveBeenCalled();
    expect(deleteCarrierMock).not.toHaveBeenCalled();
  });

  test("returns 500 when deleteDoctor rejects", async () => {
    deleteDoctorMock.mockRejectedValueOnce(new Error("DDB conditional check failed"));
    const response = await DELETE(
      makeRequest("?kind=DOCTOR&id=d1", { method: "DELETE" })
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: "Failed to persist reference data",
    });
    expect(JSON.stringify(body)).not.toContain("conditional check");
    expect(deleteDoctorMock).toHaveBeenCalledWith("d1");
  });

  test("returns 500 when deleteCarrier rejects", async () => {
    deleteCarrierMock.mockRejectedValueOnce(new Error("DDB throttled"));
    const response = await DELETE(
      makeRequest("?kind=CARRIER&id=c1", { method: "DELETE" })
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: "Failed to persist reference data",
    });
    expect(JSON.stringify(body)).not.toContain("DDB throttled");
    expect(deleteCarrierMock).toHaveBeenCalledWith("c1");
  });
});
