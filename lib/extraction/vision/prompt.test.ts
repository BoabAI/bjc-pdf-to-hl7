import { describe, expect, test } from "bun:test";
import { buildVisionPrompt, SYSTEM_PROMPT } from "./prompt";

describe("SYSTEM_PROMPT", () => {
  test("identifies the assistant as a medical extraction assistant", () => {
    expect(SYSTEM_PROMPT).toContain("medical document data extraction assistant");
  });

  test("instructs the model to always call the extraction tool", () => {
    expect(SYSTEM_PROMPT).toContain("Always call the extract_patient_data tool");
  });
});

describe("buildVisionPrompt", () => {
  test("returns the default classification prompt when no hint is provided", () => {
    expect(buildVisionPrompt()).toBe(
      "Classify this Australian medical PDF and extract the patient information using the extract_patient_data tool."
    );
  });

  test("includes a referral document type hint in the prompt", () => {
    const prompt = buildVisionPrompt("referral_letter");
    expect(prompt).toContain("A document type hint was provided: referral_letter");
    expect(prompt).toContain("extract_patient_data tool");
  });

  test("includes gp_referral hint when provided", () => {
    const prompt = buildVisionPrompt("gp_referral");
    expect(prompt).toContain("A document type hint was provided: gp_referral");
  });

  test("includes both BJC doctors when a list is provided", () => {
    const prompt = buildVisionPrompt(undefined, [
      "Dr Irwin Lim",
      "Dr Herman Lau",
    ]);
    expect(prompt).toContain("BJC_DOCTORS list");
    expect(prompt).toContain("Dr Irwin Lim");
    expect(prompt).toContain("Dr Herman Lau");
  });

  test("does not include the BJC_DOCTORS block when no doctor list is provided", () => {
    const prompt = buildVisionPrompt("gp_referral");
    expect(prompt).not.toContain("BJC_DOCTORS");
  });

  test("does not include the BJC_DOCTORS block when the doctor list is empty", () => {
    const prompt = buildVisionPrompt(undefined, []);
    expect(prompt).not.toContain("BJC_DOCTORS");
  });

  test("includes the referrals mailbox prior when mailboxHint is referrals", () => {
    const prompt = buildVisionPrompt(undefined, undefined, "referrals");
    expect(prompt).toContain("Upstream mailbox: referrals");
    expect(prompt).toContain("referral_letter or gp_referral");
  });

  test("includes the results mailbox prior when mailboxHint is results", () => {
    const prompt = buildVisionPrompt(undefined, undefined, "results");
    expect(prompt).toContain("Upstream mailbox: results");
    expect(prompt).toContain("pathology_result or radiology_result");
  });

  test("combines hint, mailbox, and doctor list when all three are present", () => {
    const prompt = buildVisionPrompt(
      "referral_letter",
      ["Dr A", "Dr B"],
      "referrals"
    );
    expect(prompt).toContain("A document type hint was provided: referral_letter");
    expect(prompt).toContain("Upstream mailbox: referrals");
    expect(prompt).toContain("BJC_DOCTORS list");
    expect(prompt).toContain("Dr A");
    expect(prompt).toContain("Dr B");
  });
});
