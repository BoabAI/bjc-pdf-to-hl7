# Australian Medical Data Compliance Research Summary

_Generated: 2026-03-20 | Sources: 40+ | Confidence: High (primary legislation and official guidance reviewed)_

## Executive Summary

<key-findings>

This research covers Australian privacy, health data, and compliance requirements relevant to a **PDF-to-HL7 document conversion tool** that:
- Accepts PDF uploads of patient medical documents (consent forms, referral letters, GP referrals)
- Uses AWS Bedrock (Claude AI) in ap-southeast-2 (Sydney) to extract patient data
- Converts extracted data to HL7 v2.4 format for Genie clinical software import
- Does NOT persistently store patient data -- processes in memory and returns output

**Key compliance findings:**

1. **The Privacy Act 1988 applies** to this tool regardless of business turnover, because it handles health information on behalf of health service providers.
2. **Health information is "sensitive information"** under the Act, attracting the highest level of privacy protection. Consent requirements are strict.
3. **Data sovereignty is satisfied** by using AWS ap-southeast-2 (Sydney) with Bedrock IRAP-assessed at PROTECTED level -- but APP 8 (cross-border disclosure) must still be considered if any data could transit overseas.
4. **Even transient processing counts** -- the Privacy Act's definition of "holds" includes having possession or control of personal information, even temporarily. The APPs apply during the processing window.
5. **The Notifiable Data Breaches (NDB) scheme applies** -- any eligible data breach involving health information must be reported to the OAIC within 30 days.
6. **A privacy policy (APP 1) is mandatory** and must describe what information is collected, how it is used, and whether it may be disclosed overseas.
7. **New statutory tort for serious invasion of privacy** (effective 10 June 2025) means individuals can now sue for privacy breaches -- raising the stakes for any health data handling.
8. **HL7/ADRM compliance is a technical standard**, not a legislative requirement, but conformance demonstrates due diligence in health data interoperability.

</key-findings>

---

## 1. Legislative Framework

### 1.1 Privacy Act 1988 (Cth) -- Primary Federal Legislation

The Privacy Act 1988 is the principal federal legislation governing the handling of personal information in Australia. It is administered by the Office of the Australian Information Commissioner (OAIC).

**Applicability to this tool:**

- The Act applies to all private sector organisations with annual turnover exceeding AU$3 million.
- **Critical exception**: Private sector health service providers must comply regardless of turnover. The small business exemption does NOT apply to any organisation that provides a health service and holds health information.
- A software tool that processes health information on behalf of health service providers is likely captured as either a health service provider itself or as an entity that "holds" health information (even transiently).

**Key concept -- "holds" personal information (s 6(1)):**

An entity "holds" personal information if it has possession or control of a record containing personal information. An entity that outsources storage to a third party but retains the right to deal with the information still "holds" it. This means even transient, in-memory processing of patient data during the PDF-to-HL7 conversion brings the tool within scope of the APPs for the duration of that processing.

**2024 Amendments (Privacy and Other Legislation Amendment Act 2024):**

- **Statutory tort for serious invasion of privacy** -- effective 10 June 2025. Individuals can sue for damages.
- **Automated decision-making transparency** -- effective 10 December 2026. If computer programs use personal information for significant decisions, the privacy policy must disclose this. Relevant if AI extraction results influence clinical decisions.
- **Children's Online Privacy Code** -- to be developed by December 2026.

### 1.2 Australian Privacy Principles (APPs) -- Detailed Requirements

The 13 APPs form the backbone of privacy obligations. The following are most relevant to this tool:

#### APP 1 -- Open and Transparent Management

- Must have a clearly expressed, up-to-date privacy policy.
- The policy **must** contain:
  - Kinds of personal information collected and held
  - How the entity collects and holds personal information
  - Purposes for collection, holding, use, and disclosure
  - How individuals can access and correct their information
  - How to complain about a privacy breach and how complaints are handled
  - Whether information is likely to be disclosed to overseas recipients
  - If overseas disclosure is likely, which countries
- The policy must be freely available (e.g., on the website).
- **From December 2026**: Must also disclose use of automated decision-making systems.

#### APP 3 -- Collection of Solicited Personal Information

