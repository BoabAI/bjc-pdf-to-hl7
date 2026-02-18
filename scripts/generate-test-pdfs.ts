/**
 * Generate realistic test PDFs for all document types and edge cases.
 * Uses Puppeteer to create PDFs with extractable text content.
 *
 * Usage: bun run scripts/generate-test-pdfs.ts
 */

import puppeteer from "puppeteer";
import { mkdirSync } from "fs";
import { join } from "path";

const OUTPUT_DIR = join(import.meta.dir, "../docs/input PDF");

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

interface TestPDF {
  filename: string;
  html: string;
  description: string;
}

// =============================================================================
// Specialist Referral Letters
// =============================================================================

const specialistReferral: TestPDF = {
  filename: "test_specialist_referral.pdf",
  description: "Standard specialist referral (NeuroSpine format)",
  html: `
    <div style="font-family: Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="margin: 0;">NeuroSpine Specialist Clinic</h2>
        <p style="margin: 5px 0; font-size: 13px;">Level 3, 100 Macquarie Street, Sydney NSW 2000</p>
        <p style="margin: 5px 0; font-size: 13px;">Ph: (02) 9876 5432 | Fax: (02) 9876 5433</p>
        <p style="margin: 5px 0; font-size: 13px;">Provider No: 457833CF</p>
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
      <p><strong>Dr Sarah Chen</strong><br/>
      MBBS, FRACS<br/>
      Neurosurgeon<br/>
      Provider No: 457833CF</p>
    </div>
  `,
};

const specialistReferralReverseName: TestPDF = {
  filename: "test_specialist_referral_reverse_name.pdf",
  description: "Specialist referral with LASTNAME, Firstname format",
  html: `
    <div style="font-family: Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="margin: 0;">Sydney Orthopaedic Associates</h2>
        <p style="margin: 5px 0; font-size: 13px;">Suite 5, 200 George Street, Sydney NSW 2000</p>
        <p style="margin: 5px 0; font-size: 13px;">Provider No: 389201AB</p>
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
      <p><strong>Dr James Morton</strong><br/>
      MBBS, FRACS (Orth)<br/>
      Provider No: 389201AB</p>
    </div>
  `,
};

// =============================================================================
// GP / Best Practice Referral Letters
// =============================================================================

const gpReferral: TestPDF = {
  filename: "test_gp_referral.pdf",
  description: "Standard GP/Best Practice referral with full patient details",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <div style="border-bottom: 1px solid #999; padding-bottom: 10px; margin-bottom: 20px;">
        <h3 style="margin: 0;">Parramatta Family Medical Centre</h3>
        <p style="margin: 3px 0; font-size: 12px;">45 Church Street, Parramatta NSW 2150</p>
        <p style="margin: 3px 0; font-size: 12px;">Phone: (02) 9635 1234 | Fax: (02) 9635 1235</p>
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
      <p><strong>Dr Helen Park</strong><br/>
      MBBS, FRACGP<br/>
      567612EL</p>
    </div>
  `,
};

const gpReferralMale: TestPDF = {
  filename: "test_gp_referral_male.pdf",
  description: "GP referral for male patient with Mr title",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <div style="border-bottom: 1px solid #999; padding-bottom: 10px; margin-bottom: 20px;">
        <h3 style="margin: 0;">Bondi Junction Medical Practice</h3>
        <p style="margin: 3px 0; font-size: 12px;">Level 1, 500 Oxford Street, Bondi Junction NSW 2022</p>
        <p style="margin: 3px 0; font-size: 12px;">Phone: (02) 9387 6543</p>
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
      <p><strong>Dr Lisa Huang</strong><br/>
      MBBS, FRACGP<br/>
      234567BT</p>
    </div>
  `,
};

