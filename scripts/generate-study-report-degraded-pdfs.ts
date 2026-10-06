/**
 * Fax-realistic variants of the study-report fixtures. Real faxes arrive as
 * image-only PDFs (no text layer) with speckle, skew and a fax header line,
 * and sleep studies run to several pages — the clean fixtures in
 * study-reports/ don't exercise any of that.
 *
 * Each page is rendered, degraded (speckle, blur, skew, fax header), captured
 * as a low-quality JPEG, and re-assembled into an image-only PDF.
 * All patients, clinicians and clinics are fictional.
 *
 * Output: docs/test-pdfs/study-reports/degraded/
 *
 *   sleep_study_fax_4p.pdf        — 4-page sleep study (summary, data tables, graph page)
 *   nerve_conduction_fax_2p.pdf   — 2-page NCS (results tables split across pages)
 *   eye_exam_fax.pdf              — single-page eye exam report
 *   sleep_study_urgent_fax.pdf    — sleep study with an URGENT stamp
 *   ncs_nonroster_fax.pdf         — NCS whose referring physician is not a BJC doctor
 *   eye_exam_cc_bjc_fax.pdf       — eye report to an external GP, BJC doctor on CC
 *
 * Run with: bun scripts/generate-study-report-degraded-pdfs.ts
 */

import puppeteer, { type Browser } from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { EYE_EXAM_HTML, NERVE_CONDUCTION_HTML, SLEEP_STUDY_HTML } from "./generate-study-report-test-pdfs";

const OUT_DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "study-reports", "degraded");

const A4 = { width: 794, height: 1123 };

const faxHeader = (stamp: string, page: number) =>
  `<div style="font-family:'Courier New',monospace;font-weight:bold;font-size:12pt;display:flex;justify-content:space-between;padding:4px 10px;">` +
  `<span>${stamp} &nbsp; UTC &nbsp; To: 61290000000</span><span>p.${page}</span></div>`;

// Wrap a body fragment (or a full HTML doc's body) in fax degradation.
function degrade(html: string, stamp: string, page: number, skewDeg: number): string {
  const body = html.includes("<body>") ? html.split("<body>")[1].split("</body>")[0] : html;
  const head = html.includes("<style>") ? html.split("<style>")[1].split("</style>")[0] : "";
  return `<!DOCTYPE html><html><head><style>${head}
    html, body { margin:0; width:${A4.width}px; height:${A4.height}px; overflow:hidden; background:#fff; }
    #wrap { transform: rotate(${skewDeg}deg); transform-origin: center; filter: blur(0.5px) contrast(1.4) grayscale(1); }
    #noise { position:absolute; inset:0; pointer-events:none; }
  </style></head><body>
    <div id="wrap">${faxHeader(stamp, page)}${body}</div>
    <canvas id="noise" width="${A4.width}" height="${A4.height}"></canvas>
    <script>
      const c = document.getElementById('noise').getContext('2d');
      let s = ${page * 7919};
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      c.fillStyle = '#000';
      for (let i = 0; i < 2600; i++) c.fillRect(rnd() * ${A4.width}, rnd() * ${A4.height}, rnd() < 0.9 ? 1 : 2, 1);
      c.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = 0; y < ${A4.height}; y += 3 + Math.floor(rnd() * 9)) c.fillRect(0, y, ${A4.width}, 1);
    </script>
  </body></html>`;
}

const SLEEP_P2 = `<p><b>Study Date: 14/09/2026</b></p><h3>Sleep Data — SLEEP ARCHITECTURE</h3>
  <table><tr><th>Start time</th><td>21:04</td><th>Sleep efficiency</th><td>71.2%</td></tr>
  <tr><th>Stop time</th><td>06:40</td><th>WASO</th><td>64.0 min</td></tr>
  <tr><th>Total sleep time</th><td>402.0 min</td><th>Sleep latency</th><td>38.0 min</td></tr></table>
  <h3>RESPIRATORY DATA</h3>
  <table><tr><th>Event type</th><th>NREM supine</th><th>NREM non-supine</th><th>REM</th></tr>
  <tr><td>Obstructive apnoea</td><td>9.1</td><td>2.2</td><td>11.0</td></tr>
  <tr><td>Hypopnoea</td><td>38.4</td><td>19.9</td><td>28.4</td></tr>
  <tr><td>AHI</td><td>48.0</td><td>22.1</td><td>39.4</td></tr></table>`;
const SLEEP_P3 = `<p><b>Study Date: 14/09/2026</b></p><h3>OXYGEN SATURATION</h3>
  <table><tr><th></th><th>WAKE</th><th>NREM</th><th>REM</th><th>TIB</th></tr>
  <tr><td>Mean SpO2%</td><td>93</td><td>90</td><td>89</td><td>90</td></tr>
  <tr><td>Minimum SpO2%</td><td>-</td><td>-</td><td>-</td><td>76</td></tr></table>
  <h3>CARDIAC SUMMARY</h3><table><tr><td>Average heart rate</td><td>66 bpm</td></tr><tr><td>Highest</td><td>81 bpm</td></tr></table>`;
