/**
 * Negative / borderline fixtures for the study-report → consult_letter rule.
 * The wider consult_letter definition must NOT pull administrative documents
 * out of generic (they'd auto-file instead of going to manual review), and
 * imaging-adjacent reports should stay radiology_result where they're imaging.
 *
 * All patients, clinicians and clinics are fictional.
 *
 * Output: docs/test-pdfs/study-report-negatives/
 *
 *   must stay generic:
 *     neg_centrelink_form.pdf       — Centrelink medical certificate form (blank-ish fields)
 *     neg_patient_invoice.pdf       — practice tax invoice / account statement
 *     neg_appointment_letter.pdf    — hospital outpatient appointment letter to the patient
 *     neg_medication_chart.pdf      — pharmacy dispensing history printout
 *   borderline (type recorded, judged in the report):
 *     bl_ecg_report.pdf             — resting 12-lead ECG report
 *     bl_echo_report.pdf            — transthoracic echocardiogram report
 *     bl_spirometry_report.pdf      — respiratory function test report
 *     bl_hospital_discharge.pdf     — hospital discharge summary to GP
 *     bl_physio_report.pdf          — physiotherapy progress report to referring doctor
 *
 * Run with: bun scripts/generate-study-report-negative-pdfs.ts
 */

import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dir, "..", "docs", "test-pdfs", "study-report-negatives");
mkdirSync(OUT_DIR, { recursive: true });

