# PDF-to-HL7 Automation — Pricing & Costs

Prepared by SMEC AI for BJC Health | April 2026

All amounts in AUD, inclusive of GST.

---

## Summary

| Component                                                      | Inc GST          |
| -------------------------------------------------------------- | ---------------- |
| Implementation (fixed price, covers referrals **and** results) | $11,000          |
| 30-day free trial                                              | $0               |
| Per-document processing                                        | 10c per document |
| Ongoing support retainer (includes 1 hr/mo)                    | $100/mo          |
| Variations to specification                                    | $192.50/hr       |

---

## 1. Implementation — $11,000 inc GST

Covers the full build, test, and deployment of the PDF-to-HL7 automation across **both referrals and results** (pathology, radiology, and other faxed results):

| Deliverable                                                                                                                                                                  | Est. Effort |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| PAD automation workflow — referrals inbox (email retrieval, API integration, retry logic, email routing)                                                                     | 12 hrs      |
| PAD automation workflow — results inboxes (3 fax-line inboxes for pathology / radiology / other results, routing into Genie's standard pathology and radiology import paths) | 8 hrs       |
| Web dashboard (doctor list management, health status, processing metrics, cloud audit log, **manual PDF drag-and-drop upload** for documents that don't arrive by email)     | 18 hrs      |
| API authentication for PAD to call the conversion service securely                                                                                                           | 4 hrs       |
| Server configuration (Task Scheduler, folders, service account setup with Medihost)                                                                                          | 4 hrs       |
| Testing with real referral and results PDFs, and Genie import verification across incoming letters / pathology / radiology                                                   | 8 hrs       |
| Staff training                                                                                                                                                               | 2 hrs       |
| Documentation and handover                                                                                                                                                   | 4 hrs       |
| **Total estimated effort**                                                                                                                                                   | **~60 hrs** |

> **Results scope note:** Initial BJC testing confirmed that the converter extracts patient data successfully from pathology and radiology PDFs. The remaining work to bring results into scope is HL7 message routing (so Genie pulls them into the pathology / radiology inboxes rather than incoming letters) and inbox configuration in PAD. This is included in the fixed price above.

### Payment Schedule

| Milestone                          | Amount (inc GST) | When                                            |
| ---------------------------------- | ---------------- | ----------------------------------------------- |
| 30-day free trial                  | $0               | On deployment to BJC Health (see §2)            |
| Implementation fee                 | $11,000          | On BJC Health acceptance after the trial period |
| Per-document processing + retainer | per §4 / §5      | Monthly from acceptance                         |

### What's Included

- All items listed in the workflow document
- Processing of referrals **and** results (pathology, radiology, other faxed results)
- Manual drag-and-drop upload via the web dashboard for documents that don't arrive by email
- Up to 3 rounds of revisions during testing/UAT
- Remote coordination with Medihost for server access and Genie configuration
- 30-day warranty period after go-live (see §3)

### What's Not Included

- Medihost labour (server provisioning, Genie REF configuration)
- Changes to the existing PDF-to-Directory automation
- Microsoft 365 or Power Automate licensing (already covered by BJC Health)
- New mailbox creation (BJC Health / Medihost responsibility)

---

## 2. 30-Day Free Trial (included)

SMEC AI will deploy the full implementation at no charge. For the first 30 days after deployment:

- BJC Health uses the system in production
- No implementation fee, per-document fee, or retainer is charged during this period
- If BJC Health is not satisfied at the end of the trial, the engagement ends with no fees payable and SMEC AI removes the system
- If BJC Health is satisfied, the $11,000 implementation fee is invoiced on acceptance and monthly per-document and retainer charges commence

The 30-day warranty (§3) runs from the date of acceptance after the trial — not from the start of the trial — so BJC Health gets a full warranty period on top of the trial.

---

## 3. Warranty — 30 Days (included)

A 30-day warranty period begins on BJC Health's acceptance of the system after the free trial. During this period:

- Bug fixes and issues caused by SMEC AI's implementation are resolved at no charge
- Response time: within 1 business day
- Staff can report issues via email to info@smecai.com.au
- Does not cover issues caused by third-party changes (Medihost server updates, Microsoft 365 changes, Genie configuration changes)

---

## 4. Per-Document Processing — 10c per document inc GST

Each document processed by the automation (referrals **and** results) is charged at a flat rate of **10 cents per document** (inc GST). This covers all cloud infrastructure: AI document reading, hosting, and data storage. There is no separate infrastructure charge.

| Volume                                                          | Monthly Cost | Per Document |
| --------------------------------------------------------------- | ------------ | ------------ |
| 300 documents/mo _(approx. current BJC referrals only)_         | $30/mo       | 10c          |
| 500 documents/mo                                                | $50/mo       | 10c          |
| 1,100 documents/mo _(approx. BJC referrals + results combined)_ | $110/mo      | 10c          |
| 1,500 documents/mo                                              | $150/mo      | 10c          |
| 2,000 documents/mo                                              | $200/mo      | 10c          |

> **Reference volume:** BJC Health processed 882 referrals between February and April 2026 (~294/mo). Results across the 3 fax-line inboxes add an estimated ~200/week (~800/mo), bringing the combined expected volume to ~1,100 documents/mo once results are in scope.

Document counts are tracked automatically by the cloud audit log and reported on the monthly invoice. Only successfully processed documents are charged — failed extractions (moved to the Review folder) are not billed.

The Windows automation itself runs on the existing BJC server at no additional cost (PAD is already licensed).

---

## 5. Ongoing Support — $100/mo inc GST

Monthly retainer for ongoing maintenance and support after the warranty period. Includes up to 1 hour per month:

| Included              | Detail                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| Monitoring            | Proactive monitoring of automation health and cloud audit logs              |
| Issue resolution      | Investigate and resolve failures                                            |
| AI tuning             | Update extraction prompts if PDF formats or layouts change                  |
| Doctor list updates   | Assist with doctor list changes if needed (also self-service via dashboard) |
| Dashboard maintenance | Keep the web dashboard running and up to date                               |
| Email support         | Respond to issues within 1 business day                                     |

**Excess hours:** Additional time beyond 1 hour is billed at $192.50/hr inc GST.

**Cancellation:** Either party can cancel the retainer with 30 days written notice.

---

## 6. Variations to Specification — $192.50/hr inc GST

Changes requested after the project scope is agreed are billed at **$192.50/hr inc GST**.

Examples of variations:

- Adding new document types beyond those currently supported
- Integration with additional practice management systems (beyond Genie)
- Additional dashboard features beyond the agreed scope
- Changes to email routing logic or notification rules
- Integration with additional mailboxes beyond the referrals inbox and 3 results fax-line inboxes

Variations are quoted in advance before work begins. No work is done without written approval from BJC Health.

---

## 7. Payment Terms

- All amounts are in **AUD, inclusive of GST**
- No fees are charged during the 30-day free trial (§2)
- Implementation fee is invoiced on BJC Health acceptance after the trial
- Monthly charges (per-document processing + retainer) commence from acceptance and are invoiced on the 1st of each month
- Invoices are payable within **30 days** of issue
- SMEC AI ABN and bank details provided on invoice

---

## Market Context

For reference, comparable services in the Australian and international healthcare IT market:

| Service Type                                   | Typical Pricing                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| HL7 integration platforms (Redox, Rhapsody)    | $35,000-$750,000+/yr + 8c-$2 per message (routes existing HL7 — does not extract from documents) |
| AI document extraction SaaS (Mindee, Sensible) | 5c-66c per document                                                                              |
| Healthcare IT consulting (AU)                  | $150-250/hr                                                                                      |
| Power Platform consulting (AU)                 | $100-200+/hr                                                                                     |
| Small practice automation projects             | $5,000-$20,000                                                                                   |
| Manual staff processing                        | $1.50-2.50 per referral (3-5 min at ~$30/hr)                                                     |
| **SMEC AI (this quote)**                       | **10c per document, all-inclusive**                                                              |

At 10 cents per document, SMEC AI's per-document cost is a fraction of both manual processing and comparable SaaS services — while delivering a complete end-to-end solution (AI extraction, HL7 generation, doctor matching, and Genie import) for both referrals and results.

SMEC AI's pricing reflects the smaller scope of this project (single practice, single workflow) and the existing foundation already built (the conversion service and AI extraction are operational).

---

## 8. Terms & Conditions

### Limitation of Liability

SMEC AI's total aggregate liability under this agreement shall not exceed the total fees paid by BJC Health to SMEC AI in the 12 months immediately preceding the claim.

SMEC AI shall not be liable for any indirect, incidental, special, or consequential damages, including but not limited to loss of revenue, loss of data, clinical outcomes, reputational damage, or business interruption, however caused and regardless of the theory of liability.

### AI Accuracy & Clinical Disclaimer

The PDF-to-HL7 automation uses artificial intelligence to extract patient information from PDF documents. AI extraction is not guaranteed to be 100% accurate. SMEC AI provides this system as an **assistive tool** to support administrative workflows.

SMEC AI does not provide medical advice, clinical decision support, or diagnostic services. BJC Health remains solely responsible for verifying the accuracy of extracted patient data and for all clinical decisions. SMEC AI accepts no liability for clinical outcomes arising from the use of this system.

BJC Health acknowledges that staff should periodically verify that automated processing is producing correct results, particularly during the warranty period.

### Intellectual Property

SMEC AI retains all intellectual property rights in the software developed under this agreement. This includes, without limitation:

- The **PDF-to-HL7 document processing API** (the cloud-hosted conversion service that accepts PDF uploads, performs AI extraction, and returns HL7 messages)
- The AI extraction system, prompts, and document classification logic

These components are proprietary SMEC AI products. BJC Health is granted a **non-exclusive, non-transferable licence** to use the system for their internal business purposes for so long as BJC Health maintains an active commercial relationship with SMEC AI (whether through per-document processing fees, the ongoing support retainer, or both). The hosted-service licence ends 30 days after the last active billing period; the source-code rights described below survive termination.

BJC Health may not sublicense, resell, redistribute, or make available the document processing API or any component of the system to third parties.

BJC Health retains all rights to their patient data at all times. SMEC AI does not claim any ownership of data processed by the system.

**Source code on termination.** On termination by either party (other than termination by SMEC AI for BJC Health's material breach), SMEC AI will provide BJC Health with a full copy of the source code for the BJC Health–specific automation, comprising:

- The Power Automate Desktop workflow
- The web dashboard
- The conversion service code as deployed for BJC Health (referrals and results processing logic, HL7 generation, doctor-matching configuration)

BJC Health may host this code itself or engage another provider to host and operate it for BJC Health's internal business purposes. SMEC AI's underlying AI extraction prompts, shared platform components, and any code used to deliver the service to other customers remain SMEC AI proprietary and are not part of the handover. This handover ensures BJC Health retains operational continuity for a system it has helped shape, regardless of the future of the SMEC AI commercial relationship.

### Data Processing & Privacy

BJC Health remains the **data controller** for all patient information under the Privacy Act 1988 (Cth). SMEC AI acts as a data processor and will:

- Process patient data only for the purpose of providing the agreed services
- Not store, retain, or log patient document content (PDFs are processed in-memory only)
- Store only processing metadata (timestamp, document type, success/fail) for audit and dashboard purposes
- Process all data within Australian data centres (AWS Sydney)
- Not use patient data for any purpose other than delivering this service

### Third-Party Dependencies

The system relies on third-party services and infrastructure including AWS (cloud hosting and AI), Microsoft 365 (email and Power Automate), Medihost (server and Genie), and Genie (practice management software). SMEC AI is not liable for outages, changes, or failures caused by these third parties.

SMEC AI will use reasonable efforts to notify BJC Health of any third-party issues affecting the service and to restore normal operation as promptly as practicable.

### Indemnification

BJC Health agrees to indemnify SMEC AI against any claims, losses, or damages arising from:

- BJC Health's use of the system in a manner not contemplated by this agreement
- Clinical decisions or patient outcomes related to documents processed by the system
- Failure by BJC Health or Medihost to maintain the required server, network, or software environment

### Force Majeure

Neither party shall be liable for delays or failures in performance caused by events beyond their reasonable control, including but not limited to natural disasters, internet outages, cloud provider failures, government actions, or pandemic-related disruptions.

> **Note:** These terms are provided as standard commercial conditions. SMEC AI recommends that BJC Health seek independent legal advice before entering into this agreement.

---

_Prepared by SMEC AI | April 2026_
