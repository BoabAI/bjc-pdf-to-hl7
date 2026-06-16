# Contractor Services Agreement

**Between SMEC AI (Contractor) and BJC Health (Client)**

**Draft v0.1 — June 2026 — NOT FOR SIGNATURE**

> ⚠️ **Draft for review.** This is a working draft prepared by SMEC AI to cover
> the contractor engagement for the PDF-to-HL7 automation. It carries forward the
> AI-accuracy, liability, privacy, and data-handling positions from the v2 costs
> document and reflects the v3 contractor model (BJC owns the IP, owns and pays
> for the AWS account, day-rate billing, no per-document fee or retainer).
>
> **The IP assignment, liability cap, indemnity, and independent-contractor
> clauses should be reviewed by a lawyer before signature.** Items in
> `[SQUARE BRACKETS]` are placeholders for details to confirm.

---

## Parties

| | |
|---|---|
| **Contractor** | [SMEC AI legal entity name], ABN [SMEC ABN] ("**SMEC AI**", "**the Contractor**") |
| **Client** | [BJC Health legal entity name], ABN [BJC ABN] of [BJC registered address] ("**BJC Health**", "**the Client**") |
| **Effective date** | [Effective date] |

Each a "**party**" and together the "**parties**".

---

## Background

A. BJC Health operates a specialist medical practice and uses the Genie practice
   management system.

B. SMEC AI has built, and continues to develop, automation that converts patient
   PDF documents into HL7 messages for import into Genie (the "**System**").

C. BJC Health wishes to engage SMEC AI as an independent contractor to build,
   deploy, configure, and maintain the System within BJC Health's own AWS
   account, on the terms in this Agreement.

D. The parties intend that all intellectual property in the BJC-specific work
   produced under this Agreement is owned by BJC Health (see clause 6).

---

## 1. Definitions

- **Agreement** — this Contractor Services Agreement and its Schedules and any
  executed Statements of Work.
- **Background IP** — intellectual property owned or licensed by a party before
  the Effective date, or developed independently of this Agreement, including
  SMEC AI's general-purpose tooling, libraries, and methods.
- **Deliverables** — the work products described in a Statement of Work.
- **Services** — the services described in clause 4 and detailed in each
  Statement of Work.
- **Statement of Work / SOW** — a document signed by both parties describing a
  specific package of Services, Deliverables, estimate, and acceptance criteria,
  substantially in the form of Schedule 2.
- **System** — the PDF-to-HL7 automation, including the conversion service, web
  dashboard, HL7 generation, doctor-matching configuration, and the Power
  Automate Desktop (PAD) workflow, as deployed for BJC Health.

---

## 2. Engagement and independent contractor status

2.1 BJC Health engages SMEC AI to provide the Services as an **independent
contractor**. Nothing in this Agreement creates a relationship of employment,
partnership, joint venture, or agency between the parties.

2.2 SMEC AI:
- (a) provides the Services using its own equipment, tools, and methods, and
  controls how and when the Services are performed, subject to agreed timeframes
  and acceptance criteria;
- (b) is free to provide services to other clients;
- (c) is responsible for its own income tax, GST, superannuation, insurances,
  and other statutory obligations; and
- (d) is engaged to produce the Deliverables and outcomes described in each SOW,
  not merely to provide labour for a period of time.

2.3 SMEC AI is not entitled to employee benefits (annual leave, sick leave,
superannuation contributions by BJC Health, or similar) and is responsible for
its own work health and safety arrangements.

> **Note (super / sham-contracting):** Clauses 2.2(d) and 5 are drafted to frame
> the engagement around results and Deliverables rather than labour-only time,
> which is the safer structure under Australian superannuation-guarantee and
> sham-contracting rules. Confirm with an accountant for the specific
> circumstances.

---

## 3. Term

3.1 This Agreement begins on the Effective date and continues until terminated
under clause 15.

3.2 Individual packages of work are governed by Statements of Work executed under
this Agreement. This Agreement governs all SOWs; if there is any inconsistency,
this Agreement prevails unless the SOW expressly states otherwise for that SOW.

---

## 4. Services