- Health information is **sensitive information** and may only be collected with **consent**, unless an exception applies.
- Even with consent, collection must be **reasonably necessary** for the entity's functions or activities.
- Exceptions allowing collection without consent include:
  - Required or authorised by Australian law
  - A "permitted health situation" exists (e.g., necessary to provide a health service)
  - Collection is in accordance with rules established by competent health or medical bodies

**For this tool**: The practice uploading the PDF has the patient relationship and (presumably) has obtained consent for the health service. The tool acts as a processor on behalf of the practice. The practice's consent framework should cover the use of this conversion tool, but the tool's privacy policy should make this clear.

#### APP 5 -- Notification of Collection

- Must give notice at or before the time of collection about:
  - Identity and contact details of the entity
  - The fact of collection and circumstances
  - Whether collection is required by law
  - Purposes of collection
  - Consequences if information is not collected
  - Usual disclosures of this kind of information
  - Access and correction rights
  - Overseas disclosure details

**For this tool**: A clear collection notice or statement on the upload page satisfies this requirement.

#### APP 6 -- Use or Disclosure of Personal Information

- Health information collected for a primary purpose may be used for that purpose.
- Secondary use requires consent or a permitted exception.
- "Directly related" secondary purposes within reasonable expectations do not require additional consent.

**For this tool**: The primary purpose is converting the PDF to HL7 format. Using Bedrock AI to extract data from the PDF is directly related to this primary purpose.

#### APP 8 -- Cross-Border Disclosure

- Before disclosing personal information to an overseas recipient, the entity must take reasonable steps to ensure the overseas recipient complies with the APPs.
- The disclosing entity remains **accountable** for the overseas recipient's handling of the information (s 16C).
- Using an overseas cloud provider that can access personal information stored in Australia triggers APP 8.

**For this tool**:
- AWS Bedrock in ap-southeast-2 (Sydney) processes data within Australia.
- AWS's own documentation confirms that Bedrock does not store or log prompts and completions, and does not use customer data to train models.
- However, if AWS infrastructure or support staff outside Australia could theoretically access the data, APP 8 obligations are triggered.
- **Mitigation**: AWS's IRAP PROTECTED assessment, contractual commitments (AWS Customer Agreement), and the use of an Australian region provide reasonable steps under APP 8.

#### APP 11 -- Security of Personal Information

- Must take **reasonable steps** to protect personal information from misuse, interference, loss, unauthorised access, modification, or disclosure.
- "Reasonable steps" factors include:
  - Nature and sensitivity of the information (health information = highest sensitivity)
  - Amount of information held
  - Possible adverse consequences of a breach
  - Practical implications of security measures (cost, time)
  - Entity's size and resources
- Must also take reasonable steps to **destroy or de-identify** personal information no longer needed.

**For this tool**:
- In-memory-only processing with no persistent storage is a strong privacy posture.
- HTTPS/TLS for data in transit is essential.
- Password authentication limits access to authorised users.
- The tool should ensure PDF data and extracted patient information are not logged, cached, or retained after the conversion response is returned.

#### APP 12 -- Access to Personal Information

- Individuals have the right to access their personal information held by the entity.

**For this tool**: Since data is not persistently stored, access requests can be responded to by explaining that no data is retained after processing. This should be documented in the privacy policy.

#### APP 13 -- Correction of Personal Information

- Entities must take reasonable steps to correct personal information they hold if it is inaccurate, incomplete, or not up to date.

**For this tool**: Similar to APP 12 -- transient processing means correction is not applicable post-processing. The user (practice staff) can correct data in the HL7 output before importing to Genie.

### 1.3 Health Records and Information Privacy Act 2002 (NSW)

The HRIP Act applies to NSW public sector agencies and health service providers handling health information of NSW residents. It establishes 15 Health Privacy Principles (HPPs) that closely mirror the federal APPs but are specific to health information.

**Relevance**: If the tool is used by NSW-based health practices (as BJC Health appears to be), the HRIP Act adds a layer of state-level obligations. Key differences from federal APPs:

- HPP 5 (Retention): Health information must be retained for specific periods (varies by record type; generally at least 7 years for adults, until age 25 for minors).
- HPP 10 (Limits on use): Tighter restrictions on secondary use of health information.
- HPP 11 (Limits on disclosure): Additional requirements for disclosure within NSW.

**For this tool**: The HRIP Act primarily applies to the health practice holding the records, not necessarily to a transient processing tool. However, awareness of the framework is important for compliance documentation.

### 1.4 State and Territory Health Privacy Legislation

