/**
 * Generate synthetic result test PDFs that mimic the layouts of five
 * real-world (redacted) samples received from the field. Each layout exposes
 * a different vision-extraction challenge: serial multi-column trends,
 * multi-page reports with page-2-only patient data, faxed To/Copies-To
 * headers, multi-panel pathology faxes with rotated category labels, and
 * letter-style reports with CC on a separate page.
 *
 * All patient identifiers are synthetic:
 *   - Names: Test{First} {Last}
 *   - Medicare: 21999999XX (fake range)
 *   - Provider numbers: 9000XXXZ (fake — no real allocation starts with 9)
 *
 * Run with: bun scripts/generate-redacted-style-test-pdfs.ts
 *
 * Output: docs/input PDF/results/redacted-style/
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

interface Patient {
  firstName: string;
  lastName: string;
  title: string;
  dob: string;
  age: string;
  sex: "M" | "F";
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  medicare: string;
  medicareRef: string;
  phone: string;
}

interface Scenario {
  filename: string;
  description: string;
  build: () => string;
}

// ---------- Shared synthetic patients ----------

const PATIENT_DHM: Patient = {
  firstName: "TestMarcus",
  lastName: "Petrov",
  title: "Mr",
  dob: "03/06/1950",
  age: "75",
  sex: "M",
  address: "12 Test Lane",
  suburb: "PARRAMATTA",
  state: "NSW",
  postcode: "2150",
  medicare: "2199999951",
  medicareRef: "1",
  phone: "0299990001",
};

const PATIENT_MMI: Patient = {
  firstName: "TestPriya",
  lastName: "Sharma",
  title: "Mrs",
  dob: "11/02/1976",
  age: "50",
  sex: "F",
  address: "44 Synthetic Way",
  suburb: "HORNSBY",
  state: "NSW",
  postcode: "2077",
  medicare: "2199999952",
  medicareRef: "2",
  phone: "0299990002",
};

const PATIENT_PRP: Patient = {
  firstName: "TestEthan",
  lastName: "Brooks",
  title: "Mr",
  dob: "22/09/1981",
  age: "44",
  sex: "M",
  address: "8 Mock Avenue",
  suburb: "BALGOWLAH",
  state: "NSW",
  postcode: "2093",
  medicare: "2199999953",
  medicareRef: "1",
  phone: "0299990003",
};

const PATIENT_NSWHP: Patient = {
  firstName: "TestPaul",
  lastName: "Whitford",
  title: "Mr",
  dob: "14/05/1965",
  age: "61",
  sex: "M",
  address: "21 Fictional Place",
  suburb: "CARDIFF",
  state: "NSW",
  postcode: "2285",
  medicare: "2199999954",
  medicareRef: "1",
  phone: "0249990004",
};

const PATIENT_IMED: Patient = {
  firstName: "TestRose",
  lastName: "Quirk",
  title: "Mrs",
  dob: "30/11/1958",
  age: "67",
  sex: "F",
  address: "5 Imaginary Court",
  suburb: "COFFS HARBOUR",
  state: "NSW",
  postcode: "2450",
  medicare: "2199999955",
  medicareRef: "1",
  phone: "0266990005",
};

// ---------- Layout 1: Douglass Hanly Moir — haematology serial ----------

function buildDhmSerial(): string {
  const p = PATIENT_DHM;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  @page { margin: 1.4cm 1.6cm; size: A4; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111; }
  .fax-header { font-family: 'Courier New', monospace; font-size: 9pt; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 14px; display: flex; justify-content: space-between; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; }
  .lab-block { display: flex; gap: 12px; align-items: flex-start; }
  .lab-logo { width: 40px; height: 40px; border-radius: 50%; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; }
  .lab-name { font-weight: bold; font-size: 14pt; line-height: 1.05; }
  .lab-tag { font-style: italic; font-size: 9pt; margin-top: 2px; }
  .lab-meta { font-size: 8.5pt; max-width: 360px; line-height: 1.35; }
  .addressee-row { display: flex; justify-content: space-between; margin: 18px 0 10px; gap: 24px; }
  .addressee { font-size: 10pt; }
  .addressee .name { font-weight: bold; }
  .ref-by { margin-top: 14px; font-size: 9.5pt; }
  .ids { font-size: 9pt; min-width: 280px; }
  .ids .lab-id { border: 1px solid #000; padding: 4px 8px; font-weight: bold; display: inline-block; min-width: 140px; text-align: center; }
  .ids .dob-box { border: 1px solid #000; padding: 4px 8px; display: inline-block; min-width: 140px; }
  .ids .meta-row { margin-top: 6px; font-size: 9pt; line-height: 1.5; }
  .ids .meta-row span.label { display: inline-block; width: 75px; }
  table.serial { border-collapse: collapse; width: 100%; font-size: 9pt; margin-top: 10px; }
  table.serial th { background: #f4f6fa; text-align: left; padding: 4px 6px; border-bottom: 1px solid #444; font-size: 8.5pt; }
  table.serial td { padding: 3px 6px; border-bottom: 1px dotted #bbb; }
  table.serial td.h-name { font-weight: bold; }
  table.serial td.flag { color: #b03030; font-weight: bold; }
  table.serial th.latest, table.serial td.latest { background: #fff5e0; font-weight: bold; }
  .panel-title { font-weight: bold; text-decoration: underline; font-size: 10pt; margin-top: 6px; }
  .comment-block { margin-top: 12px; font-size: 9.5pt; }
  .provisional { margin-top: 14px; text-align: center; font-weight: bold; font-size: 10pt; }
  .footer { margin-top: 26px; font-size: 9pt; }
  .footer-line { display: flex; justify-content: space-between; }
  .page-num { text-align: right; margin-top: 8px; font-size: 8.5pt; }
</style></head><body>
  <div class="fax-header">
    <span>Douglass Hanly Moir</span>
    <span>29/04/2026 10:22:32AM AEST</span>
    <span>1/001</span>
    <span>To:0298907655</span>
  </div>

  <div class="top">
    <div class="lab-block">
      <div class="lab-logo">DHM</div>
      <div>
        <div class="lab-name">DOUGLASS<br>HANLY MOIR<br><span style="font-size:9pt; font-weight:normal;">PATHOLOGY</span></div>
        <div class="lab-tag">Quality is in our DNA</div>
      </div>
    </div>
    <div class="lab-meta">
      This facsimile is intended for the referrer specified below.<br>
      The contents are confidential and contain legally privileged information.<br>
      If you have received this document in error, please telephone<br>
      Douglass Hanly Moir Pathology immediately on 1800 222 365.<br>
      NATA Accreditation No. 2178
    </div>
  </div>

  <div class="addressee-row">
    <div class="addressee">
      <div class="name">Dr Herman Lau</div>
      <div>BJC HEALTH</div>
      <div>Level 1</div>
      <div>17-21 Hunter Street</div>
      <div>PARRAMATTA 2150</div>
      <div class="ref-by">
        Ref by: Dr C Tanner<br>
        WESTERN SYD PRIV ONCOLOGY CTR, Level 2<br>
        16-18 Mons Road, WESTMEAD 2145
      </div>
    </div>
    <div class="ids">
      <div><span class="label">Lab ID :</span> <span class="lab-id">876699901</span></div>
      <div style="margin-top:8px;"><span class="label">Your Ref :</span> <span class="dob-box">L13820</span></div>
      <div class="meta-row">
        <div><span class="label">DOB</span>: ${p.dob} (${p.age} Yrs)</div>
        <div><span class="label">Gender</span>: ${p.sex}</div>
        <div><span class="label">Ph</span>: ${p.phone}</div>
        <div style="margin-top:6px;">
          <div><span class="label">Requested</span>: 24-Apr-26</div>
          <div><span class="label">Collected</span>: 28-Apr-26 14:31</div>
          <div><span class="label">Received</span>: 28-Apr-26 20:53</div>
          <div><span class="label">Printed</span>: 29-Apr-26 10:21</div>
        </div>
      </div>
    </div>
  </div>

  <div style="margin-top:6px;font-size:10pt;"><strong>Patient:</strong> ${p.title} ${p.firstName} ${p.lastName} &nbsp; <strong>Medicare:</strong> ${p.medicare}/${p.medicareRef}</div>

  <div class="panel-title">Haematology</div>
  <table class="serial">
    <thead>
      <tr>
        <th>Date<br>Time<br>Lab ID</th>
        <th>01-Apr-26<br>09:30<br>877528039</th>
        <th>07-Apr-26<br>11:33<br>877527972</th>
        <th>14-Apr-26<br>12:07<br>877527781</th>
        <th>22-Apr-26<br>14:16<br>877527584</th>
        <th class="latest">Latest Results<br>28-Apr-26 14:31<br>876699901</th>
        <th>Reference</th>
        <th>Units</th>
      </tr>
    </thead>
    <tbody>
      <tr><td class="h-name">Haemoglobin</td><td class="flag">103 L</td><td class="flag">98 L</td><td class="flag">95 L</td><td class="flag">86 L</td><td class="latest flag">96 L</td><td>(128-175)</td><td>g/L</td></tr>
      <tr><td class="h-name">RCC</td><td class="flag">3.9 L</td><td class="flag">3.6 L</td><td class="flag">3.5 L</td><td class="flag">3.1 L</td><td class="latest flag">3.4 L</td><td>(4.2-6.2)</td><td>x10^12/L</td></tr>
      <tr><td class="h-name">Haematocrit</td><td>0.31 L</td><td>0.30 L</td><td>0.29 L</td><td>0.26 L</td><td class="latest">0.29 L</td><td>(0.36-0.53)</td><td>L/L</td></tr>
      <tr><td class="h-name">MCV</td><td>81</td><td>83</td><td>84</td><td>84</td><td class="latest">83</td><td>(80-100)</td><td>fL</td></tr>
      <tr><td class="h-name">WCC</td><td class="flag">3.4 L</td><td class="flag">1.7 L</td><td class="flag">1.7 L</td><td class="flag">1.5 L</td><td class="latest flag">2.4 L</td><td>(4.0-11.0)</td><td>x10^9/L</td></tr>
      <tr><td class="h-name">Neutrophils</td><td class="flag">1.74 L</td><td class="flag">0.71 L</td><td class="flag">0.31 L</td><td class="flag">0.25 L</td><td class="latest flag">0.20 L</td><td>(2.0-7.5)</td><td>x10^9/L</td></tr>
      <tr><td class="h-name">Lymphocytes</td><td class="flag">0.69 L</td><td class="flag">0.56 L</td><td class="flag">0.88 L</td><td class="flag">0.64 L</td><td class="latest flag">0.84 L</td><td>(1.0-4.0)</td><td>x10^9/L</td></tr>
      <tr><td class="h-name">Monocytes</td><td>0.94</td><td>0.46</td><td>0.44</td><td>0.62</td><td class="latest flag">1.31 H</td><td>(0.0-1.0)</td><td>x10^9/L</td></tr>
      <tr><td class="h-name">Platelets</td><td class="flag">49 L</td><td class="flag">43 L</td><td class="flag">11 L</td><td class="flag">10 L</td><td class="latest flag">39 L</td><td>(150-450)</td><td>x10^9/L</td></tr>
      <tr><td class="h-name">ESR</td><td></td><td class="flag">112 H</td><td class="flag">99 H</td><td class="flag">55 H</td><td class="latest"></td><td>(1-30)</td><td>mm/h</td></tr>
    </tbody>
  </table>

  <div class="comment-block">
    <strong>Comment on Lab ID 876699901</strong><br>
    <strong>Red Cell Morphology:</strong> Rouleaux +, Anisocytosis ++, Polychromasia +, Nucleated RBC's occ.
  </div>

  <div class="provisional">*** The above result is provisional. Finalised report to follow. ***</div>

  <div class="footer">
    <div class="footer-line"><span><strong>Tests Completed:</strong> none.</span><span><strong>Pending:</strong> CHROMO/KARYO BM, ONCO FISH, FBC(e), FILM, BM, LSM Bone Marrow</span></div>
    <div style="margin-top:8px;"><strong>Clinical Notes:</strong> CMML on inqovi, persistent pancytopenia 3 weeks post reduced dose inqovi ? trans...</div>
  </div>

  <div class="page-num">Page 1 of 1</div>
</body></html>`;
}

// ---------- Layout 2: Macquarie Medical Imaging — MRI brain (multi-page) ----------

function buildMmiMri(): string {
  const p = PATIENT_MMI;
  const sharedHead = `
    <div class="fax-header">
      <span>22-Apr-2026 22:55</span><span>UTC</span><span>To: 61294133316</span><span>p.PAGE_NUM</span>
    </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  @page { margin: 1.4cm 1.8cm; size: A4; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.4; }
  .fax-header { font-family: 'Courier New', monospace; font-size: 9pt; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 18px; display: flex; justify-content: space-between; }
  .header-row { display: flex; justify-content: space-between; gap: 36px; margin-bottom: 24px; }
  .left-block { font-size: 10pt; line-height: 1.45; }
  .left-block .date { margin-bottom: 2px; }
  .left-block .branch { font-weight: bold; margin-bottom: 4px; }
  .left-block .to-line { margin-top: 4px; }
  .left-block .ref-by-label { margin-top: 4px; }
  .right-block { text-align: right; font-size: 10pt; }
  .dob-box { border: 1px solid #000; padding: 2px 14px; display: inline-block; min-width: 90px; min-height: 14px; }
  .right-meta { margin-top: 12px; }
  .copies-block { margin-top: 16px; }
  h2 { font-size: 11.5pt; margin: 8px 0 4px; }
  h3 { font-size: 10.5pt; margin: 14px 0 2px; }
  p { margin: 4px 0; }
  .body p { margin: 2px 0; }
  .disclaimer { border: 1px solid #aaa; padding: 6px; font-size: 8pt; color: #555; margin-top: 24px; }
  .page-num { text-align: right; margin-top: 14px; font-size: 9pt; }
  .page-break { page-break-after: always; }
  .p2-meta { text-align: right; font-size: 10pt; line-height: 1.45; }
</style></head><body>
  ${sharedHead.replace("PAGE_NUM", "1")}

  <div class="header-row">
    <div class="left-block">
      <div class="date">23 April 2026</div>
      <div class="branch">Macquarie Medical Imaging</div>
      <div class="to-line"><strong>To:</strong> Dr Kate Celkys</div>
      <div style="margin-top:4px;"><strong>Referred By:</strong></div>
      <div>Dr Kong Wei</div>
      <div>HORNSBY NEUROLOGY &amp; ENDO</div>
      <div>92 Balmoral St</div>
      <div>HORNSBY NSW 2077</div>
    </div>
    <div class="right-block">
      <div><strong>DOB:</strong> <span class="dob-box">${p.dob}</span></div>
      <div class="right-meta">
        <div><strong>UR:</strong> GFJ974T</div>
        <div><strong>Our Ref:</strong> 3309901</div>
        <div><strong>Service Date:</strong> 18 March 2026</div>
      </div>
      <div class="copies-block">
        <div><strong>Copies To:</strong></div>
        <div>Dr Vincent Wong</div>
        <div>Dr Kate Celkys</div>
      </div>
    </div>
  </div>

  <p><strong>Visit Description:</strong> MRI - TRIGEMINAL NERVE</p>

  <h2>MRI BRAIN AND SKULL BASE</h2>

  <p><strong>Clinical Information:</strong> Left numb chin syndrome, upgaze and left eye abduction failure, ?localisation, ?pons or midbrain, left 5th nerve V3 lesion.</p>

  <p><strong>Technique:</strong> Sagittal T1 FLAIR, axial T2 and DWI as well as susceptibility weighted and T2 FLAIR sequences were acquired through the brain. Additional axial T2 FIESTA, coronal T2 STIR as well as pre- and post-contrast T1 scans were acquired through the trigeminal nerves.</p>

  <p><strong>Comparison Study:</strong> Nil.</p>

  <h3>Report:</h3>
  <div class="body">
    <p>The ventricles and subarachnoid spaces are appropriate for the patient's age. There is no midline shift or mass effect and there is normal grey/white matter differentiation.</p>
    <p>No intra- or extra-axial haemorrhage is seen and there is no indication of significant prior blood product deposition.</p>
    <p>There is no diffusion impairment to suggest acute or subacute ischaemia.</p>
    <p>The midline structures including the pons, cerebellar vermis, mid brain, pituitary gland and corpus callosum appear normal.</p>
    <p>After contrast, no abnormal parenchymal or leptomeningeal enhancement was seen.</p>
    <p>The globes have a normal contour on each side. The intra- and extraconal fat planes are clear. The orbital apex structures appear normal on each side, as do the contours of the optic nerves.</p>
    <p>The visualised paranasal sinuses and mastoid air cells are clear.</p>
  </div>

  <h3>Skull Base:</h3>
  <div class="body">
    <p>The intracisternal path of the trigeminal nerves appears normal on each side. Meckel's cave has a normal appearance on each side.</p>
    <p>The pterygopalatine fossae are well demonstrated and appear unremarkable.</p>
    <p>The course of the inferior alveolar nerves appears unremarkable, without expansion or focal differential enhancement.</p>
    <p>The surrounding soft tissues appear normal.</p>
  </div>

  <h3>Conclusion:</h3>
  <div class="body">
    <p>No cause for the left numb chin could be seen.</p>
    <p>No cause for left eye abduction abnormality could be seen.</p>
    <p>In particular, the pons and midbrain appear normal.</p>
  </div>

  <div class="disclaimer">
    The information contained in this facsimile message is legally privileged and confidential, intended only for the use of the individual named above. If the receiver is not the intended recipient the receiver is hereby notified that any use, dissemination, distribution, publication or copying of this facsimile is prohibited. If you have received this facsimile in error please notify the practice immediately and arrangements will be made to retrieve or destroy it.
  </div>

  <div class="page-num">Page 1</div>

  <div class="page-break"></div>

  ${sharedHead.replace("PAGE_NUM", "2")}

  <div class="p2-meta">
    <div>${p.title} ${p.firstName} ${p.lastName}</div>
    <div>DOB: ${p.dob}</div>
    <div>UR: GFJ974T</div>
    <div>Our Ref: 3309901</div>
    <div>Service Date: 18 March 2026</div>
  </div>

  <p style="margin-top:30px;"><strong>Reported by:</strong></p>
  <p>Dr Helena Pavlovic</p>

  <p style="margin-top:30px; font-weight:bold; font-size:9.5pt;">MMMI now has a fleet of three MRI machines, all eligible for GP and Specialist Medicare bulk-billed studies.</p>

  <div class="page-num">Page 2</div>
</body></html>`;
}

// ---------- Layout 3: PRP Diagnostic Imaging — CT lumbar + X-ray wrist ----------

function buildPrpCombined(): string {
  const p = PATIENT_PRP;
  const sharedHead = `
    <div class="fax-header">
      <span>9-Apr-2026 23:13</span><span>UTC</span><span>To: 61294133316</span><span>p.PAGE_NUM</span>
    </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  @page { margin: 1.4cm 1.8cm; size: A4; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.4; }
  .fax-header { font-family: 'Courier New', monospace; font-size: 9pt; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 18px; display: flex; justify-content: space-between; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .prp-logo { display: flex; gap: 10px; align-items: center; }
  .prp-circle { width: 40px; height: 40px; border-radius: 50%; background: #2c5e9e; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13pt; }
  .prp-name { font-weight: bold; font-size: 16pt; color: #2c5e9e; }
  .prp-name small { display: block; font-weight: normal; font-size: 8.5pt; color: #555; }
  .branch { text-align: right; font-size: 10pt; }
  .header-row { display: flex; justify-content: space-between; gap: 36px; margin-bottom: 24px; }
  .left-block { font-size: 10pt; line-height: 1.45; }
  .right-block { text-align: right; font-size: 10pt; }
  .dob-box { border: 1px solid #000; padding: 2px 14px; display: inline-block; min-width: 90px; min-height: 14px; }
  .right-meta { margin-top: 8px; }
  .copies-block { margin-top: 16px; }
  h2 { font-size: 11.5pt; margin: 18px 0 6px; }
  h3 { font-size: 10.5pt; margin: 12px 0 4px; }
  p { margin: 4px 0; }
  .disclaimer { border: 1px solid #aaa; padding: 6px; font-size: 8pt; color: #555; margin-top: 20px; }
  .page-num { text-align: right; margin-top: 12px; font-size: 9pt; }
  .page-break { page-break-after: always; }
  .p2-meta { text-align: right; font-size: 10pt; line-height: 1.45; margin-top: 10px; }
</style></head><body>
  ${sharedHead.replace("PAGE_NUM", "1")}

  <div class="top">
    <div class="prp-logo">
      <div class="prp-circle">PRP</div>
      <div class="prp-name">PRP<small>Diagnostic Imaging</small></div>
    </div>
    <div class="branch">
      <div><strong>Frenchs Forest</strong></div>
      <div>Phone 94511062</div>
    </div>
  </div>

  <div class="header-row">
    <div class="left-block">
      <div><strong>To:</strong> Dr Kate Celkys</div>
      <div style="margin-top:4px;"><strong>Referred By:</strong></div>
      <div>Dr John Stanton</div>
      <div>BALGOWLAH FAMILY PRACTICE</div>
      <div>1/379 SYDNEY ROAD</div>
      <div>BALGOWLAH NSW 2093</div>
    </div>
    <div class="right-block">
      <div><strong>DOB:</strong> <span class="dob-box">${p.dob}</span></div>
      <div class="right-meta">
        <div><strong>Patient ID:</strong> ABD027C</div>
        <div><strong>Visit Number:</strong> 17147601</div>
        <div><strong>Service Date:</strong> 01 April 2026 08:50</div>
      </div>
      <div class="copies-block">
        <div><strong>Copies To:</strong></div>
        <div>Dr Kate Celkys</div>
      </div>
    </div>
  </div>

  <div style="font-size:10pt;"><strong>Patient:</strong> ${p.title} ${p.firstName} ${p.lastName} &nbsp; <strong>Medicare:</strong> ${p.medicare}/${p.medicareRef}</div>

  <p style="margin-top:8px;"><strong>Visit Description:</strong> CT LUMBAR SPINE, XRAY LEFT WRIST</p>

  <h2>CT LUMBAR SPINE</h2>
  <h3>HISTORY:</h3>
  <p>Referred pain to lateral 5</p>
  <h3>TECHNIQUE:</h3>
  <p>Noncontrast.</p>
  <h3>FINDINGS:</h3>
  <p>There is a mild scoliosis convex to the left centred about L3.</p>
  <p>Inflammatory changes noted between the spinous processes of L4 and L5 with erosive change.</p>
  <h3>L5/S1 level:</h3>
  <p>Degenerative disc changes with gas within the disc.</p>
  <p>There is a left paracentral disc protrusion contacting the S1 nerve root on the left leading to mild canal stenosis. No foraminal stenosis.</p>
  <h3>L4/L5 level:</h3>
  <p>There is a large generalised disc bulge leading to moderate canal stenosis without definite foraminal stenosis.</p>
  <h3>L3/L4 level:</h3>
  <p>There is a right paracentral disc protrusion at L3-4 L moderate canal stenosis. No definite foraminal stenosis</p>
  <h3>L2/L3 level:</h3>
  <p>No canal or foraminal stenosis.</p>
  <h3>L1/L2 level:</h3>
  <p>No canal or foraminal stenosis.</p>
  <h3>COMMENT:</h3>
  <p>Inflammatory changes noted between the spinous processes of L4 and L5 with erosive change.</p>
  <p>Moderate canal stenosis at L4-3-4 and L4-5 levels.</p>
  <p>A left paracentral disc protrusion at L5-S1 contacts the left S1 nerve root and leads to mild canal stenosis.</p>

  <h2>X-RAY LEFT WRIST</h2>
  <p><strong>Clinical History:</strong> Injury 7 years ago. Ongoing pain.</p>
  <h3>Findings:</h3>
  <p>There is a healed fracture of the radial styloid with a mild step in the articular surface of the distal radius.</p>
  <p>Bony alignment throughout the wrist is normal.</p>
  <p>Mild degenerative change noted at the carpometacarpal joint of the thumb.</p>
  <p>No fracture is identified.</p>
  <p>Mild radiocarpal joint degenerative change.</p>

  <div class="disclaimer">
    The information contained in this facsimile message is legally privileged and confidential, intended only for the use of the individual named above. If the receiver is not the intended recipient the receiver is hereby notified that any use, dissemination, distribution, publication or copying of this facsimile is prohibited. If you have received this facsimile in error please notify the practice immediately and arrangements will be made to retrieve or destroy it.
  </div>

  <div class="page-num">Page 1</div>

  <div class="page-break"></div>

  ${sharedHead.replace("PAGE_NUM", "2")}

  <div class="p2-meta">
    <div>${p.title} ${p.firstName} ${p.lastName}</div>
    <div>DOB: ${p.dob}</div>
    <div>Patient ID: ABD027C</div>
    <div>Visit #: 17147601</div>
    <div>Service Date: 01 April 2026 08:50</div>
  </div>

  <p style="margin-top:24px;">No erosive change.</p>
  <p style="margin-top:24px;"><strong>Reported by:</strong> Dr Andrew Baldey</p>

  <div class="page-num">Page 2</div>
</body></html>`;
}

// ---------- Layout 4: NSW Health Pathology — Hunter (multi-panel fax) ----------

function buildNswhpMultiPanel(): string {
  const p = PATIENT_NSWHP;

  const buildPanel = (
    pageNum: number,
    totalPages: number,
    sidewaysLabel: string,
    panelTitle: string,
    headerCols: string[],
    rows: { name: string; values: string[]; flag?: string; range: string; units: string }[],
    comments?: { date: string; text: string }[]
  ) => {
    const headerRow = headerCols.map((c) => `<th>${c}</th>`).join("");
    const dataRows = rows
      .map((r) => {
        const vals = r.values
          .map((v, i) =>
            i === r.values.length - 1
              ? `<td class="latest"><strong>${v}</strong>${r.flag ? ` <span class="flag">${r.flag}</span>` : ""}</td>`
              : `<td>${v}</td>`
          )
          .join("");
        return `<tr><td class="h-name">${r.name}</td>${vals}<td>${r.range}</td><td>${r.units}</td></tr>`;
      })
      .join("");
    const commentsBlock =
      comments && comments.length
        ? `
        <div class="comments-title"><strong>Comments</strong></div>
        ${comments.map((c) => `<div class="comment-row"><div class="comment-date">${c.date}</div><div>${c.text}</div></div>`).join("")}`
        : "";

    return `
    <div class="page">
      <div class="fax-header">
        <span>From NothingSetup</span><span>Wed 29 Apr 2026 14:08:15 AEST</span><span>Page ${pageNum} of ${totalPages}</span>
      </div>
      <div class="disclaimer-note">
        Note: information contained in this fax message is intended for the named addressee only. If you are not the intended recipient, you must not copy, distribute, take any action reliant on, or disclose any details of the information in this fax to any other person or organisation. If you have received this fax in error please notify us and destroy this fax immediately.
      </div>
      <div class="title-bar">NSW Health Pathology - Hunter</div>

      <div class="three-col">
        <div class="left-col">
          <div><strong>Requested by:</strong> Dr P Berton</div>
          <div style="margin-top:6px;"><strong>Report To:</strong></div>
          <div>Dr Elaine Ng</div>
          <div>00294133316</div>
        </div>
        <div class="middle-col">
          <div><strong>MRN</strong> H096 - 99 - 60</div>
          <div><strong>Name</strong> ${p.title} ${p.firstName} ${p.lastName}</div>
          <div><strong>Address</strong> ${p.address}, ${p.suburb} ${p.postcode}</div>
          <div style="margin-top:8px;"><strong>DOB</strong> ${p.dob} &nbsp; Age <strong>${p.age} years</strong> &nbsp; Sex <strong>${p.sex}</strong></div>
        </div>
        <div class="sideways-col">${sidewaysLabel.split("").join("<br>")}</div>
      </div>

      <div class="clinical-notes"><strong>Clinical Notes on Request Form:</strong></div>

      <div class="panel">
        <div class="panel-header"><strong>${panelTitle}</strong></div>
        <table class="results">
          <thead><tr>${headerRow}<th>Reference Intervals</th><th>Units</th></tr></thead>
          <tbody>${dataRows}</tbody>
        </table>
        ${commentsBlock}
      </div>

      <div class="footer">
        <div><strong>Copy to:</strong> Dr Elaine Ng_NGELYC BJC Health Ground Fl, S5B, 7 Help St Chatswood NSW 2067</div>
        <div style="margin-left:60px;">Dr Jollyben Patel_PATEJCC 321 Main Rd CARDIFF NSW 2285</div>
        <div class="footer-row"><span><strong>Authorised by:</strong> <em>Laboratory Scientist</em></span><span><strong>Page 1 of 1</strong></span></div>
        <div class="footer-row"><span><strong>Enquiries</strong> : Phone: 1800 801949 &nbsp; Fax: 02 49 214400</span><span style="font-size:8pt;color:#777;">Accredited for compliance with NPAAC<br>Standards and ISO 15189 (Lab 3561)</span></div>
        <div style="text-align:right;font-size:8.5pt;margin-top:2px;">Printed : 14:04 29-Apr-26</div>
      </div>
    </div>`;
  };

  const page1 = buildPanel(
    1,
    3,
    "Routine",
    "Routine",
    ["Date<br>Year<br>Time<br>Lab No<br>Specimen", "29 Apr<br>2026<br>08:05<br>711822050<br>Blood"],
    [
      { name: "Sodium", values: ["", "135"], range: "(135 - 145)", units: "mmol/L" },
      { name: "Potassium", values: ["", "4.9"], range: "(3.5 - 5.2)", units: "mmol/L" },
      { name: "Chloride", values: ["", "100"], range: "(95 - 110)", units: "mmol/L" },
      { name: "Bicarb.", values: ["", "28"], range: "(22 - 32)", units: "mmol/L" },
      { name: "Urea", values: ["", "4.4"], range: "(4.0 - 9.0)", units: "mmol/L" },
      { name: "Creatinine", values: ["", "96"], range: "(60 - 110)", units: "umol/L" },
      { name: "GFR Est.", values: ["", "73"], flag: "L", range: "(> 90)", units: "mL/min/1.73m2" },
      { name: "Calcium", values: ["", "2.36"], range: "(2.10 - 2.60)", units: "mmol/L" },
      { name: "Phosphate", values: ["", "0.77"], range: "(0.75 - 1.50)", units: "mmol/L" },
      { name: "T.Protein", values: ["", "66"], range: "(60 - 80)", units: "g/L" },
      { name: "Albumin", values: ["", "40"], range: "(30 - 44)", units: "g/L" },
      { name: "GGT", values: ["", "56"], flag: "H", range: "(5 - 50)", units: "U/L" },
      { name: "Alk.Phos.", values: ["", "88"], range: "(30 - 110)", units: "U/L" },
      { name: "ALT", values: ["", "28"], range: "(10 - 50)", units: "U/L" },
      { name: "AST", values: ["", "22"], range: "(10 - 35)", units: "U/L" },
      { name: "CRP", values: ["", "6"], flag: "H", range: "(< 5)", units: "mg/L" },
    ]
  );

  const page2 = buildPanel(
    2,
    3,
    "Full Blood Count",
    "Full Blood Count",
    [
      "Date<br>Year<br>Time<br>Lab No<br>Specimen",
      "24 Jan<br>2022<br>??:??<br>451413572<br>Blood",
      "09 Jan<br>2026<br>08:00<br>711875401<br>Blood",
      "09 Apr<br>2026<br>15:55<br>706379801<br>Blood",
      "29 Apr<br>2026<br>08:05<br>711822050<br>Blood",
    ],
    [
      { name: "White Cells", values: ["12.2", "9.9", "11.1", "9.7"], range: "(4.0 - 11.0)", units: "10^9/L" },
      { name: "Red Cell Count", values: ["4.47", "4.70", "4.51", "4.72"], range: "(4.50 - 5.50)", units: "10^12/L" },
      { name: "Haemoglobin", values: ["142", "150", "143", "148"], range: "(130 - 170)", units: "g/L" },
      { name: "Haematocrit", values: ["0.410", "0.443", "0.426", "0.444"], range: "(0.400 - 0.500)", units: "L/L" },
      { name: "MCV", values: ["92", "94", "94", "94"], range: "(80 - 100)", units: "fL" },
      { name: "MCH", values: ["32", "32", "32", "31"], range: "(27 - 32)", units: "pg" },
      { name: "Platelets", values: ["317", "322", "330", "361"], range: "(150 - 400)", units: "10^9/L" },
      { name: "Neutrophils", values: ["6.9", "5.7", "6.4", "5.8"], range: "(2.0 - 8.0)", units: "10^9/L" },
      { name: "Lymphocytes", values: ["3.2", "3.1", "3.4", "3.0"], range: "(1.0 - 4.0)", units: "10^9/L" },
      { name: "Monocytes", values: ["1.3", "0.7", "0.7", "0.6"], range: "(0.2 - 1.0)", units: "10^9/L" },
      { name: "Eosinophils", values: ["0.6", "0.3", "0.5", "0.2"], range: "(< 0.5)", units: "10^9/L" },
      { name: "ESR", values: ["", "", "7", "7"], range: "(0 - 15)", units: "mm/hr" },
    ],
    [{ date: "09-Apr-26 15:55<br>#706379801", text: "Results verified on film." }]
  );

  const page3 = buildPanel(
    3,
    3,
    "Glucose Metabolism",
    "Glucose Metabolism",
    [
      "Date<br>Year<br>Time<br>Lab No<br>Specimen",
      "09 Jan<br>2026<br>08:00<br>711875401<br>Blood",
      "29 Apr<br>2026<br>08:05<br>711822050<br>Blood",
    ],
    [
      { name: "HbA1c (IFCC)", values: ["32", ""], range: "(20 - 41)", units: "mmol/mol" },
      { name: "HbA1c (NGSP)", values: ["5.1", ""], range: "(4.0 - 5.9)", units: "%" },
      { name: "Fructosamine", values: ["", "192"], flag: "L", range: "(205 - 285)", units: "umol/L" },
      { name: "25-OH Vitamin D", values: ["", "80"], range: "(> 50)", units: "nmol/L" },
    ],
    [
      {
        date: "29-Apr-26 08:05<br>#711822050",
        text:
          "HbA1c is not reliable for diabetes diagnosis or monitoring in individuals with haemoglobinopathies and/or abnormal RBC survival. Vitamin D adequacy >= 50 nmol/L.",
      },
    ]
  );

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  @page { margin: 1.2cm 1.4cm; size: A4; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111; line-height: 1.35; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .fax-header { font-family: 'Courier New', monospace; font-size: 8.5pt; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 8px; display: flex; justify-content: space-between; }
  .disclaimer-note { font-size: 7.5pt; font-style: italic; color: #444; margin-bottom: 8px; line-height: 1.3; }
  .title-bar { background: #000; color: #fff; text-align: center; font-weight: bold; font-size: 13pt; padding: 4px; }
  .three-col { display: flex; gap: 16px; margin-top: 6px; align-items: stretch; border-bottom: 1px solid #000; padding-bottom: 8px; }
  .left-col { flex: 0 0 200px; font-size: 9.5pt; line-height: 1.4; }
  .middle-col { flex: 1; font-size: 9.5pt; line-height: 1.5; }
  .sideways-col { flex: 0 0 18px; writing-mode: vertical-rl; transform: rotate(180deg); font-weight: bold; letter-spacing: 1px; font-size: 8.5pt; text-align: center; }
  .clinical-notes { margin: 8px 0; font-size: 9.5pt; }
  .panel { border-top: 1px solid #aaa; padding-top: 6px; }
  .panel-header { font-size: 10pt; margin-bottom: 4px; }
  table.results { border-collapse: collapse; width: 100%; font-size: 9pt; }
  table.results th { background: #f4f6f8; text-align: left; padding: 3px 5px; border-bottom: 1px solid #555; font-size: 8.5pt; line-height: 1.25; vertical-align: top; }
  table.results td { padding: 2px 5px; border-bottom: 1px dotted #ccc; }
  table.results td.h-name { font-weight: bold; }
  table.results td.latest { background: #fff8e0; }
  table.results .flag { color: #b03030; font-weight: bold; }
  .comments-title { margin-top: 8px; font-size: 9.5pt; }
  .comment-row { display: flex; gap: 14px; font-size: 9pt; margin-top: 4px; }
  .comment-date { flex: 0 0 130px; font-family: 'Courier New', monospace; font-size: 8.5pt; }
  .footer { margin-top: 16px; border-top: 1px solid #aaa; padding-top: 6px; font-size: 8.5pt; }
  .footer-row { display: flex; justify-content: space-between; margin-top: 4px; }
</style></head><body>
  ${page1}
  ${page2}
  ${page3}
</body></html>`;
}

// ---------- Layout 5: I-MED Radiology — DEXA letter (CC on page 2) ----------

function buildImedDexaLetter(): string {
  const p = PATIENT_IMED;
  const sharedHead = `
    <div class="fax-header">
      <span>29-Apr-2026 02:15</span><span>UTC</span><span>To: 61291693497</span><span>p.PAGE_NUM</span>
    </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  @page { margin: 1.4cm 1.8cm; size: A4; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.45; }
  .fax-header { font-family: 'Courier New', monospace; font-size: 9pt; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 16px; display: flex; justify-content: space-between; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
  .imed-logo { display: flex; gap: 8px; align-items: center; }
  .imed-circle { width: 40px; height: 40px; border-radius: 50%; background: #6a6f7a; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12pt; }
  .imed-name { font-weight: bold; font-size: 16pt; color: #2b3138; }
  .imed-name small { display: block; font-size: 8pt; color: #555; font-weight: normal; }
  .branch { text-align: right; font-size: 10pt; line-height: 1.4; }
  .header-row { display: flex; justify-content: space-between; margin-bottom: 18px; }
  .addressee { font-size: 10pt; line-height: 1.5; }
  .addressee .name { font-weight: bold; }
  .ids { text-align: right; font-size: 10pt; line-height: 1.5; }
  .ids .name-box { border: 1px solid #000; padding: 2px 16px; min-width: 110px; min-height: 14px; display: inline-block; }
  .date-row { display: flex; justify-content: space-between; margin-top: 10px; font-weight: bold; }
  .salutation { margin-top: 10px; }
  .re-row { margin: 10px 0 18px; }
  .re-row .field { display: flex; gap: 20px; align-items: center; }
  .re-row .box { border: 1px solid #000; padding: 2px 16px; min-width: 200px; min-height: 14px; display: inline-block; }
  h2 { font-size: 11.5pt; margin: 12px 0 6px; }
  h3 { font-size: 10.5pt; margin: 10px 0 4px; }
  table.dexa { border-collapse: collapse; margin: 6px 0 8px; font-size: 10pt; }
  table.dexa th { text-align: left; padding: 4px 22px 4px 0; font-size: 9.5pt; }
  table.dexa td { padding: 3px 22px 3px 0; }
  table.dexa td.region { font-weight: bold; }
  .who-block { font-style: italic; font-size: 10pt; margin-top: 14px; }
  .signoff { margin-top: 22px; }
  .signoff .name { font-weight: bold; }
  .footer-mini { font-size: 8pt; color: #777; margin-top: 18px; border-top: 1px dashed #ccc; padding-top: 4px; display: flex; justify-content: space-between; }
  .page-num-r { text-align: right; font-size: 9pt; margin-top: 6px; }
  .page-break { page-break-after: always; }
  .p2-meta { text-align: right; font-size: 10pt; line-height: 1.5; margin-top: 6px; }
  .p2-meta .name-box { border: 1px solid #000; padding: 2px 16px; min-width: 110px; min-height: 14px; display: inline-block; }
  .cc-line { margin-top: 4px; }
</style></head><body>
  ${sharedHead.replace("PAGE_NUM", "1")}

  <div class="top">
    <div class="imed-logo">
      <div class="imed-circle">iM</div>
      <div class="imed-name">I-MED Radiology<small>Network — Comprehensive care. Uncompromising quality.</small></div>
    </div>
    <div class="branch">
      <div>I-MED Radiology - Coffs Harbour</div>
      <div>140 West High Street</div>
      <div>COFFS HARBOUR 2450</div>
      <div>Tel: 0266482700</div>
      <div>Fax:</div>
    </div>
  </div>

  <div class="header-row">
    <div class="addressee">
      <div class="name">Dr Neelam Dhabuwala</div>
      <div>Coffs Medical Centre</div>
      <div>42-44 Gordon Street</div>
      <div>Coffs Harbour 2450</div>
      <div>Tel: 0266485222</div>
      <div style="margin-top:8px; font-weight:bold;">29th April 2026</div>
    </div>
    <div class="ids">
      <div><strong>Patient ID:</strong> 77.12629501</div>
      <div><strong>Accession Number:</strong> 77.57776201</div>
      <div style="margin-top:18px; font-weight:bold;">Reported: 29 April 2026</div>
    </div>
  </div>

  <div class="salutation">Dear Dr Dhabuwala</div>

  <div class="re-row">
    <div class="field"><strong>Re:</strong> <span class="box">${p.title} ${p.firstName} ${p.lastName}</span> &nbsp; <strong>- DOB:</strong> <span class="box">${p.dob}</span></div>
    <div style="margin-top:4px;"><span class="box">Medicare ${p.medicare}/${p.medicareRef}</span></div>
  </div>

  <h2>Bone Mineral Densitometry</h2>

  <h3>Clinical Indications:</h3>
  <p>inflammatory arthritis, recent fall</p>

  <h3>Findings</h3>
  <p>DEXA performed on a Medilink</p>

  <table class="dexa">
    <thead>
      <tr><th>Region</th><th>BMD (g/cm2)</th><th>T-Score</th><th>Z-Score</th></tr>
    </thead>
    <tbody>
      <tr><td class="region">Lumbar Spine (L1-L4)</td><td>0.943</td><td>-1.0</td><td>-0.8</td></tr>
      <tr><td class="region">Femoral Neck (Left)</td><td>0.757</td><td>-1.4</td><td>-1.1</td></tr>
      <tr><td class="region">Total Hip (Left)</td><td>0.879</td><td>-1.2</td><td>-1.1</td></tr>
      <tr><td class="region">1/3 Forearm (Left)</td><td>0.833</td><td>2.1</td><td>2.4</td></tr>
    </tbody>
  </table>

  <p>No previous DEXA available for statistical comparison.</p>

  <h3>Conclusion:</h3>
  <p>Findings are consistent with osteopaenia (moderate risk of fracture). The most adverse result best predicts fracture risk.</p>

  <div class="who-block">
    Intervals between BMD testing should be determined according to each patient's clinical status; typically 1 year after initiation or change in therapy is appropriate, with longer intervals once therapeutic effect is established.<br><br>
    The World Health Organization recognises:<br>
    Post-menopausal women/men over 50:<br>
    T score above or at -1: Normal (low fracture risk)<br>
    T score below -1 and above -2.5: Osteopaenia (moderate fracture risk)<br>
    T score at or below -2.5: Osteoporosis (high fracture risk)
  </div>

  <div class="signoff">
    <div class="name">Dr Sohrabh Memon</div>
    <div><strong>Electronically signed at 12:05 pm Wed, 29th Apr 2026</strong></div>
  </div>

  <div class="footer-mini">
    <span>Medical Practitioners registered with I-MED Online can access images for this study.</span>
    <span>page 1 of 2</span>
  </div>
  <div style="text-align:right;font-size:8pt;color:#777;">i-med.com.au</div>

  <div class="page-break"></div>

  ${sharedHead.replace("PAGE_NUM", "2")}

  <div class="top">
    <div class="imed-logo">
      <div class="imed-circle">iM</div>
      <div class="imed-name">I-MED Radiology<small>Network — Comprehensive care. Uncompromising quality.</small></div>
    </div>
    <div class="p2-meta">
      <div><span class="name-box">${p.title} ${p.firstName} ${p.lastName}</span></div>
      <div><strong>Patient ID:</strong> 77.12629501</div>
      <div><strong>Accession:</strong> 77.57776201</div>
      <div>Dr Neelam Dhabuwala</div>
      <div>29 April 2026</div>
    </div>
  </div>

  <div class="cc-line"><strong>cc:</strong> Dr Pauline Habib</div>

  <div class="footer-mini" style="margin-top:60vh;">
    <span>Medical Practitioners registered with I-MED Online can access images for this study.</span>
    <span>page 2 of 2</span>
  </div>
  <div style="text-align:right;font-size:8pt;color:#777;">i-med.com.au</div>
</body></html>`;
}

// ---------- Scenarios ----------

const SCENARIOS: Scenario[] = [
  {
    filename: "redacted_1_dhm_haematology_serial.pdf",
    description: "DHM haematology serial trend (5 dates) → Dr Herman Lau",
    build: buildDhmSerial,
  },
  {
    filename: "redacted_2_mmi_mri_brain.pdf",
    description: "MMI MRI brain, multi-page, To/Copies-To header → Dr Kate Celkys",
    build: buildMmiMri,
  },
  {
    filename: "redacted_3_prp_ct_xray_combined.pdf",
    description: "PRP CT lumbar + X-ray wrist combined → Dr Kate Celkys",
    build: buildPrpCombined,
  },
  {
    filename: "redacted_4_nswhp_multipanel_fax.pdf",
    description: "NSW Health Pathology Hunter, 3 panels, sideways labels → Dr Elaine Ng",
    build: buildNswhpMultiPanel,
  },
  {
    filename: "redacted_5_imed_dexa_letter.pdf",
    description: "I-MED DEXA letter, addressee external, CC = Dr Pauline Habib",
    build: buildImedDexaLetter,
  },
];

// ---------- Generation ----------

async function generatePDFs() {
  const outputDir = path.join(
    __dirname,
    "..",
    "docs",
    "input PDF",
    "results",
    "redacted-style"
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created directory: ${outputDir}`);
  }

  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    timeout: 60_000,
  });

  for (const scenario of SCENARIOS) {
    const page = await browser.newPage();
    const html = scenario.build();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const outputPath = path.join(outputDir, scenario.filename);
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    await page.close();
    console.log(`Generated: ${scenario.filename}`);
    console.log(`  ${scenario.description}`);
  }

  await browser.close();
  console.log(`\nDone. ${SCENARIOS.length} redacted-style result PDFs generated.`);
}

generatePDFs().catch((err) => {
  console.error(err);
  process.exit(1);
});
