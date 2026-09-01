import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

import { DEFAULT_BJC_DOCTORS } from "@/lib/conversion-config";

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
  buildPatientInitials: (firstName: string | undefined, lastName: string | undefined) => {
    const f = firstName?.trim();
    const l = lastName?.trim();
    if (!f || !l) return undefined;
    if (f.toUpperCase() === "UNKNOWN" && l.toUpperCase() === "PATIENT") {
      return undefined;
    }
    return `${f.charAt(0).toUpperCase()}.${l.charAt(0).toUpperCase()}.`;
  },
  // Pass-through: build-row.test.ts covers real redaction.
  redactWarning: (message: string) => {
    if (typeof message !== "string") return undefined;
    const trimmed = message.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
}));

// Mock Auth.js: passthrough that injects request.auth from the x-test-auth
// header. Allows existing tests to run authed by default; new tests can omit
// the header to cover the unauthed branch.
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

// convertPdf loads the doctor roster from the DynamoDB reference data when
// the request supplies none — mocked here so tests never touch real DDB.
const listDoctorsMock = mock();

mock.module("@/lib/reference-data-store", () => ({
  listDoctors: listDoctorsMock,
}));

const PAD_TOKEN = "p".repeat(32);
process.env.PAD_TOKEN = PAD_TOKEN;

const routeModule = await import("./route");
const GET = routeModule.GET;
const POST = routeModule.POST as unknown as (req: NextRequest) => Promise<Response>;

// Genie-format roster as served by the reference-data store.
const ddbRosterDoctors = [
  { id: "doctor-irwin-lim", name: "Dr I Lim", providerNumber: "" },
  { id: "doctor-herman-lau", name: "Dr H Lau", providerNumber: "" },
];
const DDB_ROSTER_NAMES = ["Dr I Lim", "Dr H Lau"];

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
  documentType: "referral" as const,
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
    mailboxHeader?: string | null;
    authHeader?: string | null;
    /** Set to false to omit the x-test-auth header (no session). */
    authenticated?: boolean;
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
  if (options?.authenticated !== false) {
    headers["x-test-auth"] = "alice@bjchealth.com.au";
  }
  if (options?.sourceHeader !== undefined && options.sourceHeader !== null) {
    headers["x-source"] = options.sourceHeader;
  }
  if (options?.mailboxHeader !== undefined && options.mailboxHeader !== null) {
    headers["x-source-mailbox"] = options.mailboxHeader;
  }
  if (options?.authHeader !== undefined && options.authHeader !== null) {
    headers["authorization"] = options.authHeader;
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
    headers: { "x-test-auth": "alice@bjchealth.com.au" },
  });
}

