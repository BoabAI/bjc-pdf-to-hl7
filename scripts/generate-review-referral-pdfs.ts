/**
 * Generate fictional review-referral PDFs that exercise the misclassification
 * pattern Nicole reported (BJC ops, 4 May 2026): GP review-referrals with
 * date-prefixed problem lists + tabular medication grids that Bedrock
 * misclassified as pathology / radiology results.
 *
 * Templates live in `scripts/review-referral-templates/*.html`. Output PDFs
 * are written to `docs/test-pdfs/review-referrals/` and committed to the repo
 * (fictional content only — no PHI).
 *
 * Usage: bun scripts/generate-review-referral-pdfs.ts
 */

import puppeteer from "puppeteer";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const TEMPLATE_DIR = join(import.meta.dir, "review-referral-templates");
const OUT_DIR = join(
  import.meta.dir,
  "..",
  "docs",
  "test-pdfs",
  "review-referrals"
);
mkdirSync(OUT_DIR, { recursive: true });

interface Scenario {
  template: string;
  filename: string;
  description: string;
}

const SCENARIOS: Scenario[] = [
  {
    template: "review-referral-osteoarthritis.html",
    filename: "review_referral_osteoarthritis.pdf",
    description:
      "GP review referral for rheumatoid arthritis + secondary OA (analog of Nicole's testing example 1)",
  },
  {
    template: "review-referral-chronic-condition.html",
    filename: "review_referral_chronic_urticaria.pdf",
    description:
      "GP review referral for chronic spontaneous urticaria + asthma (analog of Nicole's testing example 2)",
  },
];

async function main(): Promise<void> {
  const browser = await puppeteer.launch();
  try {
    for (const scenario of SCENARIOS) {
      const html = readFileSync(
        join(TEMPLATE_DIR, scenario.template),
        "utf-8"
      );
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const pdfBuffer = await page.pdf({
        format: "A4",
        margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
        printBackground: true,
      });
      const outPath = join(OUT_DIR, scenario.filename);
      writeFileSync(outPath, pdfBuffer);
      console.log(`OK ${scenario.filename} — ${scenario.description}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\nGenerated ${SCENARIOS.length} PDFs in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