| Jurisdiction | Legislation | Coverage |
|---|---|---|
| **NSW** | Health Records and Information Privacy Act 2002 | Public and private sector health information |
| **Victoria** | Health Records Act 2001 | Public and private sector health information |
| **Queensland** | Information Privacy Act 2009 | Public sector only (private sector covered by federal Act) |
| **ACT** | Health Records (Privacy and Access) Act 1997 | Public and private sector health information |
| **SA, WA, TAS, NT** | No specific health privacy legislation | Federal Privacy Act applies to private sector |

**For this tool**: Federal Privacy Act compliance covers the base. If marketing to NSW or Victorian practices specifically, reference the relevant state legislation in the privacy policy.

### 1.5 My Health Records Act 2012

The My Health Records Act governs the national My Health Record system (the opt-out electronic health record system for Australian citizens).

**Relevance to this tool**: **Low**. This tool does not interact with the My Health Record system. It converts PDFs to HL7 for local Genie import, not for upload to the national system. However:

- If HL7 messages generated by this tool are subsequently uploaded to My Health Records by the practice's systems, the practice (not this tool) bears the My Health Records Act obligations.
- Data breach provisions under the My Health Records Act are separate from the NDB scheme and apply to registered healthcare provider organisations.

### 1.6 Health Practitioner Regulation National Law (AHPRA)

AHPRA regulates registered health practitioners (doctors, nurses, etc.) and has published guidance on:

- **AI in healthcare**: Health practitioners are personally responsible for ensuring AI tools are appropriate and meet data governance, privacy, and regulatory standards.
- **Data security**: Practitioners must ensure their chosen technology solutions meet applicable legal requirements for security and privacy.

**For this tool**: AHPRA's guidance places the compliance burden on the practitioner using the tool. However, providing clear compliance documentation helps practitioners satisfy their AHPRA obligations when choosing to use this software.

---

## 2. What Constitutes "Health Information"

### 2.1 Definition (Privacy Act s 6FA)

"Health information" means personal information that is:

1. **Information or an opinion** about the health, including an illness, disability, or injury, of an individual
2. **Information or an opinion** about a health service provided, or to be provided, to an individual
3. **Other personal information** collected to provide, or in providing, a health service to an individual
4. **Other personal information** about an individual collected in connection with the donation of body parts, organs, or body substances
5. **Genetic information** about an individual in a form that is, or could be, predictive of health

### 2.2 Application to This Tool

All data extracted from the PDFs processed by this tool constitutes health information:

| Data Field | Classification |
|---|---|
| Patient name, DOB, sex | Personal information collected to provide a health service (category 3) |
| Medicare number | Personal information collected to provide a health service (category 3) |
| Address, phone | Personal information collected to provide a health service (category 3) |
| Referral letter content | Information about health services provided/to be provided (category 2) |
| Consent form content | Information about health services to be provided (category 2) |
| Clinical details in referrals | Information/opinion about health (category 1) |
| Diagnoses, conditions | Information/opinion about health (category 1) |

**Key point**: Even "administrative" patient data (name, DOB, address) becomes health information when collected in the context of providing a health service. The entire PDF content and all extracted data fields are health information.

### 2.3 "Sensitive Information" Classification

Health information is a subset of "sensitive information" under s 6(1) of the Privacy Act. Sensitive information receives the **highest level of privacy protection**:

- Collection requires **consent** (unless an exception applies)
- Stricter limits on use and disclosure
- Higher standard for "reasonable steps" to protect security

---

## 3. Consent Requirements

### 3.1 Who Needs Consent

The **health practice** using this tool is the primary entity responsible for obtaining patient consent. The practice collects the patient's health information (the PDF documents) and uses this tool to process it.

### 3.2 Types of Consent

- **Express consent**: Given explicitly, orally or in writing, by an affirmative, unambiguous act.
- **Implied consent**: Inferred from the circumstances and conduct of the patient.

### 3.3 Consent Framework for This Tool

For a document conversion tool used by a health practice:

1. **The practice** should have general consent from the patient for handling their health information as part of providing health services (standard practice intake forms cover this).
2. **Use of the conversion tool** is a directly related purpose to the primary purpose of managing the patient's health records -- within reasonable expectations of the patient.
3. **The practice's privacy policy** should mention use of third-party tools for administrative processing of health information.
4. **The tool's own privacy policy** should make clear it acts as a processor on behalf of the practice.