const gpReferralMiss: TestPDF = {
  filename: "test_gp_referral_miss.pdf",
  description: "GP referral for young female patient with Miss title",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <div style="border-bottom: 1px solid #999; padding-bottom: 10px; margin-bottom: 20px;">
        <h3 style="margin: 0;">Melbourne City Medical</h3>
        <p style="margin: 3px 0; font-size: 12px;">300 Collins Street, Melbourne VIC 3000</p>
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
      <p><strong>Dr Andrew Walsh</strong><br/>
      MBBS, FRACGP<br/>
      345678CK</p>
    </div>
  `,
};

// =============================================================================
// Consent Forms
// =============================================================================

const consentForm: TestPDF = {
  filename: "test_consent_form.pdf",
  description: "BJC Health consent form with all fields filled",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="margin: 0; color: #4a0080;">BJC Health</h2>
        <h3 style="margin: 5px 0;">Patient Information and Consent Form</h3>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-weight: bold; font-size: 13px;">Mr</p>
      </div>

      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div>
          <p style="margin: 2px 0; font-size: 12px; color: #666;">First Name *</p>
          <p style="margin: 2px 0;">James</p>
        </div>
        <div>
          <p style="margin: 2px 0; font-size: 12px; color: #666;">Last Name *</p>
          <p style="margin: 2px 0;">Patterson</p>
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Date of Birth *</p>
        <p style="margin: 2px 0;">14/06/1978</p>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Mobile Phone *</p>
        <p style="margin: 2px 0;">0412 987 654</p>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Address *</p>
        <p style="margin: 2px 0;">25 Pitt Street</p>
      </div>

      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div>
          <p style="margin: 2px 0; font-size: 12px; color: #666;">City / Suburb *</p>
          <p style="margin: 2px 0;">Redfern</p>
        </div>
        <div>
          <p style="margin: 2px 0; font-size: 12px; color: #666;">Postcode *</p>
          <p style="margin: 2px 0;">2016</p>
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Card No. *</p>
        <p style="margin: 2px 0;">5678901234</p>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Ref Number *</p>
        <p style="margin: 2px 0;">2</p>
      </div>

      <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px;">
        <p style="font-size: 12px;">I consent to the collection and use of my personal and health information as described above.</p>
        <p style="font-size: 12px;">Signature: _____________________ Date: 14/02/2026</p>
      </div>
    </div>
  `,
};

const consentFormFemale: TestPDF = {
  filename: "test_consent_form_female.pdf",
  description: "BJC Health consent form for female patient",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="margin: 0; color: #4a0080;">BJC Health</h2>
        <h3 style="margin: 5px 0;">Patient Information and Consent Form</h3>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-weight: bold; font-size: 13px;">Ms</p>
      </div>

      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div>
          <p style="margin: 2px 0; font-size: 12px; color: #666;">First Name *</p>
          <p style="margin: 2px 0;">Priya</p>
        </div>
        <div>
          <p style="margin: 2px 0; font-size: 12px; color: #666;">Last Name *</p>
          <p style="margin: 2px 0;">Sharma</p>
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Date of Birth *</p>
        <p style="margin: 2px 0;">01/01/2000</p>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Mobile Phone *</p>
        <p style="margin: 2px 0;">0498 765 432</p>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Address *</p>
        <p style="margin: 2px 0;">Unit 12, 88 George Street</p>
      </div>

      <div style="display: flex; gap: 20px; margin-bottom: 15px;">
        <div>
          <p style="margin: 2px 0; font-size: 12px; color: #666;">City / Suburb *</p>
          <p style="margin: 2px 0;">Parramatta</p>
        </div>
        <div>
          <p style="margin: 2px 0; font-size: 12px; color: #666;">Postcode *</p>
          <p style="margin: 2px 0;">2150</p>
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Card No. *</p>
        <p style="margin: 2px 0;">2345678901</p>
      </div>

      <div style="margin-bottom: 15px;">
        <p style="margin: 2px 0; font-size: 12px; color: #666;">Medicare Ref Number *</p>
        <p style="margin: 2px 0;">1</p>
      </div>

      <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px;">
        <p style="font-size: 12px;">I consent to the collection and use of my personal and health information.</p>
        <p style="font-size: 12px;">Signature: _____________________ Date: 01/01/2026</p>
      </div>
    </div>
  `,
};

// =============================================================================
// Edge Cases
// =============================================================================

const edgeCaseMinimalReferral: TestPDF = {
  filename: "test_edge_minimal_referral.pdf",
  description: "Referral with minimal info (no phone, no address)",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>18 February 2026</p>
      <p>Dear Dr Smith,</p>
      <p>RE: Mark DAVIES - DOB: 30/09/1960</p>
      <p>I am referring this patient for further assessment. He has been experiencing chest pain on exertion for the past 2 weeks. His ECG is normal. He has a history of hypertension. I would appreciate your opinion on his cardiac risk.</p>
      <p>Regards,<br/>Dr J. Brown</p>
    </div>
  `,
};