const CSS = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; padding: 20px 28px; line-height: 1.35; }
  h1 { font-size: 15pt; margin: 6px 0 12px 0; }
  .head { display: flex; justify-content: space-between; margin-bottom: 14px; }
  .brand { font-size: 18pt; color: #335; }
  .small { font-size: 9pt; }
  table { border-collapse: collapse; margin: 8px 0 12px 0; font-size: 9.5pt; }
  th, td { border: 1px solid #777; padding: 3px 8px; text-align: left; }
  th { background: #eee; }
  .kv td { border: none; padding: 1px 12px 1px 0; }
  .box { border: 1px solid #333; height: 28px; margin: 2px 0 8px 0; }
`;

const page = (body: string) =>
  `<!DOCTYPE html><html><head><style>${CSS}</style></head><body>${body}</body></html>`;

const CENTRELINK = page(`
  <div class="head"><div class="brand">Services Australia — Centrelink</div><div class="small">SU415.2609</div></div>
  <h1>Medical Certificate</h1>
  <p class="small">This form is to be completed by the customer's treating doctor. Return the completed form to Centrelink.</p>
  <p><b>Part A — To be completed by the customer</b></p>
  <table class="kv">
    <tr><td>Customer name</td><td>Kevin DRUMMOND</td></tr>
    <tr><td>Date of birth</td><td>09/02/1979</td></tr>
    <tr><td>Customer Reference Number</td><td>000 000 000A</td></tr>
    <tr><td>Address</td><td>14 Example Avenue, Blacktown NSW 2148</td></tr>
  </table>
  <p><b>Part B — To be completed by the treating doctor</b></p>
  <p>1. What is the customer's medical condition(s)?</p><div class="box"></div>
  <p>2. Date of onset of condition</p><div class="box"></div>
  <p>3. Is the customer temporarily incapacitated for work? &nbsp; ☐ Yes &nbsp; ☐ No</p>
  <p>4. Period of incapacity: from ____/____/______ to ____/____/______</p>
  <p>Doctor's name ______________________ Provider number __________ Signature ______________</p>
  <p class="small">Privacy notice: your personal information is protected by law, including the Privacy Act 1988.</p>
`);

const INVOICE = page(`
  <div class="head"><div class="brand">BJC Health</div><div class="small">ABN 00 000 000 000<br/>Parramatta · Chatswood · Bondi Junction</div></div>
  <h1>TAX INVOICE / ACCOUNT STATEMENT</h1>
  <table class="kv">
    <tr><td><b>Invoice No:</b></td><td>INV-204417</td><td><b>Date:</b></td><td>15/09/2026</td></tr>
    <tr><td><b>Bill to:</b></td><td>Ms Rosa FERNANDES</td><td><b>DOB:</b></td><td>30/11/1967</td></tr>
    <tr><td><b>Address:</b></td><td>3 Sample Lane, Harris Park NSW 2150</td></tr>
  </table>
  <table>
    <tr><th>Date</th><th>Item</th><th>Description</th><th>Fee</th><th>Medicare rebate</th><th>Gap</th></tr>
    <tr><td>10/09/2026</td><td>110</td><td>Initial specialist consultation</td><td>$320.00</td><td>$142.00</td><td>$178.00</td></tr>
    <tr><td>10/09/2026</td><td>—</td><td>Administration fee</td><td>$15.00</td><td>$0.00</td><td>$15.00</td></tr>
  </table>
  <p><b>Amount due: $193.00</b> &nbsp; Payment due within 14 days.</p>
  <p class="small">EFT: BSB 000-000 Account 00000000. Please quote the invoice number as reference.</p>
`);

const APPOINTMENT = page(`
  <div class="head"><div class="brand">Westmead Example Hospital</div><div class="small">Outpatient Bookings<br/>Ph (02) 9000 0003</div></div>
  <p>22 September 2026</p>
  <p>Mr Harold KING<br/>27 Sample Road<br/>Wentworthville NSW 2145</p>
  <p><b>Re: Outpatient appointment — Rheumatology Clinic</b></p>
  <p>Dear Mr King,</p>
  <p>An appointment has been made for you as follows:</p>
  <table class="kv">
    <tr><td><b>Date:</b></td><td>Tuesday 13 October 2026</td></tr>
    <tr><td><b>Time:</b></td><td>9:40 am (please arrive 15 minutes early)</td></tr>
    <tr><td><b>Location:</b></td><td>Level 2, Clinic B</td></tr>
  </table>
  <p>Please bring your Medicare card, a list of your current medications and any recent X-rays. If you are unable to attend, please call us at least 48 hours beforehand so the appointment can be offered to another patient.</p>
  <p>Yours sincerely,<br/>Outpatient Bookings Office</p>
`);

const MED_CHART = page(`
  <div class="head"><div class="brand">Example Chemist Parramatta</div><div class="small">Pharmacy approval no. 00000X<br/>Ph (02) 9000 0004</div></div>
  <h1>Dispensing History</h1>
  <table class="kv">
    <tr><td><b>Patient:</b></td><td>Lillian CHO</td><td><b>DOB:</b></td><td>12/05/1950</td></tr>
    <tr><td><b>Period:</b></td><td>01/03/2026 – 15/09/2026</td></tr>
  </table>
  <table>
    <tr><th>Date</th><th>Medication</th><th>Qty</th><th>Prescriber</th><th>Rpts left</th></tr>
    <tr><td>02/03/2026</td><td>Methotrexate 2.5mg tablets</td><td>30</td><td>Dr I Lim</td><td>4</td></tr>
    <tr><td>02/03/2026</td><td>Folic acid 5mg tablets</td><td>100</td><td>Dr I Lim</td><td>2</td></tr>
    <tr><td>14/05/2026</td><td>Hydroxychloroquine 200mg tablets</td><td>100</td><td>Dr I Lim</td><td>5</td></tr>
    <tr><td>03/08/2026</td><td>Prednisolone 5mg tablets</td><td>60</td><td>Dr A Chung</td><td>0</td></tr>
  </table>
  <p class="small">Printed at patient request. This is not a prescription.</p>
`);

const ECG = page(`
  <div class="head"><div class="brand">Parramatta Heart Clinic</div><div class="small">Ph (02) 9000 0005 · Fax (02) 9000 0006</div></div>
  <h1>Resting 12-Lead ECG Report</h1>
  <table class="kv">
    <tr><td><b>Patient:</b></td><td>Stanley MORRIS</td><td><b>DOB:</b></td><td>21/01/1958</td></tr>
    <tr><td><b>Referring Doctor:</b></td><td>Dr Anne Chung, BJC Health</td><td><b>Date:</b></td><td>16/09/2026</td></tr>
  </table>
  <table>
    <tr><th>Rate</th><th>PR</th><th>QRS</th><th>QT/QTc</th><th>Axis</th></tr>
    <tr><td>68 bpm</td><td>164 ms</td><td>92 ms</td><td>392/417 ms</td><td>+45°</td></tr>
  </table>
  <p><b>Interpretation:</b> Sinus rhythm. Normal intervals. No acute ST changes. QTc within normal limits for hydroxychloroquine monitoring.</p>
  <p>Reported by Dr Oliver Grant, Cardiologist</p>
`);

const ECHO = page(`
  <div class="head"><div class="brand">Parramatta Heart Clinic</div><div class="small">Ph (02) 9000 0005 · Fax (02) 9000 0006</div></div>
  <h1>Transthoracic Echocardiogram Report</h1>
  <table class="kv">
    <tr><td><b>Patient:</b></td><td>Beverley NASH</td><td><b>DOB:</b></td><td>08/08/1952</td></tr>
    <tr><td><b>Referring Doctor:</b></td><td>Dr Herman Lau</td><td><b>Study date:</b></td><td>17/09/2026</td></tr>
    <tr><td><b>Indication:</b></td><td>Dyspnoea; systemic sclerosis — ?pulmonary hypertension</td></tr>
  </table>
  <table>
    <tr><th>Measurement</th><th>Value</th><th>Normal</th></tr>
    <tr><td>LVEF (Simpson's biplane)</td><td>58%</td><td>&gt;52%</td></tr>
    <tr><td>RVSP</td><td>41 mmHg</td><td>&lt;35 mmHg</td></tr>
    <tr><td>TAPSE</td><td>19 mm</td><td>&gt;17 mm</td></tr>
  </table>
  <p><b>Findings:</b> Normal LV size and systolic function. Mildly dilated right ventricle. Mild tricuspid regurgitation.</p>
  <p><b>Conclusion:</b> Mildly elevated estimated RVSP — consider right heart catheterisation if clinically indicated.</p>
  <p>Reported by Dr Oliver Grant, Cardiologist</p>
`);

const SPIRO = page(`
  <div class="head"><div class="brand">Northside Respiratory Laboratory</div><div class="small">Ph (02) 9000 0007</div></div>
  <h1>Respiratory Function Test Report</h1>
  <table class="kv">
    <tr><td><b>Patient:</b></td><td>Neil O'CONNOR</td><td><b>DOB:</b></td><td>02/10/1963</td></tr>
    <tr><td><b>Referring Physician:</b></td><td>Dr Kate Celkys</td><td><b>Test date:</b></td><td>18/09/2026</td></tr>
  </table>
  <table>
    <tr><th>Parameter</th><th>Measured</th><th>Predicted</th><th>% Pred</th><th>LLN</th></tr>
    <tr><td>FEV1 (L)</td><td>2.41</td><td>3.10</td><td>78</td><td>2.45</td></tr>
    <tr><td>FVC (L)</td><td>3.02</td><td>3.95</td><td>76</td><td>3.12</td></tr>
    <tr><td>FEV1/FVC</td><td>0.80</td><td>0.78</td><td>—</td><td>0.68</td></tr>
    <tr><td>DLCO</td><td>15.1</td><td>23.4</td><td>65</td><td>18.2</td></tr>
  </table>
  <p><b>Interpretation:</b> Mild restrictive ventilatory defect with moderately reduced gas transfer, consistent with interstitial lung disease.</p>
  <p>Reported by Dr Nadia Petrov, Respiratory Physician</p>
`);

const DISCHARGE = page(`
  <div class="head"><div class="brand">Westmead Example Hospital</div><div class="small">Discharge Summary</div></div>
  <table class="kv">
    <tr><td><b>Patient:</b></td><td>Joyce WALTERS</td><td><b>DOB:</b></td><td>14/04/1946</td><td><b>MRN:</b></td><td>0000123</td></tr>
    <tr><td><b>Admitted:</b></td><td>08/09/2026</td><td><b>Discharged:</b></td><td>13/09/2026</td><td><b>Ward:</b></td><td>C4 General Medicine</td></tr>
    <tr><td><b>GP:</b></td><td>Dr Mark Stevenson</td><td><b>Specialist:</b></td><td>Dr Irwin Lim, BJC Health</td></tr>
  </table>
  <p><b>Principal diagnosis:</b> Community-acquired pneumonia</p>
  <p><b>Comorbidities:</b> Rheumatoid arthritis on methotrexate; hypertension</p>
  <p><b>Hospital course:</b> Treated with IV ceftriaxone and oral azithromycin, stepped down to oral amoxicillin on day 3. Methotrexate withheld during admission.</p>
  <p><b>Medications on discharge:</b> Amoxicillin 1g TDS for 4 more days. Methotrexate to remain on hold until reviewed by rheumatologist.</p>
  <p><b>Follow-up:</b> GP review in 1 week. Rheumatology review re recommencing methotrexate.</p>
  <p>Discharging doctor: Dr Samuel Price, Resident Medical Officer</p>
`);

const PHYSIO = page(`
  <div class="head"><div class="brand">Active Motion Physiotherapy</div><div class="small">Ph (02) 9000 0008</div></div>
  <p>19 September 2026</p>
  <p>Dr Ilana Ginges<br/>BJC Health — Chatswood</p>
  <p><b>Re: Paula GRIFFIN, DOB 25/07/1974</b></p>
  <p>Dear Dr Ginges,</p>
  <p>Thank you for referring Paula for management of her right shoulder. She has attended six sessions. Active flexion has improved from 110° to 150° and her pain score has reduced from 7/10 to 3/10.</p>
  <p>I plan to continue fortnightly sessions for another month focusing on rotator cuff strengthening, then discharge to a home program.</p>
  <p>Kind regards,<br/>Tom Ellis, Physiotherapist</p>
`);

const SCENARIOS: { filename: string; html: string }[] = [
  { filename: "neg_centrelink_form.pdf", html: CENTRELINK },
  { filename: "neg_patient_invoice.pdf", html: INVOICE },
  { filename: "neg_appointment_letter.pdf", html: APPOINTMENT },
  { filename: "neg_medication_chart.pdf", html: MED_CHART },
  { filename: "bl_ecg_report.pdf", html: ECG },
  { filename: "bl_echo_report.pdf", html: ECHO },
  { filename: "bl_spirometry_report.pdf", html: SPIRO },
  { filename: "bl_hospital_discharge.pdf", html: DISCHARGE },
  { filename: "bl_physio_report.pdf", html: PHYSIO },
];

async function main() {
  const browser = await puppeteer.launch();
  try {
    for (const scenario of SCENARIOS) {
      const p = await browser.newPage();
      await p.setContent(scenario.html, { waitUntil: "domcontentloaded" });
      const pdf = await p.pdf({
        format: "A4",
        margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
        printBackground: true,
      });
      writeFileSync(join(OUT_DIR, scenario.filename), pdf);
      console.log(`✅ ${scenario.filename}`);
      await p.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
