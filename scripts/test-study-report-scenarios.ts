#!/usr/bin/env bun
/**
 * Live Bedrock test for study / examination reports (sleep study, nerve
 * conduction, eye exam) — these must classify as consult_letter (Genie
 * Incoming Letters), not generic ("Unknown type"). Requires AWS credentials
 * with bedrock:InvokeModel in BOTH ap-southeast-2 and ap-southeast-4.
 *
 * Usage: AWS_PROFILE=your-profile bun scripts/test-study-report-scenarios.ts
 *
 * Generate the fixtures first:
 *   bun scripts/generate-study-report-test-pdfs.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { extractPatientDataWithVision } from "../lib/vision-extractor";
import { snapAddressee } from "../lib/extraction/addressee-snap";

const STUDY_DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "study-reports");

// Genie-format names, mirroring the production reference data.
const BJC_DOCTORS = [
  "Dr I Lim",
  "Dr H Lau",
  "Dr Q Luu",
  "Dr V Wong",
  "Dr A Chung",
  "Dr K Celkys",
];

interface Scenario {
  file: string;
  description: string;
  expectedAddressee: string;
}

const SCENARIOS: Scenario[] = [
  { file: "sleep_study.pdf", description: "Ambulatory sleep study (Referring Physician line)", expectedAddressee: "Dr Q Luu" },
  { file: "nerve_conduction.pdf", description: "Nerve conduction study (Referring Physician line)", expectedAddressee: "Dr H Lau" },
  { file: "eye_exam_report.pdf", description: "Optometry eye examination report (To: block)", expectedAddressee: "Dr V Wong" },
];

// Negatives: administrative documents that must stay generic (→ manual review),
// so the wider consult_letter rule can't auto-file them. Borderline reports are
// printed for inspection but don't fail the run.
// Generate with: bun scripts/generate-study-report-negative-pdfs.ts
const NEG_DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "study-report-negatives");
const MUST_STAY_GENERIC = [
  "neg_centrelink_form.pdf",
  "neg_patient_invoice.pdf",
  "neg_appointment_letter.pdf",
  "neg_medication_chart.pdf",
];
const BORDERLINE = [
  "bl_ecg_report.pdf",
  "bl_echo_report.pdf",
  "bl_spirometry_report.pdf",
  "bl_hospital_discharge.pdf",
  "bl_physio_report.pdf",
];

console.log("=".repeat(70));
console.log("Study Report Scenarios — expect consult_letter");
console.log("=".repeat(70));

let passed = 0;
let failed = 0;

for (const scenario of SCENARIOS) {
  const pdfBuffer = readFileSync(join(STUDY_DIR, scenario.file));

  console.log(`\n--- ${scenario.description} ---`);
  const start = Date.now();
  const result = await extractPatientDataWithVision(Buffer.from(pdfBuffer), {
    bjcDoctors: BJC_DOCTORS,
  });
  const elapsed = Date.now() - start;

  const snap = snapAddressee(result.referralInfo, BJC_DOCTORS);
  const addressee = snap.referralInfo?.addresseeName || "";

  console.log(`  Time: ${elapsed}ms`);
  console.log(`  Document type: ${result.documentType} (confidence ${result.classificationConfidence})`);
  console.log(`  Patient: ${result.data.firstName} ${result.data.lastName} DOB ${result.data.dob}`);
  console.log(`  Sender: ${result.referralInfo?.senderName || "N/A"}`);
  console.log(`  Addressee (snapped): ${addressee || "N/A"}`);
  if (result.warnings.length) console.log(`  Warnings: ${result.warnings.join(", ")}`);

  const typeOk = result.documentType === "consult_letter";
  const addresseeOk = addressee === scenario.expectedAddressee;
  const ok = result.success && typeOk && addresseeOk;
  if (ok) passed++;
  else failed++;

  console.log(`  Doc-type check: ${typeOk ? "PASS" : "FAIL"}`);
  console.log(`  Addressee check: ${addresseeOk ? "PASS" : "FAIL"} (expected "${scenario.expectedAddressee}", got "${addressee}")`);
  console.log(`  Result: ${ok ? "PASS" : "FAIL"}`);
}

console.log("\n--- Negatives (must stay generic) ---");
for (const file of MUST_STAY_GENERIC) {
  const result = await extractPatientDataWithVision(readFileSync(join(NEG_DIR, file)), {
    bjcDoctors: BJC_DOCTORS,
  });
  const ok = result.documentType === "generic";
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${file} → ${result.documentType} (${result.classificationConfidence})`);
}

console.log("\n--- Borderline (informational) ---");
for (const file of BORDERLINE) {
  const result = await extractPatientDataWithVision(readFileSync(join(NEG_DIR, file)), {
    bjcDoctors: BJC_DOCTORS,
  });
  console.log(`  ${file} → ${result.documentType} (${result.classificationConfidence})`);
}

const total = SCENARIOS.length + MUST_STAY_GENERIC.length;
console.log("\n" + "=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed out of ${total}`);
console.log("=".repeat(70));

process.exit(failed > 0 ? 1 : 0);
