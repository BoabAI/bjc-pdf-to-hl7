# PDF-to-HL7 Automation — Pricing & Costs

**Version 2.0** — May 2026

Prepared by SMEC AI for BJC Health | April 2026 (v1) · May 2026 (v2)

All amounts in AUD, inclusive of GST.

> **Revision history**
>
> Version 2.0 (May 2026) incorporates BJC stakeholder clarifications from `BJC - SMEC agreement clarifications_v1 (002)`. Changes from v1:
>
> - §1 — staged rollout (stage 1 / stage 2) called out explicitly on the summary and in Implementation (Q1)
> - §1 — "Revisions vs defects" definition added (Q2)
> - §1 — Automated email alert if the pipeline stops processing documents added to Deliverables (Q5)
> - §3 — Dedicated-instance positioning added (BJC runs on its own instance, not a shared platform) (Q3)
> - §8 IP — Licence Grant, Sublicensing, and Source Code on Termination consolidated into one coherent narrative; perpetual irrevocable licence on termination, operational-vendor carve-out, right to assign to a successor vendor (Q7, Q8, Q9)
> - §8 Data Processing & Privacy — expanded to cover Entra SSO / inherited MFA, in-memory PDF handling, BJC-side retry behaviour, audit-row contents (Q4, Q10)
> - §8 Backup & Recovery — new subsection: continuous backup of the audit log, Microsoft 365 as the document source of truth, off-site source-code copy (Q11)
> - §8 Limitation of Liability — "Failure modes and operational mitigations" paragraph added; cap unchanged (Q6)
>
> Pricing, payment terms, trial structure, and the AI Accuracy / Indemnification / Force Majeure clauses are unchanged from v1.

---

## Summary

| Component                                                                       | Inc GST          |
| ------------------------------------------------------------------------------- | ---------------- |
| Implementation (fixed price, covers referrals **and** results, **both stages**) | $11,000          |
| 30-day free trial                                                               | $0               |
| Per-document processing                                                         | 10c per document |
| Ongoing support retainer (includes 1 hr/mo)                                     | $100/mo          |
| Variations to specification                                                     | $192.50/hr       |

---

## 1. Implementation — $11,000 inc GST

Covers the full build, test, and deployment of the PDF-to-HL7 automation across **both referrals and results** (pathology, radiology, and other faxed results), delivered in **two stages** (see below). Both stages are inside the fixed price; the per-document rate (10c) is the same in stage 1 and stage 2 — there is no additional implementation charge to move between them.

**Deliverables**

