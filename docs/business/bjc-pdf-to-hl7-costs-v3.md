# PDF-to-HL7 Automation — Engagement & Costs

**Version 3.0 (DRAFT — internal)** — June 2026

Prepared by SMEC AI for BJC Health | April 2026 (v1) · May 2026 (v2) · June 2026 (v3 draft)

All amounts in AUD, inclusive of GST.

> ⚠️ **DRAFT — not for sending yet.** This version replaces the v2 hosted-service
> model with a **contractor engagement**: SMEC AI works for BJC Health as a
> contractor, and **BJC Health owns the IP, owns the AWS infrastructure, and pays
> AWS directly.**

> **This supersedes the v2 commercial basis.** Material changes from v2 — Sean to
> confirm each is intended before this goes to BJC:
> - **IP ownership flips to BJC Health** (v2 had SMEC AI owning the conversion
>   API / AI / prompts and licensing them to BJC).
> - **No fixed $11,000 implementation fee, no 10c/document fee, no $100/mo
>   retainer** — all replaced by the day rate below.
> - **AWS infrastructure is owned and paid by BJC** (v2 bundled it into the 10c).
> - **The v2 §8 Terms & Conditions need rewriting** into a contractor /
>   work-for-hire agreement (IP assignment to BJC, contractor liability, etc.).
>   The v2 hosted-service IP, Licence Grant, Sublicensing, and Source-Code-on-
>   Termination clauses no longer apply as written.

---

## Summary

| Component | Cost |
| --- | --- |
| **SMEC AI contractor rate** | **$1,000 per day (8 hours) inc GST** (= $125/hr) |
| **Production build estimate** | **10 days = $10,000 inc GST** (incl. testing cycle — see §1) |
| Intellectual property | **Owned by BJC Health** |
| AWS infrastructure | **Owned and paid by BJC Health, directly to AWS** (est. ~$55–100/mo at full volume — see §3) |
| Per-document fee | None |
| Monthly retainer / licence | None |

---

## 1. Engagement Model

SMEC AI is engaged by BJC Health as a **contractor**. Work — the production
build, configuration of BJC's AWS account, and any later changes, fixes, or AI
tuning — is performed on this basis and billed in day blocks.

- **Rate:** $1,000 per day (8 hours), inc GST.
- **Billing:** in whole or part-day blocks against work performed; quoted in
  advance for any block of work before it begins.
- **No ongoing fixed fees:** no implementation lump sum, no per-document charge,
  and no monthly retainer. BJC pays only for contractor time used.

### Production build estimate

The full production build is estimated at **10 days = $10,000 inc GST**,
including the testing cycle. This covers:

- BJC AWS account setup, deployment role, and Bedrock model access
- Deploying the conversion app + dashboard into BJC's account (infrastructure-as-code)
- Database, Microsoft sign-in / access restriction, and the automatic outage alert
- Building the Power Automate flow (referrals + results mailboxes → conversion
  service → Genie import folder), incl. retry and email routing, on the BJC server
- Testing cycle — referrals and results PDFs end-to-end, with Genie import
  verification across incoming letters / pathology / radiology
- Documentation and handover

> Estimate, billed against actual days worked at the day rate above. Any work
> beyond the build (later changes, new formats, AI tuning) is billed in the same
> day blocks and quoted in advance.

---

## 2. Intellectual Property

All intellectual property in the work delivered under this engagement is **owned
by BJC Health**. SMEC AI assigns to BJC Health the rights in the
BJC-Health-specific automation it builds (the conversion logic, HL7 generation,
doctor-matching configuration, dashboard, and the Power Automate workflow).

> **To finalise:** confirm scope of the IP assignment, and whether any
> general-purpose tooling/components SMEC reuses across clients are licensed to
> BJC rather than assigned. This needs to be reflected in the contractor
> agreement (the v2 hosted-service IP clauses are superseded).

---

## 3. AWS Infrastructure (owned and paid by BJC Health)

The system runs in **BJC Health's own AWS account**. AWS bills BJC directly for
the usage — small for this workload, and fully itemised. **Estimates only —
confirm against the AWS Pricing Calculator or a real bill before quoting:**

| AWS service | What it does | Est. monthly (≈1,100 docs/mo) |
| --- | --- | --- |
| Amazon Bedrock (Claude) | AI document reading / extraction | ~$35–65 |
| AWS Amplify (serverless hosting) | The conversion app + dashboard | ~$15–30 |
| DynamoDB | Audit log + settings (metadata only) | <$5 |
| CloudWatch + SNS | Outage monitoring / alerts | <$2 |
| **Total (estimate)** | | **~$55–100/mo** |

Notes:
- Scales with volume — at referrals-only (~300/mo) the Bedrock portion is roughly
  a third of the above.
- No SMEC markup — BJC pays Amazon's published rates directly.
- All Australian (Sydney for app/data; Melbourne only for the AI inference
  profile). No data leaves Australia.

---

## 4. Data Residency, Privacy & Security

Carried over from v2 (unchanged on the technical substance):

- All stored data (audit log + settings) held in AWS Sydney; AI inference may run
  in AWS Melbourne. Both Australian — no patient data leaves Australia.
- PDFs are processed in memory only and never persisted.
- The audit log stores metadata only (no patient name, DOB, Medicare, address, or
  document content).
- Sign-in uses BJC's own Microsoft 365 accounts (Entra SSO), so BJC's existing
  security rules — including MFA — apply automatically. Access restricted to
  bjchealth.com.au.
- Amazon Bedrock is hosted in Australia, does not use submitted data for
  training, and is IRAP PROTECTED assessed.

Because BJC now owns the AWS account, BJC is both data controller and the owner
of the environment the data is processed in — a cleaner Privacy Act position than
the v2 hosted model.

---

## 5. Terms & Conditions

> **Rewrite required.** The v2 §8 T&Cs were written for a hosted service with
> SMEC-owned IP and recurring fees. Under this contractor model they must be
> replaced with a contractor / work-for-hire agreement covering at minimum: IP
> assignment to BJC (§2), the day rate and billing terms (§1), contractor
> liability and limitation, BJC's ownership of the AWS account and direct AWS
> costs (§3), and confidentiality / data-handling. The AI Accuracy & Clinical
> Disclaimer and Data Processing principles from v2 §8 can largely carry over.

---

*Prepared by SMEC AI | v3 draft June 2026 (v1 April 2026, v2 May 2026)*
