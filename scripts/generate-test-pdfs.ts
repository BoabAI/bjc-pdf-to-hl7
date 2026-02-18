/**
 * Generate realistic test PDFs for all document types and edge cases.
 * Uses Puppeteer to create PDFs with extractable text content.
 *
 * Outputs into nested directory structure:
 *   docs/input PDF/
 *   ├── specialist-referrals/
 *   ├── gp-referrals/
 *   ├── consent-forms/
 *   └── edge-cases/
 *       ├── skewed/
 *       ├── grainy/
 *       ├── multicultural/
 *       ├── minimal/
 *       └── states/
 *
 * Usage: bun run scripts/generate-test-pdfs.ts
 */

import puppeteer from "puppeteer";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE_DIR = join(import.meta.dir, "../docs/input PDF");

// Create all subdirectories
const DIRS = {
  specialist: join(BASE_DIR, "specialist-referrals"),
  gp: join(BASE_DIR, "gp-referrals"),
  consent: join(BASE_DIR, "consent-forms"),
  skewed: join(BASE_DIR, "edge-cases/skewed"),
  grainy: join(BASE_DIR, "edge-cases/grainy"),
  multicultural: join(BASE_DIR, "edge-cases/multicultural"),
  minimal: join(BASE_DIR, "edge-cases/minimal"),
  states: join(BASE_DIR, "edge-cases/states"),
};

for (const dir of Object.values(DIRS)) {
  mkdirSync(dir, { recursive: true });
}

interface TestPDF {
  dir: string;
  filename: string;
  html: string;
  description: string;
}

// =============================================================================
// SVG Logos for Fictional Clinics
// =============================================================================

const LOGOS = {
  neurospine: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <svg width="50" height="50" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="24" fill="#1a3d6c" stroke="#0d2240" stroke-width="1"/>
        <path d="M15 35 Q25 10 35 35" stroke="white" stroke-width="2.5" fill="none"/>
        <circle cx="25" cy="15" r="4" fill="#4da6ff"/>
        <circle cx="19" cy="22" r="2.5" fill="#4da6ff" opacity="0.7"/>
        <circle cx="31" cy="22" r="2.5" fill="#4da6ff" opacity="0.7"/>
      </svg>
      <div>
        <h2 style="margin:0;color:#1a3d6c;">NeuroSpine Specialist Clinic</h2>
        <p style="margin:2px 0;font-size:11px;color:#666;">Excellence in Spinal Care</p>
      </div>
    </div>`,
  sydneyOrtho: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <svg width="50" height="50" viewBox="0 0 50 50">
        <rect x="1" y="1" width="48" height="48" rx="8" fill="#2d5016" stroke="#1a3009" stroke-width="1"/>
        <path d="M15 38 L25 12 L35 38 M19 30 L31 30" stroke="white" stroke-width="2.5" fill="none"/>
        <circle cx="25" cy="12" r="3" fill="#7ec850"/>
      </svg>
      <div>
        <h2 style="margin:0;color:#2d5016;">Sydney Orthopaedic Associates</h2>
        <p style="margin:2px 0;font-size:11px;color:#666;">Musculoskeletal Excellence</p>
      </div>
    </div>`,
  parramattaGP: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <svg width="45" height="45" viewBox="0 0 45 45">
        <circle cx="22.5" cy="22.5" r="21" fill="#c41e3a" stroke="#8b1528" stroke-width="1"/>
        <rect x="18" y="8" width="9" height="29" rx="2" fill="white"/>
        <rect x="8" y="18" width="29" height="9" rx="2" fill="white"/>
      </svg>
      <div>
        <h3 style="margin:0;color:#c41e3a;">Parramatta Family Medical Centre</h3>
        <p style="margin:2px 0;font-size:11px;color:#666;">Your Family's Health Partner</p>
      </div>
    </div>`,
  bondiGP: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <svg width="45" height="45" viewBox="0 0 45 45">
        <circle cx="22.5" cy="22.5" r="21" fill="#0077b6" stroke="#005a8c" stroke-width="1"/>
        <path d="M10 30 Q15 20 22.5 28 Q30 20 35 30" stroke="white" stroke-width="2" fill="none"/>
        <circle cx="22.5" cy="15" r="5" fill="white" opacity="0.9"/>
      </svg>
      <div>
        <h3 style="margin:0;color:#0077b6;">Bondi Junction Medical Practice</h3>
        <p style="margin:2px 0;font-size:11px;color:#666;">Coastal Healthcare</p>
      </div>
    </div>`,
  melbourneGP: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <svg width="45" height="45" viewBox="0 0 45 45">
        <rect x="1" y="1" width="43" height="43" rx="6" fill="#4a148c" stroke="#311b60" stroke-width="1"/>
        <text x="22.5" y="30" text-anchor="middle" font-size="24" fill="white" font-weight="bold">M</text>
      </svg>
      <div>
        <h3 style="margin:0;color:#4a148c;">Melbourne City Medical</h3>
        <p style="margin:2px 0;font-size:11px;color:#666;">CBD Health Services</p>
      </div>
    </div>`,
  bjcHealth: `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="19" fill="#4a0080" stroke="#2d004d" stroke-width="1"/>
          <text x="20" y="26" text-anchor="middle" font-size="16" fill="white" font-weight="bold">BJC</text>
        </svg>
        <h2 style="margin:0;color:#4a0080;">BJC Health</h2>
      </div>
    </div>`,
  harbourDerm: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <svg width="50" height="50" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="24" fill="#d4a574" stroke="#b8894e" stroke-width="1"/>
        <path d="M15 20 Q25 10 35 20 Q35 35 25 38 Q15 35 15 20Z" fill="white" opacity="0.9"/>
        <circle cx="25" cy="25" r="3" fill="#d4a574"/>
      </svg>
      <div>
        <h2 style="margin:0;color:#8b6914;">Harbour Dermatology</h2>
        <p style="margin:2px 0;font-size:11px;color:#666;">Skin Health Specialists</p>
      </div>
    </div>`,
  darwinTropical: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <svg width="45" height="45" viewBox="0 0 45 45">
        <circle cx="22.5" cy="22.5" r="21" fill="#228B22" stroke="#166316" stroke-width="1"/>
        <path d="M22.5 8 L22.5 37 M15 15 L22.5 22 M30 15 L22.5 22 M13 25 L22.5 30 M32 25 L22.5 30" stroke="white" stroke-width="2" fill="none"/>
      </svg>
      <div>
        <h3 style="margin:0;color:#228B22;">Darwin Tropical Medical</h3>
        <p style="margin:2px 0;font-size:11px;color:#666;">Top End Healthcare</p>
      </div>
    </div>`,
};

// =============================================================================
// Common style wrappers
// =============================================================================

function wrapPage(content: string, font = "Georgia, serif"): string {
  return `<div style="font-family: ${font}; max-width: 700px; margin: 0 auto; padding: 40px;">${content}</div>`;
}

function skewedWrap(content: string): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <div style="transform: rotate(-1.5deg); transform-origin: center center;">
        ${content}
      </div>
    </div>`;
}

