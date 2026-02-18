/**
 * Diagnostic: extract text and patient data from all test PDFs
 * Usage: bun run scripts/diagnose-pdfs.ts
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { extractPatientData } from "../lib/pdf-parser";

const PDF_DIR = join(import.meta.dir, "../docs/input PDF");

async function diagnose() {
  const files = readdirSync(PDF_DIR)
    .filter((f) => f.startsWith("test_") && f.endsWith(".pdf"))
    .sort();

  for (const file of files) {
    const pdfBuffer = readFileSync(join(PDF_DIR, file));
    const result = await extractPatientData(pdfBuffer);

    console.log(`\n${"=".repeat(70)}`);
    console.log(`FILE: ${file}`);
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
  }
}

diagnose().catch(console.error);
