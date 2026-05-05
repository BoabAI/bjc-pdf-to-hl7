/**
 * Generate test referral PDFs for CC/addressee scenarios
 *
 * Scenarios:
 * 1. BJC doctor as primary addressee (no CC)
 * 2. External specialist as primary, BJC doctor in CC
 * 3. Both primary and CC are BJC doctors
 *
 * Run with: bun scripts/generate-addressee-test-pdfs.ts
 */

import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";

interface ScenarioData {
  filename: string;
  description: string;
  patient: {
    firstName: string;
    lastName: string;
    dob: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
    mobile: string;
    medicare: string;
    medicareRef: string;
  };
  sender: {
    title: string;
    name: string;
    clinic: string;
    providerNo: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
    phone: string;
  };
  primaryRecipient: {
    title: string;
    name: string;
    clinic: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
  };
  ccRecipients?: {
    title: string;
    name: string;
    clinic: string;
  }[];
  letterDate: string;
  diagnosis: string;
}

const SCENARIOS: ScenarioData[] = [
  // Scenario 1: BJC doctor as primary addressee, no CC
  {
    filename: "addressee_1_bjc_primary.pdf",
    description: "BJC doctor as primary addressee (no CC)",
    patient: {
      firstName: "Sarah",
      lastName: "WILLIAMS",
      dob: "22/03/1975",
      address: "15 Harbour View Drive",
      suburb: "PARRAMATTA",
      state: "NSW",
      postcode: "2150",
      mobile: "0412 555 123",
      medicare: "2345678901",
      medicareRef: "1",
    },
    sender: {
      title: "Dr",
      name: "Rebecca Chen",
      clinic: "Westmead Family Practice",
      providerNo: "4567890B",
      address: "Suite 3, 45 Victoria Road",
      suburb: "WESTMEAD",
      state: "NSW",
      postcode: "2145",
      phone: "02 9891 1234",
    },
    primaryRecipient: {
      title: "Dr",
      name: "Adam Maundrell",
      clinic: "BJC Health",
      address: "Suite 101, Level 1, 11 Fennell Street",
      suburb: "PARRAMATTA",
      state: "NSW",
      postcode: "2150",
    },
    letterDate: "18 March 2026",
    diagnosis: "Rheumatoid arthritis — persistent joint inflammation",
  },

  // Scenario 2: External specialist as primary, BJC doctor in CC
  {
    filename: "addressee_2_bjc_in_cc.pdf",
    description: "External specialist primary, BJC doctor in CC",
    patient: {
      firstName: "Michael",
      lastName: "NGUYEN",
      dob: "08/11/1962",
      address: "7/200 Pacific Highway",
      suburb: "CHATSWOOD",
      state: "NSW",
      postcode: "2067",
      mobile: "0433 222 876",
      medicare: "3456789012",
      medicareRef: "2",
    },
    sender: {
      title: "Dr",
      name: "James McPherson",
      clinic: "North Shore Orthopaedics",
      providerNo: "6789012C",
      address: "Level 8, 67 Albert Avenue",
      suburb: "CHATSWOOD",
      state: "NSW",
      postcode: "2067",
      phone: "02 9413 5678",
    },
    primaryRecipient: {
      title: "Dr",
      name: "Priya Sharma",
      clinic: "Chatswood Medical Centre",
      address: "Suite 5, 120 Victoria Avenue",
      suburb: "CHATSWOOD",
      state: "NSW",
      postcode: "2067",
    },
    ccRecipients: [
      {
        title: "Dr",
        name: "Irwin Lim",
        clinic: "BJC Health",
      },
    ],
    letterDate: "20 March 2026",
    diagnosis: "Bilateral knee osteoarthritis with gout flares — rheumatology co-management",
  },

  // Scenario 3: Both primary and CC are BJC doctors
  {
    filename: "addressee_3_both_bjc.pdf",
    description: "Both primary and CC are BJC Health doctors",
    patient: {
      firstName: "Patricia",
      lastName: "O'BRIEN",
      dob: "14/07/1988",
      address: "3 Ocean Street",
      suburb: "BONDI JUNCTION",
      state: "NSW",
      postcode: "2022",
      mobile: "0455 777 321",
      medicare: "4567890123",
      medicareRef: "1",
    },
    sender: {
      title: "Dr",
      name: "Lisa Thornton",
      clinic: "Bondi Junction Family Medical",
      providerNo: "7890123D",
      address: "22 Spring Street",
      suburb: "BONDI JUNCTION",
      state: "NSW",
      postcode: "2022",
      phone: "02 9389 4567",
    },
    primaryRecipient: {
      title: "Dr",
      name: "Ilana Ginges",
      clinic: "BJC Health",
      address: "Suite 101, Level 1, 11 Fennell Street",
      suburb: "PARRAMATTA",
      state: "NSW",
      postcode: "2150",
    },
    ccRecipients: [
      {
        title: "Dr",
        name: "Anne Chung",
        clinic: "BJC Health",
      },
    ],
    letterDate: "21 March 2026",
    diagnosis: "Systemic lupus erythematosus — pregnancy planning and management",
  },
];