const SLEEP_P4 = `<p><b>Study Date: 14/09/2026</b></p><h3>Graphic Summary</h3>
  ${["Hypnogram", "Body Position", "SpO2", "Arousal", "Snore"].map((l) =>
    `<p>${l}</p><svg width="640" height="70"><polyline fill="none" stroke="#000" points="${Array.from({ length: 64 }, (_, i) => `${i * 10},${35 + Math.round(Math.sin(i * 1.7 + l.length) * 25)}`).join(" ")}"/></svg>`
  ).join("")}`;

const NCS_P1 = NERVE_CONDUCTION_HTML.split('<div class="section">Motor Nerve Conduction</div>')[0] + "</body></html>";
const NCS_P2 = `<div class="section">Motor Nerve Conduction</div>` +
  NERVE_CONDUCTION_HTML.split('<div class="section">Motor Nerve Conduction</div>')[1];

const URGENT_STAMP = `<div style="position:absolute;top:140px;right:60px;border:4px solid #000;padding:6px 18px;font-size:26pt;font-weight:bold;transform:rotate(-8deg);">URGENT</div>`;

const SCENARIOS: { filename: string; pages: { html: string; skew: number }[]; stamp: string }[] = [
  {
    filename: "sleep_study_fax_4p.pdf",
    stamp: "17-Sep-2026 08:16",
    pages: [
      { html: SLEEP_STUDY_HTML, skew: -0.8 },
      { html: SLEEP_P2, skew: -0.6 },
      { html: SLEEP_P3, skew: -0.9 },
      { html: SLEEP_P4, skew: -0.7 },
    ],
  },
  {
    filename: "nerve_conduction_fax_2p.pdf",
    stamp: "12-Sep-2026 02:41",
    pages: [
      { html: NCS_P1, skew: 1.1 },
      { html: NCS_P2, skew: 1.0 },
    ],
  },
  { filename: "eye_exam_fax.pdf", stamp: "18-Sep-2026 04:08", pages: [{ html: EYE_EXAM_HTML, skew: 0.6 }] },
  {
    filename: "sleep_study_urgent_fax.pdf",
    stamp: "17-Sep-2026 09:02",
    pages: [{ html: SLEEP_STUDY_HTML.replace("<body>", `<body>${URGENT_STAMP}`), skew: -0.5 }],
  },
  {
    filename: "ncs_nonroster_fax.pdf",
    stamp: "12-Sep-2026 03:10",
    pages: [
      { html: NCS_P1.replace("Dr Herman Lau", "Dr Gregory Tanaka-Wells"), skew: 0.9 },
      { html: NCS_P2, skew: 0.8 },
    ],
  },
  {
    filename: "eye_exam_cc_bjc_fax.pdf",
    stamp: "18-Sep-2026 05:20",
    pages: [{
      html: EYE_EXAM_HTML
        .replace("Dr Vincent Wong</b><br/><b>BJC Health - Parramatta</b><br/>17-21 Hunter Street, Parramatta, NSW, 2150",
          "Dr Fiona Marsh</b><br/><b>Westmead Family Practice</b><br/>1 Example Street, Westmead, NSW, 2145")
        .replace("Dear Dr Wong,", "Dear Dr Marsh,")
        .replace("<p>Kind regards,<br/>Ms Priya Nand</p>",
          "<p>Kind regards,<br/>Ms Priya Nand</p><p><b>cc:</b> Dr Vincent Wong, BJC Health — Parramatta</p>"),
      skew: 0.7,
    }],
  },
];

async function renderPage(browser: Browser, html: string): Promise<string> {
  const page = await browser.newPage();
  await page.setViewport(A4);
  await page.setContent(html, { waitUntil: "load" });
  const jpeg = await page.screenshot({ type: "jpeg", quality: 35, encoding: "base64" });
  await page.close();
  return jpeg;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch();
  try {
    for (const s of SCENARIOS) {
      const images: string[] = [];
      for (const [i, p] of s.pages.entries()) images.push(await renderPage(browser, degrade(p.html, s.stamp, i + 1, p.skew)));
      const doc = await browser.newPage();
      await doc.setContent(
        `<html><body style="margin:0">${images
          .map((b64) => `<img src="data:image/jpeg;base64,${b64}" style="width:210mm;height:297mm;display:block;page-break-after:always">`)
          .join("")}</body></html>`,
        { waitUntil: "load" }
      );
      writeFileSync(join(OUT_DIR, s.filename), await doc.pdf({ format: "A4", margin: { top: 0, bottom: 0, left: 0, right: 0 } }));
      await doc.close();
      console.log(`✅ ${s.filename} (${s.pages.length}p, image-only)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
