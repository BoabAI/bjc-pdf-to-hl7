#!/usr/bin/env bun
/**
 * Live Bedrock test for pathology / radiology result classification + addressee
 * resolution. Requires AWS credentials with bedrock:InvokeModel for
 * anthropic.claude-sonnet-4-6 in BOTH ap-southeast-2 and ap-southeast-4.
 *
 * Usage: AWS_PROFILE=your-profile bun scripts/test-result-scenarios.ts
 *
 * Generate the test-pdfss first:
 *   bun scripts/generate-result-test-pdfs.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { extractPatientDataWithVision } from "../lib/vision-extractor";
import { snapAddressee } from "../lib/extraction/addressee-snap";

const RESULTS_DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "results");

// Genie-format names, mirroring the production reference data — the model is
// asked to return the list entry verbatim and snapAddressee enforces it.
const BJC_DOCTORS = [
  "Dr I Lim",
  "Dr A Maundrell",
  "Dr I Ginges",
  "Dr A Chung",
  "Dr H Lau",
  "Dr K Celkys",
  "Dr E Ng",
  "Dr P Habib",
  "Dr V Wong",
];

interface Scenario {
  file: string;
  description: string;
  expectedDocumentType: "pathology_result" | "radiology_result";
  /** Exact final (post-snap) addressee — must equal the roster entry. */
  expectedAddressee: string;
  /** Optional: substring that must appear in at least one ccNames entry. */
  expectedCc?: string;
}

const SCENARIOS: Scenario[] = [
  {
    file: "result_1_pathology_chemistry.pdf",
    description: "Pathology — U&E + LFT panel (DHM)",
    expectedDocumentType: "pathology_result",
    expectedAddressee: "Dr I Lim",
  },
  {
    file: "result_2_pathology_microbiology.pdf",
    description: "Pathology — Urine MCS (Laverty)",
    expectedDocumentType: "pathology_result",
    expectedAddressee: "Dr A Maundrell",
  },
  {
    file: "result_3_radiology_mri.pdf",
    description: "Radiology — MRI right knee (PRP)",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Dr H Lau",
  },
  {
    file: "result_4_radiology_ultrasound.pdf",
    description: "Radiology — Abdominal ultrasound (I-MED)",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Dr A Chung",
  },
  // Redacted-style scenarios — mimic real-world layouts from field samples.
  {
    file: "redacted-style/redacted_1_dhm_haematology_serial.pdf",
    description: "Pathology — DHM haematology serial (5-date trend)",
    expectedDocumentType: "pathology_result",
    expectedAddressee: "Dr H Lau",
  },
  {
    file: "redacted-style/redacted_2_mmi_mri_brain.pdf",
    description: "Radiology — MMI MRI brain (multi-page, To/Copies-To header)",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Dr K Celkys",
    expectedCc: "Wong",
  },
  {
    file: "redacted-style/redacted_3_prp_ct_xray_combined.pdf",
    description: "Radiology — PRP CT lumbar + X-ray wrist combined",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Dr K Celkys",
  },
  {
    file: "redacted-style/redacted_4_nswhp_multipanel_fax.pdf",
    description: "Pathology — NSW Health Pathology Hunter (3-panel fax)",
    expectedDocumentType: "pathology_result",
    expectedAddressee: "Dr E Ng",
  },
  {
    // The BJC doctor on the CC line must become the addressee even though the
    // letter is addressed to an external doctor (client requirement, Aug 2026
    // — previously this scenario expected the external "Dhabuwala").
    file: "redacted-style/redacted_5_imed_dexa_letter.pdf",
    description:
      "Radiology — I-MED DEXA letter (addressee external, CC = BJC Habib → promoted)",
    expectedDocumentType: "radiology_result",
    expectedAddressee: "Dr P Habib",
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

  const snap = snapAddressee(result.referralInfo, BJC_DOCTORS);
  const addressee = snap.referralInfo?.addresseeName || "";

  console.log(`  Time: ${elapsed}ms`);
  console.log(`  Document type: ${result.documentType}`);
  console.log(`  Patient: ${result.data.firstName} ${result.data.lastName}`);
  console.log(
    `  Addressee (raw): ${result.referralInfo?.addresseeName || "N/A"} (${result.referralInfo?.addresseeClinic || "N/A"})`
  );
  console.log(`  Addressee (snapped): ${addressee || "N/A"}`);
  console.log(
    `  CC: ${result.referralInfo?.ccNames?.join(", ") || "(none)"}`
  );
  console.log(`  Sender: ${result.referralInfo?.senderName || "N/A"}`);

  if (result.warnings.length) {
    console.log(`  Warnings: ${result.warnings.join(", ")}`);
  }
  if (snap.warnings.length) {
    console.log(`  Snap warnings: ${snap.warnings.join(", ")}`);
  }

  const typeOk = result.documentType === scenario.expectedDocumentType;
  const addresseeOk = addressee === scenario.expectedAddressee;

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
    `  Addressee check: ${addresseeOk ? "PASS" : "FAIL"} (expected exactly "${scenario.expectedAddressee}", got "${addressee}")`
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
