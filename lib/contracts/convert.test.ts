import { describe, expect, test } from "bun:test";
import { isConvertResponse, isManualReviewReason } from "./convert";

describe("isConvertResponse", () => {
  test("rejects non-object inputs", () => {
    expect(isConvertResponse(null)).toBe(false);
    expect(isConvertResponse(undefined)).toBe(false);
    expect(isConvertResponse("ok")).toBe(false);
    expect(isConvertResponse(42)).toBe(false);
    expect(isConvertResponse([])).toBe(false);
  });

  test("requires boolean success", () => {
    expect(isConvertResponse({})).toBe(false);
    expect(isConvertResponse({ success: "true" })).toBe(false);
    expect(isConvertResponse({ success: 1 })).toBe(false);
  });

  test("accepts a minimal success envelope", () => {
    expect(isConvertResponse({ success: true })).toBe(true);
    expect(isConvertResponse({ success: false })).toBe(true);
  });

  test("accepts full successful response shape", () => {
    expect(
      isConvertResponse({
        success: true,
        filename: "out.hl7",
        hl7Content: "MSH|...",
        documentType: "referral",
        extractionMethod: "vision",
        warnings: ["a", "b"],
        mailboxDisagreement: true,
        extractedData: {
          firstName: "Mary",
          lastName: "O'Brien",
          dob: "01/01/1970",
          sex: "Female",
          medicareNo: "1234",
          date: "30/04/2026",
          messageType: "REF^I12",
          carrier: "SMECAI",
          sender: "Dr X",
          addressee: "Dr Y",
          cc: "Dr Z",
        },
      })
    ).toBe(true);
  });

  test("accepts failure envelope with error string", () => {
    expect(
      isConvertResponse({ success: false, error: "Could not extract" })
    ).toBe(true);
  });

  test("rejects unknown documentType", () => {
    expect(
      isConvertResponse({ success: true, documentType: "weird" })
    ).toBe(false);
  });

  test("rejects unknown extractionMethod", () => {
    expect(
      isConvertResponse({ success: true, extractionMethod: "regex" })
    ).toBe(false);
  });

  test("rejects warnings that is not a string array", () => {
    expect(isConvertResponse({ success: true, warnings: "warn" })).toBe(false);
    expect(isConvertResponse({ success: true, warnings: [1, 2] })).toBe(false);
  });

  test("rejects malformed extractedData", () => {
    expect(
      isConvertResponse({
        success: true,
        extractedData: { firstName: 1, lastName: "x", dob: "x", sex: "x", medicareNo: "x" },
      })
    ).toBe(false);
  });

  test("rejects non-string optional fields in extractedData", () => {
    expect(
      isConvertResponse({
        success: true,
        extractedData: {
          firstName: "a",
          lastName: "b",
          dob: "01/01/1970",
          sex: "Male",
          medicareNo: "x",
          carrier: 7,
        },
      })
    ).toBe(false);
  });

  test("rejects non-boolean mailboxDisagreement", () => {
    expect(
      isConvertResponse({ success: true, mailboxDisagreement: "yes" })
    ).toBe(false);
  });

  test("accepts auto_routed action", () => {
    expect(
      isConvertResponse({ success: true, action: "auto_routed" })
    ).toBe(true);
  });

  test("accepts manual_review envelope with reason + suggestedCategory", () => {
    expect(
      isConvertResponse({
        success: true,
        action: "manual_review",
        reason: "low_confidence",
        suggestedCategory: "Needs review — Low confidence",
      })
    ).toBe(true);
  });

  test("rejects unknown action", () => {
    expect(
      isConvertResponse({ success: true, action: "weird" })
    ).toBe(false);
  });

  test("rejects unknown manual review reason", () => {
    expect(
      isConvertResponse({
        success: true,
        action: "manual_review",
        reason: "not-a-real-reason",
      })
    ).toBe(false);
  });

  test("accepts manual_review envelope with urgent_result reason", () => {
    expect(
      isConvertResponse({
        success: true,
        action: "manual_review",
        reason: "urgent_result",
        suggestedCategory: "Needs review — Urgent",
      })
    ).toBe(true);
  });
});

describe("isManualReviewReason", () => {
  test("accepts urgent_result", () => {
    expect(isManualReviewReason("urgent_result")).toBe(true);
  });

  test("accepts the existing reasons", () => {
    expect(isManualReviewReason("low_confidence")).toBe(true);
    expect(isManualReviewReason("missing_fields")).toBe(true);
    expect(isManualReviewReason("mailbox_mismatch")).toBe(true);
    expect(isManualReviewReason("unknown_doc_type")).toBe(true);
    expect(isManualReviewReason("extraction_failed")).toBe(true);
  });

  test("rejects unknown values and non-strings", () => {
    expect(isManualReviewReason("not-a-reason")).toBe(false);
    expect(isManualReviewReason(undefined)).toBe(false);
    expect(isManualReviewReason(42)).toBe(false);
  });
});