beforeEach(() => {
  extractPatientDataMock.mockReset();
  formatExtractedDataMock.mockReset();
  recordConversionMock.mockReset();
  listDoctorsMock.mockReset();
  extractPatientDataMock.mockResolvedValue(baseExtraction);
  formatExtractedDataMock.mockReturnValue(baseFormattedData);
  recordConversionMock.mockResolvedValue(undefined);
  listDoctorsMock.mockResolvedValue(ddbRosterDoctors);
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

describe("POST /api/convert PAD email-pipeline auth", () => {
  test("rejects X-Source: email with no Authorization header (closes the bypass)", async () => {
    const response = await POST(
      createConvertRequest({
        filename: "ref.pdf",
        sourceHeader: "email",
        authenticated: false,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ success: false, error: "Unauthorized" });
    // No audit row should be written for an unauthenticated rejection — the
    // request never reached the conversion pipeline.
    expect(recordConversionMock).not.toHaveBeenCalled();
  });

  test("rejects X-Source: email with a wrong bearer token", async () => {
    const response = await POST(
      createConvertRequest({
        filename: "ref.pdf",
        sourceHeader: "email",
        authenticated: false,
        authHeader: `Bearer ${"y".repeat(32)}`,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ success: false, error: "Unauthorized" });
    expect(recordConversionMock).not.toHaveBeenCalled();
  });

  test("rejects X-Source: email with a malformed Authorization header", async () => {
    const response = await POST(
      createConvertRequest({
        filename: "ref.pdf",
        sourceHeader: "email",
        authenticated: false,
        authHeader: `Basic ${PAD_TOKEN}`,
      })
    );
    expect(response.status).toBe(401);
  });

  test("rejects X-Source: email even when a session cookie is present (PAD path requires PAD token)", async () => {
    // Web users must use source=web. Setting source=email should NOT let a
    // session cookie satisfy the auth check — that would re-open the bypass
    // for any authenticated browser user impersonating the pipeline.
    const response = await POST(
      createConvertRequest({
        filename: "ref.pdf",
        sourceHeader: "email",
        authenticated: true,
      })
    );
    expect(response.status).toBe(401);
  });

  test("accepts X-Source: email with a valid bearer token (no session)", async () => {
    const response = await POST(
      createConvertRequest({
        filename: "ref.pdf",
        sourceHeader: "email",
        authenticated: false,
        authHeader: `Bearer ${PAD_TOKEN}`,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test("rejects X-Source: web with no session cookie", async () => {
    const response = await POST(
      createConvertRequest({
        filename: "ref.pdf",
        sourceHeader: "web",
        authenticated: false,
      })
    );
    expect(response.status).toBe(401);
  });

  test("rejects an unauthenticated request with no X-Source (defaults to web)", async () => {
    const response = await POST(
      createConvertRequest({
        filename: "ref.pdf",
        authenticated: false,
      })
    );
    expect(response.status).toBe(401);
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

    expect(extractPatientDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "auto",
      DDB_ROSTER_NAMES,
      undefined
    );
    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      documentType: "referral",
    });
  });

  test("passes a forced document type to extraction", async () => {
    await POST(
      createConvertRequest({
        detectOnly: true,
        documentType: "referral",
      })
    );

    expect(extractPatientDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "referral",
      DDB_ROSTER_NAMES,
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

    expect(extractPatientDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "auto",
      DDB_ROSTER_NAMES,
      undefined
    );
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
      documentType: "referral",
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
      documentType: "referral",
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
      documentType: "referral",
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
      documentType: "referral",
    });

    const response = await POST(createConvertRequest());
    const data = await response.json();

    const segments = data.hl7Content.split("\r");
    const obrFields = segments.find((s: string) => s.startsWith("OBR|"))!.split("|");

    expect(obrFields[24]).toBe("PHY");
    expect(obrFields[4]).toContain("Referral");
  });

  test("generic documents divert to manual_review (no HL7)", async () => {
    // The new eligibility gate never auto-routes `generic` — it's the model's
    // bail-out value. The route returns 200 + action: "manual_review" so PAD
    // (or the web UI queue) can surface the doc for human triage.
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "generic",
    });

    const response = await POST(createConvertRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.action).toBe("manual_review");
    expect(data.reason).toBe("unknown_doc_type");
    expect(data.hl7Content).toBeUndefined();
  });

  test("urgent pathology_result diverts to manual_review (no HL7, 200 not 422)", async () => {
    // Urgent results never auto-file — the eligibility gate diverts them to
    // manual review with reason "urgent_result" and emits no HL7. The route
    // returns 200 (manual_review), NOT 422 (which is reserved for the strict
    // missing_fields bridge).
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
      isUrgent: true,
      referralInfo: {
        senderName: "Douglass Hanly Moir Pathology",
        addresseeName: "Dr Sarah Smith",
      },
    });

    const response = await POST(
      createConvertRequest({
        documentType: "pathology_result",
        filename: "urgent-labs.pdf",
        mailboxHeader: "results",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.action).toBe("manual_review");
    expect(data.reason).toBe("urgent_result");
    expect(data.hl7Content).toBeUndefined();
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
        ["Maundrell", "Ong", "Swaraj"],
        undefined
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

describe("POST /api/convert doctor roster + addressee snap", () => {
  test("PAD requests (no form field, no env) get the DynamoDB reference-data roster", async () => {
    await POST(
      createConvertRequest({
        filename: "fax.pdf",
        sourceHeader: "email",
        authenticated: false,
        authHeader: `Bearer ${PAD_TOKEN}`,
      })
    );

    expect(listDoctorsMock).toHaveBeenCalledTimes(1);
    expect(extractPatientDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "auto",
      DDB_ROSTER_NAMES,
      undefined
    );
  });

  test("falls back to the seeded default roster when DynamoDB fails", async () => {
    listDoctorsMock.mockRejectedValue(new Error("ddb unavailable"));

    const response = await POST(createConvertRequest());

    expect(response.status).toBe(200);
    expect(extractPatientDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "auto",
      DEFAULT_BJC_DOCTORS.map((d) => d.name),
      undefined
    );
  });

  test("snaps a full-name radiology addressee onto the Genie-format roster entry in the HL7", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "radiology_result" as const,
      referralInfo: {
        senderName: "Dr Amanda Wong",
        addresseeName: "Dr Irwin Geok San Lim",
      },
    });

    const response = await POST(createConvertRequest({ filename: "xray.pdf" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.action).toBe("auto_routed");
    // PV1-9 and OBR-16 must carry the Genie-format name, not the document's.
    expect(data.hl7Content).toContain("^Lim^I^^^DR");
    expect(data.hl7Content).not.toContain("Irwin Geok San");
  });

  test("promotes a CC'd BJC doctor over an external primary addressee (REF^I12)", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      referralInfo: {
        senderName: "Dr Sarah Chen",
        addresseeName: "Dr Brendan Cantwell",
        addresseeClinic: "St Vincent's Clinic",
        ccNames: [
          "Dr Herman Lau Level 1, 17-21 Hunter Street, PARRAMATTA NSW 2150 0283826809, 0298907655",
        ],
      },
    });

    const response = await POST(createConvertRequest({ filename: "letter.pdf" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.action).toBe("auto_routed");
    expect(data.hl7Content).toContain("Lau^H");
    expect(data.hl7Content).not.toContain("Cantwell");
    expect(data.warnings).toContain("Addressee promoted from CC line: Dr H Lau");
  });
});

describe("POST /api/convert audit logging", () => {
  test("records audit row with source 'email' when X-Source: email + valid PAD token", async () => {
    await POST(
      createConvertRequest({
        filename: "Smith_John_19800123.pdf",
        sourceHeader: "email",
        authenticated: false,
        authHeader: `Bearer ${PAD_TOKEN}`,
      })
    );

    expect(recordConversionMock).toHaveBeenCalledTimes(1);
    const row = recordConversionMock.mock.calls[0][0];
    expect(row.source).toBe("email");
    // PAD calls have no Auth.js session — userEmail records the service identity.
    expect(row.userEmail).toBe("service:pad-pipeline");
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

  test("audit row contentHash is sha256 of the uploaded bytes, independent of filename", async () => {
    const sizeBytes = 2048;
    const bytes = new Uint8Array(sizeBytes);
    bytes.set(Buffer.from("%PDF-1.4"));
    const expected = createHash("sha256").update(bytes).digest("hex").slice(0, 12);

    await POST(createConvertRequest({ filename: "temp.pdf", sizeBytes }));
    await POST(createConvertRequest({ filename: "Other_Name.pdf", sizeBytes }));

    expect(recordConversionMock).toHaveBeenCalledTimes(2);
    const [first, second] = recordConversionMock.mock.calls.map((c) => c[0]);
    expect(first.contentHash).toBe(expected);
    expect(second.contentHash).toBe(expected);
    expect(first.filenameHash).not.toBe(second.filenameHash);
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
      // sha256(pdf bytes)[0:12] — what staff verify with shasum / Get-FileHash.
      "contentHash",
      "fileSizeBytes",
      "durationMs",
      "warningCount",
      // Sanitised warning messages (PHI-shaped entries dropped, capped at 10).
      "warnings",
      // Operator identity from Auth.js session — required for compliance.
      // Not patient PHI; covered by the substring leak check below.
      "userEmail",
      // F.L. initials only — operational identifier for staff who already
      // hold the source PDFs. Substring leak check below confirms full
      // names never appear.
      "patientInitials",
      // Upstream mailbox the PDF arrived in (referrals|results) and a
      // boolean flag when the LLM family classification disagreed with it.
      // Routing metadata, not PHI.
      "mailboxHint",
      "mailboxDisagreement",
      // Nicole refactor: mailbox category derived from x-source-mailbox,
      // routing decision (auto/manual), and reason for manual review. All
      // operational metadata — no PHI.
      "mailboxCategory",
      "routingDecision",
      "routingReason",
      "suggestedCategory",
      "classificationConfidence",
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
    expect(row.contentHash).toMatch(/^[0-9a-f]{12}$/);
    expect(row.contentHash).not.toBe(row.filenameHash);

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
      // Provide a roster addressee so OBR-16 is populated and neither the
      // OBR-16-missing nor the unmatched-addressee warning is appended — this
      // test is asserting the happy-path audit row.
      referralInfo: {
        senderName: "Douglass Hanly Moir Pathology",
        addresseeName: "Dr I Lim",
      },
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
    expect(row.patientInitials).toBeUndefined();
  });

  test("audit row records patient initials in F.L. form on success", async () => {
    await POST(createConvertRequest({ filename: "ref.pdf" }));

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.outcome).toBe("ok");
    // baseExtraction = Jane Smith → "J.S."
    expect(row.patientInitials).toBe("J.S.");
  });

  test("conversion still returns 200 when audit write throws", async () => {
    recordConversionMock.mockRejectedValue(new Error("DynamoDB down"));

    const response = await POST(createConvertRequest({ filename: "x.pdf" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe("POST /api/convert X-Source-Mailbox header", () => {
  test("forwards mailboxHint='referrals' to extraction and writes to audit row", async () => {
    await POST(
      createConvertRequest({
        filename: "ref.pdf",
        mailboxHeader: "referrals",
      })
    );

    expect(extractPatientDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "auto",
      DDB_ROSTER_NAMES,
      "referrals"
    );

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxHint).toBe("referrals");
  });

  test("forwards mailboxHint='results' to extraction", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
    });

    await POST(
      createConvertRequest({
        filename: "labs.pdf",
        mailboxHeader: "results",
      })
    );

    expect(extractPatientDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "auto",
      DDB_ROSTER_NAMES,
      "results"
    );

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxHint).toBe("results");
  });

  test("ignores invalid mailbox header values", async () => {
    await POST(
      createConvertRequest({
        filename: "ref.pdf",
        mailboxHeader: "garbage",
      })
    );

    expect(extractPatientDataMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      "auto",
      DDB_ROSTER_NAMES,
      undefined
    );

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxHint).toBeUndefined();
  });

  test("normalizes mailbox header case + whitespace", async () => {
    await POST(
      createConvertRequest({
        filename: "ref.pdf",
        mailboxHeader: "  REFERRALS  ",
      })
    );

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxHint).toBe("referrals");
  });

  test("flags mailboxDisagreement=true when referrals mailbox returns a result classification", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
    });

    const response = await POST(
      createConvertRequest({
        filename: "misroute.pdf",
        mailboxHeader: "referrals",
      })
    );
    const data = await response.json();

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxDisagreement).toBe(true);
    expect(data.mailboxDisagreement).toBe(true);
    expect(data.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Mailbox/content mismatch"),
      ])
    );
  });

  test("flags mailboxDisagreement=true when results mailbox returns a referral classification", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "referral",
    });

    const response = await POST(
      createConvertRequest({
        filename: "misroute.pdf",
        mailboxHeader: "results",
      })
    );
    const data = await response.json();

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxDisagreement).toBe(true);
    expect(data.mailboxDisagreement).toBe(true);
  });

  test("does not flag disagreement for consent_form or generic on either mailbox", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "consent_form",
    });

    const response = await POST(
      createConvertRequest({
        filename: "consent.pdf",
        mailboxHeader: "referrals",
      })
    );
    const data = await response.json();

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxDisagreement).toBeUndefined();
    expect(data.mailboxDisagreement).toBeUndefined();
  });

  test("does not flag disagreement when classification matches mailbox family", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "referral",
    });

    const response = await POST(
      createConvertRequest({
        filename: "ref.pdf",
        mailboxHeader: "referrals",
      })
    );
    const data = await response.json();

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxDisagreement).toBeUndefined();
    expect(data.mailboxDisagreement).toBeUndefined();
  });

  test("LLM verdict still drives routing — disagreement is a flag, not an override", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
    });

    const response = await POST(
      createConvertRequest({
        filename: "misroute.pdf",
        mailboxHeader: "referrals",
      })
    );
    const data = await response.json();

    // Even with the disagreement flag, the HL7 reflects the LLM's call:
    // ORU^R01 + LAB section, not REF^I12.
    const segments = data.hl7Content.split("\r");
    const mshFields = segments.find((s: string) => s.startsWith("MSH|"))!.split("|");
    const obrFields = segments.find((s: string) => s.startsWith("OBR|"))!.split("|");

    expect(mshFields[8]).toBe("ORU^R01");
    expect(obrFields[24]).toBe("LAB");

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.messageType).toBe("ORU^R01");
    expect(row.diagnosticServiceSection).toBe("LAB");
    expect(row.mailboxDisagreement).toBe(true);
  });
});

