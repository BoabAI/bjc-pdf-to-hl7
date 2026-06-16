# Statement of Work #001 — Production Build

**Under the Contractor Services Agreement between SMEC AI and BJC Health**

**Draft v0.1 — June 2026 — NOT FOR SIGNATURE**

> ⚠️ **Draft for review.** This SOW sits under the Contractor Services Agreement
> ("the Agreement") and is governed by it. Where this SOW and the Agreement
> conflict, the Agreement prevails unless expressly stated here. Items in
> `[SQUARE BRACKETS]` are placeholders to confirm.

---

## 1. SOW details

| | |
|---|---|
| **SOW number** | 001 |
| **Title** | Production Build — PDF-to-HL7 automation |
| **Contractor** | [SMEC AI legal entity name], ABN [SMEC ABN] |
| **Client** | [BJC Health legal entity name], ABN [BJC ABN] |
| **Start date** | [Start date] |
| **Estimate** | **10 days = $10,000 inc GST** (estimate, not a cap — see §5) |

---

## 2. Background and objective

BJC Health is moving the PDF-to-HL7 automation into production in **BJC Health's
own AWS account**, with BJC Health owning the intellectual property and paying
AWS directly. This SOW covers the build, configuration, deployment, and testing
required to take the System live for referrals and results, plus the Power
Automate (PAD) pipeline that feeds documents from BJC Health's mailboxes into the
converter and the results into Genie.

---

## 3. Scope of Services and Deliverables

1. **AWS account setup** — configure BJC Health's AWS account: deployment role,
   compute role, Amazon Bedrock model access (Sydney + Melbourne inference
   profiles), and infrastructure-as-code for repeatable deployment.

2. **Application deployment** — deploy the conversion app and dashboard into BJC
   Health's account (Amplify WEB_COMPUTE / SSR), including the audit database and
   reference-data store.

3. **Authentication and access** — Microsoft single sign-on (Entra SSO) with
   access restricted to bjchealth.com.au accounts.

4. **Outage alerting** — an automated email alert if the converter stops
   processing documents, to a recipient list BJC Health nominates.

5. **Power Automate (PAD) pipeline** — build the workflow on the BJC Health
   server: referrals and results mailboxes → conversion service → Genie import
   folder, including retry logic and email routing.

6. **Genie routing** — HL7 routing so referrals land in Incoming Letters,
   pathology in Pathology, and radiology in Radiology.

7. **Testing cycle** — end-to-end testing of referral and results PDFs with Genie
   import verification across incoming letters / pathology / radiology.

8. **Documentation and handover** — operational guide and handover to BJC
   operations and Medihost.

---

## 4. Out of scope

- Medihost labour (server provisioning, Genie REF configuration) — BJC Health /
  Medihost responsibility.
- Changes to the existing PDF-to-Directory automation.
- Microsoft 365 / Power Automate licensing — BJC Health's existing licences.
- New mailbox creation — BJC Health / Medihost responsibility.
- Ongoing AWS running costs — billed by AWS directly to BJC Health (see the
  running-cost estimate; indicative ~$90–165/month inc GST in AUD at ~1,000–2,000
  documents/month, scaling with volume).
- New document formats or AI tuning after acceptance — handled as a later SOW or
  variation at the day rate.

---

## 5. Estimate and billing

5.1 Estimated effort: **10 days at $1,000/day inc GST = $10,000 inc GST.**

5.2 This is an **estimate, not a cap**. SMEC AI will notify BJC Health before
exceeding it and will not exceed it without written approval. Billing is for time
actually worked, in whole or part-day blocks, per clause 5 of the Agreement.

5.3 Invoiced [monthly in arrears against days worked / on the milestones in §7].
Payable within 30 days.

---

## 6. Acceptance criteria

The build is accepted when:
- (a) referral PDFs convert and import into Genie Incoming Letters correctly;
- (b) pathology and radiology results import into the Pathology and Radiology
  inboxes respectively;
- (c) the PAD pipeline retrieves from the nominated mailboxes, calls the
  converter, files successes, and routes failures to manual review;
- (d) Microsoft sign-in restricts access to bjchealth.com.au accounts;
- (e) the outage alert fires to the nominated recipients on a simulated stoppage;
  and
- (f) BJC Health confirms a [test batch of N] documents process end-to-end
  without unresolved defects.

Defects (non-conformance with the above) are corrected at no charge under clause
10 of the Agreement.

---

## 7. Timeline / milestones

| Milestone | Indicative |
|---|---|
| AWS account + app deployment | [days 1–3] |
| Auth, alerting, PAD pipeline | [days 4–7] |
| Testing + Genie verification | [days 8–9] |
| Documentation + handover | [day 10] |

> Indicative only; dependent on Medihost server access and Genie configuration
> being available when needed (see §8).

---

## 8. Assumptions and dependencies

- Medihost provides timely server access and completes any Genie-side
  configuration (e.g. REF message handling).
- BJC Health provides the AWS account (or authorises SMEC AI to create it on BJC
  Health's behalf) and the mailbox/server access required.
- Microsoft 365 and Power Automate licensing is in place.
- Delays caused by third parties (Medihost, Microsoft, Genie) are outside SMEC
  AI's control (clause 14 of the Agreement) and may affect the timeline.

---

## 9. Signatures

**[SMEC AI legal entity name]**

Name: __________________________  Signature: _____________________  Date: ________

**[BJC Health legal entity name]**

Name: __________________________  Signature: _____________________  Date: ________

---

*Prepared by SMEC AI | Draft v0.1 June 2026 | Governed by the Contractor Services Agreement*