const edgeCaseSpecialCharsName: TestPDF = {
  filename: "test_edge_special_chars.pdf",
  description: "Referral with special characters in name (O'Brien-Smith)",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>Dear Dr Wilson,</p>
      <p>re. Mrs Mary O'Brien-Smith</p>
      <p>DOB: 05/11/1983</p>
      <p>Medicare No: 7890123456</p>
      <p>Mobile: 0467 890 123</p>
      <p>3/45 O'Connell Street</p>
      <p>North Sydney. 2060</p>
      <p>Thank you for seeing this patient regarding her ongoing knee pain. She has been experiencing bilateral knee pain for the past 3 months, worse on the right side. She reports stiffness in the mornings lasting approximately 30 minutes.</p>
      <p>Yours sincerely,<br/>Dr P. Kim<br/>891234DE</p>
    </div>
  `,
};

const edgeCaseSingleDigitDates: TestPDF = {
  filename: "test_edge_single_digit_dates.pdf",
  description: "GP referral with single-digit day and month in DOB",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>Dear Dr Li,</p>
      <p>re. Mr Tom Lee</p>
      <p>DOB: 3/2/1995</p>
      <p>Medicare No: 1234567890</p>
      <p>Mobile: 0411 111 222</p>
      <p>1 Short St</p>
      <p>Surry Hills. 2010</p>
      <p>Thank you for seeing this 30-year-old man regarding his persistent cough lasting 6 weeks. He is a non-smoker with no significant medical history. Chest X-ray is clear.</p>
      <p>Regards,<br/>Dr A. Patel<br/>456789FG</p>
    </div>
  `,
};

const edgeCaseQldPatient: TestPDF = {
  filename: "test_edge_qld_patient.pdf",
  description: "GP referral for Queensland patient (postcode state inference)",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>Dear Dr Johnson,</p>
      <p>re. Ms Lisa Brown</p>
      <p>DOB: 22/08/1988</p>
      <p>Medicare No: 4567890123</p>
      <p>Mobile: 0422 333 444</p>
      <p>15 Queen Street</p>
      <p>Brisbane City. 4000</p>
      <p>Thank you for seeing this 37-year-old woman who presents with anxiety and insomnia over the past 8 weeks. She reports difficulty falling asleep, early morning waking, and persistent worry about her work performance.</p>
      <p>Yours sincerely,<br/>Dr M. Wong<br/>678901HJ</p>
    </div>
  `,
};

const edgeCaseVicPatient: TestPDF = {
  filename: "test_edge_vic_patient.pdf",
  description: "Specialist referral for Victorian patient",
  html: `
    <div style="font-family: Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>10 February 2026</p>
      <p>Dear Dr Patel,</p>
      <p>RE: Anna KOWALSKI - DOB: 17/12/1975</p>
      <p>42 Chapel Street, SOUTH YARRA, VIC, 3141</p>
      <p>Mobile: 0433 555 666</p>
      <p>Thank you for referring this 50-year-old woman. She has been experiencing progressive hearing loss over the past 2 years, worse on the right side. Her audiogram confirms a moderate sensorineural hearing loss bilaterally.</p>
      <p>I have discussed hearing aid options with her and she is keen to proceed.</p>
      <p>Kind regards,<br/><strong>Dr Peter Nguyen</strong><br/>ENT Surgeon<br/>Provider No: 567890CD</p>
    </div>
  `,
};

const edgeCaseWaPatient: TestPDF = {
  filename: "test_edge_wa_patient.pdf",
  description: "GP referral for Western Australian patient",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>Dear Dr Martinez,</p>
      <p>re. Mr Jack Wilson</p>
      <p>DOB: 31/12/1949</p>
      <p>Medicare No: 6543210987</p>
      <p>Mobile: 0444 777 888</p>
      <p>8 Stirling Highway</p>
      <p>Nedlands. 6009</p>
      <p>Thank you for seeing this 76-year-old gentleman regarding his increasing shortness of breath on exertion. His echocardiogram shows moderate aortic stenosis with a peak gradient of 45mmHg. He remains reasonably active but has noticed progressive limitation over the past 6 months.</p>
      <p>Kind regards,<br/>Dr S. Ahmed<br/>789012KL</p>
    </div>
  `,
};

