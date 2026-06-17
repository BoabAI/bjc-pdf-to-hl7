# Contractor Services Agreement (Short Form)

**Between SMEC AI (Contractor) and BJC Health (Client)**

**Draft v0.2 — June 2026 — NOT FOR SIGNATURE**

> ⚠️ **Draft for review.** Plain-language short-form agreement for the PDF-to-HL7
> contractor engagement. Simplified from the v0.1 long-form draft (kept in git
> history). Reflects the v3 contractor model: BJC Health owns the IP, owns and
> pays for the AWS account, day-rate billing, no insurance requirement.
> SMEC AI's liability is limited under clause 8.
>
> Liability is limited through a **mutual** cap plus SMEC-favouring mechanisms
> (sole-remedy, ACL re-supply limit, time-bar, proportionate liability), rather
> than a one-sided cap — a one-sided cap in a standard-form small-business
> contract risks being struck out as an unfair contract term, which would leave
> SMEC AI with no cap at all.
>
> **Not legal advice.** The liability (cl 8), ACL (cl 8.3), and IP (cl 3) clauses
> should be reviewed by an Australian lawyer before signature. `[BRACKETS]` are
> placeholders to confirm.

---

## Parties

| | |
|---|---|
| **Contractor** | [SMEC AI legal entity — confirm this is the Pty Ltd], ABN [SMEC ABN] ("**SMEC AI**") |
| **Client** | [BJC Health legal entity name], ABN [BJC ABN], of [BJC address] ("**BJC Health**") |
| **Effective date** | [Effective date] |

---

## 1. The engagement

1.1 BJC Health engages SMEC AI as an **independent contractor** to build, deploy,
and maintain the PDF-to-HL7 automation (the "**System**") in BJC Health's own AWS
account. SMEC AI is not an employee, partner, or agent of BJC Health.

1.2 SMEC AI provides the Services using its own equipment and methods, is free to
work for others, and is responsible for its own tax, GST, superannuation, and
insurances. SMEC AI is engaged to deliver agreed outcomes, not to provide labour
for a fixed period.

1.3 **Work is agreed in Statements of Work (SOWs).** Each SOW sets the scope,
deliverables, estimate, and acceptance criteria for a package of work and is
governed by this Agreement. The first is **SOW #001 — Production Build**. Work
beyond a SOW is quoted and approved in writing before it starts.

---

## 2. Fees and payment

2.1 SMEC AI's rate is **$1,000 per day (8 hours) inc GST** ($125/hour), billed in
whole or part-day blocks against time worked, unless a SOW sets a fixed price. A
SOW estimate is an estimate, not a cap; SMEC AI will not exceed it without written
approval.

2.2 SMEC AI issues tax invoices (showing ABN and GST), payable within **30 days**.
SMEC AI may pause work on overdue invoices after notice.

2.3 **AWS and other third-party costs** (AWS, Microsoft 365 / Power Automate,
Medihost) are paid by BJC Health directly to those providers. SMEC AI applies no
markup.

---

## 3. Intellectual property

3.1 On payment, SMEC AI assigns to BJC Health all IP in the **deliverables and
BJC-specific work** (the conversion and HL7 logic as configured for BJC Health,
the doctor-matching configuration, the dashboard, and the Power Automate
workflow).

3.2 SMEC AI keeps its **pre-existing and general-purpose tooling** ("Background
IP") and grants BJC Health a perpetual, royalty-free, non-exclusive licence to use
and maintain any Background IP embedded in the deliverables, including via a
successor provider.

3.3 BJC Health owns all patient data at all times.

---

## 4. Confidentiality

Each party keeps the other's confidential information (including patient data and
BJC Health business information) confidential and uses it only for this
engagement. This does not apply to information that is public, independently
developed, or required to be disclosed by law. This clause survives termination.

---

## 5. Privacy and patient data

5.1 BJC Health is the **data controller** under the *Privacy Act 1988* (Cth) and,
because the System runs in BJC Health's own AWS account, owns the processing
environment. SMEC AI acts as a processor.

5.2 PDFs are processed in memory only and never stored. The audit log holds
**non-identifying metadata only** (hashed filename, file size, document type,
success/failure, patient initials, timestamp, routing) — never full name, DOB,
Medicare number, address, or content.

