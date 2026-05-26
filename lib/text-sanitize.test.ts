import { describe, expect, test } from "bun:test";
import { sanitizeReferenceField } from "./text-sanitize";

describe("sanitizeReferenceField", () => {
  test("trims surrounding whitespace", () => {
    expect(sanitizeReferenceField("  Dr Irwin Lim  ")).toBe("Dr Irwin Lim");
  });

  test("strips control characters (newline / tab / bell) from pasted text", () => {
    expect(sanitizeReferenceField("Dr Smith\n")).toBe("Dr Smith");
    expect(sanitizeReferenceField("9000001Z\t")).toBe("9000001Z");
    expect(sanitizeReferenceField("OKBell")).toBe("OKBell");
  });

  test("preserves HL7 separator characters (escaped on output, not at input)", () => {
    expect(sanitizeReferenceField("Dr Smith & Associates")).toBe(
      "Dr Smith & Associates"
    );
    expect(sanitizeReferenceField("MYCO|CO")).toBe("MYCO|CO");
    expect(sanitizeReferenceField("A^B~C\\D")).toBe("A^B~C\\D");
  });

  test("preserves internal single spaces and hyphens (Medicare convention)", () => {
    expect(sanitizeReferenceField("123456 7Y")).toBe("123456 7Y");
    expect(sanitizeReferenceField("9876-543T")).toBe("9876-543T");
  });

  test("collapses to empty when value is only control chars / whitespace", () => {
    expect(sanitizeReferenceField("\n\t ")).toBe("");
  });
});
