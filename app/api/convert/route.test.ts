import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const extractPatientDataMock = mock();
const formatExtractedDataMock = mock();
const recordConversionMock = mock();
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

mock.module("@/lib/pdf-parser", () => ({
  extractPatientData: extractPatientDataMock,
  formatExtractedData: formatExtractedDataMock,
}));

mock.module("@/lib/audit", () => ({
  recordConversion: recordConversionMock,
  buildSortKey: () => "2026-04-29T00:00:00.000Z#aaaaaa",
  monthKey: () => "2026-04",
  hashFilename: (input: string) => {
    // Stable but distinct per input — must NEVER include raw filename text.
    let h = 0;
    for (const c of input) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h.toString(16).padStart(12, "0").slice(0, 12);
  },
  extractFilenameExt: (filename: string) => {
    const i = filename.lastIndexOf(".");
    if (i <= 0 || i === filename.length - 1) return "";
    return filename.slice(i).toLowerCase();
  },
}));

const { GET, POST } = await import("./route");

const baseExtraction = {
  success: true,
  data: {
    firstName: "Jane",
    lastName: "Smith",
    dob: "19920514",
    sex: "F" as const,
    phone: "0412345678",
    medicareNo: "1234567890",
    medicareRef: "3",
  },
  warnings: ["Using Bedrock vision"],
  documentType: "referral_letter" as const,
  extractionMethod: "vision" as const,
};

const baseFormattedData = {
  firstName: "Jane",
  lastName: "Smith",
  dob: "14/05/1992",
  sex: "Female",
  medicareNo: "1234567890-3",
};

function createConvertRequest(
  options?: {
    detectOnly?: boolean;
    documentType?: string;
    autoFile?: string;
    orderingProvider?: string;
    carrier?: string;
    mimeType?: string;
    filename?: string;
    sizeBytes?: number;
    sourceHeader?: string | null;
  }
): NextRequest {
  const fileSize = options?.sizeBytes ?? 1024;
  const content = new Uint8Array(fileSize);
  content.set(Buffer.from("%PDF-1.4"));
  const blob = new Blob([content], {
    type: options?.mimeType ?? "application/pdf",
  });
  const file = new File([blob], options?.filename ?? "test.pdf", {
    type: options?.mimeType ?? "application/pdf",
  });

  const formData = new FormData();
  formData.append("pdf", file);

  if (options?.detectOnly) formData.append("detectOnly", "true");
  if (options?.documentType) formData.append("documentType", options.documentType);
  if (options?.autoFile !== undefined) formData.append("autoFile", options.autoFile);
  if (options?.orderingProvider) {
    formData.append("orderingProvider", options.orderingProvider);
  }
  if (options?.carrier) formData.append("carrier", options.carrier);

  const headers: Record<string, string> = {};
  if (options?.sourceHeader !== undefined && options.sourceHeader !== null) {
    headers["x-source"] = options.sourceHeader;
  }

  return new NextRequest("http://localhost:3000/api/convert", {
    method: "POST",
    body: formData,
    headers,
  });
}

function createEmptyRequest(): NextRequest {
  const formData = new FormData();
  return new NextRequest("http://localhost:3000/api/convert", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  extractPatientDataMock.mockReset();
  formatExtractedDataMock.mockReset();
  recordConversionMock.mockReset();
  extractPatientDataMock.mockResolvedValue(baseExtraction);
  formatExtractedDataMock.mockReturnValue(baseFormattedData);
  recordConversionMock.mockResolvedValue(undefined);
  console.error = (() => {}) as typeof console.error;
  console.warn = (() => {}) as typeof console.warn;
});

afterEach(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

describe("GET /api/convert", () => {
  test("returns service health", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.service).toBe("PDF to HL7 Converter");
  });
});