const edgeCaseNoMedicare: TestPDF = {
  filename: "test_edge_no_medicare.pdf",
  description: "GP referral without Medicare number",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>Dear Dr Taylor,</p>
      <p>re. Ms Nina Petrova</p>
      <p>DOB: 19/04/1992</p>
      <p>Mobile: 0477 123 456</p>
      <p>55 Oxford Street</p>
      <p>Darlinghurst. 2010</p>
      <p>Thank you for seeing this patient, a recent arrival to Australia who does not yet have a Medicare card. She presents with a 2-week history of right-sided abdominal pain.</p>
      <p>Yours sincerely,<br/>Dr R. Clark<br/>345678MN</p>
    </div>
  `,
};

const edgeCaseEmptyPdf: TestPDF = {
  filename: "test_edge_empty.pdf",
  description: "PDF with no meaningful text content",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>&nbsp;</p>
    </div>
  `,
};

const edgeCaseLongNames: TestPDF = {
  filename: "test_edge_long_names.pdf",
  description: "GP referral with very long names",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>Dear Dr Wolfeschlegelsteinhausenbergerdorff,</p>
      <p>re. Mr Bartholomew Wolfeschlegelsteinhausenbergerdorff</p>
      <p>DOB: 01/06/1980</p>
      <p>Medicare No: 9876543210</p>
      <p>Mobile: 0499 888 777</p>
      <p>123 Very Long Street Name Boulevard</p>
      <p>Woolloomooloo. 2011</p>
      <p>Thank you for seeing this patient with his unusually long name regarding a routine health check.</p>
      <p>Regards,<br/>Dr Z. Short<br/>901234PQ</p>
    </div>
  `,
};

const edgeCaseDearElaine: TestPDF = {
  filename: "test_edge_dear_name.pdf",
  description: "Referral addressed to first name only (Dear Elaine,) - should still detect as referral",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>Dear Elaine,</p>
      <p>re. Mr Peter Zhang</p>
      <p>DOB: 11/03/1970</p>
      <p>Medicare No: 1111222233</p>
      <p>Mobile: 0400 111 222</p>
      <p>9 Circular Quay</p>
      <p>The Rocks. 2000</p>
      <p>Thank you for seeing this 55-year-old man regarding his elevated liver enzymes. His ALT is 95 U/L and his GGT is 120 U/L. He reports moderate alcohol consumption. Hepatitis serology is negative. Ultrasound shows fatty liver changes.</p>
      <p>Kind regards,<br/>Dr B. Chen<br/>567890RS</p>
    </div>
  `,
};

