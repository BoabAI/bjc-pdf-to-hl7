/**
 * UI walkthrough screenshot capture for the explainer video.
 *
 * Captures 7 viewport-only PNGs of the converter UI at 1920x1080 (deviceScaleFactor 2)
 * directly to scripts/video/remotion/public/screenshots/.
 *
 * Prereqs:
 *   - Dev server on http://localhost:3000 with TEST_MODE=true (auth bypass)
 *   - Sample PDFs under docs/input PDF/{referrals,results}/
 *
 * Run:  bun run scripts/video/capture-ui.ts
 */

import { chromium, type Page } from "playwright";
import { mkdirSync, existsSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = join(__dirname, "remotion", "public", "screenshots");
const TOUR_PLAN_PATH = join(__dirname, "tour-plan.json");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

mkdirSync(SHOTS_DIR, { recursive: true });

async function captureShot(page: Page, id: string, label: string): Promise<void> {
  const filePath = join(SHOTS_DIR, `${id}.png`);
  await page.screenshot({ path: filePath, type: "png", fullPage: false });
  const size = statSync(filePath).size;
  if (size < 50_000) {
    console.warn(`  ⚠ ${id} is only ${size} bytes — may be blank`);
  }
  console.log(`  ✓ ${id}.png  (${(size / 1024).toFixed(0)} KB)  — ${label}`);
}

async function dismissOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("[data-cookie-banner], .cookie-consent").forEach((el) => el.remove());
  });
}