4.1 SMEC AI will provide the Services described in each SOW. The first SOW
(**SOW #001 — Production Build**) covers the production build of the System.

4.2 The Services may include, as set out in the applicable SOW:
- BJC Health AWS account setup, deployment role, and Bedrock model access;
- deploying the conversion app and dashboard into BJC Health's AWS account using
  infrastructure-as-code;
- database, Microsoft sign-in / access restriction, and outage alerting;
- building the Power Automate workflow on the BJC Health server;
- testing of referral and results PDFs end-to-end with Genie import verification;
- documentation and handover; and
- later changes, new document formats, and AI tuning.

4.3 **Change control.** Work beyond an executed SOW is performed only under a new
SOW or a written variation, quoted in advance and approved in writing by BJC
Health before work begins.

---

## 5. Fees, invoicing, and payment

5.1 **Day rate.** SMEC AI's fee is **$1,000 per day (8 hours), inclusive of
GST** (equivalent to $125 per hour inc GST), unless a SOW states a fixed price.
Work is billed in whole or part-day blocks against time actually worked.

5.2 **Estimates.** Any estimate in a SOW (for example, the 10-day production build
estimated at $10,000 inc GST) is an estimate, not a cap. SMEC AI will notify BJC
Health before exceeding an estimate and will not exceed it without BJC Health's
written approval.

5.3 **No other recurring fees.** There is no implementation lump sum, no
per-document charge, and no monthly retainer. BJC Health pays only for contractor
time actually worked under a SOW or approved variation.

5.4 **AWS and third-party costs.** The System runs in **BJC Health's own AWS
account**. AWS bills BJC Health directly for usage; SMEC AI applies no markup to,
and does not on-charge, AWS costs. Microsoft 365 / Power Automate licensing and
Medihost server costs are BJC Health's responsibility.

5.5 **Invoicing.** SMEC AI issues tax invoices showing its ABN and GST. Invoices
are payable within **30 days** of issue to the account nominated on the invoice.

5.6 **GST.** Fees are stated inclusive of GST. SMEC AI is registered for GST and
will provide valid tax invoices.

---

## 6. Intellectual property

6.1 **Assignment to BJC Health.** Subject to clause 6.3, SMEC AI assigns to BJC
Health, on creation, all intellectual property rights in the **Deliverables and
the BJC-specific work** produced under this Agreement, including:
- the conversion logic and HL7 generation as configured for BJC Health;
- the doctor-matching configuration;
- the web dashboard; and
- the Power Automate Desktop workflow.

6.2 SMEC AI will do all things reasonably necessary to give effect to this
assignment, and warrants that the Deliverables will not, to its knowledge,
infringe the intellectual property rights of any third party.

6.3 **Background IP and general tooling.** SMEC AI retains ownership of its
Background IP and any general-purpose components, libraries, methods, or tools it
reuses across clients. To the extent any Background IP is incorporated into a
Deliverable, SMEC AI grants BJC Health a **perpetual, irrevocable,
royalty-free, non-exclusive licence** to use, modify, and maintain that
Background IP as part of the System for BJC Health's internal business purposes,
including the right to engage a successor provider to do so.

> **To finalise:** confirm the boundary between assigned BJC-specific IP (6.1)
> and licensed-back general tooling (6.3). Where SMEC AI reuses components across
> other clients, those should sit under 6.3 (licence), not 6.1 (assignment).

6.4 **Moral rights.** SMEC AI consents (and will procure its personnel's consent)
to acts or omissions by BJC Health that would otherwise infringe moral rights in
the Deliverables.

6.5 **Patient data.** BJC Health owns all patient data at all times. SMEC AI
claims no ownership of data processed by the System.

---

## 7. Confidentiality

7.1 Each party will keep the other's confidential information confidential and
use it only to perform or receive the Services. Confidential information includes
patient data, BJC Health business information, and SMEC AI's Background IP and
methods.

7.2 The obligation does not apply to information that is public (other than
through breach), independently developed, or required to be disclosed by law.

7.3 SMEC AI may disclose confidential information to its personnel and
subcontractors who need it, provided they are bound by equivalent obligations.

7.4 Confidentiality obligations survive termination.

---

## 8. Privacy and data protection

8.1 **Roles.** BJC Health is the **data controller** for all patient information
under the *Privacy Act 1988* (Cth) and the Australian Privacy Principles. Because
the System runs in BJC Health's own AWS account, BJC Health is also the owner of
the environment in which the data is processed. SMEC AI acts as a data processor
in performing the Services.

8.2 **Document handling.** PDF documents are held only in temporary server memory
for the few seconds the AI takes to read them, then discarded once the result is
returned. Documents are never written to disk, cloud storage, a database, or any
log.

8.3 **Audit log contents.** For each conversion the System stores only
non-identifying details: a hashed filename, file size, document type,
success/failure, the patient's initials, the timestamp, and basic routing
information. It never stores the patient's full name, date of birth, Medicare
number, address, or document content.

8.4 **Data residency.** Stored data (audit log and settings) is held in AWS
Sydney. The AI reading step may run in AWS Melbourne. Both are Australian data
centres — no patient data leaves Australia.

8.5 **Authentication.** Access uses Microsoft single sign-on against BJC Health's
own Microsoft 365 directory, so BJC Health's security controls (including MFA)
apply automatically. Access is restricted to bjchealth.com.au accounts.

8.6 **Use of data.** SMEC AI will not use patient data for any purpose other than
delivering the Services.

8.7 **Breach.** SMEC AI will notify BJC Health without undue delay on becoming
aware of any actual or suspected data breach involving patient data and will
cooperate with BJC Health's obligations under the Notifiable Data Breaches
scheme.

---

## 9. AI accuracy and clinical disclaimer

9.1 The System uses artificial intelligence to extract patient information from
PDF documents. AI extraction is **not guaranteed to be 100% accurate**. SMEC AI
provides the System as an **assistive tool** to support administrative workflows.

9.2 SMEC AI does not provide medical advice, clinical decision support, or
diagnostic services. BJC Health remains solely responsible for verifying the
accuracy of extracted patient data and for all clinical decisions. SMEC AI
accepts no liability for clinical outcomes arising from use of the System.

9.3 BJC Health acknowledges that staff should verify that imported documents are
correct in Genie before acting on them.

---

## 10. Warranties

10.1 SMEC AI warrants that it will perform the Services with due care and skill
and in a professional and workmanlike manner, consistent with industry standards
for healthcare IT contractors.

10.2 SMEC AI warrants that Deliverables will, on acceptance, materially conform to
the acceptance criteria in the applicable SOW. SMEC AI will correct, at no
charge, any non-conformance (a **defect**) reported within [30] days of
acceptance of the relevant Deliverable.

10.3 Except as expressly stated, and to the extent permitted by law (including
the Australian Consumer Law where it applies), all other warranties are excluded.

---

## 11. Insurance

11.1 SMEC AI will hold and maintain, for the term and for [12] months after:
- **Professional Indemnity** insurance of at least $[PI amount, e.g. 1,000,000–2,000,000]; and
- **Public Liability** insurance of at least $[PL amount, e.g. 5,000,000 / 10,000,000].

11.2 SMEC AI will provide a Certificate of Currency on request.

> **To confirm:** the cover amounts BJC Health requires, and that SMEC AI's
> policies are in place before signature. PI cover is the practical backstop for
> clause 9 (AI accuracy) and clause 12 (liability).

---

## 12. Limitation of liability

12.1 SMEC AI's total aggregate liability under or in connection with this
Agreement will not exceed the total fees paid by BJC Health to SMEC AI in the
**12 months immediately preceding the claim**.

12.2 SMEC AI is not liable for any indirect, incidental, special, or
consequential loss, including loss of revenue, loss of data, clinical outcomes,
reputational damage, or business interruption, however caused.

12.3 Nothing in this clause limits liability that cannot be limited at law
(including under the Australian Consumer Law), or liability for a data breach
caused by SMEC AI's [negligence / wilful default] — [carve-out to confirm].

12.4 **Failure modes and mitigations.** The principal failure modes are: (a)
incorrect HL7 — a document routed to the wrong patient or doctor; (b) silent
failure — a document that fails without being surfaced; and (c) outage. The
mitigations in place are: AI extraction is an assistive tool and staff verify in
Genie before acting; failed conversions land in a manual-review folder rather
than being dropped; defects are corrected under clause 10; and patient content is
never persisted (clause 8). Because BJC Health owns the AWS account and the IP
(clause 6), BJC Health retains the ability to operate or re-engage another
provider for the System at any time.

---

## 13. Indemnities

13.1 BJC Health indemnifies SMEC AI against claims, losses, or damages arising
from:
- (a) BJC Health's use of the System in a manner not contemplated by this
  Agreement;
- (b) clinical decisions or patient outcomes related to documents processed by
  the System; and
- (c) failure by BJC Health or its providers (including Medihost) to maintain the
  required server, network, or software environment.

13.2 Each party's liability under any indemnity is reduced to the extent the
relevant loss was caused by the other party's act or omission.

---

## 14. Third-party dependencies

14.1 The System relies on third-party services including AWS, Microsoft 365,
Medihost, and Genie. SMEC AI is not liable for outages, changes, or failures
caused by these third parties, but will use reasonable efforts to notify BJC
Health and restore normal operation promptly.

---

## 15. Termination

15.1 Either party may terminate this Agreement or any SOW for convenience on [30]
days' written notice.

15.2 Either party may terminate immediately on written notice if the other
commits a material breach not remedied within [14] days of notice, or becomes
insolvent.

15.3 On termination, BJC Health will pay for all Services performed up to the
termination date.

---

## 16. Consequences of termination

16.1 Because intellectual property in the Deliverables is owned by BJC Health
(clause 6) and the System runs in BJC Health's own AWS account, BJC Health
retains full operational continuity on termination without further action by SMEC
AI.

16.2 On request at any time, and on termination, SMEC AI will provide BJC Health
with a current copy of the source code for the BJC-specific automation (the PAD
workflow, the dashboard, and the conversion service as deployed for BJC Health)
and reasonable handover assistance (handover assistance billable at the day rate
unless within an existing SOW).

16.3 Each party will return or destroy the other's confidential information on
request, except where retention is required by law.

---

## 17. Force majeure

17.1 Neither party is liable for delay or failure caused by events beyond its
reasonable control, including natural disasters, internet outages, cloud-provider
failures, government actions, or pandemics.

---

## 18. General

18.1 **Subcontracting / assignment.** SMEC AI may subcontract with BJC Health's
prior written consent (not unreasonably withheld) but remains responsible for the
Services. Neither party may assign this Agreement without the other's consent,
except BJC Health may assign to a successor operator of the System.

18.2 **Notices.** Notices are in writing to the parties' nominated email
addresses: BJC Health — [BJC notice email]; SMEC AI — info@smecai.com.au.

18.3 **Dispute resolution.** The parties will attempt to resolve disputes in good
faith by discussion before commencing proceedings (except for urgent injunctive
relief).

18.4 **Governing law.** This Agreement is governed by the laws of [New South
Wales], and the parties submit to the non-exclusive jurisdiction of its courts.

18.5 **Entire agreement.** This Agreement and its Schedules and SOWs are the
entire agreement and supersede prior proposals, including the v1/v2 hosted-service
pricing documents and their terms.

18.6 **Variation.** Any variation must be in writing and signed by both parties.

18.7 **Severability.** If any provision is unenforceable, it is severed and the
rest continues.

---

## Execution

**Signed for and on behalf of [SMEC AI legal entity name]:**

Name: __________________________  ( [Sean O'Reilly], [title] )

Signature: _____________________  Date: ____________

**Signed for and on behalf of [BJC Health legal entity name]:**

Name: __________________________  ( [name], [title] )

Signature: _____________________  Date: ____________

---

## Schedule 1 — Rate card

| Item | Rate (inc GST) |
|---|---|
| Standard day (8 hours) | $1,000 |
| Hourly equivalent | $125 |
| Production build (SOW #001) | Estimated 10 days = $10,000 (estimate, not a cap) |

- Billed in whole or part-day blocks against time worked.
- AWS, Microsoft 365 / Power Automate, and Medihost costs are paid by BJC Health
  directly to those providers (clause 5.4).
- Work beyond a SOW is quoted in advance and approved in writing before starting.

---

## Schedule 2 — Statement of Work (template)

Each package of work is documented in a SOW that includes:

1. **SOW number and title**
2. **Background / objective**
3. **Scope of Services and Deliverables**
4. **Out of scope**
5. **Estimate** (days × day rate, or fixed price)
6. **Acceptance criteria**
7. **Assumptions and dependencies** (BJC Health / Medihost responsibilities)
8. **Timeline / milestones**
9. **Signatures**

See **SOW #001 — Production Build** for the first executed Statement of Work.

---

*Prepared by SMEC AI | Draft v0.1 June 2026 | Supersedes the v1/v2 hosted-service terms*
