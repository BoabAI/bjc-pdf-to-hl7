/**
 * Recaptures the /log and /stats screenshots used by the explainer video.
 *
 * Writes to scripts/video/remotion/public/screenshots/{11-nav-log,12-nav-stats}.png.
 * Authenticates via APP_PASSWORD (no TEST_MODE bypass needed) so we can run
 * against the user's existing dev server on :3000.
 *
 * Run:  bun run scripts/video/capture-log-stats.ts
 */

import { chromium } from "playwright";
import { mkdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load APP_PASSWORD from .env.local without adding a dotenv dependency.
try {
  const envText = readFileSync(join(__dirname, "..", "..", ".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/i.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // Fine — caller may have exported vars already.
}

const SHOTS_DIR = join(__dirname, "remotion", "public", "screenshots");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.APP_PASSWORD;

if (!PASSWORD) {
  console.error("APP_PASSWORD missing from .env.local");
  process.exit(1);
}

mkdirSync(SHOTS_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // Log in via curl (Playwright's request API mis-parses Next's relative cookie path under Bun).
  console.log(`Authenticating at ${BASE_URL}/api/auth/password via curl...`);
  const curl = spawnSync(
    "curl",
    [
      "-s",
      "-D",
      "-",
      "-o",
      "/dev/null",
      "-X",
      "POST",
      "-H",
      "content-type: application/json",
      "-d",
      JSON.stringify({ password: PASSWORD }),
      `${BASE_URL}/api/auth/password`,
    ],
    { encoding: "utf8" }
  );
  if (curl.status !== 0) throw new Error(`curl failed: ${curl.stderr}`);
  const cookies = [...curl.stdout.matchAll(/^set-cookie:\s*([^=]+)=([^;]+);.*?Path=([^;]+)/gim)].map(
    (m) => ({
      name: m[1].trim(),
      value: m[2],
      domain: "localhost",
      path: m[3].trim(),
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    })
  );
  if (cookies.length === 0) throw new Error("No cookies returned from login");
  await ctx.addCookies(cookies);
  console.log(`  ✓ ${cookies.length} cookie(s) added: ${cookies.map((c) => c.name).join(", ")}`);

  for (const [path, id] of [
    ["/log", "11-nav-log"],
    ["/stats", "12-nav-stats"],
  ] as const) {
    console.log(`Capturing ${path} -> ${id}.png`);
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
    // Give donuts/data a moment to render.
    await page.waitForTimeout(2500);
    const file = join(SHOTS_DIR, `${id}.png`);
    await page.screenshot({ path: file, type: "png", fullPage: false });
    console.log(`  ✓ ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }

  await browser.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
