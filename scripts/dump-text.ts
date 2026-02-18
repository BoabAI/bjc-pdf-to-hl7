/**
 * Dump raw text from PDFs to understand extraction patterns
 * Usage: bun run scripts/dump-text.ts [path-to-pdf]
 *        bun run scripts/dump-text.ts  (dumps first 4 test PDFs from nested dirs)
 */

import pdf from "pdf-parse";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const PDF_DIR = join(import.meta.dir, "../docs/input PDF");
const target = process.argv[2];

/** Recursively find test_*.pdf files */
function findTestPDFs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...findTestPDFs(fullPath));
    } else if (entry.startsWith("test_") && entry.endsWith(".pdf")) {
      results.push(fullPath);
    }
  }
  return results;
}

async function dump() {
  let files: string[];

  if (target) {
    // Absolute path provided directly
    files = [target];
  } else {
    files = findTestPDFs(PDF_DIR).sort().slice(0, 4);
  }

  for (const file of files) {
    const pdfBuffer = readFileSync(file);
    const data = await pdf(pdfBuffer);

    console.log(`\n${"=".repeat(70)}`);
    console.log(`FILE: ${file}`);
    console.log(`${"=".repeat(70)}`);
    // Show text with visible newlines
    const escaped = data.text
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n\n");
    console.log(escaped);
  }
}

dump().catch(console.error);