describe("POST /api/convert validation", () => {
  test("rejects a request with no file", async () => {
    const response = await POST(createEmptyRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No PDF file provided");
  });

  test("rejects a non-PDF upload", async () => {
    const response = await POST(
      createConvertRequest({
        mimeType: "text/plain",
        filename: "notes.txt",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("File must be a PDF");
  });

  test("rejects files above the 10MB limit", async () => {
    const response = await POST(
      createConvertRequest({
        sizeBytes: 11 * 1024 * 1024,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("File size exceeds 10MB limit");
  });
});

describe("POST /api/convert Bedrock flow", () => {
  test("returns document type only in detect-only mode", async () => {
    const response = await POST(
      createConvertRequest({
        detectOnly: true,
      })
    );
    const data = await response.json();

    expect(extractPatientDataMock).toHaveBeenCalledWith(expect.any(Buffer), "auto", undefined);
    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      documentType: "referral_letter",
    });
  });

  test("passes a forced document type to extraction", async () => {
    await POST(
      createConvertRequest({
        detectOnly: true,
        documentType: "gp_referral",
      })
    );

    expect(extractPatientDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "gp_referral",
      undefined
    );
  });

  test("falls back to auto when document type is invalid", async () => {
    await POST(
      createConvertRequest({
        detectOnly: true,
        documentType: "not_real",
      })
    );

    expect(extractPatientDataMock).toHaveBeenCalledWith(expect.any(Buffer), "auto", undefined);
  });

  test("builds an HL7 payload from Bedrock extraction output", async () => {
    const response = await POST(
      createConvertRequest({
        filename: "Referral.pdf",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.filename).toMatch(/^Smith_Jane_\d{14}\.hl7$/);
    expect(data.extractedData).toEqual({
      ...baseFormattedData,
      date: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/),
      messageType: "REF (Referral)",
      carrier: "SMECAI",
    });
    expect(data.warnings).toEqual(["Using Bedrock vision"]);
    expect(data.extractionMethod).toBe("vision");
    expect(data.hl7Content).toContain("MSH|");
    expect(data.hl7Content).toContain("PID|");
    expect(data.hl7Content).toContain("OBR|");
    expect(data.hl7Content).toContain("^application^pdf^Base64^");
  });

  test("sets OBR-25 to Preliminary when autoFile is false", async () => {
    const response = await POST(
      createConvertRequest({
        autoFile: "false",
      })
    );
    const data = await response.json();
    const obrSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("OBR|"));
    const obrFields = obrSegment.split("|");

    expect(obrFields[25]).toBe("P");
  });

  test("includes the ordering provider in PV1-9", async () => {
    const response = await POST(
      createConvertRequest({
        orderingProvider: "457833CF",
      })
    );
    const data = await response.json();
    const pv1Segment = data.hl7Content.split("\r").find((s: string) => s.startsWith("PV1|"));

    expect(pv1Segment).toContain("457833CF^^^AUSHICPR");
  });

  test("returns a user-facing extraction failure when Bedrock returns no patient", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      success: false,
      data: {
        firstName: "UNKNOWN",
        lastName: "PATIENT",
        dob: "19000101",
        sex: "U" as const,
      },
      warnings: ["Vision extraction could not determine patient name"],
      documentType: "generic",
    });

    const response = await POST(createConvertRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.warnings).toEqual([
      "Vision extraction could not determine patient name",
    ]);
    expect(data.extractionMethod).toBe("vision");
  });

  test("uses REF^I12 message type for referral_letter documents", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "referral_letter",
    });

    const response = await POST(createConvertRequest());
    const data = await response.json();
    const mshSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("MSH|"));
    const mshFields = mshSegment.split("|");

    expect(mshFields[8]).toBe("REF^I12");
  });

  test("uses REF^I12 message type for gp_referral documents", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "gp_referral",
    });

    const response = await POST(createConvertRequest());
    const data = await response.json();
    const mshSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("MSH|"));
    const mshFields = mshSegment.split("|");

    expect(mshFields[8]).toBe("REF^I12");
  });

  test("uses ORU^R01 message type for consent_form documents", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "consent_form",
    });

    const response = await POST(createConvertRequest());
    const data = await response.json();
    const mshSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("MSH|"));
    const mshFields = mshSegment.split("|");

    expect(mshFields[8]).toBe("ORU^R01");
  });

  test("includes referralInfo in HL7 output when present", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "referral_letter",
      referralInfo: {
        senderName: "Dr Sarah Jones",
        senderClinic: "Springfield Medical",
        senderProviderNumber: "1234567A",
        addresseeName: "Dr Michael Brown",
        addresseeClinic: "BJC Health",
      },
    });
    formatExtractedDataMock.mockReturnValue({
      ...baseFormattedData,
      sender: "Dr Sarah Jones (Springfield Medical)",
      addressee: "Dr Michael Brown (BJC Health)",
    });

    const response = await POST(createConvertRequest());
    const data = await response.json();

    // Check OBR-16 has sender info
    const obrSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("OBR|"));
    expect(obrSegment).toContain("1234567A^Jones^Sarah^^^DR^^^AUSHICPR");

    // Check PV1-9 has addressee (no explicit orderingProvider, so addressee fills it)
    const pv1Segment = data.hl7Content.split("\r").find((s: string) => s.startsWith("PV1|"));
    expect(pv1Segment).toContain("^Brown^Michael^^^DR");

    // Check extractedData includes sender/addressee for display
    expect(data.extractedData.sender).toBe("Dr Sarah Jones (Springfield Medical)");
    expect(data.extractedData.addressee).toBe("Dr Michael Brown (BJC Health)");
  });

  test("accepts pathology_result documents and produces ORU^R01 with LAB section + Pathology Result label", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
    });

    const response = await POST(
      createConvertRequest({
        documentType: "pathology_result",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.extractedData.messageType).toBe("ORU (Result)");

    const segments = data.hl7Content.split("\r");
    const mshFields = segments.find((s: string) => s.startsWith("MSH|"))!.split("|");
    const obrFields = segments.find((s: string) => s.startsWith("OBR|"))!.split("|");

    expect(mshFields[8]).toBe("ORU^R01");
    expect(obrFields[24]).toBe("LAB");
    expect(obrFields[4]).toContain("Pathology Result");
  });

  test("accepts radiology_result documents and produces ORU^R01 with RAD section + Radiology Result label", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "radiology_result",
    });

    const response = await POST(
      createConvertRequest({
        documentType: "radiology_result",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.extractedData.messageType).toBe("ORU (Result)");

    const segments = data.hl7Content.split("\r");
    const mshFields = segments.find((s: string) => s.startsWith("MSH|"))!.split("|");
    const obrFields = segments.find((s: string) => s.startsWith("OBR|"))!.split("|");

    expect(mshFields[8]).toBe("ORU^R01");
    expect(obrFields[24]).toBe("RAD");
    expect(obrFields[4]).toContain("Radiology Result");
  });

  test("referral_letter still routes to PHY in OBR-24 and uses Referral label", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "referral_letter",
    });

    const response = await POST(createConvertRequest());
    const data = await response.json();

    const segments = data.hl7Content.split("\r");
    const obrFields = segments.find((s: string) => s.startsWith("OBR|"))!.split("|");

    expect(obrFields[24]).toBe("PHY");
    expect(obrFields[4]).toContain("Referral");
  });

  test("uses ORU^R01 message type for generic documents", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "generic",
    });

    const response = await POST(createConvertRequest());
    const data = await response.json();
    const mshSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("MSH|"));
    const mshFields = mshSegment.split("|");

    expect(mshFields[8]).toBe("ORU^R01");
  });

  test("carrier flows to MSH-3 and extractedData", async () => {
    const response = await POST(
      createConvertRequest({ carrier: "EMAIL" })
    );
    const data = await response.json();

    // MSH-3 should be EMAIL
    const mshSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("MSH|"));
    const mshFields = mshSegment.split("|");
    expect(mshFields[2]).toBe("EMAIL");

    // extractedData.carrier should reflect the value
    expect(data.extractedData.carrier).toBe("EMAIL");
  });

  test("defaults to SMECAI when no carrier provided", async () => {
    const response = await POST(createConvertRequest());
    const data = await response.json();

    // MSH-3 defaults to SMECAI
    const mshSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("MSH|"));
    const mshFields = mshSegment.split("|");
    expect(mshFields[2]).toBe("SMECAI");

    // extractedData.carrier defaults to SMECAI
    expect(data.extractedData.carrier).toBe("SMECAI");
  });

  test("returns a 500 when the conversion pipeline throws", async () => {
    extractPatientDataMock.mockRejectedValue(new Error("Bedrock crashed"));

    const response = await POST(createConvertRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      error: "Bedrock crashed",
    });
  });

  test("passes BJC_DOCTORS env var as doctor list to extraction", async () => {
    const original = process.env.BJC_DOCTORS;
    process.env.BJC_DOCTORS = "Maundrell, Ong, Swaraj";

    try {
      await POST(createConvertRequest());

      expect(extractPatientDataMock).toHaveBeenCalledWith(
        expect.any(Buffer),
        "auto",
        ["Maundrell", "Ong", "Swaraj"]
      );
    } finally {
      if (original === undefined) {
        delete process.env.BJC_DOCTORS;
      } else {
        process.env.BJC_DOCTORS = original;
      }
    }
  });
});

