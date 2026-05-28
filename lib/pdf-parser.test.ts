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
  model: "au.anthropic.claude-opus-4-7",
  documentType: "referral" as const,
  classificationConfidence: 100,
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
      bjcDoctors: undefined,
      mailboxCategory: undefined,
    });
    expect(result).toEqual({
      success: true,
      data: baseVisionResult.data,
      warnings: baseVisionResult.warnings,
      documentType: "referral",
      extractionMethod: "vision",
      classificationConfidence: 100,
    });
  });

  test("passes a forced document type hint to Bedrock as an advisory tie-breaker", async () => {
    // The hint is forwarded to Bedrock via the prompt, but Bedrock's
    // classification is what the result reflects. When Bedrock agrees with
    // the hint, the result matches the hint.
    const pdfBuffer = Buffer.from("%PDF-1.4 hint-matches");
    extractPatientDataWithVisionMock.mockResolvedValue({
      ...baseVisionResult,
      documentType: "referral",
    });

    const result = await extractPatientData(pdfBuffer, "referral");

    expect(extractPatientDataWithVisionMock).toHaveBeenCalledWith(pdfBuffer, {
      documentTypeHint: "referral",
      bjcDoctors: undefined,
      mailboxCategory: undefined,
    });
    expect(result.documentType).toBe("referral");
  });

  test("Bedrock classification wins when it disagrees with the hint", async () => {
    // Regression test: previously the hint was authoritative
    // (`documentTypeHint ?? visionResult.documentType`), which would shadow
    // Bedrock's classification. If a caller passes `referral_letter` but the
    // PDF is actually a pathology result, the document must route as a
    // pathology result (ORU^R01/LAB), not a referral (REF^I12/PHY).
    const pdfBuffer = Buffer.from("%PDF-1.4 hint-disagrees");
    extractPatientDataWithVisionMock.mockResolvedValue({
      ...baseVisionResult,
      documentType: "pathology_result",
    });

    const result = await extractPatientData(pdfBuffer, "referral");

    expect(extractPatientDataWithVisionMock).toHaveBeenCalledWith(pdfBuffer, {
      documentTypeHint: "referral",
      bjcDoctors: undefined,
      mailboxHint: undefined,
    });
    expect(result.documentType).toBe("pathology_result");
  });

  test("uses Bedrock classification when no hint is provided", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 no-hint");
    extractPatientDataWithVisionMock.mockResolvedValue({
      ...baseVisionResult,
      documentType: "referral",
    });

    const result = await extractPatientData(pdfBuffer, "auto");

    expect(extractPatientDataWithVisionMock).toHaveBeenCalledWith(pdfBuffer, {
      documentTypeHint: undefined,
      bjcDoctors: undefined,
      mailboxHint: undefined,
    });
    expect(result.documentType).toBe("referral");
  });

  test("forwards bjcDoctors and mailboxHint to the vision extractor", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 letters");
    await extractPatientData(pdfBuffer, "auto", ["Dr A", "Dr B"], "referrals");
    expect(extractPatientDataWithVisionMock).toHaveBeenCalledWith(pdfBuffer, {
      documentTypeHint: undefined,
      bjcDoctors: ["Dr A", "Dr B"],
      mailboxHint: "referrals",
    });
  });

  test("falls back to the hint when extraction throws", async () => {
    // The catch path is the only place the hint may legitimately stand in for
    // a classification — Bedrock returned nothing usable.
    extractPatientDataWithVisionMock.mockRejectedValue(
      new Error("Bedrock runtime unavailable")
    );

    const result = await extractPatientData(
      Buffer.from("%PDF-1.4 catch"),
      "referral"
    );

    expect(result.success).toBe(false);
    expect(result.documentType).toBe("referral");
  });

  test("falls back to 'generic' when extraction throws and no hint is provided", async () => {
    extractPatientDataWithVisionMock.mockRejectedValue(
      new Error("Bedrock runtime unavailable")
    );

    const result = await extractPatientData(Buffer.from("%PDF-1.4 catch-no-hint"));

    expect(result.success).toBe(false);
    expect(result.documentType).toBe("generic");
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
