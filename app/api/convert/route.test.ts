import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { GET, POST } from "./route";
import { NextRequest } from "next/server";

const PDF_DIR = join(import.meta.dir, "../../../docs/input PDF");

// Helper: create a NextRequest with FormData containing a PDF file
function createConvertRequest(
  pdfPath: string,
  options?: {
    detectOnly?: boolean;
    documentType?: string;
    autoFile?: string;
    orderingProvider?: string;
    mimeType?: string;
    filename?: string;
  }
): NextRequest {
  const pdfBuffer = readFileSync(pdfPath);
  const blob = new Blob([pdfBuffer], { type: options?.mimeType ?? "application/pdf" });
  const file = new File([blob], options?.filename ?? "test.pdf", {
    type: options?.mimeType ?? "application/pdf",
  });

  const formData = new FormData();
  formData.append("pdf", file);

  if (options?.detectOnly) formData.append("detectOnly", "true");
  if (options?.documentType) formData.append("documentType", options.documentType);
  if (options?.autoFile !== undefined) formData.append("autoFile", options.autoFile);
  if (options?.orderingProvider) formData.append("orderingProvider", options.orderingProvider);

  return new NextRequest("http://localhost:3000/api/convert", {
    method: "POST",
    body: formData,
  });
}

// Helper: create a request with no file
function createEmptyRequest(): NextRequest {
  const formData = new FormData();
  return new NextRequest("http://localhost:3000/api/convert", {
    method: "POST",
    body: formData,
  });
}

// =============================================================================
// GET - Health Check
// =============================================================================

describe("GET /api/convert - Health Check", () => {
  test("returns ok status", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.service).toBe("PDF to HL7 Converter");
    expect(data.version).toBe("1.0.0");
  });
});

// =============================================================================
// POST - Validation
// =============================================================================

describe("POST /api/convert - Input Validation", () => {
  test("rejects request with no file", async () => {
    const req = createEmptyRequest();
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe("No PDF file provided");
  });

  test("rejects non-PDF file", async () => {
    const textBlob = new Blob(["hello world"], { type: "text/plain" });
    const file = new File([textBlob], "test.txt", { type: "text/plain" });

    const formData = new FormData();
    formData.append("pdf", file);

    const req = new NextRequest("http://localhost:3000/api/convert", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe("File must be a PDF");
  });

  test("rejects file exceeding 10MB", async () => {
    // Create a >10MB buffer
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 0);
    const blob = new Blob([largeBuffer], { type: "application/pdf" });
    const file = new File([blob], "large.pdf", { type: "application/pdf" });

    const formData = new FormData();
    formData.append("pdf", file);

    const req = new NextRequest("http://localhost:3000/api/convert", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe("File size exceeds 10MB limit");
  });
});

// =============================================================================
// POST - Successful Conversion
// =============================================================================

describe("POST /api/convert - Successful Conversion", () => {
  test("converts specialist referral to HL7", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"));
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.filename).toMatch(/WILLIAMS_Emma_\d+\.hl7$/);
    expect(data.hl7Content).toContain("MSH|");
    expect(data.hl7Content).toContain("PID|");
    expect(data.hl7Content).toContain("OBX|");
    expect(data.extractedData.firstName).toBe("Emma");
    expect(data.extractedData.lastName).toBe("WILLIAMS");
  });

  test("converts GP referral to HL7", async () => {
    const req = createConvertRequest(join(PDF_DIR, "gp-referrals/test_gp_referral.pdf"));
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.extractedData.firstName).toBe("Sarah");
    expect(data.extractedData.lastName).toBe("Thompson");
    expect(data.extractedData.sex).toBe("Female");
  });

  test("converts consent form to HL7", async () => {
    const req = createConvertRequest(join(PDF_DIR, "consent-forms/test_consent_form.pdf"));
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.extractedData.firstName).toBe("James");
    expect(data.extractedData.lastName).toBe("Patterson");
  });

  test("HL7 content contains embedded PDF as Base64", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"));
    const response = await POST(req);
    const data = await response.json();

    expect(data.hl7Content).toContain("^application^pdf^Base64^");
  });

  test("HL7 uses CR-only terminators", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"));
    const response = await POST(req);
    const data = await response.json();

    expect(data.hl7Content).toContain("\r");
    expect(data.hl7Content).not.toContain("\n");
  });

  test("returns warnings array", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"));
    const response = await POST(req);
    const data = await response.json();

    expect(Array.isArray(data.warnings)).toBe(true);
  });
});

// =============================================================================
// POST - Detect Only Mode
// =============================================================================

describe("POST /api/convert - Detect Only Mode", () => {
  test("returns only document type for specialist referral", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"), {
      detectOnly: true,
    });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.documentType).toBe("referral_letter");
    // Should NOT include HL7 content in detect-only mode
    expect(data.hl7Content).toBeUndefined();
    expect(data.filename).toBeUndefined();
  });

  test("returns gp_referral for GP referral", async () => {
    const req = createConvertRequest(join(PDF_DIR, "gp-referrals/test_gp_referral.pdf"), {
      detectOnly: true,
    });
    const response = await POST(req);
    const data = await response.json();

    expect(data.documentType).toBe("gp_referral");
  });

  test("returns consent_form for consent form", async () => {
    const req = createConvertRequest(join(PDF_DIR, "consent-forms/test_consent_form.pdf"), {
      detectOnly: true,
    });
    const response = await POST(req);
    const data = await response.json();

    expect(data.documentType).toBe("consent_form");
  });
});

// =============================================================================
// POST - Document Type Override
// =============================================================================