function grainyWrap(content: string): string {
  // NOTE: CSS `filter` causes Puppeteer to rasterize text, destroying the text layer.
  // Instead, simulate fax-like appearance with Courier font, muted colors, and scan lines.
  return `
    <div style="font-family: Courier, monospace; max-width: 700px; margin: 0 auto; padding: 40px;
                color: #333;
                background: repeating-linear-gradient(
                  0deg,
                  transparent,
                  transparent 2px,
                  rgba(0,0,0,0.015) 2px,
                  rgba(0,0,0,0.015) 4px
                );">
      <div style="letter-spacing: 0.3px;">
        ${content}
      </div>
    </div>`;
}

// =============================================================================
// Specialist Referral Letters
// =============================================================================

const specialistReferrals: TestPDF[] = [
  {
    dir: DIRS.specialist,
    filename: "test_specialist_referral.pdf",
    description: "Standard specialist referral (NeuroSpine format with logo)",
    html: wrapPage(`
      ${LOGOS.neurospine}
      <div style="border-bottom: 2px solid #1a3d6c; padding-bottom: 8px; margin-bottom: 20px;">
        <p style="margin: 3px 0; font-size: 12px; color: #666;">Level 3, 100 Macquarie Street, Sydney NSW 2000</p>
        <p style="margin: 3px 0; font-size: 12px; color: #666;">Ph: (02) 9876 5432 | Fax: (02) 9876 5433</p>
        <p style="margin: 3px 0; font-size: 12px; color: #666;">Provider No: 457833CF</p>
      </div>
      <p>15 January 2026</p>
      <p>Dear Dr Michael Roberts,</p>
      <p>RE: Emma WILLIAMS - DOB: 23/04/1985</p>
      <p>45 Harbour Street, PYRMONT, NSW, 2009</p>
      <p>Ph: 0412 345 678</p>
      <p>Thank you for referring this 40-year-old woman for assessment of her chronic lower back pain.</p>
      <p>I reviewed Emma in my clinic today. She reports a 6-month history of progressive lumbar pain radiating to her left leg. She describes the pain as constant with intermittent sharp exacerbations. Her symptoms are aggravated by prolonged sitting and bending activities.</p>
      <p>On examination, she demonstrated reduced lumbar flexion to approximately 60 degrees. Straight leg raise was positive on the left at 45 degrees. Neurological examination of her lower limbs revealed reduced sensation in the L5 dermatome on the left. Her power was 4/5 in left ankle dorsiflexion.</p>
      <p>MRI lumbar spine (dated 10/12/2025) demonstrates a left paracentral disc protrusion at L4/5 with compression of the traversing L5 nerve root.</p>
      <p>I have discussed the findings with her and recommended an initial trial of conservative management including physiotherapy and a targeted exercise program. If her symptoms fail to improve over the next 6-8 weeks, I would recommend consideration of a left L4/5 transforaminal epidural steroid injection.</p>
      <p>I will review her in 8 weeks. Please do not hesitate to contact me if you have any concerns regarding her management.</p>
      <p>Kind regards,</p>
      <p><strong>Dr Sarah Chen</strong><br/>MBBS, FRACS<br/>Neurosurgeon<br/>Provider No: 457833CF</p>
    `),
  },
  {
    dir: DIRS.specialist,
    filename: "test_specialist_referral_reverse_name.pdf",
    description: "Specialist referral with LASTNAME, Firstname format and logo",
    html: wrapPage(`
      ${LOGOS.sydneyOrtho}
      <div style="border-bottom: 2px solid #2d5016; padding-bottom: 8px; margin-bottom: 20px;">
        <p style="margin: 3px 0; font-size: 12px; color: #666;">Suite 5, 200 George Street, Sydney NSW 2000</p>
        <p style="margin: 3px 0; font-size: 12px; color: #666;">Provider No: 389201AB</p>
      </div>
      <p>3 February 2026</p>
      <p>Dear Dr Amanda Li,</p>
      <p>RE: JOHNSON, Robert - DOB: 08/11/1972</p>
      <p>12 King Street, NEWTOWN, NSW, 2042</p>
      <p>Mobile: 0423 987 654</p>
      <p>Thank you for referring this 53-year-old gentleman for assessment of his right knee.</p>
      <p>He presents with a 3-month history of medial knee pain and intermittent swelling. His symptoms started after he stumbled on uneven ground. He reports difficulty with stairs and prolonged walking.</p>
      <p>On examination, there was a small effusion in his right knee. He had tenderness over the medial joint line. McMurray's test was positive medially. His range of motion was 0-120 degrees compared to 0-140 degrees on the left.</p>
      <p>I have arranged an MRI of his right knee to evaluate for a possible medial meniscal tear. I will review him once the results are available.</p>
      <p>Yours sincerely,</p>
      <p><strong>Dr James Morton</strong><br/>MBBS, FRACS (Orth)<br/>Provider No: 389201AB</p>
    `),
  },
];

// =============================================================================
// GP / Best Practice Referral Letters
// =============================================================================

