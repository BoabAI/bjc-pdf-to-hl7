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

const { GET, PUT, DELETE } = await import("./route");

const cookieHeader = "app_authenticated=true";

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
    headers.cookie = cookieHeader;
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
  console.error = (() => {}) as typeof console.error;
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("GET /api/reference-data", () => {
  test("returns 401 without auth cookie", async () => {
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
  test("returns 401 without auth", async () => {
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

describe("DELETE /api/reference-data", () => {
  test("returns 401 without auth", async () => {
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
});
