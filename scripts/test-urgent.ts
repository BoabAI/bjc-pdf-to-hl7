#!/usr/bin/env bun
/**
 * Reproduction: does the "Example of Urgent" 4Cyte pathology PDF get held
 * for manual review (reason=urgent_result) instead of auto-routed?
 *
 * Usage: bun run scripts/test-urgent.ts [path-to-pdf]
 * Needs AWS creds (default profile) for the live Bedrock call.
 */

import { readFileSync } from "fs";
import { extractPatientData } from "../lib/pdf-parser";
import { evaluateAutoRouteEligibility } from "../lib/extraction/eligibility";
import { isResultDocumentType } from "../lib/conversion-config";
import { convertPdf } from "../lib/convert-service";
import { DEFAULT_MIN_CLASSIFICATION_CONFIDENCE } from "../lib/settings";

const pdfPath =
  process.argv[2] ??
  "docs/test-pdfs/urgent/example-of-urgent-mock.pdf";

const settings = {
  minClassificationConfidence: DEFAULT_MIN_CLASSIFICATION_CONFIDENCE,
};

console.log("=".repeat(70));
console.log("Urgent-detection reproduction");
console.log("PDF:", pdfPath);
console.log("=".repeat(70));

const pdfBuffer = Buffer.from(readFileSync(pdfPath));

const start = Date.now();
const extraction = await extractPatientData(pdfBuffer);
const elapsed = Date.now() - start;

console.log(`\n--- raw extraction (${elapsed}ms) ---`);
console.log("  success:", extraction.success);
console.log("  documentType:", extraction.documentType);
console.log("  isResultDocumentType:", isResultDocumentType(extraction.documentType));
console.log("  isUrgent:", extraction.isUrgent);
console.log("  classificationConfidence:", extraction.classificationConfidence);
console.log("  name:", extraction.data.firstName, extraction.data.lastName);
console.log("  dob:", extraction.data.dob);
console.log("  addressee:", extraction.referralInfo?.addresseeName ?? "N/A");
if (extraction.warnings?.length) {
  console.log("  warnings:", extraction.warnings.join(" | "));
}

console.log("\n--- eligibility gate ---");
const eligibility = evaluateAutoRouteEligibility({
  extraction,
  mailboxCategory: "none",
  settings,
  strictRequiredFields: true,
});
for (const c of eligibility.checks) {
  console.log(`  ${c.passed ? "PASS" : "FAIL"}  ${c.name}${c.detail ? " — " + c.detail : ""}`);
}
console.log("  eligible:", eligibility.eligible, "reason:", eligibility.reason ?? "(none)");

console.log("\n--- full convertPdf response ---");
const result = await convertPdf(
  { pdfBuffer, detectOnly: false, documentType: "auto", autoFile: true },
  { settings }
);
console.log("  action:", (result as { action?: string }).action);
console.log("  reason:", (result as { reason?: string }).reason ?? "(none)");
console.log("  suggestedCategory:", (result as { suggestedCategory?: string }).suggestedCategory ?? "(none)");

const flaggedUrgent =
  (result as { action?: string }).action === "manual_review" &&
  (result as { reason?: string }).reason === "urgent_result";

console.log("\n" + "=".repeat(70));
console.log(flaggedUrgent ? "✅ FLAGGED URGENT (manual_review)" : "❌ NOT flagged urgent");
console.log("=".repeat(70));

process.exit(flaggedUrgent ? 0 : 1);
