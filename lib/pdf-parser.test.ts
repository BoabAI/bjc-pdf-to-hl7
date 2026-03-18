import { beforeEach, describe, expect, mock, test } from "bun:test";

const extractPatientDataWithVisionMock = mock();

mock.module("./vision-extractor", () => ({
  extractPatientDataWithVision: extractPatientDataWithVisionMock,
}));

const { extractPatientData, formatExtractedData } = await import("./pdf-parser");

const baseVisionResult = {
  success: true,
  data: {
    firstName: "Jane",
    lastName: "Smith",
    dob: "19920514",
    sex: "F" as const,
    phone: "0412 345 678",
    medicareNo: "1234567890",
    medicareRef: "3",
  },
  warnings: ["Using Bedrock vision"],
  model: "au.anthropic.claude-sonnet-4-6",
  documentType: "referral_letter" as const,
  tokensUsed: { input: 123, output: 45 },
};

beforeEach(() => {
  extractPatientDataWithVisionMock.mockReset();
  extractPatientDataWithVisionMock.mockResolvedValue(baseVisionResult);
});

describe("extractPatientData", () => {
  test("returns the Bedrock extraction result", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake");
    const result = await extractPatientData(pdfBuffer);

    expect(extractPatientDataWithVisionMock).toHaveBeenCalledWith(pdfBuffer, {
      documentTypeHint: undefined,
    });
    expect(result).toEqual({
      success: true,
      data: baseVisionResult.data,
      warnings: baseVisionResult.warnings,
      documentType: "referral_letter",
      extractionMethod: "vision",
    });
  });

  test("passes a forced document type hint to Bedrock", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 forced");
    extractPatientDataWithVisionMock.mockResolvedValue({
      ...baseVisionResult,
      documentType: "generic",
    });

    const result = await extractPatientData(pdfBuffer, "gp_referral");

    expect(extractPatientDataWithVisionMock).toHaveBeenCalledWith(pdfBuffer, {
      documentTypeHint: "gp_referral",
    });
    expect(result.documentType).toBe("gp_referral");
  });

  test("returns a failed vision result without any fallback path", async () => {
    extractPatientDataWithVisionMock.mockResolvedValue({
      ...baseVisionResult,
      success: false,
      warnings: [
        "Vision extraction failed: AWS credentials unavailable. In Amplify SSR, attach a compute role with Bedrock permissions; locally, configure AWS credentials.",
      ],
      data: {
        firstName: "UNKNOWN",
        lastName: "PATIENT",
        dob: "19000101",
        sex: "U" as const,
      },
      documentType: "generic",
    });

    const result = await extractPatientData(Buffer.from("%PDF-1.4 failure"));

    expect(result.success).toBe(false);
    expect(result.extractionMethod).toBe("vision");
    expect(result.warnings[0]).toContain("AWS credentials unavailable");
  });

  test("surfaces unexpected vision errors as extraction errors", async () => {
    extractPatientDataWithVisionMock.mockRejectedValue(
      new Error("Bedrock runtime unavailable")
    );

    const result = await extractPatientData(
      Buffer.from("%PDF-1.4 crash"),
      "consent_form"
    );

    expect(result.success).toBe(false);
    expect(result.documentType).toBe("consent_form");
    expect(result.warnings).toEqual([
      "Extraction error: Bedrock runtime unavailable",
    ]);
  });
});

describe("extractPatientData referralInfo pass-through", () => {
  test("passes referralInfo from vision result", async () => {
    extractPatientDataWithVisionMock.mockResolvedValue({
      ...baseVisionResult,
      referralInfo: {
        senderName: "Dr Sarah Jones",
        senderClinic: "Springfield Medical",
        addresseeName: "Dr Michael Brown",
      },
    });

    const result = await extractPatientData(Buffer.from("%PDF-1.4"));

    expect(result.referralInfo).toEqual({
      senderName: "Dr Sarah Jones",
      senderClinic: "Springfield Medical",
      addresseeName: "Dr Michael Brown",
    });
  });

  test("referralInfo is undefined when vision result has none", async () => {
    const result = await extractPatientData(Buffer.from("%PDF-1.4"));

    expect(result.referralInfo).toBeUndefined();
  });
});

describe("formatExtractedData", () => {
  test("formats HL7 date, sex, and Medicare display values", () => {
    const formatted = formatExtractedData({
      firstName: "Jane",
      lastName: "Smith",
      dob: "19920514",
      sex: "F",
      medicareNo: "1234567890",
      medicareRef: "3",
    });

    expect(formatted).toEqual({
      firstName: "Jane",
      lastName: "Smith",
      dob: "14/05/1992",
      sex: "Female",
      medicareNo: "1234567890-3",
    });
  });

  test("uses fallback display values when optional fields are missing", () => {
    const formatted = formatExtractedData({
      firstName: "Unknown",
      lastName: "Patient",
      dob: "19000101",
      sex: "U",
    });

    expect(formatted.sex).toBe("Unknown");
    expect(formatted.medicareNo).toBe("Not provided");
  });

  test("includes sender display string when referralInfo has senderName", () => {
    const formatted = formatExtractedData(
      { firstName: "Jane", lastName: "Smith", dob: "19920514", sex: "F" },
      { senderName: "Dr Sarah Jones", senderClinic: "Springfield Medical" }
    );

    expect(formatted.sender).toBe("Dr Sarah Jones (Springfield Medical)");
  });

  test("includes addressee display string when referralInfo has addresseeName", () => {
    const formatted = formatExtractedData(
      { firstName: "Jane", lastName: "Smith", dob: "19920514", sex: "F" },
      { addresseeName: "Dr Michael Brown", addresseeClinic: "BJC Health" }
    );

    expect(formatted.addressee).toBe("Dr Michael Brown (BJC Health)");
  });

  test("sender/addressee omitted when referralInfo not provided", () => {
    const formatted = formatExtractedData({
      firstName: "Jane",
      lastName: "Smith",
      dob: "19920514",
      sex: "F",
    });

    expect(formatted.sender).toBeUndefined();
    expect(formatted.addressee).toBeUndefined();
  });
});