describe("POST /api/convert OBR-16 missing (results documents)", () => {
  let originalStrict: string | undefined;

  beforeEach(() => {
    originalStrict = process.env.STRICT_REQUIRED_FIELDS;
    delete process.env.STRICT_REQUIRED_FIELDS;
  });

  afterEach(() => {
    if (originalStrict === undefined) delete process.env.STRICT_REQUIRED_FIELDS;
    else process.env.STRICT_REQUIRED_FIELDS = originalStrict;
  });

  test("lenient default: pathology_result without addresseeName returns 200 + warning", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
      // Lab is the sender. No addresseeName resolved → OBR-16 missing.
      referralInfo: {
        senderName: "Douglass Hanly Moir Pathology",
      },
    });

    const response = await POST(
      createConvertRequest({ filename: "labs.pdf" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.warnings).toEqual(
      expect.arrayContaining([
        "OBR-16 (Ordered By) missing for pathology_result",
      ])
    );

    // Audit row records ok + warning so ops can chase the gap.
    const row = recordConversionMock.mock.calls[0][0];
    expect(row.outcome).toBe("ok");
    expect(row.warnings).toEqual(
      expect.arrayContaining([
        "OBR-16 (Ordered By) missing for pathology_result",
      ])
    );
  });

  test("lenient default: pathology_result WITH addresseeName has no OBR-16 warning", async () => {
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
      referralInfo: {
        senderName: "Douglass Hanly Moir Pathology",
        addresseeName: "Dr Sarah Smith",
      },
    });

    const response = await POST(
      createConvertRequest({ filename: "labs.pdf" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    const obr16Warning = (data.warnings as string[] | undefined)?.find(
      (w) => w.startsWith("OBR-16")
    );
    expect(obr16Warning).toBeUndefined();
  });

  test("strict mode: pathology_result without addresseeName returns 422 + audit fail", async () => {
    process.env.STRICT_REQUIRED_FIELDS = "true";
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
      referralInfo: {
        senderName: "Douglass Hanly Moir Pathology",
      },
    });

    const response = await POST(
      createConvertRequest({ filename: "labs.pdf" })
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data).toEqual(
      expect.objectContaining({
        success: false,
        error:
          "Required field missing: OBR-16 (Ordered By) for pathology/radiology result",
      })
    );

    // Audit row should record outcome=fail with the same warning.
    const row = recordConversionMock.mock.calls[0][0];
    expect(row.outcome).toBe("fail");
    expect(row.warnings).toEqual(
      expect.arrayContaining([
        "OBR-16 (Ordered By) missing for pathology_result",
      ])
    );
  });

  test("strict mode: radiology_result without addresseeName returns 422", async () => {
    process.env.STRICT_REQUIRED_FIELDS = "true";
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "radiology_result",
      referralInfo: {
        senderName: "PRP Imaging",
      },
    });

    const response = await POST(
      createConvertRequest({ filename: "scan.pdf" })
    );
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.success).toBe(false);
  });

  test("strict mode: pathology_result WITH addresseeName returns 200 (no OBR-16 warning)", async () => {
    process.env.STRICT_REQUIRED_FIELDS = "true";
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "pathology_result",
      referralInfo: {
        senderName: "Douglass Hanly Moir Pathology",
        addresseeName: "Dr Sarah Smith",
      },
    });

    const response = await POST(
      createConvertRequest({ filename: "labs.pdf" })
    );

    expect(response.status).toBe(200);
  });

  test("strict mode: referral_letter with no senderName does not 422 (only results gated)", async () => {
    // OBR-16 missing is currently only enforced for results documents. A
    // referral with no senderName should still go through (the existing
    // referral failure modes are unchanged by strict mode).
    process.env.STRICT_REQUIRED_FIELDS = "true";
    extractPatientDataMock.mockResolvedValue({
      ...baseExtraction,
      documentType: "referral",
      referralInfo: {
        addresseeName: "Dr Michael Brown",
      },
    });

    const response = await POST(
      createConvertRequest({ filename: "ref.pdf" })
    );

    expect(response.status).toBe(200);
  });
});

describe("POST /api/convert X-Source-Mailbox address persistence", () => {
  test("persists an address-shaped mailbox header as mailboxAddress (normalised)", async () => {
    await POST(
      createConvertRequest({
        filename: "fax.pdf",
        mailboxHeader: " GoFax.Par@bjchealth.com.au ",
      })
    );

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxAddress).toBe("gofax.par@bjchealth.com.au");
    // The legacy enum field is untouched by an address-shaped header.
    expect(row.mailboxHint).toBeUndefined();
  });

  test("does not persist mailboxAddress for the legacy enum header", async () => {
    await POST(
      createConvertRequest({
        filename: "ref.pdf",
        mailboxHeader: "results",
      })
    );

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxAddress).toBeUndefined();
  });

  test("does not persist mailboxAddress when the header is absent", async () => {
    await POST(createConvertRequest({ filename: "ref.pdf" }));

    const row = recordConversionMock.mock.calls[0][0];
    expect(row.mailboxAddress).toBeUndefined();
  });
});