async function main() {
  console.log(`Launching chromium against ${BASE_URL}...`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // ---- 01: Empty drop zone ----
  console.log("\n01-drop-zone: home page, empty drop zone");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 10000 });
  // Wait for the upload zone to render
  await page.waitForSelector(".upload-zone, [data-testid='upload-zone'], input[type='file']", { timeout: 8000 });
  await page.waitForTimeout(2000);
  await dismissOverlays(page);
  await captureShot(page, "01-drop-zone", "Empty drop zone");

  // ---- 02: Supported format badges (close-up) ----
  console.log("\n02-supports: supported format badges");
  await page.evaluate(() => {
    const badges = document.querySelector(".badge-blue") as HTMLElement | null;
    if (badges?.parentElement) {
      badges.parentElement.scrollIntoView({ block: "center", behavior: "auto" });
    }
  });
  await page.waitForTimeout(500);
  await captureShot(page, "02-supports", "Supported format badges");

  // ---- Add 2 sample PDFs ----
  console.log("\n   Adding 2 sample PDFs to the queue...");
  const docsRoot = join(__dirname, "..", "..", "docs", "input PDF");
  const referralPdf = join(docsRoot, "referrals", "referral_1.pdf");
  const pathologyPdf = join(docsRoot, "results", "result_1_pathology_chemistry.pdf");

  let pdfA: string | null = existsSync(referralPdf) ? referralPdf : null;
  let pdfB: string | null = existsSync(pathologyPdf) ? pathologyPdf : null;

  if (!pdfA || !pdfB) {
    // Fallback: walk docs/input PDF for any PDFs
    const found: string[] = [];
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) found.push(p);
      }
    };
    walk(docsRoot);
    if (!pdfA && found[0]) pdfA = found[0];
    if (!pdfB && found[1]) pdfB = found[1];
  }
  if (!pdfA || !pdfB) {
    throw new Error(`Could not find 2 sample PDFs under ${docsRoot}`);
  }
  console.log(`   - ${pdfA}`);
  console.log(`   - ${pdfB}`);

  const fileInput = page.locator("input[type='file']");
  await fileInput.setInputFiles([pdfA, pdfB]);
  await page.waitForTimeout(1500);

  // ---- 03: Queue with files ----
  console.log("\n03-queue: file queue with 2 entries");
  await page.evaluate(() => {
    // Scroll to "Files" section header
    const heading = Array.from(document.querySelectorAll("h2, h3, p, span"))
      .find((el) => /^files$/i.test((el.textContent ?? "").trim()));
    if (heading) (heading as HTMLElement).scrollIntoView({ block: "center", behavior: "auto" });
  });
  await page.waitForTimeout(700);
  await captureShot(page, "03-queue", "File queue with 2 entries");

  // ---- 04: Conversion options panel ----
  console.log("\n04-options: conversion options panel");
  await page.evaluate(() => {
    // The ConversionOptions panel renders inline once entries exist.
    // Find an element whose text contains 'Carrier' or 'Auto-file' or 'Conversion Options'.
    const candidates = Array.from(document.querySelectorAll("section, fieldset, div, label, h2, h3"))
      .filter((el) => /carrier|auto-?file|conversion options|send to doctor/i.test(el.textContent ?? ""))
      .filter((el) => (el as HTMLElement).offsetHeight > 0);
    // Pick the smallest container that contains "Carrier" — likely the options card.
    const target = candidates.sort((a, b) => (a as HTMLElement).offsetHeight - (b as HTMLElement).offsetHeight)[0];
    if (target) (target as HTMLElement).scrollIntoView({ block: "center", behavior: "auto" });
  });
  await page.waitForTimeout(700);
  await captureShot(page, "04-options", "Conversion options");

  // ---- 05: Mid-conversion ----
  console.log("\n05-converting: mid-conversion state");
  const convertButton = page
    .locator("button")
    .filter({ hasText: /convert/i })
    .filter({ hasNotText: /reset|clear/i })
    .first();

  if ((await convertButton.count()) > 0) {
    await convertButton.scrollIntoViewIfNeeded();
    await convertButton.click();
    await page.waitForTimeout(900);
  } else {
    console.warn("  ⚠ Convert button not found — capturing pre-convert queue state");
  }
  // Scroll to the queue mid-flight
  await page.evaluate(() => {
    const firstEntry = document.querySelector("[data-status], .file-queue-item, [class*='queue']");
    if (firstEntry) (firstEntry as HTMLElement).scrollIntoView({ block: "center", behavior: "auto" });
  });
  await captureShot(page, "05-converting", "Mid-conversion");

  // ---- Wait for conversion to complete ----
  console.log("\n   Waiting for conversion to complete (up to 90s)...");
  try {
    await page.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const downloadCount = buttons.filter((b) => /download/i.test(b.textContent ?? "")).length;
        return downloadCount >= 1;
      },
      { timeout: 90000 }
    );
  } catch {
    console.warn("  ⚠ Convert didn't complete within 90s — continuing");
  }
  await page.waitForTimeout(1500);

  // ---- 06: Result / completed queue ----
  console.log("\n06-result: completed queue");
  await page.evaluate(() => {
    const firstDone = Array.from(document.querySelectorAll("button")).find(
      (b) => /download/i.test(b.textContent ?? "")
    );
    if (firstDone) firstDone.scrollIntoView({ block: "center", behavior: "auto" });
    else window.scrollTo({ top: 200, behavior: "auto" });
  });
  await page.waitForTimeout(500);
  await captureShot(page, "06-result", "Completed queue");

  // ---- 07: Download (hover) ----
  console.log("\n07-download: download button hover");
  const downloadBtn = page
    .locator("button")
    .filter({ hasText: /download/i })
    .first();
  if ((await downloadBtn.count()) > 0) {
    await downloadBtn.scrollIntoViewIfNeeded();
    await downloadBtn.hover();
    await page.waitForTimeout(400);
  }
  await captureShot(page, "07-download", "Download action");

  await browser.close();

  // Write tour-plan.json with shot metadata.
  const tourPlan = [
    { id: "01-drop-zone",  file: "screenshots/01-drop-zone.png",  label: "Drop zone",      url: "app.example.com",       shotArchetype: "establish",    zoom: 1.6 },
    { id: "02-supports",   file: "screenshots/02-supports.png",   label: "Document types", url: "app.example.com",       shotArchetype: "detail-crop",  zoom: 2.0 },
    { id: "03-queue",      file: "screenshots/03-queue.png",      label: "File queue",     url: "app.example.com",       shotArchetype: "result-state", zoom: 1.6 },
    { id: "04-options",    file: "screenshots/04-options.png",    label: "Options",        url: "app.example.com",       shotArchetype: "detail-crop",  zoom: 1.8 },
    { id: "05-converting", file: "screenshots/05-converting.png", label: "Converting",     url: "app.example.com",       shotArchetype: "push-in",      zoom: 1.6 },
    { id: "06-result",     file: "screenshots/06-result.png",     label: "Routing",        url: "app.example.com",       shotArchetype: "result-state", zoom: 1.6 },
    { id: "07-download",   file: "screenshots/07-download.png",   label: "Download",       url: "app.example.com",       shotArchetype: "detail-crop",  zoom: 2.0 },
  ];
  writeFileSync(TOUR_PLAN_PATH, JSON.stringify(tourPlan, null, 2) + "\n");
  console.log(`\n✓ Wrote tour-plan.json with ${tourPlan.length} shots`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
