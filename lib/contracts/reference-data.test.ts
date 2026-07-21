import { describe, expect, test } from "bun:test";
import { isReferenceDataResponse } from "./reference-data";

describe("isReferenceDataResponse", () => {
  test("rejects non-object inputs", () => {
    expect(isReferenceDataResponse(null)).toBe(false);
    expect(isReferenceDataResponse([])).toBe(false);
    expect(isReferenceDataResponse("nope")).toBe(false);
  });

  test("requires boolean success", () => {
    expect(isReferenceDataResponse({})).toBe(false);
    expect(isReferenceDataResponse({ success: "yes" })).toBe(false);
  });

  test("accepts minimal success", () => {
    expect(isReferenceDataResponse({ success: true })).toBe(true);
    expect(isReferenceDataResponse({ success: false, error: "x" })).toBe(true);
  });

  test("accepts well-formed doctors and carriers", () => {
    expect(
      isReferenceDataResponse({
        success: true,
        doctors: [{ id: "d1", name: "Dr X", providerNumber: "9000001Z" }],
        carriers: [
          { id: "c1", value: "SMECAI", label: "SMEC AI", isDefault: true },
          { id: "c2", value: "FAX", label: "Fax" },
        ],
      })
    ).toBe(true);
  });

  test("accepts a doctor with an empty providerNumber (optional field)", () => {
    // Regression: requiring a non-empty providerNumber here meant a single
    // blank-provider doctor rejected the entire reference-data response,
    // breaking the doctor + carrier lists for every user.
    expect(
      isReferenceDataResponse({
        success: true,
        doctors: [{ id: "d1", name: "Dr X", providerNumber: "" }],
      })
    ).toBe(true);
  });

  test("rejects malformed doctor entries", () => {
    expect(
      isReferenceDataResponse({
        success: true,
        doctors: [{ id: "d1", name: "", providerNumber: "x" }],
      })
    ).toBe(false);
    expect(
      isReferenceDataResponse({
        success: true,
        doctors: [{ id: "d1", name: "Dr X" }],
      })
    ).toBe(false);
  });

  test("rejects malformed carrier entries", () => {
    expect(
      isReferenceDataResponse({
        success: true,
        carriers: [{ id: "c1", value: "X" }],
      })
    ).toBe(false);
    expect(
      isReferenceDataResponse({
        success: true,
        carriers: [{ id: "c1", value: "X", label: "X", isDefault: "yes" }],
      })
    ).toBe(false);
  });

  test("rejects non-array doctors/carriers", () => {
    expect(
      isReferenceDataResponse({ success: true, doctors: {} })
    ).toBe(false);
    expect(
      isReferenceDataResponse({ success: true, carriers: "list" })
    ).toBe(false);
  });
});
