import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const extractPatientDataMock = mock();
const formatExtractedDataMock = mock();

mock.module("@/lib/pdf-parser", () => ({
  extractPatientData: extractPatientDataMock,
  formatExtractedData: formatExtractedDataMock,
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

  return new NextRequest("http://localhost:3000/api/convert", {
    method: "POST",
    body: formData,
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
  extractPatientDataMock.mockResolvedValue(baseExtraction);
  formatExtractedDataMock.mockReturnValue(baseFormattedData);
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
