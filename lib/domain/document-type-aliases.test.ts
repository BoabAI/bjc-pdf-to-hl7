import { describe, expect, test } from "bun:test";
import {
  LEGACY_DOC_TYPE_ALIASES,
  resolveDocumentTypeAlias,
} from "./document-type-aliases";

describe("LEGACY_DOC_TYPE_ALIASES", () => {
  test("maps gp_referral to referral", () => {
    expect(LEGACY_DOC_TYPE_ALIASES.gp_referral).toBe("referral");
  });

  test("maps referral_letter to referral", () => {
    expect(LEGACY_DOC_TYPE_ALIASES.referral_letter).toBe("referral");
  });

  test("does not contain a self-mapping for referral", () => {
    // The canonical value is not itself an alias — callers should treat
    // canonical values as pass-through.
    expect(LEGACY_DOC_TYPE_ALIASES.referral).toBeUndefined();
  });
});

describe("resolveDocumentTypeAlias", () => {
  test("returns referral for the gp_referral alias", () => {
    expect(resolveDocumentTypeAlias("gp_referral")).toBe("referral");
  });

  test("returns referral for the referral_letter alias", () => {
    expect(resolveDocumentTypeAlias("referral_letter")).toBe("referral");
  });

  test("returns undefined for unknown / non-alias strings", () => {
    // Non-alias strings (including current canonical doc types like
    // "referral", "pathology_result") return undefined because this helper
    // only resolves aliases — full canonical membership belongs to
    // `normalizeDocumentType` which composes this helper with
    // DOCUMENT_TYPES.includes().
    expect(resolveDocumentTypeAlias("referral")).toBeUndefined();
    expect(resolveDocumentTypeAlias("pathology_result")).toBeUndefined();
    expect(resolveDocumentTypeAlias("garbage")).toBeUndefined();
  });

  test("returns undefined for non-string / empty / whitespace input", () => {
    expect(resolveDocumentTypeAlias(undefined)).toBeUndefined();
    expect(resolveDocumentTypeAlias(null)).toBeUndefined();
    expect(resolveDocumentTypeAlias(123)).toBeUndefined();
    expect(resolveDocumentTypeAlias("")).toBeUndefined();
    expect(resolveDocumentTypeAlias("   ")).toBeUndefined();
  });

  test("trims surrounding whitespace before resolving", () => {
    expect(resolveDocumentTypeAlias("  gp_referral  ")).toBe("referral");
  });
});
