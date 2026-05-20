#!/usr/bin/env bun
/**
 * Manual integration test for vision LLM extraction.
 * Sends each mock referral PDF to AWS Bedrock and prints extracted patient data.
 *
 * Usage: AWS_PROFILE=your-profile bun run scripts/test-vision.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { extractPatientDataWithVision } from "../lib/vision-extractor";

const MOCK_DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "referrals");

const EXPECTED = [
  { file: "referral_1.pdf", firstName: "James", lastName: "MITCHELL", dob: "18/09/1978" },
  { file: "referral_2.pdf", firstName: "Patricia Anne", lastName: "Henderson", dob: "03/11/1956" },
  { file: "referral_3.pdf", firstName: "Karen", lastName: "Phillips", dob: "14/07/1982" },
  { file: "referral_4.pdf", firstName: "Amira", lastName: "Karim", dob: "08/11/1985" },
  { file: "referral_5.pdf", firstName: "Thomas", lastName: "Whitaker", dob: "15/06/1948" },
];

console.log("=".repeat(70));
console.log("Vision LLM Extraction Test");
console.log("Auth: AWS SDK default credential chain");
console.log("=".repeat(70));

let passed = 0;
let failed = 0;

for (const exp of EXPECTED) {
  const pdfPath = join(MOCK_DIR, exp.file);
  const pdfBuffer = readFileSync(pdfPath);

  console.log(`\n--- ${exp.file} ---`);
  const start = Date.now();
  const result = await extractPatientDataWithVision(Buffer.from(pdfBuffer));
  const elapsed = Date.now() - start;

  console.log(`  Model: ${result.model} (${elapsed}ms)`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Name: ${result.data.firstName} ${result.data.lastName}`);
  console.log(`  DOB: ${result.data.dob}`);
  console.log(`  Sex: ${result.data.sex}`);
  console.log(`  Phone: ${result.data.phone || "N/A"}`);
  console.log(`  Address: ${result.data.address || "N/A"}`);
  console.log(`  Suburb: ${result.data.suburb || "N/A"} ${result.data.state || ""} ${result.data.postcode || ""}`);
  console.log(`  Medicare: ${result.data.medicareNo || "N/A"} ref ${result.data.medicareRef || "N/A"}`);
  if (result.tokensUsed) {
    console.log(`  Tokens: ${result.tokensUsed.input} in / ${result.tokensUsed.output} out`);
  }
  if (result.warnings.length) {
    console.log(`  Warnings: ${result.warnings.join(", ")}`);
  }

  // Check key fields
  const checks: string[] = [];
  const firstNameMatch = result.data.firstName.toLowerCase().includes(exp.firstName.split(" ")[0].toLowerCase());
  const lastNameMatch = result.data.lastName.toLowerCase().includes(exp.lastName.toLowerCase());
  // Convert expected DOB to HL7 format for comparison
  const [d, m, y] = exp.dob.split("/");
  const expectedHL7 = `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`;
  const dobMatch = result.data.dob === expectedHL7;

  if (!firstNameMatch) checks.push(`firstName expected "${exp.firstName}" got "${result.data.firstName}"`);
  if (!lastNameMatch) checks.push(`lastName expected "${exp.lastName}" got "${result.data.lastName}"`);
  if (!dobMatch) checks.push(`dob expected "${expectedHL7}" got "${result.data.dob}"`);

  if (checks.length === 0) {
    console.log(`  ✅ PASS`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${checks.join("; ")}`);
    failed++;
  }
}

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed out of ${EXPECTED.length}`);
console.log("=".repeat(70));

// ---------------------------------------------------------------------------
// Review-referral regression suite (Nicole, 4 May 2026).
//
// Both fictional PDFs are GP review-referrals dressed up to look like results
// — date-prefixed problem lists + tabular medication grids. Under the
// `letters` mailbox prior they MUST classify as referral_letter / gp_referral
// (not pathology_result / radiology_result). The eligibility gate must accept
// them, so OBR-24 ends up `PHY` and the message type `REF^I12`.
// ---------------------------------------------------------------------------

interface ReviewReferralExpectation {
  file: string;
  firstName: string;
  lastName: string;
  dob: string;
}

const REVIEW_REFERRAL_DIR = join(
  import.meta.dir,
  "..",
  "docs",
  "test-pdfs",
  "review-referrals"
);

const REVIEW_REFERRALS: ReviewReferralExpectation[] = [
  {
    file: "review_referral_osteoarthritis.pdf",
    firstName: "Patricia",
    lastName: "Chen",
    dob: "04/03/1958",
  },
  {
    file: "review_referral_chronic_urticaria.pdf",
    firstName: "Benjamin",
    lastName: "Whitfield",
    dob: "17/09/1972",
  },
];

const REFERRAL_DOC_TYPES = new Set(["referral", "referral"]);

console.log("\n" + "=".repeat(70));
console.log("Review-referral regression (Nicole)");
console.log("Mailbox prior: letters");
console.log("=".repeat(70));

let rrPassed = 0;
let rrFailed = 0;

for (const exp of REVIEW_REFERRALS) {
  const pdfPath = join(REVIEW_REFERRAL_DIR, exp.file);
  const pdfBuffer = readFileSync(pdfPath);

  console.log(`\n--- ${exp.file} (mailbox: letters) ---`);
  const start = Date.now();
  const result = await extractPatientDataWithVision(Buffer.from(pdfBuffer), {
    // The simulated-admin sentinel maps to MailboxCategory: "letters" — the
    // production mailbox we expect these PDFs to arrive in.
    mailboxHint: "referrals",
  });
  const elapsed = Date.now() - start;

  console.log(`  Model: ${result.model} (${elapsed}ms)`);
  console.log(`  documentType: ${result.documentType} (confidence ${result.classificationConfidence})`);
  console.log(`  Name: ${result.data.firstName} ${result.data.lastName}`);
  console.log(`  DOB: ${result.data.dob}`);
  console.log(`  Sender: ${result.referralInfo?.senderName ?? "N/A"}`);
  console.log(`  Addressee: ${result.referralInfo?.addresseeName ?? "N/A"}`);

  const checks: string[] = [];
  if (!REFERRAL_DOC_TYPES.has(result.documentType)) {
    checks.push(
      `documentType expected referral_letter or gp_referral, got "${result.documentType}"`
    );
  }
  if (
    !result.data.firstName.toLowerCase().includes(exp.firstName.toLowerCase())
  ) {
    checks.push(`firstName expected "${exp.firstName}", got "${result.data.firstName}"`);
  }
  if (
    !result.data.lastName.toLowerCase().includes(exp.lastName.toLowerCase())
  ) {
    checks.push(`lastName expected "${exp.lastName}", got "${result.data.lastName}"`);
  }
  const [d, m, y] = exp.dob.split("/");
  const expectedHL7 = `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`;
  if (result.data.dob !== expectedHL7) {
    checks.push(`dob expected "${expectedHL7}", got "${result.data.dob}"`);
  }
  if (!result.referralInfo?.addresseeName?.trim()) {
    checks.push("addresseeName missing — eligibility gate would divert");
  }

  if (checks.length === 0) {
    console.log("  ✅ PASS");
    rrPassed++;
  } else {
    console.log(`  ❌ FAIL: ${checks.join("; ")}`);
    rrFailed++;
  }
}

console.log("\n" + "=".repeat(70));
console.log(
  `Review-referral results: ${rrPassed} passed, ${rrFailed} failed out of ${REVIEW_REFERRALS.length}`
);
console.log("=".repeat(70));

process.exit(failed > 0 ? 1 : 0);
