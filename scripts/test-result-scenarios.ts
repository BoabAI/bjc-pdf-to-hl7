#!/usr/bin/env bun
/**
 * Live Bedrock test for pathology / radiology result classification + addressee
 * resolution. Requires AWS credentials with bedrock:InvokeModel for
 * anthropic.claude-sonnet-4-6 in BOTH ap-southeast-2 and ap-southeast-4.
 *
 * Usage: AWS_PROFILE=your-profile bun scripts/test-result-scenarios.ts
 *
 * Generate the input PDFs first:
 *   bun scripts/generate-result-test-pdfs.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { extractPatientDataWithVision } from "../lib/vision-extractor";

const RESULTS_DIR = join(import.meta.dir, "..", "docs", "input PDF", "results");

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
  expectedDocumentType: "pathology_result" | "radiology_result";
  expectedAddressee: string;
  /** Optional: substring that must appear in at least one ccNames entry. */
  expectedCc?: string;
}

const SCENARIOS: Scenario[] = [
  {
    file: "test_result1_pathology_chemistry.pdf",
    description: "Pathology — U&E + LFT panel (DHM)",
    expectedDocumentType: "pathology_result",
    expectedAddressee: "Lim",
  },
  {
    file: "test_result2_pathology_microbiology.pdf",
    description: "Pathology — Urine MCS (Laverty)",
    expectedDocumentType: "pathology_result",
    expectedAddressee: "Maundrell",
  },
  {
    file: "test_result3_radiology_mri.pdf",
    description: "Radiology — MRI right knee (PRP)",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Lau",
  },
  {
    file: "test_result4_radiology_ultrasound.pdf",
    description: "Radiology — Abdominal ultrasound (I-MED)",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Chung",
  },
  // Redacted-style scenarios — mimic real-world layouts from field samples.
  {
    file: "redacted-style/test_redacted1_dhm_haematology_serial.pdf",
    description: "Pathology — DHM haematology serial (5-date trend)",
    expectedDocumentType: "pathology_result",
    expectedAddressee: "Lau",
  },
  {
    file: "redacted-style/test_redacted2_mmi_mri_brain.pdf",
    description: "Radiology — MMI MRI brain (multi-page, To/Copies-To header)",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Celkys",
    expectedCc: "Wong",
  },
  {
    file: "redacted-style/test_redacted3_prp_ct_xray_combined.pdf",
    description: "Radiology — PRP CT lumbar + X-ray wrist combined",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Celkys",
  },
  {
    file: "redacted-style/test_redacted4_nswhp_multipanel_fax.pdf",
    description: "Pathology — NSW Health Pathology Hunter (3-panel fax)",
    expectedDocumentType: "pathology_result",
    expectedAddressee: "Ng",
  },
  {
    file: "redacted-style/test_redacted5_imed_dexa_letter.pdf",
    description:
      "Radiology — I-MED DEXA letter (addressee external, CC = BJC Habib)",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Dhabuwala",
    expectedCc: "Habib",
  },
];

console.log("=".repeat(70));
console.log("Result Scenarios — Pathology / Radiology Classification");
console.log(`BJC Doctor list: ${BJC_DOCTORS.length} doctors`);
console.log("=".repeat(70));

let passed = 0;
let failed = 0;

for (const scenario of SCENARIOS) {
  const pdfPath = join(RESULTS_DIR, scenario.file);
  const pdfBuffer = readFileSync(pdfPath);

  console.log(`\n--- ${scenario.description} ---`);
  console.log(`  File: ${scenario.file}`);

  const start = Date.now();
  const result = await extractPatientDataWithVision(Buffer.from(pdfBuffer), {
    bjcDoctors: BJC_DOCTORS,
  });
  const elapsed = Date.now() - start;

  console.log(`  Time: ${elapsed}ms`);
  console.log(`  Document type: ${result.documentType}`);
  console.log(`  Patient: ${result.data.firstName} ${result.data.lastName}`);
  console.log(
    `  Addressee: ${result.referralInfo?.addresseeName || "N/A"} (${result.referralInfo?.addresseeClinic || "N/A"})`
  );
  console.log(
    `  CC: ${result.referralInfo?.ccNames?.join(", ") || "(none)"}`
  );
  console.log(`  Sender: ${result.referralInfo?.senderName || "N/A"}`);

  if (result.warnings.length) {
    console.log(`  Warnings: ${result.warnings.join(", ")}`);
  }

  const typeOk = result.documentType === scenario.expectedDocumentType;
  const addressee = result.referralInfo?.addresseeName || "";
  const addresseeOk = addressee
    .toLowerCase()
    .includes(scenario.expectedAddressee.toLowerCase());

  const ccNames = result.referralInfo?.ccNames || [];
  const ccOk = scenario.expectedCc
    ? ccNames.some((cc) =>
        cc.toLowerCase().includes(scenario.expectedCc!.toLowerCase())
      )
    : true;

  const status = typeOk && addresseeOk && ccOk ? "PASS" : "FAIL";
  if (status === "PASS") passed++;
  else failed++;

  console.log(
    `  Doc-type check: ${typeOk ? "PASS" : "FAIL"} (expected "${scenario.expectedDocumentType}", got "${result.documentType}")`
  );
  console.log(
    `  Addressee check: ${addresseeOk ? "PASS" : "FAIL"} (expected "${scenario.expectedAddressee}" in "${addressee}")`
  );
  if (scenario.expectedCc) {
    console.log(
      `  CC check: ${ccOk ? "PASS" : "FAIL"} (expected "${scenario.expectedCc}" in [${ccNames.join(", ")}])`
    );
  }
  console.log(`  Result: ${status}`);
}

console.log("\n" + "=".repeat(70));
console.log(
  `Results: ${passed} passed, ${failed} failed out of ${SCENARIOS.length}`
);
console.log("=".repeat(70));

process.exit(failed > 0 ? 1 : 0);