### 3.4 What This Tool Should Document

The tool does NOT need to obtain separate patient consent (the practice holds this relationship), but it should:

- Clearly state in its privacy policy that it processes health information on behalf of health practices
- Describe what data is processed and for what purpose
- Confirm that data is not retained after processing
- Describe security measures in place
- Identify any overseas data processing (even if none)

---

## 4. Data Sovereignty and Cloud Hosting

### 4.1 Current Requirements

Australia does not have a single, comprehensive data localisation law for health data in the private sector. However, several frameworks create strong expectations:

- **APP 8** requires reasonable steps before cross-border disclosure.
- **Australian Digital Health Agency (ADHA) guidance** recommends health data remain within Australia.
- **Government Hosting Certification Framework** (for government agencies) requires certified hosting for sensitive data -- while not directly applicable to private sector tools, it sets industry expectations.
- **Practical consensus**: The Australian health sector strongly expects patient data to remain within Australian borders.

### 4.2 AWS ap-southeast-2 (Sydney) Compliance

| Requirement | Status |
|---|---|
| **Data residency in Australia** | Satisfied -- ap-southeast-2 is in Sydney |
| **IRAP PROTECTED assessment** | AWS services including Bedrock are IRAP-assessed at PROTECTED level (as of 2024 H1 report; reaffirmed in 2025 H1) |
| **Encryption in transit** | AWS provides TLS encryption for all Bedrock API calls |
| **Encryption at rest** | AWS encrypts all data at rest; optional customer-managed keys (CMK) available |
| **No data retention by Bedrock** | AWS confirms Bedrock does not store or log prompts/completions, and does not use customer data for model training |
| **ISO 27001 certified** | AWS Sydney region is ISO 27001 certified |
| **SOC 2 Type II** | AWS has current SOC 2 Type II reports available |

### 4.3 Bedrock-Specific Data Protection

From AWS documentation on Amazon Bedrock security and compliance:

- Bedrock does **not** store or log customer prompts and completions
- Bedrock does **not** use customer data to train any AWS models
- Customer data is **not** distributed to third parties
- Data is encrypted in transit and at rest
- Bedrock is in scope for HIPAA, GDPR, SOC, ISO, and IRAP compliance programs
- Bedrock has been IRAP-assessed at PROTECTED level for the Sydney region

### 4.4 Compliance Claims for This Tool

The tool can legitimately claim:

- "All data processing occurs within Australia (AWS Sydney region, ap-southeast-2)"
- "Patient data is processed using AWS Bedrock, which is IRAP-assessed at PROTECTED level"
- "AWS Bedrock does not store, log, or use patient data for model training"
- "Data is encrypted in transit (TLS) and at rest"
- "No patient data is persistently stored by this application"

---

## 5. Notifiable Data Breaches (NDB) Scheme

### 5.1 Overview

Part IIIC of the Privacy Act establishes the NDB scheme. Any entity covered by the Privacy Act must notify affected individuals and the OAIC when a data breach is likely to result in **serious harm** to an individual whose personal information is involved.

### 5.2 What Constitutes an "Eligible Data Breach"

A data breach occurs when personal information held by an entity is:
- Lost in circumstances where unauthorised access is likely
- Subject to unauthorised access
- Subject to unauthorised disclosure

The breach is "eligible" (triggering notification obligations) if a reasonable person would conclude it is **likely to result in serious harm** to any affected individual.

### 5.3 Health Information and Serious Harm

Health information breaches are **more likely** to meet the "serious harm" threshold because:
- Health information is sensitive information
- Unauthorised disclosure of health conditions, treatments, or medications can cause significant harm
- Medicare numbers can be used for identity fraud

### 5.4 Obligations Under the NDB Scheme

1. **Assess** the breach within **30 days** of becoming aware of it
2. **Notify the OAIC** if the breach is eligible
3. **Notify affected individuals** about the breach and recommended steps
4. **Contents of notification**: Description of the breach, types of information involved, recommended steps for individuals

### 5.5 Relevance to This Tool

Even though the tool does not persist data, breaches can still occur:
- Unauthorised access to the application (compromised password)
- Interception of data in transit (TLS vulnerability)
- Server-side vulnerabilities exposing in-memory data
- Logging or caching that inadvertently retains patient data
- AWS infrastructure compromise