describe("POST /api/convert audit logging", () => {
  test("records audit row with source 'email' when X-Source: email", async () => {
    await POST(
      createConvertRequest({
        filename: "Smith_John_19800123.pdf",
        sourceHeader: "email",
      })
    );

    expect(recordConversionMock).toHaveBeenCalledTimes(1);
    const row = recordConversionMock.mock.calls[0][0];
    expect(row.source).toBe("email");
  });

  test("defaults source to 'web' when X-Source header is missing", async () => {
    await POST(createConvertRequest({ filename: "test.pdf" }));

    expect(recordConversionMock).toHaveBeenCalledTimes(1);
    const row = recordConversionMock.mock.calls[0][0];
    expect(row.source).toBe("web");
  });

  test("defaults source to 'web' when X-Source header is invalid (no 400)", async () => {
    const response = await POST(
      createConvertRequest({
        filename: "test.pdf",
        sourceHeader: "garbage",
      })
    );

    expect(response.status).toBe(200);
    expect(recordConversionMock).toHaveBeenCalledTimes(1);
    const row = recordConversionMock.mock.calls[0][0];
    expect(row.source).toBe("web");
  });

  test("audit row contains hashed filename + extension, never raw PHI", async () => {
    // Use a filename with name + DOB + Medicare number bundled together —
    // the worst-case real export filename pattern.
    await POST(
      createConvertRequest({
        filename: "Smith_John_DOB19800123_MEDICARE2950123456.pdf",
      })
    );

    const row = recordConversionMock.mock.calls[0][0];

    // Whitelist the allowed audit row keys. Anything else is a contract
    // violation — additions must go through code review.
    const allowedKeys = [
      "month",
      "ts",
      "documentType",
      "outcome",
      "source",
      "messageType",
      "diagnosticServiceSection",
      "filenameHash",
      "filenameExt",
      "fileSizeBytes",
      "durationMs",
      "warningCount",
    ].sort();
    expect(Object.keys(row).sort().filter((k) => row[k] !== undefined))
      .toEqual(
        expect.arrayContaining(["month", "ts", "outcome", "source", "filenameHash", "filenameExt"]),
      );
    for (const key of Object.keys(row)) {
      expect(allowedKeys).toContain(key);
    }

    expect(row.filenameHash).toMatch(/^[0-9a-f]{12}$/);
    expect(row.filenameExt).toBe(".pdf");

    // No PHI fields allowed — defensive, even though allowedKeys check covers it
    expect(row).not.toHaveProperty("filename");
    expect(row).not.toHaveProperty("firstName");
    expect(row).not.toHaveProperty("lastName");
    expect(row).not.toHaveProperty("dob");
    expect(row).not.toHaveProperty("medicareNo");
    expect(row).not.toHaveProperty("address");

    // No PHI substring leaks through ANY field — stringify the entire row
    // (the most aggressive check).
    const serialized = JSON.stringify(row);
    const sensitive = [
      "Smith",
      "smith",
      "John",
      "john",
      "19800123",
      "1980",
      "2950123456",
      "MEDICARE",
      "DOB",
    ];
    for (const token of sensitive) {
      expect(serialized).not.toContain(token);
    }
  });

  test("audit row records outcome 'ok' on success with messageType + section", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
    });

    await POST(
      createConvertRequest({
        documentType: "pathology_result",
        filename: "labs.pdf",
      })
    );

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.outcome).toBe("ok");
    expect(row.messageType).toBe("ORU^R01");
    expect(row.diagnosticServiceSection).toBe("LAB");
    expect(row.documentType).toBe("pathology_result");
    expect(typeof row.durationMs).toBe("number");
    expect(row.durationMs).toBeGreaterThanOrEqual(0);
    expect(row.fileSizeBytes).toBe(1024);
    expect(row.month).toMatch(/^\d{4}-\d{2}$/);
    expect(row.ts).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z#[0-9a-z]{6}$/);
    expect(row.warningCount).toBe(baseExtraction.warnings.length);
  });

  test("audit row records outcome 'fail' when extraction fails", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      success: false,
      data: {
        firstName: "UNKNOWN",
        lastName: "PATIENT",
        dob: "19000101",
        sex: "U" as const,
      },
      warnings: ["could not determine patient"],
      documentType: "generic",
    });

    await POST(createConvertRequest({ filename: "blank.pdf" }));

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.outcome).toBe("fail");
    expect(row.warningCount).toBe(1);
  });

  test("conversion still returns 200 when audit write throws", async () => {
    recordConversionMock.mockRejectedValue(new Error("DynamoDB down"));

    const response = await POST(createConvertRequest({ filename: "x.pdf" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
