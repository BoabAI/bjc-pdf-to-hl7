/**
 * Diagnostic: extract text and patient data from all test PDFs
 * Searches nested subdirectories for test_*.pdf files
 * Usage: bun run scripts/diagnose-pdfs.ts
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { extractPatientData } from "../lib/pdf-parser";

const PDF_DIR = join(import.meta.dir, "../docs/input PDF");

/** Recursively find all test_*.pdf files in nested directories */
function findTestPDFs(dir: string, prefix = ""): { path: string; relPath: string }[] {
  const results: { path: string; relPath: string }[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;

    if (statSync(fullPath).isDirectory()) {
      results.push(...findTestPDFs(fullPath, relPath));
    } else if (entry.startsWith("test_") && entry.endsWith(".pdf")) {
      results.push({ path: fullPath, relPath });
    }
  }

  return results;
}

async function diagnose() {
  const files = findTestPDFs(PDF_DIR).sort((a, b) => a.relPath.localeCompare(b.relPath));

  console.log(`Found ${files.length} test PDFs across nested directories\n`);

  let successCount = 0;
  let failCount = 0;

  for (const { path, relPath } of files) {
    const pdfBuffer = readFileSync(path);
    const result = await extractPatientData(pdfBuffer);

    console.log(`\n${"=".repeat(70)}`);
    console.log(`FILE: ${relPath}`);
    console.log(`${"=".repeat(70)}`);
    console.log(`Document Type: ${result.documentType}`);
    console.log(`Success: ${result.success}`);
    console.log(`Patient: ${result.data.firstName} ${result.data.lastName}`);
    console.log(`DOB: ${result.data.dob}`);
    console.log(`Sex: ${result.data.sex}`);
    console.log(`Phone: ${result.data.phone || "N/A"}`);
    console.log(`Address: ${result.data.address || "N/A"}`);
    console.log(`Suburb: ${result.data.suburb || "N/A"}`);
    console.log(`State: ${result.data.state || "N/A"}`);
    console.log(`Postcode: ${result.data.postcode || "N/A"}`);
    console.log(`Medicare: ${result.data.medicareNo || "N/A"}-${result.data.medicareRef || "N/A"}`);
    if (result.warnings.length > 0) {
      console.log(`Warnings: ${result.warnings.join("; ")}`);
    }

    if (result.success) successCount++;
    else failCount++;
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`SUMMARY: ${successCount} success, ${failCount} failed, ${files.length} total`);
}

diagnose().catch(console.error);