**Recommended measures**:
- Maintain a data breach response plan
- Ensure no logging of patient data (including in AWS CloudWatch, application logs, or error reports)
- Implement monitoring for unauthorised access attempts
- Document the transient nature of data processing as a risk-mitigation factor

### 5.6 Health Service Provider Breach Statistics

For context, health service providers were the **top sector** reporting data breaches in Australia (121 notifications in July-December 2024), reinforcing the importance of compliance for health-adjacent tools.

---

## 6. Security Requirements

### 6.1 APP 11 -- Reasonable Steps

The standard is "reasonable steps" -- a context-dependent assessment. For a tool handling health information:

**Technical measures expected:**
- HTTPS/TLS for all data in transit
- Authentication and access controls (password-protected access)
- No persistent storage of patient data
- No logging of patient data content
- Encryption at rest for any temporary data
- Regular security updates and patching
- Secure deployment configuration

**Organisational measures expected:**
- Privacy policy and collection notice
- Data breach response plan
- Staff training on privacy obligations (if applicable)
- Regular review of security measures
- Vendor management (AWS compliance documentation)

### 6.2 OAIC Guide to Securing Personal Information

The OAIC's guide recommends considering:
- **Governance**: Clear accountability for privacy compliance
- **ICT security**: Technical controls appropriate to the risk
- **Access controls**: Limiting access to authorised personnel
- **Third-party management**: Due diligence on service providers
- **Data minimisation**: Collecting and holding only what is necessary
- **Destruction**: Ensuring data is properly destroyed when no longer needed

### 6.3 ADHA Cloud Services Guidance

The Australian Digital Health Agency's "Cloud Services: Considerations for Healthcare Organisations" recommends:
- Understand the risk landscape before selecting a cloud provider
- Ensure appropriate security certifications (ISO, IRAP)
- Establish contractual arrangements covering data protection
- Maintain regular reporting and reviews of cloud service provider security
- Consider the financial model implications of cloud services
- Ensure data backup and recovery capabilities

---

## 7. HL7 Australia / ADRM Compliance

### 7.1 ADRM Standard

The Australian Diagnostics and Referral Messaging standard (HL7AUSD-STD-OO-ADRM-2021.1) is the Australian localisation of HL7 v2.4. It is a **technical interoperability standard**, not legislation. Compliance is not legally mandated but is:

- **Expected** by receiving clinical software (Genie, Best Practice, Medical Director)
- **Required** by messaging intermediaries (Medical Objects, HealthLink)
- **Best practice** for any Australian health data exchange
- **Evidence of due diligence** in health information handling

### 7.2 Key ADRM Requirements Met by This Tool

| Requirement | Status |
|---|---|
| HL7 v2.4 message format | Implemented |
| ORU^R01 message type | Implemented |
| REF^I12 message type | Implemented |
| PV1 segment (mandatory in Australia) | Implemented |
| AUSPDI coding for embedded PDFs | Implemented |
| Base64 encoding in OBX ED datatype | Implemented |
| CR-only segment terminator | Implemented |
| 8859/1 character set | Implemented |
| Medicare number format (AUSHIC/MC) | Implemented |
| Provider number format (AUSHICPR) | Implemented |
| AUS country code in MSH | Implemented |

### 7.3 HL7 Australia and ADHA Strategic Direction

- HL7 Australia published its Strategy 2025-2029, with continued support for v2.4 messaging alongside FHIR adoption.
- The ADHA's National Healthcare Interoperability Plan targets a fully connected health system by 2027, with FHIR as the strategic direction.
- HL7 v2.4 remains the **operational standard** for pathology, radiology, and referral messaging in Australian general practice for the foreseeable future.
- Services Australia is planning FHIR adoption for 2025-26, but this is for government services, not clinical messaging.

---

## 8. Medicare and Provider Number Data Handling

### 8.1 Medicare Numbers

Medicare numbers are personal information and, when collected in the context of a health service, constitute health information. There are no separate legislative requirements for Medicare number handling beyond the Privacy Act, but:

- Medicare numbers should be handled with the same care as other health information
- They should not be logged or retained unnecessarily
- Format: 10-digit card number + optional 1-digit individual reference number (IRN)
- In HL7: Represented as `number^^^AUSHIC^MC` in PID-3

### 8.2 Medicare Provider Numbers

