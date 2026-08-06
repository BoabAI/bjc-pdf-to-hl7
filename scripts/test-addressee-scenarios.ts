#!/usr/bin/env bun
/**
 * Test CC addressee resolution against Bedrock.
 *
 * Usage: AWS_PROFILE=your-profile bun scripts/test-addressee-scenarios.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { extractPatientDataWithVision } from "../lib/vision-extractor";
import { snapAddressee } from "../lib/extraction/addressee-snap";

const ADDRESSEE_DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "addressees");

// Genie-format names, mirroring the production reference data — the model is
// asked to return the list entry verbatim and snapAddressee enforces it.
const BJC_DOCTORS = [
  "Dr I Lim",
  "Dr A Maundrell",
  "Dr I Ginges",
  "Dr A Chung",
  "Dr H Lau",
];

const SCENARIOS = [
  {
    file: "addressee_1_bjc_primary.pdf",
    description: "BJC doctor as primary (no CC)",
    // Exact final (post-snap) addressee — substring checks can't catch
    // format drift like "Dr Adam Maundrell" vs "Dr A Maundrell".
    expectedAddressee: "Dr A Maundrell",
    expectedCC: null,
  },
  {
    file: "addressee_2_bjc_in_cc.pdf",
    description: "External primary, BJC doctor in CC",
    expectedAddressee: "Dr I Lim",
    expectedCC: "Lim",
  },
  {
    file: "addressee_3_both_bjc.pdf",
    description: "Both primary and CC are BJC",
    expectedAddressee: "Dr I Ginges",
    expectedCC: "Chung",
  },
];

console.log("=".repeat(70));
console.log("CC Addressee Resolution Test");
console.log(`BJC Doctor list: ${BJC_DOCTORS.length} doctors`);
console.log("=".repeat(70));

let passed = 0;
let failed = 0;

for (const scenario of SCENARIOS) {
  const pdfPath = join(ADDRESSEE_DIR, scenario.file);
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
  console.log(`  Patient: ${result.data.firstName} ${result.data.lastName}`);
  console.log(`  Addressee (raw): ${result.referralInfo?.addresseeName || "N/A"} (${result.referralInfo?.addresseeClinic || "N/A"})`);
  console.log(`  Addressee (snapped): ${addressee || "N/A"}`);
  console.log(`  CC: ${result.referralInfo?.ccNames?.join(", ") || "(none)"}`);
  console.log(`  Sender: ${result.referralInfo?.senderName || "N/A"}`);

  if (result.warnings.length) {
    console.log(`  Warnings: ${result.warnings.join(", ")}`);
  }
  if (snap.warnings.length) {
    console.log(`  Snap warnings: ${snap.warnings.join(", ")}`);
  }

  // The final (post-snap) addressee must equal the Genie-format roster entry.
  const addresseeOk = addressee === scenario.expectedAddressee;

  // Verify CC extraction
  const ccNames = result.referralInfo?.ccNames || [];
  let ccOk: boolean;
  if (scenario.expectedCC === null) {
    ccOk = ccNames.length === 0;
  } else {
    ccOk = ccNames.some((n) => n.toLowerCase().includes(scenario.expectedCC!.toLowerCase()));
  }

  const status = addresseeOk && ccOk ? "PASS" : "FAIL";
  if (status === "PASS") passed++;
  else failed++;

  console.log(`  Addressee check: ${addresseeOk ? "PASS" : "FAIL"} (expected exactly "${scenario.expectedAddressee}", got "${addressee}")`);
  console.log(`  CC check: ${ccOk ? "PASS" : "FAIL"} (expected ${scenario.expectedCC ? `"${scenario.expectedCC}"` : "none"}, got [${ccNames.join(", ")}])`);
  console.log(`  Result: ${status}`);
}

console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed out of ${SCENARIOS.length}`);
console.log("=".repeat(70));

process.exit(failed > 0 ? 1 : 0);