function buildHTML(data: ScenarioData): string {
  const ccBlock = data.ccRecipients?.length
    ? `<div class="cc-block">
        <strong>CC:</strong> ${data.ccRecipients
          .map((cc) => `${cc.title} ${cc.name}, ${cc.clinic}`)
          .join("; ")}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 2cm; size: A4; }
    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #333; }
    .header { border-bottom: 2px solid #0099cc; padding-bottom: 15px; margin-bottom: 20px; }
    .clinic-name { font-size: 22pt; font-weight: bold; color: #0099cc; margin-bottom: 3px; }
    .clinic-tagline { font-size: 9pt; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .contact-info { text-align: right; font-size: 9pt; color: #666; margin-top: -40px; }
    .date { text-align: right; margin: 20px 0; }
    .recipient-block { margin-bottom: 20px; }
    .salutation { margin: 20px 0; }
    .re-line { margin: 15px 0; padding: 10px; background: #f5f5f5; border-left: 3px solid #0099cc; }
    .re-line strong { color: #0099cc; }
    .patient-details { margin-left: 50px; }
    .body-text { margin: 20px 0; text-align: justify; }
    .body-text p { margin-bottom: 12px; }
    .diagnosis strong { color: #333; }
    .signature-block { margin-top: 40px; }
    .signature-line { margin-top: 50px; border-top: 1px solid #333; width: 200px; }
    .author-name { font-weight: bold; margin-top: 5px; }
    .author-details { font-size: 10pt; color: #666; }
    .cc-block { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 10pt; color: #555; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 8pt; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="clinic-name">${data.sender.clinic}</div>
    <div class="clinic-tagline">Medical Practice</div>
    <div class="contact-info">
      ${data.sender.address}<br>
      ${data.sender.suburb} ${data.sender.state} ${data.sender.postcode}<br>
      T. ${data.sender.phone}
    </div>
  </div>

  <div class="date">${data.letterDate}</div>

  <div class="recipient-block">
    ${data.primaryRecipient.title} ${data.primaryRecipient.name}<br>
    ${data.primaryRecipient.clinic}<br>
    ${data.primaryRecipient.address}<br>
    ${data.primaryRecipient.suburb} ${data.primaryRecipient.state} ${data.primaryRecipient.postcode}
  </div>

  <div class="salutation">Dear ${data.primaryRecipient.title} ${data.primaryRecipient.name.split(" ").pop()},</div>

  <div class="re-line">
    <strong>RE:</strong> ${data.patient.firstName} ${data.patient.lastName} — DOB: ${data.patient.dob}
    <div class="patient-details">
      ${data.patient.address}, ${data.patient.suburb} ${data.patient.state} ${data.patient.postcode}<br>
      Mobile: ${data.patient.mobile}<br>
      Medicare: ${data.patient.medicare}/${data.patient.medicareRef}
    </div>
  </div>

  <div class="body-text">
    <p>Thank you for your ongoing care of ${data.patient.firstName}. I reviewed her today in consultation.</p>

    <div class="diagnosis">
      <strong>Provisional Diagnosis:</strong> ${data.diagnosis}
    </div>

    <p>On examination, the patient was in good general condition. I have outlined a management plan and would appreciate your continued involvement in her care.</p>

    <p>I have arranged follow-up in four weeks to review her progress. Please do not hesitate to contact my rooms if you have any questions in the interim.</p>
  </div>

  <div class="signature-block">
    <p>Yours sincerely,</p>
    <div class="signature-line"></div>
    <div class="author-name">${data.sender.title} ${data.sender.name}</div>
    <div class="author-details">
      Provider No: ${data.sender.providerNo}
    </div>
  </div>

  ${ccBlock}

  <div class="footer">
    This letter is intended for the exclusive use of the addressee. It may contain privileged or confidential information.
  </div>
</body>
</html>`;
}

async function generatePDFs() {
  const outputDir = path.join(__dirname, "../docs/test-pdfs/addressees");

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
    const html = buildHTML(scenario);
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
    console.log(`  Patient: ${scenario.patient.firstName} ${scenario.patient.lastName}`);
    console.log(`  Primary: ${scenario.primaryRecipient.title} ${scenario.primaryRecipient.name} (${scenario.primaryRecipient.clinic})`);
    if (scenario.ccRecipients?.length) {
      console.log(`  CC: ${scenario.ccRecipients.map((cc) => `${cc.title} ${cc.name} (${cc.clinic})`).join(", ")}`);
    } else {
      console.log(`  CC: (none)`);
    }
    console.log();
  }

  await browser.close();
  console.log("Done! All CC scenario PDFs generated.");
}

generatePDFs().catch(console.error);