Provider numbers identify health practitioners for Medicare purposes. They are less sensitive than patient Medicare numbers but should still be handled appropriately:

- Format: 6 digits + 1 letter + 1 check character (e.g., `2345678P`)
- In HL7: Represented with `AUSHICPR` assigning authority
- Used in PV1-9 for document routing in Genie

### 8.3 Healthcare Identifiers

The Healthcare Identifiers Act 2010 establishes:
- **IHI** (Individual Healthcare Identifier) -- for patients
- **HPI-I** (Healthcare Provider Identifier - Individual) -- for practitioners
- **HPI-O** (Healthcare Provider Identifier - Organisation) -- for organisations

These identifiers have specific handling requirements under the Healthcare Identifiers Act. This tool currently does not handle HPI-I, HPI-O, or IHI, so those requirements do not apply.

---

## 9. AI-Specific Considerations

### 9.1 AHPRA Guidance on AI in Healthcare

AHPRA's guidance (published 2024-2025) states:
- Health practitioners are **personally responsible** for ensuring AI tools are appropriate
- AI tools must satisfy **data governance, privacy, and regulatory standards**
- Practitioners must understand the limitations of AI tools they use
- AI outputs should be reviewed by the practitioner before clinical use

### 9.2 OAIC Regulatory Priorities 2025-26

The OAIC has flagged AI as a priority area, focusing on:
- Practices that erode privacy rights in the application of AI
- Rebalancing power and information asymmetries created by AI
- Transparency about AI use in handling personal information

### 9.3 Automated Decision-Making (from December 2026)

The 2024 Privacy Act amendments require transparency about automated decisions:
- If the tool's AI extraction results are used to make decisions that "could reasonably be expected to significantly affect the rights or interests of an individual," additional disclosure is required.
- For this tool: The extraction of patient data from PDFs for HL7 generation could be considered to affect patient interests (e.g., incorrect data extraction leading to wrong patient matching in Genie). The privacy policy should disclose the use of AI for data extraction.

### 9.4 Compliance Claims for AI Processing

The tool can legitimately state:
- "AI (AWS Bedrock Claude) is used to extract structured patient data from PDF documents"
- "AI extraction results are presented to the user for review before HL7 generation"
- "AWS Bedrock does not retain, log, or learn from patient data processed through this tool"
- "All AI processing occurs within Australia (AWS Sydney region)"

---

## 10. Compliance Posture for a Document Conversion Tool

### 10.1 What This Tool IS and IS NOT

**This tool IS:**
- A document format converter (PDF to HL7)
- A transient data processor (no persistent storage)
- A tool used by health practices to streamline administrative workflows
- An application that processes health information as defined under the Privacy Act

**This tool IS NOT:**
- An Electronic Health Record (EHR) or Electronic Medical Record (EMR)
- A My Health Record system participant
- A health service provider (it does not provide health services directly to patients)
- A repository of patient health information
- A clinical decision-making system

### 10.2 Appropriate Compliance Claims

Based on the research, the following compliance statements are appropriate:

**Legitimate claims:**

1. "Compliant with the Australian Privacy Act 1988 and Australian Privacy Principles"
2. "Health information is processed transiently and not persistently stored"
3. "All data processing occurs within Australia using IRAP PROTECTED-assessed AWS infrastructure"
4. "HL7 v2.4 messages are generated in accordance with the Australian ADRM specification"
5. "AWS Bedrock does not store, log, or use patient data for model training"
6. "Data is encrypted in transit (TLS) and at rest"
7. "The application implements access controls to prevent unauthorised use"

**Claims to AVOID (overclaiming):**

1. Do NOT claim "IRAP certified" -- the tool itself is not IRAP-assessed; the underlying AWS infrastructure is
2. Do NOT claim "fully compliant with HRIP Act" unless specifically assessed against NSW HPPs
3. Do NOT claim "certified by the Australian Digital Health Agency"
4. Do NOT claim "compliant with the My Health Records Act" (not relevant)
5. Do NOT claim "HIPAA compliant" (US standard, not relevant to Australian context)

### 10.3 Recommended Compliance Documentation

