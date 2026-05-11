/**
 * Generate synthetic test PDFs that exercise WS1 (multipage cover letter)
 * and WS2 (letter_subtype demotion) classification rules.
 *
 * Output: docs/test-pdfs/letter-subtypes/
 *
 *   1. letter_followup.pdf            — specialist follow-up update letter
 *   2. letter_discharge.pdf           — specialist discharging back to GP
 *   3. letter_result_commentary.pdf   — specialist commenting on lab results
 *   4. multipage_referral_with_results.pdf — page 1 referral + 2+ result pages
 *
 * Run with: bun scripts/generate-letter-subtype-test-pdfs.ts
 */

import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "letter-subtypes");
mkdirSync(OUT_DIR, { recursive: true });

const BASE_CSS = `
  body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; color: #111; padding: 24px 32px; line-height: 1.45; }
  .letterhead { text-align: right; font-size: 10pt; color: #333; margin-bottom: 32px; }
  .letterhead h2 { margin: 0 0 4px 0; font-size: 14pt; color: #003366; }
  .meta { margin-bottom: 16px; font-size: 10pt; color: #444; }
  .recipient { margin-bottom: 20px; }
  .re-line { font-weight: bold; margin: 16px 0 12px 0; }
  p { margin: 0 0 12px 0; }
  .signoff { margin-top: 24px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; }
  th { background: #eee; }
  .page-break { page-break-after: always; }
  .results-header { background: #f5f5f5; padding: 8px; margin: 16px 0 8px 0; font-weight: bold; }
`;

const FOLLOWUP_HTML = `
<!DOCTYPE html>
<html><head><style>${BASE_CSS}</style></head><body>
  <div class="letterhead">
    <h2>BJC Health Rheumatology</h2>
    <div>Parramatta · Chatswood · Bondi Junction</div>
    <div>P: 1300 252 698</div>
  </div>
  <div class="meta">12 May 2026</div>
  <div class="recipient">
    Dr Mark Stevenson<br/>
    Parramatta Family Medical Centre<br/>
    225 Church Street<br/>
    Parramatta NSW 2150
  </div>

  <p>Dear Mark,</p>

  <div class="re-line">RE: WHITAKER, Helen — DOB 22/08/1957 — Medicare 2298765432 / 1</div>

  <p>Thank you for sending Helen back for her three-month rheumatoid arthritis review on 10 May 2026. I am writing to update you on her progress since we adjusted her treatment in February.</p>

  <p>Helen has tolerated the increase in methotrexate to 20mg weekly very well, with no nausea and stable liver enzymes (ALT 28, AST 24). Her morning stiffness has reduced from 90 minutes to about 20 minutes, and her DAS28 has dropped from 4.6 to 2.9 — a clinical response we are both pleased with. Hand swelling and tenderness in the MCP joints have largely resolved.</p>

  <p>I have asked her to continue methotrexate 20mg weekly, folic acid 5mg daily (excluding the methotrexate day), and to maintain her existing low-dose prednisolone wean. She will continue regular bloods through your rooms every six weeks.</p>

  <p>I will see her again in three months. There is no need for any further action at your end — this letter is simply to keep you informed of her ongoing care.</p>

  <p>Kind regards,</p>

  <div class="signoff">
    <p>Dr Irwin Lim<br/>
    Rheumatologist<br/>
    BJC Health<br/>
    Provider No. 2412345Y</p>
  </div>
</body></html>
`;

const DISCHARGE_HTML = `
<!DOCTYPE html>
<html><head><style>${BASE_CSS}</style></head><body>
  <div class="letterhead">
    <h2>BJC Health Rheumatology</h2>
    <div>Parramatta · Chatswood · Bondi Junction</div>
    <div>P: 1300 252 698</div>
  </div>
  <div class="meta">14 May 2026</div>
  <div class="recipient">
    Dr Sarah Bennington<br/>
    Bondi Junction Medical Practice<br/>
    100 Oxford Street<br/>
    Bondi Junction NSW 2022
  </div>

  <p>Dear Sarah,</p>

  <div class="re-line">RE: PETROVIC, Aleksandar — DOB 04/11/1971 — Medicare 5172839405 / 2</div>

  <p>I am writing to formally discharge Aleksandar from my rheumatology clinic, with thanks for the original referral in 2023.</p>

  <p>As you know, Aleksandar was initially referred for investigation of polyarthralgia. Following work-up his symptoms were attributed to a non-inflammatory mechanical aetiology rather than seronegative inflammatory arthritis. We have monitored him for two years with serial inflammatory markers all within normal range (most recently ESR 6, CRP &lt;3), and clinically he has remained well on physiotherapy alone with no need for DMARD therapy.</p>

  <p>I am therefore discharging him back to your care. There is no ongoing need for specialist rheumatology input. Should his symptoms change in character — particularly if he develops genuine joint swelling, prolonged morning stiffness, or systemic features — I would be very happy to see him again on re-referral.</p>

  <p>Thank you again for the original referral and the ongoing primary care.</p>

  <p>Kind regards,</p>

  <div class="signoff">
    <p>Dr Adam Maundrell<br/>
    Rheumatologist<br/>
    BJC Health<br/>
    Provider No. 2487654X</p>
  </div>
</body></html>
`;