const edgeCaseSaPatient: TestPDF = {
  filename: "test_edge_sa_patient.pdf",
  description: "Specialist referral for South Australian patient",
  html: `
    <div style="font-family: Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>1 February 2026</p>
      <p>Dear Dr Green,</p>
      <p>RE: Sophie TAYLOR - DOB: 25/07/1998</p>
      <p>33 Rundle Mall, ADELAIDE, SA, 5000</p>
      <p>Ph: 0455 666 777</p>
      <p>Thank you for referring this young woman for dermatological assessment. She presents with multiple atypical naevi on her back and upper limbs. She has a strong family history of melanoma (mother and maternal aunt). I have performed dermoscopy and recommend excision biopsy of two suspicious lesions.</p>
      <p>I will arrange her surgery within the next 2 weeks and keep you informed of the histopathology results.</p>
      <p>Yours sincerely,<br/><strong>Dr Karen White</strong><br/>Dermatologist<br/>Provider No: 234567UV</p>
    </div>
  `,
};

const edgeCaseTasPatient: TestPDF = {
  filename: "test_edge_tas_patient.pdf",
  description: "GP referral for Tasmanian patient",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>Dear Dr Morrison,</p>
      <p>re. Mrs Helen Campbell</p>
      <p>DOB: 09/10/1965</p>
      <p>Medicare No: 7654321098</p>
      <p>Mobile: 0466 999 000</p>
      <p>14 Liverpool Street</p>
      <p>Hobart. 7000</p>
      <p>Thank you for seeing this 60-year-old woman regarding her hypothyroidism. Her TSH has been difficult to control despite dose adjustments of thyroxine. Current TSH is 8.5 mIU/L on Eltroxin 100mcg daily.</p>
      <p>Yours sincerely,<br/>Dr T. Burns<br/>456789WX</p>
    </div>
  `,
};

const edgeCaseNtPatient: TestPDF = {
  filename: "test_edge_nt_patient.pdf",
  description: "GP referral for Northern Territory patient",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
      <p>Dear Dr Robinson,</p>
      <p>re. Mr Daniel Cooper</p>
      <p>DOB: 14/02/1982</p>
      <p>Medicare No: 0123456789</p>
      <p>Mobile: 0488 111 333</p>
      <p>27 Mitchell Street</p>
      <p>Darwin. 0800</p>
      <p>Thank you for seeing this 43-year-old man regarding recurrent tropical infections. He has had three episodes of cellulitis in the past year, each requiring intravenous antibiotics.</p>
      <p>Yours sincerely,<br/>Dr K. Lawson<br/>678901YZ</p>
    </div>
  `,
};

// =============================================================================
// Generate all PDFs
// =============================================================================

const allPDFs: TestPDF[] = [
  specialistReferral,
  specialistReferralReverseName,
  gpReferral,
  gpReferralMale,
  gpReferralMiss,
  consentForm,
  consentFormFemale,
  edgeCaseMinimalReferral,
  edgeCaseSpecialCharsName,
  edgeCaseSingleDigitDates,
  edgeCaseQldPatient,
  edgeCaseVicPatient,
  edgeCaseWaPatient,
  edgeCaseNoMedicare,
  edgeCaseEmptyPdf,
  edgeCaseLongNames,
  edgeCaseDearElaine,
  edgeCaseSaPatient,
  edgeCaseTasPatient,
  edgeCaseNtPatient,
];

async function generatePDFs() {
  console.log(`Generating ${allPDFs.length} test PDFs...`);

  const browser = await puppeteer.launch({ headless: true });

  for (const pdf of allPDFs) {
    const page = await browser.newPage();
    await page.setContent(pdf.html, { waitUntil: "networkidle0" });

    const outputPath = join(OUTPUT_DIR, pdf.filename);
    await page.pdf({
      path: outputPath,
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      printBackground: true,
    });

    console.log(`  ✓ ${pdf.filename} - ${pdf.description}`);
    await page.close();
  }

  await browser.close();
  console.log(`\nDone! ${allPDFs.length} PDFs generated in: ${OUTPUT_DIR}`);
}

generatePDFs().catch(console.error);