const gpReferrals: TestPDF[] = [
  {
    dir: DIRS.gp,
    filename: "test_gp_referral.pdf",
    description: "Standard GP referral with logo and full patient details",
    html: wrapPage(`
      ${LOGOS.parramattaGP}
      <div style="border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 20px;">
        <p style="margin: 3px 0; font-size: 12px; color: #666;">45 Church Street, Parramatta NSW 2150</p>
        <p style="margin: 3px 0; font-size: 12px; color: #666;">Phone: (02) 9635 1234 | Fax: (02) 9635 1235</p>
      </div>
      <p>10 February 2026</p>
      <p>Dear Dr Chen,</p>
      <p>re. Mrs Sarah Thompson</p>
      <p>DOB: 15/03/1990</p>
      <p>Medicare No: 3456789012</p>
      <p>Mobile: 0434 567 890</p>
      <p>18 Victoria Road</p>
      <p>Parramatta. 2150</p>
      <p>Thank you for seeing this 35-year-old woman who presents with persistent headaches over the past 4 weeks.</p>
      <p>She describes bifrontal headaches occurring daily, lasting 4-6 hours. She has associated photophobia and occasional nausea but no vomiting. There is no visual aura. She has a past history of migraines in her early twenties which resolved.</p>
      <p>Current medications: Nil regular. She takes paracetamol PRN with limited relief.</p>
      <p>Examination today: BP 128/78, neurological examination unremarkable. Fundoscopy normal.</p>
      <p>I would appreciate your assessment and management advice.</p>
      <p>Yours sincerely,</p>
      <p><strong>Dr Helen Park</strong><br/>MBBS, FRACGP<br/>567612EL</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.gp,
    filename: "test_gp_referral_male.pdf",
    description: "GP referral for male patient with apostrophe name and logo",
    html: wrapPage(`
      ${LOGOS.bondiGP}
      <div style="border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 20px;">
        <p style="margin: 3px 0; font-size: 12px; color: #666;">Level 1, 500 Oxford Street, Bondi Junction NSW 2022</p>
        <p style="margin: 3px 0; font-size: 12px; color: #666;">Phone: (02) 9387 6543</p>
      </div>
      <p>5 February 2026</p>
      <p>Dear Professor Williams,</p>
      <p>re. Mr David O'Connor</p>
      <p>DOB: 28/12/1955</p>
      <p>Medicare No: 49876543211</p>
      <p>Mobile: 0401 222 333</p>
      <p>7/88 Campbell Parade</p>
      <p>Bondi Beach. 2026</p>
      <p>I would be grateful if you could see this 70-year-old gentleman regarding his elevated PSA.</p>
      <p>His recent blood work shows a PSA of 7.2 ng/mL (previously 4.1 twelve months ago). He has a family history of prostate cancer (father diagnosed age 72). He reports no urinary symptoms.</p>
      <p>He is otherwise well. His medications include Atorvastatin 20mg daily and Perindopril 5mg daily for hypertension.</p>
      <p>I would appreciate your expert opinion regarding further investigation and management.</p>
      <p>Kind regards,</p>
      <p><strong>Dr Lisa Huang</strong><br/>MBBS, FRACGP<br/>234567BT</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.gp,
    filename: "test_gp_referral_miss.pdf",
    description: "GP referral for young female with Miss title and logo",
    html: wrapPage(`
      ${LOGOS.melbourneGP}
      <div style="border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 20px;">
        <p style="margin: 3px 0; font-size: 12px; color: #666;">300 Collins Street, Melbourne VIC 3000</p>
      </div>
      <p>12 February 2026</p>
      <p>Dear Dr Roberts,</p>
      <p>re. Miss Aisha Khan</p>
      <p>DOB: 02/07/2001</p>
      <p>Medicare No: 6234567890</p>
      <p>Mobile: 0455 123 456</p>
      <p>Unit 4, 22 Flinders Lane</p>
      <p>Melbourne. 3000</p>
      <p>Thank you for seeing this 24-year-old woman regarding her recurrent tonsillitis.</p>
      <p>She has had 5 episodes of culture-positive Group A Streptococcal tonsillitis in the past 12 months, each requiring antibiotics. Between episodes she reports persistent sore throat and fatigue.</p>
      <p>I would appreciate your assessment regarding suitability for tonsillectomy.</p>
      <p>Yours sincerely,</p>
      <p><strong>Dr Andrew Walsh</strong><br/>MBBS, FRACGP<br/>345678CK</p>
    `, "Arial, sans-serif"),
  },
];

// =============================================================================
// Consent Forms
// =============================================================================

const consentForms: TestPDF[] = [
  {
    dir: DIRS.consent,
    filename: "test_consent_form.pdf",
    description: "BJC Health consent form with logo - male patient",
    html: wrapPage(`
      ${LOGOS.bjcHealth}
      <h3 style="text-align:center;margin:5px 0 25px;">Patient Information and Consent Form</h3>
      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-weight: bold; font-size: 13px;">Mr</p>
      </div>
      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">First Name *</p><p style="margin: 2px 0;">James</p></div>
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">Last Name *</p><p style="margin: 2px 0;">Patterson</p></div>
      </div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Date of Birth *</p><p style="margin: 2px 0;">14/06/1978</p></div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Mobile Phone *</p><p style="margin: 2px 0;">0412 987 654</p></div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Address *</p><p style="margin: 2px 0;">25 Pitt Street</p></div>
      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">City / Suburb *</p><p style="margin: 2px 0;">Redfern</p></div>
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">Postcode *</p><p style="margin: 2px 0;">2016</p></div>
      </div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Card No. *</p><p style="margin: 2px 0;">5678901234</p></div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Ref Number *</p><p style="margin: 2px 0;">2</p></div>
      <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px;">
        <p style="font-size: 12px;">I consent to the collection and use of my personal and health information as described above.</p>
        <p style="font-size: 12px;">Signature: _____________________ Date: 14/02/2026</p>
      </div>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.consent,
    filename: "test_consent_form_female.pdf",
    description: "BJC Health consent form with logo - female patient",
    html: wrapPage(`
      ${LOGOS.bjcHealth}
      <h3 style="text-align:center;margin:5px 0 25px;">Patient Information and Consent Form</h3>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-weight: bold; font-size: 13px;">Ms</p></div>
      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">First Name *</p><p style="margin: 2px 0;">Priya</p></div>
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">Last Name *</p><p style="margin: 2px 0;">Sharma</p></div>
      </div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Date of Birth *</p><p style="margin: 2px 0;">01/01/2000</p></div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Mobile Phone *</p><p style="margin: 2px 0;">0498 765 432</p></div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Address *</p><p style="margin: 2px 0;">Unit 12, 88 George Street</p></div>
      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">City / Suburb *</p><p style="margin: 2px 0;">Parramatta</p></div>
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">Postcode *</p><p style="margin: 2px 0;">2150</p></div>
      </div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Card No. *</p><p style="margin: 2px 0;">2345678901</p></div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Ref Number *</p><p style="margin: 2px 0;">1</p></div>
      <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px;">
        <p style="font-size: 12px;">I consent to the collection and use of my personal and health information.</p>
        <p style="font-size: 12px;">Signature: _____________________ Date: 01/01/2026</p>
      </div>
    `, "Arial, sans-serif"),
  },
];

// =============================================================================
// Edge Cases - Minimal / Missing Data
// =============================================================================

const edgeCasesMinimal: TestPDF[] = [
  {
    dir: DIRS.minimal,
    filename: "test_edge_minimal_referral.pdf",
    description: "Referral with minimal info (no phone, no address, no letterhead)",
    html: wrapPage(`
      <p>18 February 2026</p>
      <p>Dear Dr Smith,</p>
      <p>RE: Mark DAVIES - DOB: 30/09/1960</p>
      <p>I am referring this patient for further assessment. He has been experiencing chest pain on exertion for the past 2 weeks. His ECG is normal. He has a history of hypertension. I would appreciate your opinion on his cardiac risk.</p>
      <p>Regards,<br/>Dr J. Brown</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.minimal,
    filename: "test_edge_special_chars.pdf",
    description: "GP referral with apostrophe and hyphen in name",
    html: wrapPage(`
      <p>Dear Dr Wilson,</p>
      <p>re. Mrs Mary O'Brien-Smith</p>
      <p>DOB: 05/11/1983</p>
      <p>Medicare No: 7890123456</p>
      <p>Mobile: 0467 890 123</p>
      <p>3/45 O'Connell Street</p>
      <p>North Sydney. 2060</p>
      <p>Thank you for seeing this patient regarding her ongoing knee pain. She has been experiencing bilateral knee pain for the past 3 months, worse on the right side. She reports stiffness in the mornings lasting approximately 30 minutes.</p>
      <p>Yours sincerely,<br/>Dr P. Kim<br/>891234DE</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.minimal,
    filename: "test_edge_single_digit_dates.pdf",
    description: "GP referral with single-digit day and month in DOB",
    html: wrapPage(`
      <p>Dear Dr Li,</p>
      <p>re. Mr Tom Lee</p>
      <p>DOB: 3/2/1995</p>
      <p>Medicare No: 1234567890</p>
      <p>Mobile: 0411 111 222</p>
      <p>1 Short St</p>
      <p>Surry Hills. 2010</p>
      <p>Thank you for seeing this 30-year-old man regarding his persistent cough lasting 6 weeks. He is a non-smoker with no significant medical history. Chest X-ray is clear.</p>
      <p>Regards,<br/>Dr A. Patel<br/>456789FG</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.minimal,
    filename: "test_edge_no_medicare.pdf",
    description: "GP referral without Medicare number (overseas patient)",
    html: wrapPage(`
      <p>Dear Dr Taylor,</p>
      <p>re. Ms Nina Petrova</p>
      <p>DOB: 19/04/1992</p>
      <p>Mobile: 0477 123 456</p>
      <p>55 Oxford Street</p>
      <p>Darlinghurst. 2010</p>
      <p>Thank you for seeing this patient, a recent arrival to Australia who does not yet have a Medicare card. She presents with a 2-week history of right-sided abdominal pain.</p>
      <p>Yours sincerely,<br/>Dr R. Clark<br/>345678MN</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.minimal,
    filename: "test_edge_empty.pdf",
    description: "PDF with no meaningful text content",
    html: `<div style="font-family: Arial; padding: 40px;"><p>&nbsp;</p></div>`,
  },
  {
    dir: DIRS.minimal,
    filename: "test_edge_long_names.pdf",
    description: "GP referral with very long names",
    html: wrapPage(`
      <p>Dear Dr Wolfeschlegelsteinhausenbergerdorff,</p>
      <p>re. Mr Bartholomew Wolfeschlegelsteinhausenbergerdorff</p>
      <p>DOB: 01/06/1980</p>
      <p>Medicare No: 9876543210</p>
      <p>Mobile: 0499 888 777</p>
      <p>123 Very Long Street Name Boulevard</p>
      <p>Woolloomooloo. 2011</p>
      <p>Thank you for seeing this patient with his unusually long name regarding a routine health check.</p>
      <p>Regards,<br/>Dr Z. Short<br/>901234PQ</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.minimal,
    filename: "test_edge_dear_name.pdf",
    description: "Referral addressed to first name only (Dear Elaine,)",
    html: wrapPage(`
      <p>Dear Elaine,</p>
      <p>re. Mr Peter Zhang</p>
      <p>DOB: 11/03/1970</p>
      <p>Medicare No: 1111222233</p>
      <p>Mobile: 0400 111 222</p>
      <p>9 Circular Quay</p>
      <p>The Rocks. 2000</p>
      <p>Thank you for seeing this 55-year-old man regarding his elevated liver enzymes. His ALT is 95 U/L and his GGT is 120 U/L. He reports moderate alcohol consumption. Hepatitis serology is negative. Ultrasound shows fatty liver changes.</p>
      <p>Kind regards,<br/>Dr B. Chen<br/>567890RS</p>
    `, "Arial, sans-serif"),
  },
];

// =============================================================================
// Edge Cases - Australian States (postcode inference)
// =============================================================================

const edgeCasesStates: TestPDF[] = [
  {
    dir: DIRS.states,
    filename: "test_edge_qld_patient.pdf",
    description: "GP referral for Queensland patient (4xxx postcode)",
    html: wrapPage(`
      <p>Dear Dr Johnson,</p>
      <p>re. Ms Lisa Brown</p>
      <p>DOB: 22/08/1988</p>
      <p>Medicare No: 4567890123</p>
      <p>Mobile: 0422 333 444</p>
      <p>15 Queen Street</p>
      <p>Brisbane City. 4000</p>
      <p>Thank you for seeing this 37-year-old woman who presents with anxiety and insomnia over the past 8 weeks. She reports difficulty falling asleep, early morning waking, and persistent worry about her work performance.</p>
      <p>Yours sincerely,<br/>Dr M. Wong<br/>678901HJ</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.states,
    filename: "test_edge_vic_patient.pdf",
    description: "Specialist referral for Victorian patient (3xxx postcode)",
    html: wrapPage(`
      <p>10 February 2026</p>
      <p>Dear Dr Patel,</p>
      <p>RE: Anna KOWALSKI - DOB: 17/12/1975</p>
      <p>42 Chapel Street, SOUTH YARRA, VIC, 3141</p>
      <p>Mobile: 0433 555 666</p>
      <p>Thank you for referring this 50-year-old woman. She has been experiencing progressive hearing loss over the past 2 years, worse on the right side. Her audiogram confirms a moderate sensorineural hearing loss bilaterally.</p>
      <p>I have discussed hearing aid options with her and she is keen to proceed.</p>
      <p>Kind regards,<br/><strong>Dr Peter Nguyen</strong><br/>ENT Surgeon<br/>Provider No: 567890CD</p>
    `),
  },
  {
    dir: DIRS.states,
    filename: "test_edge_wa_patient.pdf",
    description: "GP referral for Western Australian patient (6xxx postcode)",
    html: wrapPage(`
      <p>Dear Dr Martinez,</p>
      <p>re. Mr Jack Wilson</p>
      <p>DOB: 31/12/1949</p>
      <p>Medicare No: 6543210987</p>
      <p>Mobile: 0444 777 888</p>
      <p>8 Stirling Highway</p>
      <p>Nedlands. 6009</p>
      <p>Thank you for seeing this 76-year-old gentleman regarding his increasing shortness of breath on exertion. His echocardiogram shows moderate aortic stenosis with a peak gradient of 45mmHg. He remains reasonably active but has noticed progressive limitation over the past 6 months.</p>
      <p>Kind regards,<br/>Dr S. Ahmed<br/>789012KL</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.states,
    filename: "test_edge_sa_patient.pdf",
    description: "Specialist referral for South Australian patient (5xxx postcode)",
    html: wrapPage(`
      ${LOGOS.harbourDerm}
      <div style="border-bottom: 1px solid #d4a574; margin-bottom: 20px; padding-bottom: 8px;">
        <p style="margin: 3px 0; font-size: 12px; color: #666;">33 Hutt Street, Adelaide SA 5000</p>
        <p style="margin: 3px 0; font-size: 12px; color: #666;">Provider No: 234567UV</p>
      </div>
      <p>1 February 2026</p>
      <p>Dear Dr Green,</p>
      <p>RE: Sophie TAYLOR - DOB: 25/07/1998</p>
      <p>33 Rundle Mall, ADELAIDE, SA, 5000</p>
      <p>Ph: 0455 666 777</p>
      <p>Thank you for referring this young woman for dermatological assessment. She presents with multiple atypical naevi on her back and upper limbs. She has a strong family history of melanoma (mother and maternal aunt). I have performed dermoscopy and recommend excision biopsy of two suspicious lesions.</p>
      <p>I will arrange her surgery within the next 2 weeks and keep you informed of the histopathology results.</p>
      <p>Yours sincerely,<br/><strong>Dr Karen White</strong><br/>Dermatologist<br/>Provider No: 234567UV</p>
    `),
  },
  {
    dir: DIRS.states,
    filename: "test_edge_tas_patient.pdf",
    description: "GP referral for Tasmanian patient (7xxx postcode)",
    html: wrapPage(`
      <p>Dear Dr Morrison,</p>
      <p>re. Mrs Helen Campbell</p>
      <p>DOB: 09/10/1965</p>
      <p>Medicare No: 7654321098</p>
      <p>Mobile: 0466 999 000</p>
      <p>14 Liverpool Street</p>
      <p>Hobart. 7000</p>
      <p>Thank you for seeing this 60-year-old woman regarding her hypothyroidism. Her TSH has been difficult to control despite dose adjustments of thyroxine. Current TSH is 8.5 mIU/L on Eltroxin 100mcg daily.</p>
      <p>Yours sincerely,<br/>Dr T. Burns<br/>456789WX</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.states,
    filename: "test_edge_nt_patient.pdf",
    description: "GP referral for Northern Territory patient (0xxx postcode) with logo",
    html: wrapPage(`
      ${LOGOS.darwinTropical}
      <div style="border-bottom: 1px solid #228B22; margin-bottom: 20px; padding-bottom: 8px;">
        <p style="margin: 3px 0; font-size: 12px; color: #666;">42 Smith Street, Darwin NT 0800</p>
      </div>
      <p>Dear Dr Robinson,</p>
      <p>re. Mr Daniel Cooper</p>
      <p>DOB: 14/02/1982</p>
      <p>Medicare No: 0123456789</p>
      <p>Mobile: 0488 111 333</p>
      <p>27 Mitchell Street</p>
      <p>Darwin. 0800</p>
      <p>Thank you for seeing this 43-year-old man regarding recurrent tropical infections. He has had three episodes of cellulitis in the past year, each requiring intravenous antibiotics.</p>
      <p>Yours sincerely,<br/>Dr K. Lawson<br/>678901YZ</p>
    `, "Arial, sans-serif"),
  },
];

// =============================================================================
// Edge Cases - Skewed Text (simulating scanned/crooked documents)
// =============================================================================

const edgeCasesSkewed: TestPDF[] = [
  {
    dir: DIRS.skewed,
    filename: "test_skewed_specialist.pdf",
    description: "Skewed specialist referral (slight rotation like a scanned letter)",
    html: skewedWrap(`
      <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 18px;">
        <h2 style="margin: 0;">Sydney Cardiology Group</h2>
        <p style="margin: 3px 0; font-size: 12px;">Level 8, 50 Bridge Street, Sydney NSW 2000</p>
        <p style="margin: 3px 0; font-size: 12px;">Provider No: 567890EF</p>
      </div>
      <p>8 February 2026</p>
      <p>Dear Dr Nguyen,</p>
      <p>RE: Michael CHEN - DOB: 12/06/1968</p>
      <p>88 Pacific Highway, CROWS NEST, NSW, 2065</p>
      <p>Ph: 0433 111 222</p>
      <p>Thank you for referring this 57-year-old man for cardiac assessment. He presents with exercise-induced chest tightness and dyspnoea on exertion. His resting ECG shows T-wave inversion in V4-V6.</p>
      <p>I have arranged a stress echocardiogram which revealed an area of inducible ischaemia in the anterior wall. His ejection fraction is preserved at 58%.</p>
      <p>I recommend coronary angiography to further delineate his coronary anatomy. I will arrange this as a priority.</p>
      <p>Kind regards,</p>
      <p><strong>Dr William Fraser</strong><br/>MBBS, FRACP<br/>Cardiologist<br/>Provider No: 567890EF</p>
    `),
  },
  {
    dir: DIRS.skewed,
    filename: "test_skewed_gp_referral.pdf",
    description: "Skewed GP referral (slightly tilted fax-style)",
    html: skewedWrap(`
      <h3 style="margin: 0;">Randwick Medical Centre</h3>
      <p style="font-size: 12px; color: #666;">123 Alison Road, Randwick NSW 2031</p>
      <hr style="border: 0.5px solid #ccc;">
      <p>14 February 2026</p>
      <p>Dear Dr Patel,</p>
      <p>re. Mrs Angela Morris</p>
      <p>DOB: 20/05/1976</p>
      <p>Medicare No: 8901234567</p>
      <p>Mobile: 0444 555 666</p>
      <p>17 Coogee Bay Road</p>
      <p>Coogee. 2034</p>
      <p>Thank you for seeing this 49-year-old woman regarding her chronic fatigue. She reports persistent tiredness for the past 3 months despite adequate sleep. Her thyroid function tests and full blood count are normal. Iron studies show a ferritin of 12 ug/L.</p>
      <p>I have commenced oral iron supplementation. I would appreciate your further assessment.</p>
      <p>Yours sincerely,<br/>Dr F. Garcia<br/>234567GH</p>
    `),
  },
  {
    dir: DIRS.skewed,
    filename: "test_skewed_consent.pdf",
    description: "Skewed consent form (slightly rotated scan)",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
        <div style="transform: rotate(1deg); transform-origin: top left;">
          ${LOGOS.bjcHealth}
          <h3 style="text-align:center;margin:5px 0 25px;">Patient Information and Consent Form</h3>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-weight: bold; font-size: 13px;">Mrs</p></div>
          <div style="display: flex; gap: 20px; margin-bottom: 15px;">
            <div><p style="margin: 2px 0; font-size: 12px; color: #666;">First Name *</p><p style="margin: 2px 0;">Margaret</p></div>
            <div><p style="margin: 2px 0; font-size: 12px; color: #666;">Last Name *</p><p style="margin: 2px 0;">Fletcher</p></div>
          </div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Date of Birth *</p><p style="margin: 2px 0;">28/03/1952</p></div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Mobile Phone *</p><p style="margin: 2px 0;">0411 222 333</p></div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Address *</p><p style="margin: 2px 0;">5 Ocean Avenue</p></div>
          <div style="display: flex; gap: 20px; margin-bottom: 15px;">
            <div><p style="margin: 2px 0; font-size: 12px; color: #666;">City / Suburb *</p><p style="margin: 2px 0;">Double Bay</p></div>
            <div><p style="margin: 2px 0; font-size: 12px; color: #666;">Postcode *</p><p style="margin: 2px 0;">2028</p></div>
          </div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Card No. *</p><p style="margin: 2px 0;">3456789012</p></div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Ref Number *</p><p style="margin: 2px 0;">3</p></div>
          <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px;">
            <p style="font-size: 12px;">Signature: _____________________ Date: 15/02/2026</p>
          </div>
        </div>
      </div>`,
  },
];

// =============================================================================
// Edge Cases - Grainy / Fax-like Documents
// =============================================================================

const edgeCasesGrainy: TestPDF[] = [
  {
    dir: DIRS.grainy,
    filename: "test_grainy_specialist.pdf",
    description: "Grainy fax-like specialist referral (low-quality scan simulation)",
    html: grainyWrap(`
      <div style="text-align: center; border-bottom: 1px dashed #555; padding-bottom: 10px; margin-bottom: 15px;">
        <h2 style="margin: 0; letter-spacing: 1px;">WESTERN SUBURBS ENT</h2>
        <p style="margin: 3px 0; font-size: 11px;">Suite 2, 15 Railway Parade, Burwood NSW 2134</p>
        <p style="margin: 3px 0; font-size: 11px;">Provider No: 890123GH</p>
      </div>
      <p>20 January 2026</p>
      <p>Dear Dr Anderson,</p>
      <p>RE: Rachel GREEN - DOB: 07/09/1991</p>
      <p>156 Burwood Road, BURWOOD, NSW, 2134</p>
      <p>Ph: 0422 888 999</p>
      <p>Thank you for referring this 34-year-old woman with chronic rhinosinusitis. She has had recurrent sinus infections requiring antibiotics approximately every 6-8 weeks over the past year. She has trialled nasal corticosteroid sprays and saline irrigations with limited benefit.</p>
      <p>CT sinuses demonstrates bilateral maxillary sinus mucosal thickening and partial opacification of the anterior ethmoid cells. Her septum is deviated to the right with a spur contacting the middle turbinate.</p>
      <p>I have recommended functional endoscopic sinus surgery with septoplasty. She is keen to proceed.</p>
      <p>Yours faithfully,</p>
      <p><strong>Dr Rajesh Kapoor</strong><br/>MBBS, FRACS<br/>ENT Surgeon<br/>Provider No: 890123GH</p>
    `),
  },
  {
    dir: DIRS.grainy,
    filename: "test_grainy_gp_referral.pdf",
    description: "Grainy fax-like GP referral",
    html: grainyWrap(`
      <p style="font-size: 13px; font-weight: bold;">LAKESIDE FAMILY PRACTICE</p>
      <p style="font-size: 10px;">88 Lakeside Drive, Tuggerah NSW 2259</p>
      <hr style="border: 0.5px dashed #888;">
      <p>3 February 2026</p>
      <p>Dear Dr Stevens,</p>
      <p>re. Mr Graham Harris</p>
      <p>DOB: 15/01/1958</p>
      <p>Medicare No: 5432109876</p>
      <p>Mobile: 0466 777 888</p>
      <p>22 Pacific Highway</p>
      <p>Tuggerah. 2259</p>
      <p>Thank you for seeing this 68-year-old gentleman regarding bilateral hand numbness and tingling. He reports symptoms predominantly affecting his thumb, index, and middle fingers bilaterally. Symptoms are worse at night and are relieved by shaking his hands. He has a history of Type 2 diabetes mellitus.</p>
      <p>Nerve conduction studies confirm moderate bilateral carpal tunnel syndrome.</p>
      <p>Kind regards,<br/>Dr J. Murphy<br/>567890AB</p>
    `),
  },
  {
    dir: DIRS.grainy,
    filename: "test_grainy_consent.pdf",
    description: "Grainy fax-like consent form",
    html: `
      <div style="font-family: Courier, monospace; max-width: 700px; margin: 0 auto; padding: 40px;
                  color: #333;
                  background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.015) 3px, rgba(0,0,0,0.015) 6px);">
        <div style="letter-spacing: 0.3px;">
          <h2 style="text-align:center;margin:0;letter-spacing:2px;">BJC Health</h2>
          <h3 style="text-align:center;margin:5px 0 25px;">Patient Information and Consent Form</h3>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-weight: bold;">Mr</p></div>
          <div style="margin-bottom: 15px;">
            <p style="margin: 2px 0; font-size: 11px;">First Name *</p><p style="margin: 2px 0;">Kevin</p>
            <p style="margin: 2px 0; font-size: 11px;">Last Name *</p><p style="margin: 2px 0;">Tran</p>
          </div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 11px;">Date of Birth *</p><p style="margin: 2px 0;">22/11/1985</p></div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 11px;">Mobile Phone *</p><p style="margin: 2px 0;">0433 444 555</p></div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 11px;">Address *</p><p style="margin: 2px 0;">Unit 8, 120 King Street</p></div>
          <div style="margin-bottom: 15px;">
            <p style="margin: 2px 0; font-size: 11px;">City / Suburb *</p><p style="margin: 2px 0;">Newtown</p>
            <p style="margin: 2px 0; font-size: 11px;">Postcode *</p><p style="margin: 2px 0;">2042</p>
          </div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 11px;">Medicare Card No. *</p><p style="margin: 2px 0;">6789012345</p></div>
          <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 11px;">Medicare Ref Number *</p><p style="margin: 2px 0;">4</p></div>
          <p style="font-size: 11px; margin-top: 25px;">Signature: _____________________ Date: 03/02/2026</p>
        </div>
      </div>`,
  },
];

// =============================================================================
// Edge Cases - Multicultural Names
// =============================================================================

const edgeCasesMulticultural: TestPDF[] = [
  {
    dir: DIRS.multicultural,
    filename: "test_multicultural_vietnamese.pdf",
    description: "GP referral - Vietnamese patient (Nguyen Thi Mai -> anglicised as Mai Nguyen)",
    html: wrapPage(`
      <p>Dear Dr Roberts,</p>
      <p>re. Mrs Mai Nguyen</p>
      <p>DOB: 08/03/1975</p>
      <p>Medicare No: 2345678901</p>
      <p>Mobile: 0411 333 444</p>
      <p>45 John Street</p>
      <p>Cabramatta. 2166</p>
      <p>Thank you for seeing this 50-year-old woman regarding her chronic lower back pain. She works as a seamstress and has noticed progressive difficulty with prolonged sitting. She has a history of osteoporosis and is on alendronate. She reports the pain radiates to both buttocks but not beyond her knees.</p>
      <p>Yours sincerely,<br/>Dr T. Pham<br/>123456AB</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.multicultural,
    filename: "test_multicultural_chinese.pdf",
    description: "Specialist referral - Chinese patient (Wei ZHANG)",
    html: wrapPage(`
      <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 18px;">
        <h2 style="margin: 0;">Sydney Gastroenterology Centre</h2>
        <p style="margin: 3px 0; font-size: 12px;">Level 5, 80 Castlereagh Street, Sydney NSW 2000</p>
        <p style="margin: 3px 0; font-size: 12px;">Provider No: 345678CD</p>
      </div>
      <p>5 February 2026</p>
      <p>Dear Dr Morrison,</p>
      <p>RE: Wei ZHANG - DOB: 14/10/1965</p>
      <p>Unit 3, 55 Sussex Street, SYDNEY, NSW, 2000</p>
      <p>Ph: 0433 222 111</p>
      <p>Thank you for referring this 60-year-old man for investigation of his iron deficiency anaemia. He reports intermittent dark stools over the past month. He has no significant abdominal pain. His haemoglobin is 105 g/L with a ferritin of 8 ug/L.</p>
      <p>I have arranged a colonoscopy and gastroscopy under sedation. I will keep you informed of the findings.</p>
      <p>Kind regards,</p>
      <p><strong>Dr Michelle Fong</strong><br/>MBBS, FRACP<br/>Gastroenterologist<br/>Provider No: 345678CD</p>
    `),
  },
  {
    dir: DIRS.multicultural,
    filename: "test_multicultural_arabic.pdf",
    description: "GP referral - Arabic patient (Mohammed Al-Rashidi)",
    html: wrapPage(`
      <p>Dear Dr Chen,</p>
      <p>re. Mr Mohammed Al-Rashidi</p>
      <p>DOB: 25/12/1980</p>
      <p>Medicare No: 8765432109</p>
      <p>Mobile: 0455 666 777</p>
      <p>12 Auburn Road</p>
      <p>Auburn. 2144</p>
      <p>Thank you for seeing this 45-year-old gentleman regarding his poorly controlled Type 2 diabetes. His HbA1c is 9.2% despite maximum tolerated metformin and gliclazide. He has a BMI of 34. He reports difficulty adhering to his dietary plan due to his shift work schedule.</p>
      <p>I would appreciate your guidance regarding intensification of his therapy, potentially with GLP-1 receptor agonist or insulin.</p>
      <p>Kind regards,<br/>Dr S. Habib<br/>890123EF</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.multicultural,
    filename: "test_multicultural_indian.pdf",
    description: "Consent form - Indian patient (Rajesh Patel)",
    html: wrapPage(`
      ${LOGOS.bjcHealth}
      <h3 style="text-align:center;margin:5px 0 25px;">Patient Information and Consent Form</h3>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-weight: bold; font-size: 13px;">Mr</p></div>
      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">First Name *</p><p style="margin: 2px 0;">Rajesh</p></div>
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">Last Name *</p><p style="margin: 2px 0;">Patel</p></div>
      </div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Date of Birth *</p><p style="margin: 2px 0;">19/07/1972</p></div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Mobile Phone *</p><p style="margin: 2px 0;">0400 888 999</p></div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Address *</p><p style="margin: 2px 0;">3/22 Harris Street</p></div>
      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">City / Suburb *</p><p style="margin: 2px 0;">Harris Park</p></div>
        <div><p style="margin: 2px 0; font-size: 12px; color: #666;">Postcode *</p><p style="margin: 2px 0;">2150</p></div>
      </div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Card No. *</p><p style="margin: 2px 0;">4321098765</p></div>
      <div style="margin-bottom: 15px;"><p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Ref Number *</p><p style="margin: 2px 0;">1</p></div>
      <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px;">
        <p style="font-size: 12px;">Signature: _____________________ Date: 10/02/2026</p>
      </div>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.multicultural,
    filename: "test_multicultural_greek.pdf",
    description: "GP referral - Greek patient (Eleni Papadopoulos)",
    html: wrapPage(`
      <p>Dear Dr Williams,</p>
      <p>re. Ms Eleni Papadopoulos</p>
      <p>DOB: 30/06/1988</p>
      <p>Medicare No: 5678901234</p>
      <p>Mobile: 0477 888 999</p>
      <p>99 Haldon Street</p>
      <p>Lakemba. 2195</p>
      <p>Thank you for seeing this 37-year-old woman regarding her recurrent urinary tract infections. She has had 4 culture-positive UTIs in the past 6 months despite adequate hydration and post-coital voiding. She is otherwise well with no significant comorbidities. She is not currently taking any regular medications.</p>
      <p>Yours sincerely,<br/>Dr N. Georgiou<br/>234567KL</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.multicultural,
    filename: "test_multicultural_pacific_islander.pdf",
    description: "Specialist referral - Tongan patient (Sione Tupou)",
    html: wrapPage(`
      <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 18px;">
        <h2 style="margin: 0;">Liverpool Orthopaedic Clinic</h2>
        <p style="margin: 3px 0; font-size: 12px;">Level 2, 20 Speed Street, Liverpool NSW 2170</p>
        <p style="margin: 3px 0; font-size: 12px;">Provider No: 678901GH</p>
      </div>
      <p>12 February 2026</p>
      <p>Dear Dr Patel,</p>
      <p>RE: Sione TUPOU - DOB: 03/08/1990</p>
      <p>44 Macquarie Street, LIVERPOOL, NSW, 2170</p>
      <p>Mobile: 0488 999 000</p>
      <p>Thank you for referring this 35-year-old man for assessment of his right shoulder. He injured his shoulder playing rugby league approximately 4 weeks ago. He reports persistent pain and reduced range of motion, particularly with overhead activities.</p>
      <p>On examination, he has reduced active forward flexion to 130 degrees. External rotation strength is reduced compared to the left. Impingement tests are positive.</p>
      <p>MRI demonstrates a partial-thickness tear of his supraspinatus tendon. I have recommended a course of physiotherapy and will review him in 6 weeks.</p>
      <p>Yours sincerely,</p>
      <p><strong>Dr Tony Matafeo</strong><br/>MBBS, FRACS (Orth)<br/>Provider No: 678901GH</p>
    `),
  },
  {
    dir: DIRS.multicultural,
    filename: "test_multicultural_korean.pdf",
    description: "GP referral - Korean patient (Jiyeon Kim)",
    html: wrapPage(`
      <p>Dear Dr Anderson,</p>
      <p>re. Miss Jiyeon Kim</p>
      <p>DOB: 15/04/1996</p>
      <p>Medicare No: 3210987654</p>
      <p>Mobile: 0411 222 333</p>
      <p>Unit 15, 88 Walker Street</p>
      <p>North Sydney. 2060</p>
      <p>Thank you for seeing this 29-year-old woman regarding her persistent allergic rhinitis. She reports year-round nasal congestion, sneezing, and watery eyes. She has tried over-the-counter antihistamines with limited relief. She has a strong family history of atopy.</p>
      <p>I would appreciate your assessment regarding skin prick testing and immunotherapy options.</p>
      <p>Yours sincerely,<br/>Dr H. Park<br/>456789MN</p>
    `, "Arial, sans-serif"),
  },
  {
    dir: DIRS.multicultural,
    filename: "test_multicultural_lebanese.pdf",
    description: "GP referral - Lebanese patient with hyphenated name (Layla El-Masri)",
    html: wrapPage(`
      <p>Dear Dr Chen,</p>
      <p>re. Mrs Layla El-Masri</p>
      <p>DOB: 11/09/1983</p>
      <p>Medicare No: 7654321098</p>
      <p>Mobile: 0455 333 444</p>
      <p>27 Punchbowl Road</p>
      <p>Punchbowl. 2196</p>
      <p>Thank you for seeing this 42-year-old woman regarding her gestational diabetes in her current pregnancy. She is currently 28 weeks gestation. Her oral glucose tolerance test showed a fasting glucose of 5.8 mmol/L and a 2-hour result of 9.1 mmol/L. She has a BMI of 32 and a family history of Type 2 diabetes.</p>
      <p>Kind regards,<br/>Dr A. Khalil<br/>890123PQ</p>
    `, "Arial, sans-serif"),
  },
];

// =============================================================================
// Generate all PDFs
// =============================================================================

const allPDFs: TestPDF[] = [
  ...specialistReferrals,
  ...gpReferrals,
  ...consentForms,
  ...edgeCasesMinimal,
  ...edgeCasesStates,
  ...edgeCasesSkewed,
  ...edgeCasesGrainy,
  ...edgeCasesMulticultural,
];

async function generatePDFs() {
  console.log(`Generating ${allPDFs.length} test PDFs into nested directories...`);
  console.log();

  const browser = await puppeteer.launch({ headless: true });

  let category = "";
  for (const pdf of allPDFs) {
    // Print category header
    const dir = pdf.dir.split("/").slice(-2).join("/");
    if (dir !== category) {
      category = dir;
      console.log(`\n  [${category}]`);
    }

    const page = await browser.newPage();
    await page.setContent(pdf.html, { waitUntil: "networkidle0" });

    const outputPath = join(pdf.dir, pdf.filename);
    await page.pdf({
      path: outputPath,
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      printBackground: true,
    });

    console.log(`    ✓ ${pdf.filename} - ${pdf.description}`);
    await page.close();
  }

  await browser.close();
  console.log(`\nDone! ${allPDFs.length} PDFs generated across ${Object.keys(DIRS).length} directories.`);
}

generatePDFs().catch(console.error);
