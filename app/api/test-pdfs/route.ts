import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { logOperationalError } from "@/lib/server/logging";

export const runtime = "nodejs";

// Whitelist of directories to include. Everything else under `docs/input PDF/`
// (e.g. real consent forms in `originals/`, redacted real referrals) is
// gitignored and may contain PHI — NEVER expose those through this endpoint.
const SAFE_DIRS = ["mock-referrals", "addressee-scenarios", "results"] as const;

// Single-file allowlist for committed dummies that live in otherwise-PHI dirs.
const SAFE_FILES: { dir: string; file: string }[] = [
  { dir: "originals", file: "referral_dummy.pdf" },
];

const TEST_PDF_ROOT = join(process.cwd(), "docs", "input PDF");

interface ZipEntry {
  /** Relative path inside the zip, with directory prefix. */
  zipPath: string;
  /** Absolute path on disk. */
  diskPath: string;
}

async function collectEntries(): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];

  for (const dir of SAFE_DIRS) {
    const abs = join(TEST_PDF_ROOT, dir);
    const files = await readdir(abs).catch(() => [] as string[]);
    for (const file of files) {
      if (!file.toLowerCase().endsWith(".pdf")) continue;
      entries.push({
        zipPath: `${dir}/${file}`,
        diskPath: join(abs, file),
      });
    }
  }

  for (const { dir, file } of SAFE_FILES) {
    entries.push({
      zipPath: `${dir}/${file}`,
      diskPath: join(TEST_PDF_ROOT, dir, file),
    });
  }

  return entries;
}

export async function GET() {
  try {
    const entries = await collectEntries();
    const zip = new JSZip();

    for (const entry of entries) {
      const buf = await readFile(entry.diskPath).catch(() => null);
      if (!buf) continue; // skip missing files silently
      zip.file(entry.zipPath, buf);
    }

    const blob = await zip.generateAsync({ type: "uint8array" });

    return new NextResponse(Buffer.from(blob), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="bjc-test-pdfs.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logOperationalError("test-pdfs", error);
    return NextResponse.json(
      { success: false, error: "Failed to build test PDF zip" },
      { status: 500 }
    );
  }
}