describe("POST /api/convert - Document Type Override", () => {
  test("forces consent_form document type", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"), {
      detectOnly: true,
      documentType: "consent_form",
    });
    const response = await POST(req);
    const data = await response.json();

    expect(data.documentType).toBe("consent_form");
  });

  test("forces gp_referral document type", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"), {
      detectOnly: true,
      documentType: "gp_referral",
    });
    const response = await POST(req);
    const data = await response.json();

    expect(data.documentType).toBe("gp_referral");
  });

  test("ignores invalid document type (falls back to auto)", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"), {
      detectOnly: true,
      documentType: "invalid_type",
    });
    const response = await POST(req);
    const data = await response.json();

    // Should auto-detect since "invalid_type" is not a valid DocumentType
    expect(data.documentType).toBe("referral_letter");
  });
});

// =============================================================================
// POST - Genie Options
// =============================================================================

describe("POST /api/convert - Genie Options", () => {
  test("defaults to auto-file (OBR-25 = F)", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"));
    const response = await POST(req);
    const data = await response.json();

    // OBR segment should contain F for Final (auto-file)
    const obrSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("OBR|"));
    const obrFields = obrSegment.split("|");
    expect(obrFields[25]).toBe("F");
  });

  test("sets Preliminary when autoFile=false (OBR-25 = P)", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"), {
      autoFile: "false",
    });
    const response = await POST(req);
    const data = await response.json();

    const obrSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("OBR|"));
    const obrFields = obrSegment.split("|");
    expect(obrFields[25]).toBe("P");
  });

  test("includes ordering provider in PV1-9", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"), {
      orderingProvider: "457833CF",
    });
    const response = await POST(req);
    const data = await response.json();

    const pv1Segment = data.hl7Content.split("\r").find((s: string) => s.startsWith("PV1|"));
    expect(pv1Segment).toContain("457833CF^^^AUSHICPR");
  });

  test("omits ordering provider when not specified", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"));
    const response = await POST(req);
    const data = await response.json();

    const pv1Segment = data.hl7Content.split("\r").find((s: string) => s.startsWith("PV1|"));
    expect(pv1Segment).not.toContain("AUSHICPR");
  });

  test("uses filename (sans .pdf) as document title", async () => {
    const req = createConvertRequest(join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf"), {
      filename: "Specialist_Referral_Dr_Chen.pdf",
    });
    const response = await POST(req);
    const data = await response.json();

    const obrSegment = data.hl7Content.split("\r").find((s: string) => s.startsWith("OBR|"));
    expect(obrSegment).toContain("Specialist_Referral_Dr_Chen");
  });
});

// =============================================================================
// POST - End-to-End with All Document Types (including new categories)
// =============================================================================

describe("POST /api/convert - End-to-End All Types", () => {
  const testCases = [
    { file: "specialist-referrals/test_specialist_referral.pdf", name: "WILLIAMS", first: "Emma" },
    { file: "specialist-referrals/test_specialist_referral_reverse_name.pdf", name: "JOHNSON", first: "Robert" },
    { file: "gp-referrals/test_gp_referral.pdf", name: "Thompson", first: "Sarah" },
    { file: "gp-referrals/test_gp_referral_male.pdf", name: "O'Connor", first: "David" },
    { file: "gp-referrals/test_gp_referral_miss.pdf", name: "Khan", first: "Aisha" },
    { file: "consent-forms/test_consent_form.pdf", name: "Patterson", first: "James" },
    { file: "consent-forms/test_consent_form_female.pdf", name: "Sharma", first: "Priya" },
    { file: "edge-cases/minimal/test_edge_special_chars.pdf", name: "O'Brien-Smith", first: "Mary" },
    { file: "edge-cases/states/test_edge_qld_patient.pdf", name: "Brown", first: "Lisa" },
    { file: "edge-cases/states/test_edge_nt_patient.pdf", name: "Cooper", first: "Daniel" },
    // Skewed documents
    { file: "edge-cases/skewed/test_skewed_specialist.pdf", name: "CHEN", first: "Michael" },
    { file: "edge-cases/skewed/test_skewed_gp_referral.pdf", name: "Morris", first: "Angela" },
    // Grainy documents
    { file: "edge-cases/grainy/test_grainy_specialist.pdf", name: "GREEN", first: "Rachel" },
    { file: "edge-cases/grainy/test_grainy_gp_referral.pdf", name: "Harris", first: "Graham" },
    // Multicultural names
    { file: "edge-cases/multicultural/test_multicultural_vietnamese.pdf", name: "Nguyen", first: "Mai" },
    { file: "edge-cases/multicultural/test_multicultural_chinese.pdf", name: "ZHANG", first: "Wei" },
    { file: "edge-cases/multicultural/test_multicultural_arabic.pdf", name: "Al-Rashidi", first: "Mohammed" },
    { file: "edge-cases/multicultural/test_multicultural_greek.pdf", name: "Papadopoulos", first: "Eleni" },
    { file: "edge-cases/multicultural/test_multicultural_pacific_islander.pdf", name: "TUPOU", first: "Sione" },
    { file: "edge-cases/multicultural/test_multicultural_korean.pdf", name: "Kim", first: "Jiyeon" },
    { file: "edge-cases/multicultural/test_multicultural_lebanese.pdf", name: "El-Masri", first: "Layla" },
  ];

  for (const tc of testCases) {
    test(`converts ${tc.file.split("/").pop()} -> ${tc.first} ${tc.name}`, async () => {
      const req = createConvertRequest(join(PDF_DIR, tc.file));
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.extractedData.firstName).toBe(tc.first);
      expect(data.extractedData.lastName).toBe(tc.name);
      expect(data.hl7Content).toContain("MSH|");
      expect(data.hl7Content).toContain("^application^pdf^Base64^");
    });
  }
});