| Document | Purpose | Status |
|---|---|---|
| **Privacy Policy** | APP 1 requirement; must describe data handling | Required |
| **Collection Notice** | APP 5 requirement; inform users at point of collection | Required |
| **Data Breach Response Plan** | NDB scheme preparedness | Recommended |
| **Security Overview** | APP 11 documentation of reasonable steps | Recommended |
| **Terms of Service** | Define responsibilities between tool and practice | Recommended |
| **Third-Party Processor Agreement** | Contractual privacy protections with practices | Recommended for enterprise |

---

## 11. Practical Implementation Checklist

### 11.1 Must-Have (Legal Requirements)

- [ ] **Privacy Policy** on the website/application covering all APP 1 requirements
- [ ] **Collection Notice** at or before the point of PDF upload
- [ ] **No logging of patient data** -- ensure application logs, error logs, and CloudWatch do not contain patient information
- [ ] **HTTPS/TLS** for all data in transit
- [ ] **Authentication** to prevent unauthorised access
- [ ] **Data destruction** -- ensure all patient data is cleared from memory after processing (no caching, no temp files)
- [ ] **Data Breach Response Plan** documented and ready
- [ ] **Contact details** for privacy inquiries published on the website

### 11.2 Should-Have (Best Practice)

- [ ] **Security assessment** of the application (penetration testing or security review)
- [ ] **AWS security hardening** -- WAF, security groups, least-privilege IAM
- [ ] **Access logging** -- log who accessed the tool and when (without logging the data content)
- [ ] **Terms of Service** establishing the practice's responsibility for consent and the tool's role as processor
- [ ] **Annual privacy impact assessment** review
- [ ] **Incident response testing** -- periodic testing of the breach response plan
- [ ] **ADRM conformance testing** of generated HL7 messages

### 11.3 Nice-to-Have (Demonstrates Maturity)

- [ ] **Privacy Impact Assessment (PIA)** -- formal assessment per OAIC guidance
- [ ] **ISO 27001 alignment** of security controls
- [ ] **SOC 2 Type II** report (for enterprise clients)
- [ ] **OWASP security testing** of the web application
- [ ] **Data Processing Agreement** template for practice clients
- [ ] **Compliance page** on the website summarising the tool's privacy posture

---

## 12. Key Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Patient data logged in application/AWS logs | Medium | High | Audit all logging; ensure no PHI in logs; configure CloudWatch appropriately |
| AI extraction error leads to wrong patient match in Genie | Medium | Medium | Display extracted data for user review before HL7 generation; document AI limitations |
| Unauthorised access via compromised password | Medium | High | Strong password policy; consider MFA; rate limiting; session expiry |
| AWS Bedrock processes data outside Australia | Low | High | Pin to ap-southeast-2; verify Bedrock regional behaviour; document in compliance materials |
| Data breach notification failure | Low | High | Maintain breach response plan; train on NDB obligations; establish OAIC notification process |
| Statutory tort claim for privacy breach | Low | High | Robust privacy practices; clear documentation; professional indemnity insurance |
| State health privacy legislation non-compliance | Low | Medium | Document compliance with federal APPs; note state-specific requirements for NSW/VIC |

---

## References