const RESULT_COMMENTARY_HTML = `
<!DOCTYPE html>
<html><head><style>${BASE_CSS}</style></head><body>
  <div class="letterhead">
    <h2>BJC Health Rheumatology</h2>
    <div>Parramatta · Chatswood · Bondi Junction</div>
    <div>P: 1300 252 698</div>
  </div>
  <div class="meta">16 May 2026</div>
  <div class="recipient">
    Dr Linda Chen<br/>
    Chatswood Family Practice<br/>
    14 Victoria Avenue<br/>
    Chatswood NSW 2067
  </div>

  <p>Dear Linda,</p>

  <div class="re-line">RE: HARROD, Catherine — DOB 17/06/1984 — Medicare 3148572036 / 1</div>

  <p>Thank you for arranging the autoimmune panel for Catherine. I wanted to write briefly to comment on the results, which I have now reviewed alongside her recent symptoms.</p>

  <p>Her ANA returned positive at 1:320 with a speckled pattern. ENA panel was negative for SSA, SSB, Sm, RNP, Scl-70, and Jo-1. Complement levels (C3 and C4) were within normal limits, and her CRP was 4 with an ESR of 14. dsDNA was negative.</p>

  <p>In the clinical context — fatigue without arthralgia, no rash, no oral ulceration, no Raynaud's — these results do not meet criteria for any defined connective tissue disease. A positive ANA at this titre in a 41-year-old woman without specific clinical features is most likely incidental, although I would acknowledge that a small subset of these patients evolve over time.</p>

  <p>No further specialist follow-up is required at this stage. I have asked her to return to you if she develops new joint symptoms, photosensitive rash, dry eyes / dry mouth, or Raynaud's phenomenon, in which case I would be happy to reassess.</p>

  <p>Kind regards,</p>

  <div class="signoff">
    <p>Dr Ilana Ginges<br/>
    Rheumatologist<br/>
    BJC Health<br/>
    Provider No. 2455678P</p>
  </div>
</body></html>
`;

