import { afterEach, describe, expect, test } from "bun:test";
import { convertPdf } from "./convertClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function fakeFile(name = "test.pdf"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

describe("convertPdf", () => {
  test("posts FormData to /api/convert and returns parsed response", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = (async (input: unknown, init: unknown) => {
      captured = { url: String(input), init: (init ?? {}) as RequestInit };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          filename: "out.hl7",
          hl7Content: "MSH|...",
          documentType: "referral_letter",
          extractionMethod: "vision",
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await convertPdf(fakeFile(), {
      documentType: "auto",
      autoFile: true,
      carrier: "SMECAI",
    });

    expect(result.success).toBe(true);
    expect(result.filename).toBe("out.hl7");
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("/api/convert");
    expect(captured!.init.method).toBe("POST");

    const formData = captured!.init.body as FormData;
    expect(formData.get("documentType")).toBe("auto");
    expect(formData.get("autoFile")).toBe("true");
    expect(formData.get("carrier")).toBe("SMECAI");
  });

  test("includes orderingProvider and bjcDoctors when present", async () => {
    let body: FormData | null = null;
    globalThis.fetch = (async (_input: unknown, init: unknown) => {
      body = ((init ?? {}) as RequestInit).body as FormData;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await convertPdf(fakeFile(), {
      documentType: "referral_letter",
      autoFile: false,
      carrier: "FAX",
      orderingProvider: "9000001Z",
      bjcDoctors: ["Dr X", "Dr Y"],
    });

    expect(body).not.toBeNull();
    expect(body!.get("orderingProvider")).toBe("9000001Z");
    expect(JSON.parse(String(body!.get("bjcDoctors")))).toEqual(["Dr X", "Dr Y"]);
    expect(body!.get("autoFile")).toBe("false");
  });

  test("omits bjcDoctors when empty", async () => {
    let body: FormData | null = null;
    globalThis.fetch = (async (_input: unknown, init: unknown) => {
      body = ((init ?? {}) as RequestInit).body as FormData;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await convertPdf(fakeFile(), {
      documentType: "auto",
      autoFile: true,
      carrier: "SMECAI",
      bjcDoctors: [],
    });

    expect(body!.get("bjcDoctors")).toBeNull();
  });

  test("returns failure shape when JSON parsing fails", async () => {
    globalThis.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await convertPdf(fakeFile(), {
      documentType: "auto",
      autoFile: true,
      carrier: "SMECAI",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("no JSON body");
  });

  test("returns failure shape when JSON does not match contract", async () => {
    globalThis.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ unrelated: true }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await convertPdf(fakeFile(), {
      documentType: "auto",
      autoFile: true,
      carrier: "SMECAI",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Malformed");
  });

  test("returns server error body when status non-2xx but valid contract", async () => {
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: "bad pdf" }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await convertPdf(fakeFile(), {
      documentType: "auto",
      autoFile: true,
      carrier: "SMECAI",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("bad pdf");
  });
});
