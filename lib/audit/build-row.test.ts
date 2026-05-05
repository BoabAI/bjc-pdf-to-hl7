import { describe, expect, test } from "bun:test";
import {
  buildConversionAuditRow,
  buildFailureAuditRow,
  type AuditRowMeta,
} from "./build-row";
import type { ConvertResult } from "@/lib/convert-service";

const FIXED_NOW = new Date("2026-04-30T01:23:45.000Z");

const baseMeta: AuditRowMeta = {
  source: "web",
  userEmail: "alice@bjchealth.com.au",
  mailboxHint: undefined,
  originalFilename: "Smith_John_DOB19800123.pdf",
  fileSizeBytes: 4096,
  startedAtMs: 1_000,
  finishedAtMs: 1_250,
  now: FIXED_NOW,
};

const baseExtractedData = {
  firstName: "Jane",
  lastName: "Smith",
  dob: "14/05/1992",
  sex: "Female",
  medicareNo: "1234567890-3",
  date: "30/04/2026",
  messageType: "REF (Referral)",
  carrier: "SMECAI",
};

const baseSuccess: ConvertResult = {
  success: true,
  filename: "Smith_Jane_20260430012345.hl7",
  hl7Content: "MSH|...",
  extractedData: baseExtractedData,
  warnings: ["Using Bedrock vision"],
  extractionMethod: "vision",
  documentType: "referral_letter",
};

describe("buildConversionAuditRow", () => {
  test("success ORU result records messageType ORU^R01 and LAB section", () => {
    const result: ConvertResult = {
      ...baseSuccess,
      documentType: "pathology_result",
    };

    const row = buildConversionAuditRow(baseMeta, result);

    expect(row.outcome).toBe("ok");
    expect(row.messageType).toBe("ORU^R01");
    expect(row.diagnosticServiceSection).toBe("LAB");
    expect(row.documentType).toBe("pathology_result");
  });

  test("success REF result records messageType REF^I12 and PHY section", () => {
    const row = buildConversionAuditRow(baseMeta, baseSuccess);

    expect(row.outcome).toBe("ok");
    expect(row.messageType).toBe("REF^I12");
    expect(row.diagnosticServiceSection).toBe("PHY");
    expect(row.documentType).toBe("referral_letter");
  });

  test("radiology_result records ORU^R01 + RAD", () => {
    const row = buildConversionAuditRow(baseMeta, {
      ...baseSuccess,
      documentType: "radiology_result",
    });

    expect(row.messageType).toBe("ORU^R01");
    expect(row.diagnosticServiceSection).toBe("RAD");
  });

  test("consent_form has no diagnosticServiceSection (Genie default routing)", () => {
    const row = buildConversionAuditRow(baseMeta, {
      ...baseSuccess,
      documentType: "consent_form",
    });

    expect(row.messageType).toBe("ORU^R01");
    expect(row.diagnosticServiceSection).toBeUndefined();
  });

  test("records patient initials in F.L. form on success", () => {
    const row = buildConversionAuditRow(baseMeta, baseSuccess);
    expect(row.patientInitials).toBe("J.S.");
  });

  test("omits patient initials when extractedData is missing", () => {
    const row = buildConversionAuditRow(baseMeta, {
      ...baseSuccess,
      extractedData: undefined,
    });
    expect(row.patientInitials).toBeUndefined();
  });

  test("failure result records outcome 'fail' with no messageType / DSS / patient initials", () => {
    const failResult: ConvertResult = {
      success: false,
      error: "Could not extract patient name",
      warnings: ["Vision extraction could not determine patient name"],
      extractionMethod: "vision",
      documentType: "generic",
    };

    const row = buildConversionAuditRow(baseMeta, failResult);

    expect(row.outcome).toBe("fail");
    expect(row.messageType).toBeUndefined();
    expect(row.diagnosticServiceSection).toBeUndefined();
    expect(row.patientInitials).toBeUndefined();
    expect(row.warningCount).toBe(1);
    // documentType is still recorded — it's the LLM's classification, not PHI.
    expect(row.documentType).toBe("generic");
  });

  test("flags mailboxDisagreement when referrals mailbox returns a result", () => {
    const row = buildConversionAuditRow(
      { ...baseMeta, mailboxHint: "referrals" },
      { ...baseSuccess, documentType: "pathology_result" }
    );

    expect(row.mailboxDisagreement).toBe(true);
    expect(row.mailboxHint).toBe("referrals");
  });

  test("does not include mailboxDisagreement key when classification matches mailbox", () => {
    const row = buildConversionAuditRow(
      { ...baseMeta, mailboxHint: "referrals" },
      baseSuccess
    );

    expect(row.mailboxDisagreement).toBeUndefined();
  });

  test("does not flag disagreement for consent_form on either mailbox", () => {
    const row = buildConversionAuditRow(
      { ...baseMeta, mailboxHint: "referrals" },
      { ...baseSuccess, documentType: "consent_form" }
    );

    expect(row.mailboxDisagreement).toBeUndefined();
  });

  test("durationMs is finishedAtMs - startedAtMs", () => {
    const row = buildConversionAuditRow(
      { ...baseMeta, startedAtMs: 100, finishedAtMs: 875 },
      baseSuccess
    );

    expect(row.durationMs).toBe(775);
  });

  test("month and ts come from the supplied 'now' Date", () => {
    const row = buildConversionAuditRow(baseMeta, baseSuccess);
    expect(row.month).toBe("2026-04");
    expect(row.ts.startsWith("2026-04-30T01:23:45.000Z#")).toBe(true);
  });

  test("filename hash + ext come from originalFilename, not raw filename", () => {
    const row = buildConversionAuditRow(baseMeta, baseSuccess);
    expect(row.filenameHash).toMatch(/^[0-9a-f]{12}$/);
    expect(row.filenameExt).toBe(".pdf");
    // Raw filename never appears anywhere on the row.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("Smith");
    expect(serialized).not.toContain("19800123");
  });

  test("records warnings array on the row when ConvertResult has warnings", () => {
    const row = buildConversionAuditRow(baseMeta, {
      ...baseSuccess,
      warnings: [
        "Bedrock vision call timed out after 30s",
        "Mailbox/content mismatch: arrived via referrals mailbox but classified as pathology_result. Verify before filing.",
      ],
    });

    expect(row.warningCount).toBe(2);
    expect(row.warnings).toEqual([
      "Bedrock vision call timed out after 30s",
      "Mailbox/content mismatch: arrived via referrals mailbox but classified as pathology_result. Verify before filing.",
    ]);
  });

  test("omits warnings field when ConvertResult has no warnings", () => {
    const row = buildConversionAuditRow(baseMeta, {
      ...baseSuccess,
      warnings: [],
    });
    expect(row.warningCount).toBe(0);
    expect(row.warnings).toBeUndefined();
  });

  test("redacts warnings containing PHI-like patterns before persisting", () => {
    const row = buildConversionAuditRow(baseMeta, {
      ...baseSuccess,
      warnings: [
        "Bedrock vision call timed out after 30s",
        "Patient Medicare 2950123456 invalid",
        "DOB 14/07/1982 not parseable",
      ],
    });
    // warningCount keeps the original count for ops visibility …
    expect(row.warningCount).toBe(3);
    // … but only the safe operational warning is persisted.
    expect(row.warnings).toEqual(["Bedrock vision call timed out after 30s"]);
  });

  test("caps warnings at 10 entries and truncates each to 300 chars", () => {
    const long = "X".repeat(500);
    const row = buildConversionAuditRow(baseMeta, {
      ...baseSuccess,
      warnings: Array.from({ length: 15 }, (_, i) => `${i}:${long}`),
    });

    expect(row.warningCount).toBe(15);
    expect(row.warnings).toBeDefined();
    const persisted = row.warnings as string[];
    expect(persisted.length).toBe(10);
    for (const msg of persisted) {
      expect(msg.length).toBeLessThanOrEqual(300);
    }
  });

  test("source 'email' propagates from meta", () => {
    const row = buildConversionAuditRow(
      { ...baseMeta, source: "email", userEmail: "service:pad-pipeline" },
      baseSuccess
    );
    expect(row.source).toBe("email");
    expect(row.userEmail).toBe("service:pad-pipeline");
  });
});