- PAD automation workflow — referrals inbox (email retrieval, API integration, retry logic, email routing)
- PAD automation workflow — results inboxes (3 fax-line inboxes for pathology / radiology / other results, routing into Genie's standard pathology and radiology import paths)
- Web dashboard (doctor list management, health status, processing metrics, cloud audit log, **manual PDF drag-and-drop upload** for documents that don't arrive by email)
- **Automated alert** — an email is sent automatically if the converter stops processing documents (an automated monitor emails a recipient list you choose), so no one needs to be logged into the dashboard to notice an outage
- API authentication for PAD to call the conversion service securely
- Server configuration (Task Scheduler, folders, service account setup with Medihost)
- Testing with real referral and results PDFs, and Genie import verification across incoming letters / pathology / radiology
- Staff training
- Documentation and handover

> **Results scope note:** Initial BJC testing confirmed that the converter extracts patient data successfully from pathology and radiology PDFs. The remaining work to bring results into scope is HL7 message routing (so Genie pulls them into the pathology / radiology inboxes rather than incoming letters) and inbox configuration in PAD. This is included in the fixed price above.

### Rollout in two stages

Both stages are inside the $11,000 fixed price. The per-document rate (10c) is the same in both stages.

- **Stage 1 — production rollout.** The existing referrals inbox plus the 3 GoFax fax-line inboxes (pathology, radiology, other results) processing live into Genie.
- **Stage 2 — `admin@` inbox.** The `admin@bjchealth.com.au` inbox is brought into the automation once the failure-handling UX has been finalised on stage-1 traffic.

### Revisions vs defects

The "up to 3 rounds of revisions during testing/UAT" allowance covers **scope-aligned tuning passes** requested by BJC — for example "retrain the doctor matcher on this new format", "rename this category label", "tighten the prompt for this pathology layout". Anything that doesn't behave as agreed — a bug against the spec — is a **defect**, not a revision. Defects are fixed at no charge during UAT and throughout the 30-day warranty period under §3, and they do not consume the revision allowance. The three rounds exist so that genuine "we want to change how this works" requests have a clear, included budget; defects remain uncapped.

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
- Both stages of the rollout (see "Rollout in two stages" above)
- Custom subdomain on smecai.au with access restricted to bjchealth.com.au email addresses (replaces the Amplify default URL)
- Automated email alert if the pipeline stops processing documents (see Deliverables above)
- Up to 3 rounds of revisions during testing/UAT (revisions ≠ defects; see above)
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

**Dedicated instance.** BJC Health runs on its own dedicated instance — a separate setup with its own database, its own web address (`bjchealth.smecai.au`), and its own settings (doctor list, carrier, mailbox routing). It is not a shared platform: no other practice runs on BJC Health's instance, so no fix or improvement BJC Health funds is ever applied to, or benefits, another practice. Warranty coverage is scoped to BJC Health's instance, and the Source Code on Termination clause (§8) guarantees BJC Health the right to self-host the entire instance at any time.

A 30-day warranty period begins on BJC Health's acceptance of the system after the free trial. During this period:

- Bug fixes and issues caused by SMEC AI's implementation are resolved at no charge
- Initial response time: within 1 business day
- Staff can report issues via email to info@smecai.com.au
- An automated email alert fires if the converter stops processing documents — raised to SMEC AI and BJC operations in parallel, so no one needs to be logged into the dashboard to notice an outage
- Does not cover issues caused by third-party changes (Medihost server updates, Microsoft 365 changes, Genie configuration changes)

---

## 4. Per-Document Processing — 10c per document inc GST

Each document processed by the automation (referrals **and** results) is charged at a flat rate of **10 cents per document** (inc GST). This covers all cloud infrastructure: AI document reading, hosting, and data storage. There is no separate infrastructure charge.

| Volume                                                          | Monthly Cost | Per Document |
| --------------------------------------------------------------- | ------------ | ------------ |
| 300 documents/mo _(approx. current BJC referrals only)_         | $30/mo       | 10c          |
| 500 documents/mo                                                | $50/mo       | 10c          |
| 1,100 documents/mo _(approx. BJC referrals + results combined)_ | $110/mo      | 10c          |

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

- Adding new document classifications beyond the agreed five (pathology result, radiology result, referral letter, correspondence letter, unknown)
- Integration with additional practice management systems (beyond Genie)
- Additional dashboard features beyond the agreed scope
- Changes to email routing logic or notification rules
- Integration with additional mailboxes beyond the referrals inbox and 3 results fax-line inboxes
- Stronger backup arrangements beyond the defaults described under §8 Backup & Recovery (e.g. a second copy in another Australian data centre, or a longer-retained daily snapshot)

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
| **SMEC AI (this quote)**                       | **10c per document**                                                                             |

At 10 cents per document, SMEC AI's per-document cost is a fraction of both manual processing and comparable SaaS services — while delivering a complete end-to-end solution (AI extraction, HL7 generation, doctor matching, and Genie import) for both referrals and results.

SMEC AI's pricing reflects the smaller scope of this project (single practice, single workflow) and the existing foundation already built (the conversion service and AI extraction are operational).

---

## 8. Terms & Conditions

### Limitation of Liability

SMEC AI's total aggregate liability under this agreement shall not exceed the total fees paid by BJC Health to SMEC AI in the 12 months immediately preceding the claim.

SMEC AI shall not be liable for any indirect, incidental, special, or consequential damages, including but not limited to loss of revenue, loss of data, clinical outcomes, reputational damage, or business interruption, however caused and regardless of the theory of liability.

**Failure modes and operational mitigations.** The principal failure modes SMEC AI underwrites are: (a) **incorrect HL7** — a document is converted but routed to the wrong patient or doctor; (b) **silent failure** — a document fails to process and isn't surfaced for review; (c) **outage** — the converter is unavailable and the queue backs up. The operational mitigations in place are: AI extraction is treated as an assistive tool and BJC staff verify the imported document inside Genie before acting on it; failed conversions land in a manual-review folder rather than being silently dropped; the warranty (§3) covers SMEC AI implementation bugs free of charge; patient document content is never persisted (see Data Processing & Privacy below); and the Source Code on Termination clause (below) ensures BJC Health retains the ability to operate the system if the commercial relationship ends. SMEC AI is open to discussion of the liability cap or specific carve-outs (e.g. data breach caused by SMEC AI) at BJC Health's request.

### AI Accuracy & Clinical Disclaimer

The PDF-to-HL7 automation uses artificial intelligence to extract patient information from PDF documents. AI extraction is not guaranteed to be 100% accurate. SMEC AI provides this system as an **assistive tool** to support administrative workflows.

SMEC AI does not provide medical advice, clinical decision support, or diagnostic services. BJC Health remains solely responsible for verifying the accuracy of extracted patient data and for all clinical decisions. SMEC AI accepts no liability for clinical outcomes arising from the use of this system.

BJC Health acknowledges that staff should periodically verify that automated processing is producing correct results, particularly during the warranty period.

### Intellectual Property

SMEC AI retains all intellectual property rights in the software developed under this agreement. This includes, without limitation:

- The **PDF-to-HL7 document processing API** (the cloud-hosted conversion service that accepts PDF uploads, performs AI extraction, and returns HL7 messages)
- The AI extraction system, prompts, and document classification logic

**Hosted-service licence.** These components are proprietary SMEC AI products. BJC Health is granted a **non-exclusive, non-transferable licence** to use the system for their internal business purposes for so long as BJC Health maintains an active commercial relationship with SMEC AI (whether through per-document processing fees, the ongoing support retainer, or both). The hosted-service licence ends 30 days after the last active billing period. **Notwithstanding the termination of the hosted-service licence, the source-code rights described under "Source code on termination" below survive termination and grant BJC Health a perpetual, irrevocable licence to host, modify, and operate the BJC-specific automation for BJC Health's internal business purposes.**

**Sublicensing.** BJC Health may not sublicense, resell, redistribute, or make available the document processing API or any component of the system to third parties. **The sublicensing restriction does not apply to bona fide service providers engaged by BJC Health to operate, host, maintain, or support the system for BJC Health's internal business purposes — including, without limitation, Medihost, BJC Health's IT provider, or a successor provider engaged after termination.**

**Patient data ownership.** BJC Health retains all rights to their patient data at all times. SMEC AI does not claim any ownership of data processed by the system.

**Source code on termination.** On termination by either party (other than termination by SMEC AI for BJC Health's material breach), SMEC AI will provide BJC Health with a full copy of the source code for the BJC Health–specific automation, comprising:

- The Power Automate Desktop workflow
- The web dashboard
- The conversion service code as deployed for BJC Health (referrals and results processing logic, HL7 generation, doctor-matching configuration)

BJC Health may host this code itself or engage another provider to host and operate it for BJC Health's internal business purposes, and BJC Health may assign the perpetual licence granted above to that successor operational vendor. This handover ensures BJC Health retains operational continuity for a system it has helped shape, regardless of the future of the SMEC AI commercial relationship.

### Data Processing & Privacy

BJC Health remains the **data controller** for all patient information under the Privacy Act 1988 (Cth). SMEC AI acts as a data processor.

**Authentication and access.** Login uses Microsoft single sign-on with BJC Health's existing Microsoft 365 accounts. Staff sign in with their own BJC Health accounts, and Microsoft verifies them against BJC Health's own account directory — so BJC Health's existing Microsoft security rules apply automatically, including multi-factor authentication (2FA), device checks, and risky-sign-in blocking. SMEC AI does not run a separate login of its own, and any tightening of BJC Health's security policy applies here automatically. Access is restricted to bjchealth.com.au accounts.

**Document handling.** A document is held only in the server's temporary memory for the few seconds the AI takes to read it, then discarded the moment the result is returned. Documents are never saved to disk, to cloud storage, to a database, or to any log. Files uploaded through the web dashboard are handled exactly the same way as those that arrive by email.

**Retry behaviour.** Retries happen on BJC Health's side: if a document fails, the Power Automate workflow on the BJC Health server re-reads the original from the BJC Health mailbox and sends it again. SMEC AI does not run a queue or holding area, so there is no point at which a document is held on SMEC AI's systems between attempts. If the server were to crash mid-conversion, its memory is wiped automatically — there is nowhere on SMEC AI's side for a stray document to be left behind.

**What the audit log stores.** For each conversion SMEC AI keeps only non-identifying details: a scrambled version of the filename, the file size, the document type, success or failure, the patient's initials (e.g. "JM"), the time, and basic routing information. It never contains the patient's full name, date of birth, Medicare number, address, or the document content itself. Not storing patient identifiers is a built-in rule of the system, not a manual step.

**Data residency.** All stored data (the audit log and settings) is held in AWS Sydney. The AI reading step may run in AWS Melbourne. Both are Australian data centres — no patient data leaves Australia.

**Use of data.** SMEC AI will not use patient data for any purpose other than delivering this service.

### Backup & Recovery

- **Audit log and settings (AWS Sydney).** Continuous backup is enabled — the database can be restored to any moment within the previous 35 days. This is stronger than a once-a-day backup, because every change is captured as it happens.
- **PDF documents.** Not persisted by SMEC AI. The canonical copy of each document remains in BJC Health's Microsoft 365 mailbox, governed by BJC Health's existing M365 retention and backup policy.
- **Application source code.** Kept in version-controlled source control with an off-site copy. SMEC AI will provide BJC Health with a copy on request at any time, and the Source Code on Termination clause guarantees delivery on exit.
- **Optional enhancements.** Stronger backup arrangements — such as keeping a second copy in another Australian data centre, or a daily exported snapshot kept for longer — are available as a §6 variation. These are mostly configuration changes with very little added cost.

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

---

_Prepared by SMEC AI | v2 May 2026 (v1 April 2026)_