### Primary Legislation
- [Privacy Act 1988 (Cth)](https://www.legislation.gov.au/C2004A03712/latest)
- [Health Records and Information Privacy Act 2002 (NSW)](https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-2002-071)
- [My Health Records Act 2012 (Cth)](https://www.legislation.gov.au/Details/C2017C00313)
- [Privacy Act 1988 - Section 6FA - Meaning of health information](http://classic.austlii.edu.au/au/legis/cth/consol_act/pa1988108/s6fa.html)

### OAIC Guidance
- [Guide to Health Privacy (May 2025)](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/health-service-providers/guide-to-health-privacy)
- [Guide to Health Privacy - Full PDF (Collated May 2025)](https://www.oaic.gov.au/__data/assets/pdf_file/0020/251183/Guide-to-Health-Privacy-Collated-May-2025.pdf)
- [Chapter 1: APP 1 - Open and Transparent Management](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-1-app-1-open-and-transparent-management-of-personal-information)
- [Chapter 3: APP 3 - Collection of Solicited Personal Information](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-3-app-3-collection-of-solicited-personal-information)
- [Chapter 8: APP 8 - Cross-border Disclosure](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information)
- [Chapter 11: APP 11 - Security of Personal Information](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)
- [Guide to Securing Personal Information](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/guide-to-securing-personal-information)
- [Notifiable Data Breaches Scheme](https://www.oaic.gov.au/privacy/notifiable-data-breaches/about-the-notifiable-data-breaches-scheme)
- [OAIC 2025-26 Regulatory Action Priorities](https://www.oaic.gov.au/news/media-centre/oaic-releases-regulatory-action-priorities-for-2025-26)
- [Statutory Tort for Serious Invasions of Privacy](https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/statutory-tort-for-serious-invasions-of-privacy)

### AWS Compliance
- [AWS Australia Data Privacy](https://aws.amazon.com/compliance/australia-data-privacy/)
- [AWS IRAP Compliance](https://aws.amazon.com/compliance/irap/)
- [AWS IRAP Services in Scope](https://aws.amazon.com/compliance/services-in-scope/IRAP/)
- [Amazon Bedrock Security and Compliance](https://aws.amazon.com/bedrock/security-compliance/)
- [Amazon Bedrock Data Protection](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)
- [2025 H1 IRAP Report Announcement](https://aws.amazon.com/blogs/security/2025-h1-irap-report-is-now-available-on-aws-artifact-for-australian-customers/)

### HL7 Australia / ADRM
- [ADRM 2021 - Introduction](https://confluence.hl7australia.com/display/OOADRM20211/1+Introduction)
- [ADRM 2021 - Observation Reporting](https://confluence.hl7australia.com/display/OOADRM20211/4+Observation+Reporting)
- [HL7 Australia](https://hl7.com.au/)
- [ADHA Digital Health Standards](https://www.digitalhealth.gov.au/standards)
- [ADHA National Healthcare Interoperability Plan](https://www.digitalhealth.gov.au/healthcare-providers/initiatives-and-programs/digital-health-standards)

### Australian Digital Health Agency
- [Cloud Services: Considerations for Healthcare Organisations](https://www.digitalhealth.gov.au/sites/default/files/2020-11/Cloud_services-Considerations_for_healthcare_organisations.pdf)
- [Cyber Security for Healthcare Providers](https://www.digitalhealth.gov.au/healthcare-providers/cyber-security-for-healthcare-providers)
- [Digital Health Implementer Hub](https://implementer.digitalhealth.gov.au/standards/organisation/australian-digital-health-agency-adha)

### Privacy Law Analysis
- [Norton Rose Fulbright - Statutory Tort Analysis](https://www.nortonrosefulbright.com/en/knowledge/publications/87ee5e95/privacy-gets-teeth-australias-new-statutory-tort-and-how-it-might-look-in-practice)
- [Norton Rose Fulbright - Privacy Reform Summary](https://www.nortonrosefulbright.com/en/knowledge/publications/be98b0ff/australian-privacy-alert-parliament-passes-major-and-meaningful-privacy-law-reform)
- [ICLG Data Protection Laws 2025-2026 Australia](https://iclg.com/practice-areas/data-protection-laws-and-regulations/australia)
- [ICLG Digital Health Laws 2025-2026 Australia](https://iclg.com/practice-areas/digital-health-laws-and-regulations/australia)
- [DLA Piper - Data Protection Laws Australia](https://www.dlapiperdataprotection.com/index.html?c=AU)
- [Holding Redlich - National Health Privacy Rules](https://www.holdingredlich.com/new-national-health-privacy-rules-commence)

### AHPRA and AI
- [AHPRA AI Guidance - MinterEllison Analysis](https://www.minterellison.com/articles/ahpra-introduces-ai-guidelines-for-health-practitioners)
- [AHPRA AI Guidance - Avand Health](https://www.avandhealth.com.au/blogs/ahpra-compliance-ai-documentation-guide)

### State Privacy Legislation
- [OAIC - State and Territory Privacy Legislation](https://www.oaic.gov.au/privacy/privacy-legislation/state-and-territory-privacy-legislation)
- [NSW Information and Privacy Commission - HRIP Act](https://www.ipc.nsw.gov.au/privacy/nsw-privacy-laws/hrip)

---

## Research Metadata

<meta>
research-date: 2026-03-20
confidence-level: high
sources-validated: 40+
privacy-act-version: as amended by Privacy and Other Legislation Amendment Act 2024
adrm-version: HL7AUSD-STD-OO-ADRM-2021.1
aws-irap-report: 2025 H1
oaic-health-guide-version: May 2025 (v2.0)
statutory-tort-effective: 2025-06-10
automated-decision-disclosure: 2026-12-10
</meta>