describe("buildFailureAuditRow", () => {
  test("minimal failure row has outcome fail and metadata only", () => {
    const row = buildFailureAuditRow(baseMeta);

    expect(row.outcome).toBe("fail");
    expect(row.source).toBe("web");
    expect(row.userEmail).toBe("alice@bjchealth.com.au");
    expect(row.warningCount).toBe(0);
    expect(row.fileSizeBytes).toBe(4096);
    expect(row.durationMs).toBe(250);
    expect(row.filenameHash).toMatch(/^[0-9a-f]{12}$/);
    expect(row.filenameExt).toBe(".pdf");
  });

  test("does not include extracted fields", () => {
    const row = buildFailureAuditRow(baseMeta);

    expect(row.documentType).toBeUndefined();
    expect(row.messageType).toBeUndefined();
    expect(row.diagnosticServiceSection).toBeUndefined();
    expect(row.patientInitials).toBeUndefined();
    expect(row.mailboxDisagreement).toBeUndefined();
  });

  test("propagates mailbox hint when present", () => {
    const row = buildFailureAuditRow({ ...baseMeta, mailboxHint: "results" });
    expect(row.mailboxHint).toBe("results");
  });

  test("month and ts come from supplied now", () => {
    const row = buildFailureAuditRow(baseMeta);
    expect(row.month).toBe("2026-04");
    expect(row.ts.startsWith("2026-04-30T01:23:45.000Z#")).toBe(true);
  });

  test("never leaks raw filename text into the row", () => {
    const row = buildFailureAuditRow(baseMeta);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("Smith");
    expect(serialized).not.toContain("DOB");
    expect(serialized).not.toContain("19800123");
  });
});