const MULTIPAGE_REFERRAL_HTML = `
<!DOCTYPE html>
<html><head><style>${BASE_CSS}</style></head><body>
  <!-- PAGE 1: GP REFERRAL COVER LETTER -->
  <div class="letterhead">
    <h2>Rozelle Family Medical Centre</h2>
    <div>88 Darling Street, Rozelle NSW 2039</div>
    <div>P: 02 9810 4422</div>
  </div>
  <div class="meta">8 May 2026</div>
  <div class="recipient">
    Dear Rheumatologist,<br/>
    BJC Health<br/>
    Parramatta NSW 2150
  </div>

  <div class="re-line">re. Mrs Jennifer O'Connor — DOB 23/04/1968 — Medicare 4198273645 / 1</div>

  <p>Address: 47 Beattie Street, Balmain NSW 2041</p>
  <p>Phone: 0419 887 332</p>

  <p>I am referring Mrs O'Connor for assessment and management of a six-month history of symmetrical polyarthralgia affecting the small joints of her hands, wrists, and feet, with associated morning stiffness lasting up to two hours.</p>

  <p>Her symptoms have progressed despite trial of regular paracetamol and a short course of celecoxib. There is now visible synovitis at the MCPs bilaterally and tenderness at the MTPs. She has lost approximately 4 kg of weight unintentionally over the same period and reports significant fatigue.</p>

  <p>Recent investigations are attached for your reference, including a positive rheumatoid factor and elevated anti-CCP, along with raised inflammatory markers. Hand X-rays are also enclosed.</p>

  <p>I would be grateful for your assessment, advice on diagnosis, and consideration of DMARD therapy. Please contact me if you require any further information.</p>

  <p>Yours sincerely,</p>

  <div class="signoff">
    <p>Dr Mary Sutherland<br/>
    General Practitioner<br/>
    Provider No. 0512345A</p>
  </div>

  <div class="page-break"></div>

  <!-- PAGE 2: ATTACHED PATHOLOGY RESULT -->
  <div class="letterhead">
    <h2>Douglass Hanly Moir Pathology</h2>
    <div>14 Giffnock Avenue, Macquarie Park NSW 2113</div>
    <div>NATA Accredited Laboratory No. 1438</div>
  </div>
  <div class="meta">Collected: 28 April 2026 08:42 · Reported: 28 April 2026 16:10</div>

  <p><strong>Patient:</strong> O'CONNOR, Jennifer · DOB 23/04/1968 · Sex F<br/>
  <strong>Referring Doctor:</strong> Dr Mary Sutherland, Rozelle Family Medical Centre</p>

  <div class="results-header">Inflammatory & Rheumatology Panel</div>

  <table>
    <thead><tr><th>Analyte</th><th>Result</th><th>Reference Range</th><th>Units</th></tr></thead>
    <tbody>
      <tr><td>Rheumatoid Factor</td><td><strong>148</strong></td><td>&lt; 14</td><td>IU/mL</td></tr>
      <tr><td>Anti-CCP</td><td><strong>92</strong></td><td>&lt; 17</td><td>U/mL</td></tr>
      <tr><td>ESR</td><td><strong>48</strong></td><td>&lt; 20</td><td>mm/hr</td></tr>
      <tr><td>CRP</td><td><strong>32</strong></td><td>&lt; 5</td><td>mg/L</td></tr>
      <tr><td>ANA</td><td>Negative</td><td>Negative</td><td>—</td></tr>
      <tr><td>Full Blood Count — Hb</td><td>118</td><td>115 – 165</td><td>g/L</td></tr>
      <tr><td>Full Blood Count — WCC</td><td>8.4</td><td>4.0 – 11.0</td><td>x10⁹/L</td></tr>
      <tr><td>Full Blood Count — Platelets</td><td>412</td><td>150 – 400</td><td>x10⁹/L</td></tr>
      <tr><td>Urea & Electrolytes</td><td>Normal</td><td>—</td><td>—</td></tr>
      <tr><td>Liver Function Tests</td><td>Normal</td><td>—</td><td>—</td></tr>
    </tbody>
  </table>

  <p><strong>Reported by:</strong> Dr Olivia Hartwell, Pathologist (Provider 0000001P)</p>

  <div class="page-break"></div>

  <!-- PAGE 3: ATTACHED RADIOLOGY REPORT -->
  <div class="letterhead">
    <h2>PRP Diagnostic Imaging</h2>
    <div>Level 3, 18 Hunter Street, Parramatta NSW 2150</div>
  </div>
  <div class="meta">Examined: 30 April 2026 · Reported: 1 May 2026</div>

  <p><strong>Patient:</strong> O'CONNOR, Jennifer · DOB 23/04/1968<br/>
  <strong>Referrer:</strong> Dr Mary Sutherland, Rozelle Family Medical Centre</p>

  <div class="results-header">X-Ray Both Hands — PA and Oblique Views</div>

  <p><strong>Technique:</strong> Bilateral PA and oblique radiographs of the hands and wrists.</p>

  <p><strong>Findings:</strong> Symmetrical soft tissue swelling at the MCP joints bilaterally. Periarticular osteopenia is noted at the 2nd and 3rd MCPs on the right. There is an early erosion at the radial aspect of the right 2nd MCP head, measuring approximately 1.5mm. No joint space narrowing yet. No subluxation. Bony alignment is preserved. The carpal bones appear unremarkable.</p>

  <p><strong>Impression:</strong> Findings consistent with early erosive inflammatory arthropathy. Symmetrical distribution and MCP involvement support a diagnosis of rheumatoid arthritis. Recommend clinical correlation and rheumatology review.</p>

  <p><strong>Reported by:</strong> Dr Anthony Reeves, Radiologist (Provider 0000002R)</p>
</body></html>
`;

const SCENARIOS: { filename: string; html: string; description: string }[] = [
  {
    filename: "letter_followup.pdf",
    description: "Specialist follow-up progress letter to GP",
    html: FOLLOWUP_HTML,
  },
  {
    filename: "letter_discharge.pdf",
    description: "Specialist discharging patient back to GP care",
    html: DISCHARGE_HTML,
  },
  {
    filename: "letter_result_commentary.pdf",
    description: "Specialist commenting on lab results sent to GP",
    html: RESULT_COMMENTARY_HTML,
  },
  {
    filename: "multipage_referral_with_results.pdf",
    description: "Page 1 GP referral letter, pages 2-3 attached pathology + radiology",
    html: MULTIPAGE_REFERRAL_HTML,
  },
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
      const outPath = join(OUT_DIR, scenario.filename);
      writeFileSync(outPath, pdfBuffer);
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
