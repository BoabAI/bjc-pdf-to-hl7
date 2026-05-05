/**
 * Generate synthetic pathology and radiology result test PDFs.
 *
 * Each PDF identifies a fake patient and a referring doctor from the BJC
 * Health doctor list so addressee resolution can be verified live.
 *
 * Run with: bun scripts/generate-result-test-pdfs.ts
 *
 * Output: docs/test-pdfs/results/
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

interface PatientBlock {
  firstName: string;
  lastName: string;
  dob: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  medicare: string;
  medicareRef: string;
}

interface ProviderBlock {
  title: string;
  name: string;
  providerNumber?: string;
}

interface PathologyScenario {
  kind: "pathology";
  filename: string;
  description: string;
  labName: string;
  labAddress: string;
  natAccreditation: string;
  collectedAt: string;
  reportedAt: string;
  patient: PatientBlock;
  reportingPathologist: ProviderBlock;
  referringDoctor: ProviderBlock;
  panelTitle: string;
  rows: { name: string; value: string; range: string; units: string }[];
  comment?: string;
}

interface RadiologyScenario {
  kind: "radiology";
  filename: string;
  description: string;
  providerName: string;
  providerAddress: string;
  examTitle: string;
  examDate: string;
  reportedDate: string;
  patient: PatientBlock;
  reportingRadiologist: ProviderBlock;
  referringDoctor: ProviderBlock;
  technique: string;
  findings: string;
  impression: string;
}

type Scenario = PathologyScenario | RadiologyScenario;

// Synthetic patient identifiers — Test* names + 2199999991 fake Medicare numbers
const SCENARIOS: Scenario[] = [
  {
    kind: "pathology",
    filename: "result_1_pathology_chemistry.pdf",
    description: "Pathology — U&E + LFT panel from Douglass Hanly Moir",
    labName: "Douglass Hanly Moir Pathology",
    labAddress: "14 Giffnock Avenue, Macquarie Park NSW 2113",
    natAccreditation: "NATA Accredited Laboratory No. 1438",
    collectedAt: "21 April 2026 09:14",
    reportedAt: "21 April 2026 16:42",
    patient: {
      firstName: "Marcus",
      lastName: "Tanaka",
      dob: "12/03/1962",
      address: "10 Birchgrove Road",
      suburb: "PARRAMATTA",
      state: "NSW",
      postcode: "2150",
      medicare: "2199999911",
      medicareRef: "1",
    },
    reportingPathologist: {
      title: "Dr",
      name: "Olivia Hartwell",
      providerNumber: "0000001P",
    },
    referringDoctor: {
      title: "Dr",
      name: "Irwin Lim",
    },
    panelTitle: "Urea, Electrolytes, Creatinine + Liver Function Tests",
    rows: [
      { name: "Sodium", value: "140", range: "135 – 145", units: "mmol/L" },
      { name: "Potassium", value: "4.3", range: "3.5 – 5.2", units: "mmol/L" },
      { name: "Chloride", value: "104", range: "98 – 108", units: "mmol/L" },
      { name: "Bicarbonate", value: "26", range: "22 – 30", units: "mmol/L" },
      { name: "Urea", value: "5.8", range: "3.0 – 8.0", units: "mmol/L" },
      {
        name: "Creatinine",
        value: "78",
        range: "60 – 110",
        units: "umol/L",
      },
      { name: "eGFR", value: ">90", range: ">60", units: "mL/min/1.73m²" },
      {
        name: "Bilirubin (total)",
        value: "12",
        range: "< 20",
        units: "umol/L",
      },
      { name: "ALP", value: "78", range: "30 – 110", units: "U/L" },
      { name: "ALT", value: "24", range: "< 40", units: "U/L" },
      { name: "AST", value: "22", range: "< 40", units: "U/L" },
      { name: "GGT", value: "31", range: "< 60", units: "U/L" },
      {
        name: "Albumin",
        value: "42",
        range: "35 – 50",
        units: "g/L",
      },
    ],
    comment:
      "Renal and hepatic function within reference range. No follow-up required at this time.",
  },
  {
    kind: "pathology",
    filename: "result_2_pathology_microbiology.pdf",
    description: "Pathology — Urine MCS from Laverty Pathology",
    labName: "Laverty Pathology",
    labAddress: "60 Waterloo Road, Macquarie Park NSW 2113",
    natAccreditation: "NATA Accredited Laboratory No. 14579",
    collectedAt: "20 April 2026 11:32",
    reportedAt: "21 April 2026 08:05",
    patient: {
      firstName: "Eleanor",
      lastName: "Whitfield",
      dob: "08/07/1955",
      address: "22 Cumberland Drive",
      suburb: "PARRAMATTA",
      state: "NSW",
      postcode: "2150",
      medicare: "2199999922",
      medicareRef: "1",
    },
    reportingPathologist: {
      title: "Dr",
      name: "Marcus Rowley",
      providerNumber: "0000002P",
    },
    referringDoctor: {
      title: "Dr",
      name: "Adam Maundrell",
    },
    panelTitle: "Urine Microscopy, Culture and Sensitivity",
    rows: [
      { name: "Appearance", value: "Cloudy", range: "Clear", units: "" },
      { name: "Leucocytes", value: "120", range: "< 10", units: "x10^6/L" },
      {
        name: "Erythrocytes",
        value: "12",
        range: "< 10",
        units: "x10^6/L",
      },
      {
        name: "Epithelial cells",
        value: "Few",
        range: "Few",
        units: "",
      },
      {
        name: "Organism",
        value: "Escherichia coli — heavy growth",
        range: "No growth",
        units: "",
      },
      {
        name: "Susceptibility",
        value:
          "Sensitive: Trimethoprim, Nitrofurantoin, Cephalexin. Resistant: Amoxicillin",
        range: "—",
        units: "",
      },
    ],
    comment:
      "Findings consistent with uncomplicated urinary tract infection. Treat per local antimicrobial guidelines.",
  },
  {
    kind: "radiology",
    filename: "result_3_radiology_mri.pdf",
    description: "Radiology — MRI right knee from PRP Diagnostic Imaging",
    providerName: "PRP Diagnostic Imaging",
    providerAddress: "Suite 12, 320 Victoria Avenue, Chatswood NSW 2067",
    examTitle: "MRI Right Knee",
    examDate: "19 April 2026",
    reportedDate: "19 April 2026",
    patient: {
      firstName: "Reza",
      lastName: "Farahani",
      dob: "02/02/1978",
      address: "44 Mowbray Road",
      suburb: "CHATSWOOD",
      state: "NSW",
      postcode: "2067",
      medicare: "2199999933",
      medicareRef: "1",
    },
    reportingRadiologist: {
      title: "Dr",
      name: "Helena Pavlovic",
      providerNumber: "0000003R",
    },
    referringDoctor: {
      title: "Dr",
      name: "Herman Lau",
    },
    technique:
      "Multiplanar, multisequence imaging of the right knee was performed including PD, PD fat-saturated and T1-weighted sequences.",
    findings:
      "There is a horizontal cleavage tear of the posterior horn of the medial meniscus extending to the inferior articular surface. Mild chondral thinning is noted in the medial femoral condyle. The anterior and posterior cruciate ligaments are intact. Collateral ligaments are unremarkable. Small joint effusion. No evidence of acute fracture or bone marrow oedema.",
    impression:
      "Horizontal tear of the posterior horn of the medial meniscus with mild medial compartment chondral wear and a small joint effusion.",
  },
  {
    kind: "radiology",
    filename: "result_4_radiology_ultrasound.pdf",
    description: "Radiology — Abdominal ultrasound from I-MED Radiology",
    providerName: "I-MED Radiology Network",
    providerAddress: "Level 1, 22 Macquarie Street, Parramatta NSW 2150",
    examTitle: "Ultrasound Abdomen",
    examDate: "18 April 2026",
    reportedDate: "18 April 2026",
    patient: {
      firstName: "Linh Phuong",
      lastName: "Nguyen",
      dob: "27/09/1969",
      address: "88 Pendle Way",
      suburb: "PARRAMATTA",
      state: "NSW",
      postcode: "2150",
      medicare: "2199999944",
      medicareRef: "1",
    },
    reportingRadiologist: {
      title: "Dr",
      name: "Daniel Foxworthy",
      providerNumber: "0000004R",
    },
    referringDoctor: {
      title: "Dr",
      name: "Anne Chung",
    },
    technique:
      "Greyscale and colour Doppler ultrasound of the upper abdomen was performed using a curvilinear probe.",
    findings:
      "The liver is normal in size and echotexture with no focal lesion. Intrahepatic ducts are not dilated. The gallbladder contains a single 9 mm calculus with no wall thickening or pericholecystic fluid. The common bile duct measures 4 mm. The pancreas is normal where visualised. The spleen and kidneys are unremarkable. No free fluid identified.",
    impression:
      "Single uncomplicated cholelithiasis. No sonographic features of acute cholecystitis. Otherwise unremarkable upper abdominal ultrasound.",
  },
];

function buildPathologyHTML(s: PathologyScenario): string {
  const referringFull = `${s.referringDoctor.title} ${s.referringDoctor.name}`;
  const reportingFull = `${s.reportingPathologist.title} ${s.reportingPathologist.name}`;
  const rows = s.rows
    .map(
      (r) => `
        <tr>
          <td>${r.name}</td>
          <td class="value">${r.value}</td>
          <td class="units">${r.units}</td>
          <td class="range">${r.range}</td>
        </tr>
      `
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 1.8cm; size: A4; }
    body { font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #222; }
    .header { border-bottom: 2px solid #2a4f8a; padding-bottom: 12px; margin-bottom: 18px; }
    .lab-name { font-size: 18pt; font-weight: bold; color: #2a4f8a; margin-bottom: 2px; }
    .lab-meta { font-size: 9pt; color: #555; }
    .nata { font-size: 8.5pt; color: #888; margin-top: 4px; }
    .section { margin: 14px 0; }
    .section-title { font-weight: bold; color: #2a4f8a; text-transform: uppercase; font-size: 9.5pt; letter-spacing: 0.5px; margin-bottom: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; font-size: 10pt; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
    th, td { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left; }
    th { background: #f0f3f8; color: #2a4f8a; font-weight: bold; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.4px; }
    td.value { font-weight: bold; }
    td.range, td.units { color: #666; font-size: 9.5pt; }
    .comment { background: #fafbfd; padding: 10px 12px; border-left: 3px solid #2a4f8a; margin: 10px 0; }
    .signoff { margin-top: 20px; font-size: 10pt; }
    .footer { margin-top: 24px; font-size: 8pt; color: #888; border-top: 1px solid #ddd; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="lab-name">${s.labName}</div>
    <div class="lab-meta">${s.labAddress}</div>
    <div class="nata">${s.natAccreditation}</div>
  </div>

  <div class="section">
    <div class="section-title">Patient</div>
    <div class="grid">
      <div><strong>Name:</strong> ${s.patient.firstName} ${s.patient.lastName}</div>
      <div><strong>DOB:</strong> ${s.patient.dob}</div>
      <div><strong>Address:</strong> ${s.patient.address}, ${s.patient.suburb} ${s.patient.state} ${s.patient.postcode}</div>
      <div><strong>Medicare:</strong> ${s.patient.medicare}/${s.patient.medicareRef}</div>
      <div><strong>Specimen Collected:</strong> ${s.collectedAt}</div>
      <div><strong>Reported:</strong> ${s.reportedAt}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Reported To</div>
    <div>${referringFull}${s.referringDoctor.providerNumber ? ` (Provider ${s.referringDoctor.providerNumber})` : ""}</div>
  </div>

  <div class="section">
    <div class="section-title">${s.panelTitle}</div>
    <table>
      <thead>
        <tr><th>Test</th><th>Result</th><th>Units</th><th>Reference Range</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  ${s.comment ? `<div class="comment"><strong>Comment:</strong> ${s.comment}</div>` : ""}

  <div class="signoff">
    Reported by ${reportingFull}${s.reportingPathologist.providerNumber ? `, Provider No. ${s.reportingPathologist.providerNumber}` : ""}<br>
    Specimen received: ${s.collectedAt}
  </div>

  <div class="footer">
    Synthetic test data. Not for clinical use.
  </div>
</body>
</html>`;
}

function buildRadiologyHTML(s: RadiologyScenario): string {
  const referringFull = `${s.referringDoctor.title} ${s.referringDoctor.name}`;
  const reportingFull = `${s.reportingRadiologist.title} ${s.reportingRadiologist.name}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 1.8cm; size: A4; }
    body { font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #222; }
    .header { border-bottom: 2px solid #6b3aa1; padding-bottom: 12px; margin-bottom: 18px; }
    .provider-name { font-size: 18pt; font-weight: bold; color: #6b3aa1; margin-bottom: 2px; }
    .provider-meta { font-size: 9pt; color: #555; }
    .exam-title { font-size: 14pt; color: #333; margin: 16px 0 4px; font-weight: bold; }
    .meta-row { font-size: 10pt; color: #555; margin-bottom: 12px; }
    .section-title { font-weight: bold; color: #6b3aa1; text-transform: uppercase; font-size: 9.5pt; letter-spacing: 0.5px; margin: 14px 0 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; font-size: 10pt; margin-bottom: 8px; }
    .impression { background: #faf7fd; padding: 12px 14px; border-left: 3px solid #6b3aa1; margin: 12px 0; }
    .signoff { margin-top: 20px; font-size: 10pt; }
    .footer { margin-top: 24px; font-size: 8pt; color: #888; border-top: 1px solid #ddd; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="provider-name">${s.providerName}</div>
    <div class="provider-meta">${s.providerAddress}</div>
  </div>

  <div class="exam-title">${s.examTitle}</div>
  <div class="meta-row">Exam date: ${s.examDate} &nbsp;|&nbsp; Reported: ${s.reportedDate}</div>

  <div class="section-title">Patient</div>
  <div class="grid">
    <div><strong>Name:</strong> ${s.patient.firstName} ${s.patient.lastName}</div>
    <div><strong>DOB:</strong> ${s.patient.dob}</div>
    <div><strong>Address:</strong> ${s.patient.address}, ${s.patient.suburb} ${s.patient.state} ${s.patient.postcode}</div>
    <div><strong>Medicare:</strong> ${s.patient.medicare}/${s.patient.medicareRef}</div>
  </div>

  <div class="section-title">Referring Doctor</div>
  <div>${referringFull}${s.referringDoctor.providerNumber ? ` (Provider ${s.referringDoctor.providerNumber})` : ""}</div>

  <div class="section-title">Technique</div>
  <div>${s.technique}</div>

  <div class="section-title">Findings</div>
  <div>${s.findings}</div>

  <div class="impression"><strong>Impression:</strong> ${s.impression}</div>

  <div class="signoff">
    Reported by ${reportingFull}${s.reportingRadiologist.providerNumber ? `, Provider No. ${s.reportingRadiologist.providerNumber}` : ""}
  </div>

  <div class="footer">
    Synthetic test data. Not for clinical use.
  </div>
</body>
</html>`;
}

async function generatePDFs() {
  const outputDir = path.join(__dirname, "..", "docs", "test-pdfs", "results");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created directory: ${outputDir}`);
  }

  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    timeout: 60_000,
  });

  for (const scenario of SCENARIOS) {
    const page = await browser.newPage();
    const html =
      scenario.kind === "pathology"
        ? buildPathologyHTML(scenario)
        : buildRadiologyHTML(scenario);
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
    console.log(
      `  Patient: ${scenario.patient.firstName} ${scenario.patient.lastName}`
    );
    console.log(
      `  Referring: ${scenario.referringDoctor.title} ${scenario.referringDoctor.name}`
    );
    console.log();
  }

  await browser.close();
  console.log("Done! All result test PDFs generated.");
}

generatePDFs().catch((err) => {
  console.error(err);
  process.exit(1);
});
