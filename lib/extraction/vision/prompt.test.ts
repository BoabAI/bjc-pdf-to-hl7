import { describe, expect, test } from "bun:test";
import {
  SYSTEM_PROMPT,
  buildVisionPrompt,
  mailboxCategoryFromHeader,
  mailboxCategoryFromSource,
} from "./prompt";

describe("SYSTEM_PROMPT", () => {
  test("identifies the assistant as a medical extraction assistant", () => {
    expect(SYSTEM_PROMPT).toContain("medical document data extraction assistant");
  });

  test("instructs the model to always call the extraction tool", () => {
    expect(SYSTEM_PROMPT).toContain("Always call the extract_patient_data tool");
  });

  test("describes the consult_letter doc type", () => {
    expect(SYSTEM_PROMPT).toContain("consult_letter");
    expect(SYSTEM_PROMPT).toContain("Thanks for referring");
  });

  test("calls out the AU review-referral phrasing trap", () => {
    expect(SYSTEM_PROMPT).toContain("Thank you for seeing");
    // Should explicitly say that phrase is a referral, not a thank-you note
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("review referral");
  });
});

describe("buildVisionPrompt — default (no hint)", () => {
  test("returns the default classification prompt when no hint is provided", () => {
    expect(buildVisionPrompt()).toBe(
      "Classify this Australian medical PDF and extract the patient information using the extract_patient_data tool."
    );
  });
});

describe("buildVisionPrompt — document type hint", () => {
  test("includes a referral document type hint in the prompt", () => {
    const prompt = buildVisionPrompt("referral");
    expect(prompt).toContain("A document type hint was provided: referral");
    expect(prompt).toContain("extract_patient_data tool");
  });

  test("includes consult_letter hint when provided", () => {
    const prompt = buildVisionPrompt("consult_letter");
    expect(prompt).toContain("A document type hint was provided: consult_letter");
  });
});

describe("buildVisionPrompt — BJC doctor list", () => {
  test("includes the BJC doctor list when provided", () => {
    const prompt = buildVisionPrompt(undefined, [
      "Dr Irwin Lim",
      "Dr Herman Lau",
    ]);
    expect(prompt).toContain("BJC_DOCTORS list");
    expect(prompt).toContain("Dr Irwin Lim");
    expect(prompt).toContain("Dr Herman Lau");
  });

  test("omits the BJC_DOCTORS block when no doctor list is provided", () => {
    const prompt = buildVisionPrompt("referral");
    expect(prompt).not.toContain("BJC_DOCTORS");
  });

  test("omits the BJC_DOCTORS block when the doctor list is empty", () => {
    const prompt = buildVisionPrompt(undefined, []);
    expect(prompt).not.toContain("BJC_DOCTORS");
  });
});

describe("buildVisionPrompt — mailbox category constraint", () => {
  test("results mailbox narrows candidates to pathology / radiology / generic", () => {
    const prompt = buildVisionPrompt(undefined, undefined, "results");
    expect(prompt).toContain("Upstream mailbox: results");
    expect(prompt).toContain("pathology_result");
    expect(prompt).toContain("radiology_result");
    // Explicitly tells the model NOT to pick referral/consult/consent from results
    expect(prompt).toContain("Do not pick referral");
  });

  test("letters mailbox narrows candidates to referral / consult / generic", () => {
    const prompt = buildVisionPrompt(undefined, undefined, "letters");
    expect(prompt).toContain("Upstream mailbox: letters");
    expect(prompt).toContain("referral");
    expect(prompt).toContain("consult_letter");
    // Explicitly tells the model NOT to pick lab/imaging from letters
    expect(prompt).toContain("Do not pick pathology_result");
  });

  test("none mailbox category omits the mailbox-constraint paragraph", () => {
    const prompt = buildVisionPrompt(undefined, undefined, "none");
    expect(prompt).not.toContain("Upstream mailbox:");
  });

  test("default mailbox argument is 'none' (free classification)", () => {
    const prompt = buildVisionPrompt("referral");
    expect(prompt).not.toContain("Upstream mailbox:");
  });

  test("letters mailbox reiterates the 'Thank you for seeing' = referral rule", () => {
    const prompt = buildVisionPrompt(undefined, undefined, "letters");
    expect(prompt).toContain("Thank you for seeing");
    expect(prompt).toContain("referral");
  });

  test("combines hint, mailbox, and doctor list when all three are present", () => {
    const prompt = buildVisionPrompt(
      "referral",
      ["Dr A", "Dr B"],
      "letters"
    );
    expect(prompt).toContain("A document type hint was provided: referral");
    expect(prompt).toContain("Upstream mailbox: letters");
    expect(prompt).toContain("BJC_DOCTORS list");
    expect(prompt).toContain("Dr A");
    expect(prompt).toContain("Dr B");
  });
});

describe("mailboxCategoryFromHeader", () => {
  test("maps known fax mailboxes to results", () => {
    expect(mailboxCategoryFromHeader("fax-pathology@bjchealth.com.au")).toBe(
      "results"
    );
  });

  test("maps admin mailbox to letters", () => {
    expect(mailboxCategoryFromHeader("admin@bjchealth.com.au")).toBe("letters");
  });

  test("maps simulated:fax / simulated:admin sentinels", () => {
    expect(mailboxCategoryFromHeader("simulated:fax")).toBe("results");
    expect(mailboxCategoryFromHeader("simulated:admin")).toBe("letters");
  });

  test("returns none for unknown / null / empty headers", () => {
    expect(mailboxCategoryFromHeader(undefined)).toBe("none");
    expect(mailboxCategoryFromHeader(null)).toBe("none");
    expect(mailboxCategoryFromHeader("")).toBe("none");
    expect(mailboxCategoryFromHeader("unknown@example.com")).toBe("none");
  });
});

describe("mailboxCategoryFromSource (legacy enum shim)", () => {
  test("referrals → letters", () => {
    expect(mailboxCategoryFromSource("referrals")).toBe("letters");
  });

  test("results → results", () => {
    expect(mailboxCategoryFromSource("results")).toBe("results");
  });

  test("undefined → none", () => {
    expect(mailboxCategoryFromSource(undefined)).toBe("none");
  });
});
