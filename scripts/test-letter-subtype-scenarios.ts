/**
 * Live Bedrock test for WS1 (multipage cover-letter promotion) and WS2
 * (letterSubtype demotion) classification rules.
 *
 * Requires AWS credentials with bedrock:InvokeModel for
 * anthropic.claude-sonnet-4-6 in BOTH ap-southeast-2 and ap-southeast-4.
 *
 * Generate the PDFs first:
 *   bun scripts/generate-letter-subtype-test-pdfs.ts
 *
 * Usage: AWS_PROFILE=your-profile bun scripts/test-letter-subtype-scenarios.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { extractPatientDataWithVision } from "../lib/vision-extractor";

const DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "letter-subtypes");

const BJC_DOCTORS = [
  "Dr Irwin Lim",
  "Dr Adam Maundrell",
  "Dr Ilana Ginges",
  "Dr Anne Chung",
  "Dr Herman Lau",
  "Dr Kate Celkys",
  "Dr Elaine Ng",
  "Dr Pauline Habib",
  "Dr Vincent Wong",
];

interface Scenario {
  file: string;
  description: string;
  expectedDocumentType: "generic" | "referral_letter" | "gp_referral";
  expectedLetterSubtype: "follow_up" | "discharge" | "result_commentary" | "referral";
  /** True when this scenario should produce a demotion warning */
  expectDemotion?: boolean;
  /** True when this scenario should produce a promotion warning */
  expectPromotion?: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    file: "letter_followup.pdf",
    description: "Follow-up progress letter (specialist → GP) — should demote to generic",
    expectedDocumentType: "generic",
    expectedLetterSubtype: "follow_up",
  },
  {
    file: "letter_discharge.pdf",
    description: "Discharge letter (specialist → GP) — should demote to generic",
    expectedDocumentType: "generic",
    expectedLetterSubtype: "discharge",
  },
  {
    file: "letter_result_commentary.pdf",
    description: "Result commentary letter (specialist → GP) — should demote to generic",
    expectedDocumentType: "generic",
    expectedLetterSubtype: "result_commentary",
  },
  {
    file: "multipage_referral_with_results.pdf",
    description: "Page 1 GP referral + pages 2-3 attached results — should classify as gp_referral",
    expectedDocumentType: "gp_referral",
    expectedLetterSubtype: "referral",
  },
];

console.log("=".repeat(74));
console.log("Letter Subtype Scenarios — WS1 (multipage promotion) + WS2 (demotion)");
console.log("BJC Doctor list:", BJC_DOCTORS.length, "doctors");
console.log("=".repeat(74));

let passed = 0;
let failed = 0;

for (const scenario of SCENARIOS) {
  const pdfPath = join(DIR, scenario.file);
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = readFileSync(pdfPath);
  } catch (err) {
    console.error(`\n--- ${scenario.description} ---`);
    console.error(`  ❌ Could not read ${scenario.file}:`, err);
    failed++;
    continue;
  }

  console.log(`\n--- ${scenario.description} ---`);
  console.log(`  File: ${scenario.file}`);

  const start = Date.now();
  const result = await extractPatientDataWithVision(Buffer.from(pdfBuffer), {
    bjcDoctors: BJC_DOCTORS,
  });
  const elapsed = Date.now() - start;

  console.log(`  Time: ${elapsed}ms`);
  console.log(`  Document type: ${result.documentType}`);
  console.log(`  Letter subtype: ${result.letterSubtype ?? "(not set)"}`);
  console.log(`  Classification confidence: ${result.classificationConfidence}`);
  console.log(`  Patient: ${result.data.firstName} ${result.data.lastName}`);
  if (result.referralInfo) {
    console.log(`  Sender: ${result.referralInfo.senderName ?? "(none)"}`);
    console.log(`  Addressee: ${result.referralInfo.addresseeName ?? "(none)"}`);
  }
  if (result.warnings && result.warnings.length > 0) {
    console.log(`  Warnings:`);
    for (const w of result.warnings) console.log(`    - ${w}`);
  }

  let scenarioPassed = true;

  // Doc-type assertion
  if (result.documentType === scenario.expectedDocumentType) {
    console.log(`  ✅ Doc-type: expected "${scenario.expectedDocumentType}", got "${result.documentType}"`);
  } else {
    console.log(`  ❌ Doc-type: expected "${scenario.expectedDocumentType}", got "${result.documentType}"`);
    scenarioPassed = false;
  }

  // Letter subtype assertion
  if (result.letterSubtype === scenario.expectedLetterSubtype) {
    console.log(`  ✅ Letter subtype: expected "${scenario.expectedLetterSubtype}", got "${result.letterSubtype}"`);
  } else {
    console.log(`  ❌ Letter subtype: expected "${scenario.expectedLetterSubtype}", got "${result.letterSubtype ?? "(not set)"}"`);
    scenarioPassed = false;
  }

  if (scenarioPassed) {
    passed++;
    console.log(`  Result: PASS`);
  } else {
    failed++;
    console.log(`  Result: FAIL`);
  }
}

console.log("\n" + "=".repeat(74));
console.log(`Results: ${passed} passed, ${failed} failed out of ${SCENARIOS.length}`);
console.log("=".repeat(74));

if (failed > 0) process.exit(1);
