/**
 * Generate synthetic study / examination report PDFs — the document families
 * Nicole reported landing in "Unknown type" (generic) on 22 Sep 2026. They
 * should classify as consult_letter and route to Genie Incoming Letters.
 *
 * Layouts mirror the real faxes; all patients, clinicians and clinics are
 * fictional (addressees are BJC roster doctors so resolution can be checked).
 *
 * Output: docs/test-pdfs/study-reports/
 *
 *   1. sleep_study.pdf          — ambulatory sleep study report, "Referring Physician:" line
 *   2. nerve_conduction.pdf     — nerve conduction study, tables + Report/Comment
 *   3. eye_exam_report.pdf      — optometry "Eye Examination Report", To:/From: blocks
 *
 * Run with: bun scripts/generate-study-report-test-pdfs.ts
 */

import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "study-reports");
mkdirSync(OUT_DIR, { recursive: true });

const BASE_CSS = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; padding: 20px 28px; line-height: 1.35; }
  h1 { font-size: 15pt; margin: 8px 0 12px 0; }
  .letterhead { display: flex; justify-content: space-between; margin-bottom: 16px; }
  .brand { font-size: 20pt; color: #335; }
  .contact { text-align: right; font-size: 9pt; }
  table { border-collapse: collapse; margin: 8px 0 12px 0; font-size: 9pt; }
  th, td { border: 1px solid #777; padding: 3px 8px; text-align: left; }
  th { background: #eee; }
  .kv td { border: none; padding: 1px 12px 1px 0; }
  .section { font-weight: bold; text-decoration: underline; margin-top: 12px; }
  .two-col { display: flex; gap: 40px; margin-bottom: 12px; }
`;

const SLEEP_STUDY_HTML = `
<!DOCTYPE html>
<html><head><style>${BASE_CSS}</style></head><body>
  <div class="letterhead">
    <div class="brand">Harbourside Sleep Diagnostics</div>
    <div class="contact">Phone: 1300 000 111<br/>Fax: 1300 000 112<br/>sleep@harbourside-sleep.example</div>
  </div>
  <h1 style="text-align:center"><em>AMBULATORY SLEEP STUDY REPORT</em></h1>
  <table class="kv">
    <tr><td><b>Patient Name:</b></td><td>Graham PETERSEN</td><td><b>Referring Physician:</b></td><td>Dr Queenie Luu</td></tr>
    <tr><td><b>Date of Birth:</b></td><td>04/03/1961</td><td><b>Referring Clinic:</b></td><td>BJC Health</td></tr>
    <tr><td><b>Gender:</b></td><td>Male</td><td><b>Interpreting Physician:</b></td><td>Dr Marcus Hale</td></tr>
    <tr><td><b>Age:</b></td><td>65</td><td><b>Study Date:</b></td><td>14/09/2026</td></tr>
  </table>
  <div class="section">Patient Clinical Information</div>
  <table class="kv"><tr><td>Height: 178 cm</td><td>Weight: 112 kg</td><td>BMI: 35.3 kg/m²</td></tr>
  <tr><td>Epworth Score: 11/24</td><td>STOP-BANG: 6/8</td><td>OSA 50: 9/10</td></tr></table>
  <div class="section">Summary of findings:</div>
  <ul>
    <li>Signal quality was sufficient for evaluation of sleep during the study.</li>
    <li>Total sleep time was 402.0 minutes; supine for 44.0% of total sleep time.</li>
    <li>Overall Apnoea Hypopnoea Index of 34.2, more prevalent in supine sleep.</li>
    <li>Mean oxygen saturation 90%, nadir 76%, Oxygen Desaturation Index 31.5.</li>
  </ul>
  <table>
    <tr><th></th><th>NREM Supine</th><th>NREM Non-supine</th><th>REM Total</th><th>All sleep AHI</th></tr>
    <tr><td>AHI/hr</td><td>48.0</td><td>22.1</td><td>39.4</td><td>34.2</td></tr>
  </table>
  <p><b>ECG:</b> Normal sinus rhythm. No sustained arrhythmias during sleep.</p>
  <p><b>Conclusion:</b> Severe obstructive sleep apnoea.</p>
  <p><b>Recommendation:</b> Clinical review to discuss results and management options including CPAP therapy.</p>
  <p>Reported by:<br/><br/>Dr Marcus Hale<br/>Provider # 0000101A<br/>Respiratory &amp; Sleep Physician</p>
</body></html>
`;

const NERVE_CONDUCTION_HTML = `
<!DOCTYPE html>
<html><head><style>${BASE_CSS}</style></head><body>
  <div class="letterhead">
    <div class="brand">Northshore Neurophysiology</div>
    <div class="contact">Suite 12, 40 Example Road<br/>Hornsby NSW 2077<br/>Telephone 02 9000 0001<br/>Fax 02 9000 0002</div>
  </div>
  <p style="text-align:center"><b>Dr Laura Benedetti</b><br/>MBBS, FRACP<br/>CONSULTANT NEUROLOGIST</p>
  <table class="kv">
    <tr><td><b>Full Name:</b></td><td>Doris WALLACE</td><td><b>Gender:</b></td><td>Female</td></tr>
    <tr><td><b>Patient ID:</b></td><td>26-0917</td><td><b>Date of Birth:</b></td><td>19/12/1948</td></tr>
  </table>
  <table class="kv">
    <tr><td><b>Visit Date:</b></td><td>11/09/2026 10:40 AM</td></tr>
    <tr><td><b>Examining Physician:</b></td><td>Laura Benedetti</td></tr>
    <tr><td><b>Referring Physician:</b></td><td>Dr Herman Lau</td></tr>
    <tr><td><b>Patient History:</b></td><td>?Carpal tunnel syndrome R&gt;L</td></tr>
  </table>
  <div class="section">Sensory Nerve Conduction</div>
  <table>
    <tr><th>Nerve / Sites</th><th>Rec. Site</th><th>Onset Lat ms</th><th>Amp. µV</th><th>Distance mm</th><th>Velocity m/s</th></tr>
    <tr><td>R Median Dig II</td><td>Wrist</td><td>4.1</td><td>6.2</td><td>135</td><td>33</td></tr>
    <tr><td>L Median Dig II</td><td>Wrist</td><td>3.4</td><td>11.8</td><td>135</td><td>40</td></tr>
    <tr><td>R Ulnar Dig V</td><td>Wrist</td><td>2.5</td><td>9.1</td><td>120</td><td>48</td></tr>
  </table>
  <div class="section">Motor Nerve Conduction</div>
  <table>
    <tr><th>Nerve / Sites</th><th>Muscle</th><th>Latency ms</th><th>Amplitude mV</th><th>Velocity m/s</th></tr>
    <tr><td>R Median - Wrist</td><td>APB</td><td>5.8</td><td>5.1</td><td></td></tr>
    <tr><td>R Median - Elbow</td><td>APB</td><td>10.2</td><td>4.8</td><td>50</td></tr>
    <tr><td>L Median - Wrist</td><td>APB</td><td>4.2</td><td>8.4</td><td></td></tr>
  </table>
  <div class="section">Report</div>
  <p>Right median sensory and motor distal latencies are prolonged with reduced sensory amplitude. Left median studies show mild slowing across the wrist. Ulnar studies are normal.</p>
  <div class="section">Comment</div>
  <p>Today's nerve conduction studies show <b>moderate right and mild left median neuropathy at the wrist</b>, consistent with bilateral carpal tunnel syndrome.</p>
  <p><br/>Dr Laura Benedetti</p>
</body></html>
`;

const EYE_EXAM_HTML = `
<!DOCTYPE html>
<html><head><style>${BASE_CSS}</style></head><body>
  <div class="letterhead">
    <div><h1 style="margin:0">Eye Examination Report</h1>18 September 2026</div>
    <div class="brand">ClearView Optometry</div>
  </div>
  <div class="two-col">
    <div>To:<br/><b style="font-size:13pt">Dr Vincent Wong</b><br/><b>BJC Health - Parramatta</b><br/>17-21 Hunter Street, Parramatta, NSW, 2150</div>
    <div>From:<br/><b style="font-size:13pt">Ms Priya Nand (0000202B)</b><br/><b>ClearView Optometry Parramatta</b><br/>Shop 12, 1 Example Mall, Parramatta, NSW, 2150</div>
  </div>
  <table class="kv">
    <tr><td><b>Patient:</b></td><td>Margaret O'SULLIVAN</td></tr>
    <tr><td><b>DOB:</b></td><td>27/06/1955</td></tr>
    <tr><td><b>Address:</b></td><td>8 Sample Street, Westmead NSW 2145</td></tr>
  </table>
  <table class="kv">
    <tr><td><b>Reason for report</b></td><td>Hydroxychloroquine screening</td></tr>
    <tr><td><b>Key findings</b></td><td>Eye report for patient seen on 18/09/2026.</td></tr>
  </table>
  <p>Dear Dr Wong,</p>
  <p>I saw Margaret today for her annual hydroxychloroquine retinal screening. Visual fields and OCT macula scans are unchanged from last year, with no evidence of retinal toxicity. I will recall her in 12 months.</p>
  <p>Kind regards,<br/>Ms Priya Nand</p>
  <table>
    <tr><th>Examination findings</th><th>RIGHT EYE</th><th>LEFT EYE</th></tr>
    <tr><td>Visual acuity</td><td>6/6</td><td>6/7.5</td></tr>
    <tr><td>Visual correction</td><td>best corrected</td><td>best corrected</td></tr>
  </table>
  <table class="kv">
    <tr><td><b>Patient will be recalled on</b></td><td>18 September 2027 (12 months)</td></tr>
    <tr><td><b>Current medication</b></td><td>Hydroxychloroquine 200mg daily</td></tr>
  </table>
</body></html>
`;

const SCENARIOS: { filename: string; html: string; description: string }[] = [
  { filename: "sleep_study.pdf", description: "Ambulatory sleep study report", html: SLEEP_STUDY_HTML },
  { filename: "nerve_conduction.pdf", description: "Nerve conduction study report", html: NERVE_CONDUCTION_HTML },
  { filename: "eye_exam_report.pdf", description: "Optometry eye examination report", html: EYE_EXAM_HTML },
];

async function main() {
  const browser = await puppeteer.launch();
  try {
    for (const scenario of SCENARIOS) {
      const page = await browser.newPage();
      await page.setContent(scenario.html, { waitUntil: "domcontentloaded" });
      const pdfBuffer = await page.pdf({
        format: "A4",
        margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
        printBackground: true,
      });
      writeFileSync(join(OUT_DIR, scenario.filename), pdfBuffer);
      console.log(`✅ ${scenario.filename} — ${scenario.description}`);
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
