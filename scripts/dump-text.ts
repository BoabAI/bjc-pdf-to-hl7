/**
 * Dump raw text from PDFs to understand extraction patterns
 * Usage: bun run scripts/dump-text.ts [filename]
 */

import pdf from "pdf-parse";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const PDF_DIR = join(import.meta.dir, "../docs/input PDF");
const target = process.argv[2];

async function dump() {
  const files = target
    ? [target]
    : readdirSync(PDF_DIR)
        .filter((f) => f.startsWith("test_") && f.endsWith(".pdf"))
        .sort()
        .slice(0, 4); // First 4 only

  for (const file of files) {
    const pdfBuffer = readFileSync(join(PDF_DIR, file));
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