5.3 Stored data (audit log, settings) is held in AWS Sydney; AI reading may run in
AWS Melbourne. No patient data leaves Australia. Access is via BJC Health's
Microsoft sign-in (so BJC Health's MFA and security policies apply), restricted to
bjchealth.com.au accounts.

5.4 SMEC AI will notify BJC Health without undue delay of any actual or suspected
data breach involving patient data.

---

## 6. The System is an assistive tool

6.1 The System uses AI to extract information from PDFs. **AI extraction is not
guaranteed to be accurate.** It is an assistive tool for administrative workflow
only — not medical advice or clinical decision support.

6.2 **BJC Health is responsible for verifying each imported document in Genie
before acting on it**, and for all clinical decisions. Failed conversions are
routed to manual review rather than dropped.

---

## 7. Warranties and sole remedy

7.1 SMEC AI warrants that it will perform the Services with **due care and skill**,
and that deliverables will materially meet the SOW acceptance criteria on
acceptance. No other warranties are given except those that cannot be excluded by
law.

7.2 **Sole remedy.** BJC Health's sole and exclusive remedy for a defect is, at
SMEC AI's election, re-performance of the affected Services at no extra cost, or a
refund of the Fees paid for them.

---

## 8. Liability

8.1 **Cap (mutual).** To the maximum extent permitted by law, each party's total
aggregate liability under or in connection with this Agreement (whether in
contract, tort including negligence, under statute, or otherwise) is limited to
the **total Fees paid by BJC Health to SMEC AI in the 12 months before the event**
giving rise to the liability. This does not limit BJC Health's obligation to pay
Fees properly due.

8.2 **No indirect loss (mutual).** Neither party is liable for loss of profit,
revenue, anticipated savings, data, goodwill, or business opportunity, or for any
indirect, special, or consequential loss, whether or not foreseeable.

8.3 **Australian Consumer Law.** Nothing in this Agreement excludes rights under
the Australian Consumer Law that cannot be excluded. To the extent the Services
are not of a kind ordinarily acquired for personal, domestic, or household use,
SMEC AI's liability for breach of a non-excludable consumer guarantee is limited,
at SMEC AI's election, to **re-supplying the Services or paying the cost of having
them re-supplied**.

8.4 **Carve-outs.** Clauses 8.1 and 8.2 do not apply to liability that cannot be
limited at law, fraud or wilful misconduct, breach of confidentiality, or
infringement of the other party's intellectual property.

8.5 **Time bar.** Neither party may bring a claim more than **12 months** after it
first became aware (or reasonably should have become aware) of the circumstances
giving rise to it.

8.6 **Proportionate liability.** Nothing in this Agreement excludes, restricts, or
modifies any proportionate liability regime that applies by statute.

8.7 **BJC Health indemnity.** BJC Health indemnifies SMEC AI against claims, losses,
or damages arising from (a) use of the System in a manner not contemplated by this
Agreement; (b) clinical decisions or patient outcomes related to documents
processed by the System; or (c) failure of BJC Health's or Medihost's environment
— in each case reduced to the extent SMEC AI caused the loss.

---

## 9. Term and termination

9.1 This Agreement starts on the Effective date and continues until terminated.
Either party may terminate for convenience on **30 days'** written notice, or
immediately for a material breach not remedied within **14 days** of notice, or on
the other's insolvency.

9.2 On termination, BJC Health pays for Services performed to that date. Because
BJC Health owns the IP (clause 3) and runs the System in its own AWS account, it
keeps full operational continuity. On request, SMEC AI will provide a current copy
of the BJC-specific source code and reasonable handover assistance (handover billed
at the day rate unless covered by a SOW).

---

## 10. General

10.1 SMEC AI may subcontract with BJC Health's prior written consent (not
unreasonably withheld) but remains responsible for the Services. Neither party may
assign without the other's consent, except BJC Health may assign to a successor
operator of the System.

10.2 The parties will try in good faith to resolve disputes by discussion (then
mediation) before commencing proceedings, except for urgent relief.

10.3 This Agreement, with its Schedules and SOWs, is the **entire agreement** and
supersedes prior proposals — including the v1/v2 hosted-service pricing documents
and the v0.1 long-form draft. Variations must be in writing and signed. If a
provision is unenforceable it is severed and the rest continues. Notices go to:
BJC Health — [BJC notice email]; SMEC AI — info@smecai.com.au. This Agreement is
governed by the laws of **[New South Wales]**, and the parties submit to the
non-exclusive jurisdiction of its courts.

---

## Execution

**Signed for [SMEC AI legal entity]:**

Name: __________________________  Signature: _____________________  Date: ________

**Signed for [BJC Health legal entity]:**

Name: __________________________  Signature: _____________________  Date: ________

---

## Schedule 1 — Rate card

| Item | Rate (inc GST) |
|---|---|
| Standard day (8 hours) | $1,000 |
| Hourly | $125 |
| Production build (SOW #001) | Estimated 10 days = $10,000 (estimate, not a cap) |

- Billed against time worked. AWS / Microsoft 365 / Medihost costs are paid by BJC
  Health directly to those providers.
- Work beyond a SOW is quoted and approved in writing first.

---

## Schedule 2 — Statements of Work

Each package of work is a SOW covering: number and title, objective, scope and
deliverables, out of scope, estimate, acceptance criteria, assumptions and
dependencies, timeline, and signatures. See **SOW #001 — Production Build**.

---

*Prepared by SMEC AI | Draft v0.2 (short form) June 2026 | Supersedes the v0.1 long-form draft (in git history) and the v1/v2 hosted-service terms*
