# Australian Medical Security Baseline — BJC PDF-to-HL7

_Research output, generated 2026-04-30._

## Executive Summary

<key-findings>
- BJC Health is a **private health service provider** — APP-bound regardless of turnover, and additionally bound by **NSW HRIP Act** (15 HPPs).
- SMEC AI, processing PHI on BJC's behalf, is **also APP-bound** for the PHI it holds, even if SMEC AI is sub-$3M turnover, because it "provides a health service" in the broad sense (collects/holds health information for a health-related purpose). At minimum, SMEC AI should treat itself as in-scope and contract on that basis.
- The current biggest gap is the **PAD email→`/api/convert` path that bypasses auth entirely** (`X-Source: email`). That is an APP 11 problem and a reasonable-steps problem, full stop.
- AWS Bedrock in `ap-southeast-2`/`ap-southeast-4` keeps prompts within the APAC geographic boundary when using AU/APAC inference profiles, but **prompts can move between APAC regions** during cross-region inference. AWS DPA + Anthropic's no-training commitment cover most of APP 8, but APP 8.1 still applies because the data leaves the BJC entity to a third party.
- No My Health Record integration ⇒ My Health Records Act and ADHA SMD certification regimes do **not** apply.
- **Essential Eight ML1** is a sensible internal target — it's not legally mandatory for private healthcare, but it is the floor the OAIC, ACSC and any auditor will measure "reasonable steps" against.
- **Audit log content matters**: hashed filename + initials + user email is **likely still personal information** under the Privacy Act's broad "reasonably identifiable" test. Treat the audit table as PHI-adjacent and apply APP 11 controls to it.
</key-findings>

## 1. Privacy Act 1988 + Australian Privacy Principles

### Rule
The Privacy Act 1988 (Cth) and the 13 APPs regulate handling of personal information by APP entities. APP 1 (open and transparent management — privacy policy), APP 5 (notification at collection), APP 6 (use/disclosure limited to primary purpose), APP 11 (security + destruction).

### Applies to us?
**Yes, both BJC and SMEC AI.** The small-business exemption does **not** apply to organisations that "provide a health service" and hold health information. OAIC's definition explicitly captures private medical practitioners, allied health, and any organisation handling health info as part of a service — which includes a SaaS vendor processing PHI on a clinic's behalf. Even if SMEC AI's turnover is under $3M, the health-service-provider carve-out catches it.

### Minimum to comply
- Published **Privacy Policy** (APP 1.3) covering collection, purposes, disclosure, overseas recipients (with countries listed where reasonably practicable), access/correction, complaints — both BJC and SMEC AI.
- **Collection notice** (APP 5) wherever data is collected. For the BJC clinic this is patient-facing at intake; for the SMEC AI app, the BJC user-facing UI doesn't collect from patients directly, so APP 5 falls primarily on BJC. SMEC AI should still document it in its Privacy Policy as "we receive PHI from health service provider customers."
- **APP 6** — use only for the conversion task and the documented audit log. Don't repurpose PHI for product analytics, model training, marketing.
- **APP 8** (cross-border) — see §5.
- **APP 11** — see §6, §7, §8.
- **APP 11.2** — destroy/de-identify when no longer needed. We don't persist the PDF, but the audit row persists. Document a retention period and deletion policy.
- Privacy Act 11.3 (effective 11 Dec 2024): "reasonable steps" now **explicitly includes both technical and organisational measures**. Policies and training count, not just code.

### Gotchas
- The 2024 amendments added **OAIC infringement notices up to $66k per contravention** and Federal Court penalties to **$50M / 30% adjusted turnover**, plus a **statutory tort of serious invasions of privacy** (commenced ~10 Jun 2025) — individuals can sue you directly. This raises the stakes for the email-pipeline-bypass-auth issue specifically.
- "Health information" under the Act is **sensitive information** and attracts a higher reasonable-steps bar.

## 2. Notifiable Data Breaches (NDB) Scheme

### Rule
Eligible data breach = unauthorised access/disclosure or loss of personal information **likely to result in serious harm**. Must notify OAIC and affected individuals.

### Applies to us? **Yes.**

### Minimum to comply
- **Detect**: log access events, alerts on auth bypass, alerts on unusual Bedrock spend / volume.
- **Assess within 30 days max** of suspecting a breach. OAIC expects far less — "wherever possible, much shorter."
- **Notify OAIC + individuals "as soon as practicable"** once you form a reasonable belief that there's an eligible breach. There is no explicit numeric notification deadline post-belief; in practice expect days, not weeks. (Tranche-2 reforms have proposed shortening, monitor OAIC.)
- **Documented data breach response plan** — required as a "reasonable step" under APP 11. Template is on OAIC site.
- Notification must include: nature of breach, info involved, recommended steps for individuals, contact.

### Gotchas
- Health information is sensitive — **the bar for "serious harm" is lower** than for, e.g., a marketing list.
- A breach affecting a single PHI record can still be eligible and notifiable. Don't assume small-volume = no notification.
- "Loss" includes a misdirected fax/email, an unencrypted laptop, or PDFs uploaded by an unauthenticated caller into our system without reason — i.e. the email pipeline is the most likely incident vector for us.
- BJC, as the originating health service provider, is the controller of the patient relationship. Both BJC and SMEC AI may have NDB obligations for the same incident; the contract should specify who notifies first and how the other is informed.

## 3. State Health-Records Legislation — NSW HRIP Act

### Rule
NSW Health Records and Information Privacy Act 2002 (HRIP Act) and its 15 Health Privacy Principles (HPPs) apply to organisations in NSW that handle health information, public **and private**, including private medical practices.

### Applies to us?
- **BJC: Yes** (rheumatology clinic in NSW).
- **SMEC AI: Conditional.** HRIP Act applies to organisations that "collect, hold or use health information" in NSW. SMEC AI processing PHI for a NSW clinic almost certainly triggers it. Treat as in-scope.
- VIC Health Records Act 2001 and ACT Health Records Act apply only if you have patients/operations there; current scope is NSW-only.

### Minimum to comply
- The HPPs broadly mirror the APPs but with extras:
  - **HPP 5 (Retention & security)** — adequate security against misuse, loss, unauthorised access. Same shape as APP 11.
  - **Mandatory 7-year retention** for health information (or until age 25 for under-18s) for private health service providers under HRIP Act s 25/Reg cl 5. *This applies to clinical records held by BJC, not to our derived audit log* — but if BJC is using our audit log as the durable record of an event, the 7-year rule attaches.
- Comply with the federal NDB scheme; NSW also has a separate **Mandatory Notification of Data Breach (MNDB) scheme** under Part 6A of the NSW PPIP Act for **public sector agencies** — does **not** apply to private clinics, but worth knowing if any BJC partner is public.

### Gotchas
- HRIP complaints go to the **NSW Privacy Commissioner (IPC NSW)**, not the OAIC. A breach of PHI for a NSW patient can produce parallel OAIC + IPC NSW exposure.
- The 7-year retention obligation is on **BJC** for the underlying clinical record. Our audit log retention should be set in agreement with BJC — likely 7 years to match.

## 4. My Health Records Act 2012

### Rule
Governs the My Health Record (MHR) system. Strict registration, conformance, and security/access policy obligations under Rule 42 of the My Health Records Rule 2016.

### Applies to us? **No** — the app does not connect to MHR, does not read/write MHR documents, does not act as a conformant clinical software product against MHR.

### When that changes
If we ever:
- Submit/retrieve documents to MHR via the B2B Gateway
- Surface MHR data in the UI
- Become a "contracted service provider" to a registered healthcare provider organisation for MHR purposes

…then MHR Act + ADHA conformance + a written security and access policy + ADHA registration/attestation kick in. None of that today.

### Gotchas
- Some BJC staff workflows touch MHR via Genie. That's BJC's MHR registration and is independent of us.

## 5. Cross-Border Data Flow — APP 8 and Bedrock

### Rule
APP 8.1: before disclosing PI to an overseas recipient, take reasonable steps to ensure the recipient does not breach the APPs in relation to the info. s 16C: the disclosing entity remains accountable for the recipient's acts. APP 8.2 lists exceptions (substantially-similar law, individual consent with notice, required by law, enforcement, etc).

### Applies to us? **Yes — sending PDFs to Bedrock is a disclosure.**
This is the standard OAIC position: handing PI to a third party (even a cloud processor) is a disclosure unless it falls within the narrow "use-by-the-entity-via-cloud-storage" carve-out. Bedrock invocation is processing, not pure storage, so we should not rely on the "cloud storage = use, not disclosure" reading.

### Where the data physically goes
- We use AU inference profile `au.anthropic.claude-sonnet-4-6`. AWS confirms data **at rest** stays in source region. **In-transit during cross-region inference, prompts may move between APAC regions** (`ap-southeast-2` Sydney ↔ `ap-southeast-4` Melbourne). Both are in Australia.
- Crucially, Bedrock-hosted Anthropic models on the AU profile keep inference within AU. AWS's general APAC inference profiles can route to other APAC countries (Tokyo, Mumbai) — **make sure the code uses the `au.` profile, not the broader `apac.` profile.** (CLAUDE.md confirms `au.anthropic.claude-sonnet-4-6` is in use.)
- AWS infrastructure operations and support may originate from outside Australia even though customer data is processed in-region. This is the standard AWS disclosure and is covered by the AWS DPA.

### Minimum to comply
- **Rely on APP 8.1 with contractual safeguards.** AWS Customer Agreement + AWS Service Terms + Global AWS DPA bind AWS contractually, and Anthropic's Bedrock terms prohibit training on customer content. That is the standard "reasonable steps" position the OAIC accepts for major cloud providers.
- **Privacy Policy must list** that personal information may be disclosed to overseas recipients; AWS infrastructure providers can be characterised as "Australia (with potential operational support from the United States)" — list the US as a potential recipient country to be safe.
- **Do not attempt APP 8.2(a) substantially-similar exemption** for the US — OAIC has never blessed it.
- Document the data flow, the contractual chain (BJC → SMEC AI → AWS → Anthropic), and the no-training commitment in a one-page **Data Flow Map** for the DPA annex.

### Gotchas
- **Bedrock model invocation logging** (CloudWatch / S3) is opt-in. If we enable it, logs may contain PHI prompts; that storage location and access controls also need APP 11 / APP 8 treatment. Leave model invocation logging **off** unless you need it for incident response, and if on, encrypt + restrict access + retain minimally.
- s 16C accountability means **if AWS leaks our data, we're on the hook** in Australia. This is unavoidable; mitigate via the contract and via not sending more PHI than needed.
- The "use" exemption only covers the narrow case of overseas storage where the entity retains effective control. Bedrock vision extraction is best treated as a disclosure.

## 6. Encryption / Transport Security

### Rule
APP 11 — reasonable steps include encryption "where appropriate." OAIC's Guide to Securing Personal Information explicitly endorses TLS in transit and AES at rest for sensitive info.

### Applies to us? **Yes.**

### Minimum to comply
- **TLS 1.2 minimum, TLS 1.3 preferred** on every public endpoint. Amplify/CloudFront defaults are fine; verify and disable older protocols if any custom domain is set.
- **HSTS** header on the SSR responses.
- **AES-256 at rest** for every persistent store. DynamoDB encryption at rest is on by default with AWS-owned keys; for sensitive data move to a customer-managed KMS key (CMK) so you control rotation and audit.
- **No PHI in URLs or query strings** (logs leak them).
- **Secrets** (Bedrock, NextAuth secrets, DynamoDB perms) only in Amplify env vars or AWS Secrets Manager — never committed.
- Lambda environment uses TLS to Bedrock and DynamoDB by default — verify endpoints aren't being overridden.

### Gotchas
- IRAP is **not required** unless contracting for Australian government PROTECTED-or-above data. Don't waste cycles. Note IRAP-aligned controls as a "future-state" item if the customer base ever extends to public health.
- ISM (Information Security Manual) is the IRAP rulebook. Useful as a checklist, not a requirement.

## 7. Authentication / Access Control

### Rule
APP 11 reasonable steps include access controls and authentication appropriate to the sensitivity of the data. RACGP and OAIC both call out MFA as a baseline expectation for systems holding health information. Essential Eight ML1 makes MFA mandatory for "internet-facing services that process, store or communicate sensitive customer data."

### Applies to us? **Yes — and there's a known gap.**

### Minimum to comply
- **Web users** — Microsoft Entra SSO is in place (per `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`). MFA must be **enforced at the IdP level** in Entra — verify a Conditional Access policy requires MFA for the BJC and SMEC AI tenants accessing this app. Don't rely on the app to enforce MFA.
- **Service-to-service (PAD email pipeline) — currently a hole.** The `X-Source: email` path bypasses the cookie/SSO check via middleware logic. This is the single highest-risk item. Acceptable patterns:
  - **Shared secret in `Authorization: Bearer <token>` or `X-PAD-Token` header**, validated server-side, secret in Amplify env. Rotate quarterly. Combine with…
  - **IP allowlist** of the PAD egress IP(s) at the middleware or Lambda Function URL level.
  - Optional: **HMAC-signed body** so the secret is never sent in clear and replay is bounded by a timestamp + nonce window.
  - Higher bar: **mTLS** via API Gateway with client certs — overkill for one upstream caller, but defensible.
- **Session management**: JWT sessions configured (Auth.js v5). Set short lifetime (e.g. 12h) and rotate on auth events. Cookie flags: `Secure`, `HttpOnly`, `SameSite=Lax`, `__Host-` prefix where possible.
- **UPN-domain allowlist** for `bjchealth.com.au` and `smecai.au` is good — keep it; reject any other tenant-issued token even if the signature validates.
- **Least-privilege IAM** on the compute role: `bedrock:InvokeModel` only on the specific model ARNs in `ap-southeast-2` and `ap-southeast-4`; `dynamodb:PutItem`/`Query` on the audit table only.

### Gotchas
- A shared bearer token in an env var is fine **only if** Amplify is the only place it lives, the consumer (PAD) stores it in its own secret store, and you have a rotation runbook. Without rotation it degrades over time.
- If the PAD pipeline ever runs outside AWS (e.g. a SaaS email-to-webhook bridge), the IP allowlist becomes unstable. mTLS or per-request HMAC is more durable.

## 8. Audit Logging

### Rule
APP 11 reasonable steps include "logs of access" and the OAIC explicitly cites audit logs as a detection control. There is **no statutory minimum retention** for application audit logs in the Privacy Act, but parallel obligations (HRIP Act 7-year retention for clinical records, RACGP guidance, BJC's own clinical retention policies) effectively pull audit retention up.

### Applies to us? **Yes.**

### Minimum to comply
- Log: `userEmail`, `source` (web/email), `mailbox` (referrals/results), `timestamp`, `documentType`, `mailboxDisagreement` flag, `warnings`, `convertSucceeded`, `responseStatus`, `clientIp` for PAD calls. Already most of this in `lib/audit.ts`.
- Log auth events: SSO login success/failure, PAD token reject, auth middleware redirects.
- **Do not log full PHI** — current design is correct: hashed filename, patient initials, no Medicare number, no DOB, no PDF body. Continue this discipline.
- **Retention**: 7 years to match HRIP clinical retention is the safe default, agreed with BJC.
- **Access controls on the log**: the `/log` page is gated by SSO. Ensure no public IAM principal can read the DynamoDB table outside the Lambda execution role.
- **Tamper-resistance**: enable DynamoDB Point-in-Time Recovery, optionally stream to S3 with Object Lock for an immutable copy if the auditor pushes for it. Probably overkill for ML1, defensible for ML2.

### Gotchas — is the audit log "personal information"?
- Yes, almost certainly. `userEmail` is PI on the staff member; `patientInitials + documentType + timestamp + practiceContext` is **reasonably identifiable** for that patient when combined with BJC's clinical record. OAIC's test is a "reasonably identifiable" individual, not "uniquely identifiable from this row alone."
- Hashed filename is **not** sufficient de-identification on its own — if the hash function is unsalted/plain SHA-256 and the filename is recoverable (e.g. PAD logs the filename), the hash is reversible. Use a **keyed HMAC** with a server-side secret if you want any de-id strength, and even then OAIC treats hashed identifiers as pseudonymous, not de-identified.
- Practical conclusion: treat the audit table as PHI-adjacent — full APP 11 controls, document its scope in the Privacy Policy, include it in retention and incident-response plans.

## 9. Data Retention & Destruction (APP 11.2)

### Rule
Destroy or de-identify PI when no longer needed for any allowed purpose, unless retention is required by law.

### Applies to us? **Yes, primarily for the audit log** (PDFs and HL7 are not persisted server-side).

### Minimum to comply
- Document a **retention schedule**: audit rows = 7 years (HRIP-aligned), then deletion or de-identification.
- Implement **TTL** on DynamoDB items for automatic expiry, or a scheduled cleanup Lambda. TTL is simplest.
- For incident logs (CloudWatch), set log group retention (e.g. 90 days for ops logs, 7 years for security/audit logs).
- Document a **destruction certification** for any one-off bulk delete (SOC-style evidence).

### Gotchas
- "No longer needed" is interpreted purpose-by-purpose. If the only purpose for the audit row is "be available for breach forensics for 7 years," then 7 years is justified. Anything beyond that needs a fresh justification.
- DynamoDB TTL deletes asynchronously (up to 48h after expiry). Don't promise instant deletion in the Privacy Policy; say "within a reasonable period."

## 10. Secure Messaging in Australian Healthcare (Argus, HealthLink, Medical Objects, ReferralNet)

### Rule
ADHA runs an industry program around secure messaging interoperability standards (SMD profile, FHIR, MIMS-aligned standards). The certification regime applies to **transport providers** (Telstra Health Argus, HealthLink, Medical Objects, ReferralNet) — not to tools that produce HL7 files dropped into an EHR's input directory.

### Applies to us? **No, not currently.**
Our app builds an HL7 v2.4 file and PAD writes it to Genie's `LabRslts` directory at the BJC clinic. We are not transporting messages between organisations over the internet; we are an **internal pipeline** that produces a Genie-ingestible file. SMD certification doesn't bite.

### When that changes
If we ever:
- Send HL7 directly between organisations (clinic-to-clinic, clinic-to-pathology) over the internet
- Operate as a hosted message exchange
- Want to interoperate with other EHRs that demand SMD

…then we would need to align with the ADHA Secure Messaging specifications and likely partner with or become an SMD provider.

### Gotchas
- Some hospitals/Medicare interactions implicitly assume HL7 arrives via a certified transport. If we ever push HL7 outside the clinic boundary, audit that path before sending real PHI.

## 11. Essential Eight (ACSC)

### Rule
Eight cyber risk-mitigation strategies maintained by ACSC, with maturity levels 0–3.

### Applies to us?
**Not legally mandatory** for private healthcare. However, OAIC and any reasonable auditor will read "reasonable steps" through an Essential Eight lens. **Target ML1 across all eight controls.**

### Minimum to comply (ML1, mapped to our stack)
1. **Application control** — N/A in the SSR Lambda sense; for SMEC AI laptops/dev workstations, use OS-level app allowlisting (macOS Gatekeeper, equivalent on team Macs).
2. **Patch applications** — `bun update` cadence, monitor `npm audit` / `bun pm audit`, Dependabot/Renovate on the repo, Next.js LTS upgrades within 1 month.
3. **Configure MS Office macros** — Org-wide macro-from-internet block for any team using Office.
4. **User application hardening** — Browser config (no Java, Flash dead, ads blocked).
5. **Restrict admin privileges** — IAM least privilege, no console root use, MFA on the AWS root account.
6. **Patch operating systems** — Lambda runs on AWS-managed images; Node.js LTS major upgrade within 1 month of release.
7. **Multi-factor authentication** — Enforced via Entra Conditional Access for the app; AWS console MFA for all admins.
8. **Regular backups** — DynamoDB PITR + automated snapshot, tested restore at least annually.

### Gotchas
- ML1 is genuinely achievable with a small team. ML2/ML3 require continuous monitoring tooling and won't be cost-effective at SMEC AI's size.

## 12. ISO 27001 / 27799

### Rule
ISO/IEC 27001 = ISMS certification. ISO 27799 = health-information-specific extension.

### Applies to us?
**Not required by law.** They are sales/procurement signals, not regulatory obligations. Larger health buyers (hospitals, networks) ask for them; a single private clinic engagement does not. Skip until commercial demand justifies the spend.

### When to revisit
- A second clinic or hospital tender requires SOC 2 or ISO 27001
- Government health customer engagement
- Any data-broking-adjacent product surface

## 13. Contractual Obligations Between BJC and SMEC AI

### Rule
Under APP 11.1, BJC remains responsible for PHI it discloses to SMEC AI. The contract is the primary mechanism BJC uses to discharge "reasonable steps." Same logic applies to the SMEC AI ↔ AWS chain (already covered by the AWS DPA).

### Minimum to include in the BJC ↔ SMEC AI agreement
- **Scope and purpose** of processing — convert PDFs to HL7 + audit. No other use.
- **APP compliance commitment** — SMEC AI agrees to comply with the APPs for PHI received from BJC.
- **Sub-processors** disclosed — AWS (compute, storage, Bedrock), Anthropic-via-Bedrock for inference, Microsoft (Entra IdP). Sub-processor changes notified.
- **Cross-border** — disclosure that AWS support functions may operate from outside Australia; Bedrock inference stays in AU profile.
- **Security controls** — TLS, encryption at rest, MFA, RBAC, audit logging, tested backup/restore.
- **NDB cooperation** — who notifies whom within how many hours of suspecting an eligible breach. Recommend 48h SMEC AI → BJC, with joint OAIC notification path.
- **Audit/inspection rights** — BJC may request evidence of controls (penetration test summary, ML1 attestation) once per 12 months.
- **Data return / destruction on termination** — within 30 days of contract end, certify destruction of audit log, non-PHI configuration, etc.
- **Indemnity / liability** — usual carve-outs for data-protection breaches and statutory penalties.
- **Statutory tort awareness** — both parties acknowledge the new statutory tort and the obligation to notify each other of any individual claim.

### Gotchas
- BJC's natural instinct will be to require SMEC AI to "comply with HIPAA" — politely correct: HIPAA is US, and is irrelevant. Substitute "Privacy Act 1988 (Cth) and HRIP Act 2002 (NSW)."

---

## Prioritised Punch-List (top 10 by risk × effort)

Ordered: highest risk-reduction-per-hour first.

1. **Harden the PAD (`X-Source: email`) endpoint.** In `middleware.ts` and `app/api/convert/route.ts`, require an `Authorization: Bearer <PAD_TOKEN>` (env-stored, at least 32 random bytes) on requests carrying `X-Source: email`. Reject otherwise with 401. Add a unit test asserting the bypass is closed. Highest single risk-reduction action.
2. **Add IP allowlist on the same PAD path** (defence in depth): match `request.headers.get('x-forwarded-for')` against a comma-separated env `PAD_ALLOWED_IPS`. Configurable so PAD can rotate.
3. **Verify Entra Conditional Access enforces MFA** on the BJC + SMEC AI tenants for this app's enterprise app registration. App-side check (`lib/auth.ts`) cannot enforce MFA — must be IdP policy. Document the policy ID in `docs/plans/auth-sso.md`.
4. **Switch DynamoDB encryption to a customer-managed KMS key** for the audit table. Lets you rotate keys, gate access via key policy, and survive a future SOC/27001 audit without rework. Low effort with Terraform.
5. **Set retention on the audit table.** Add a `expiresAt` (epoch seconds) attribute = ts + 7 years, enable DynamoDB TTL on it. Document retention in Privacy Policy.
6. **Switch hashed-filename to HMAC-SHA-256** with a server-side key (separate env var `AUDIT_HASH_KEY`). Plain SHA-256 of a known filename pattern is trivially reversible.
7. **Write the Privacy Policy + DPA template** for SMEC AI and the BJC ↔ SMEC AI processing agreement. Use this doc as the source. Publish Privacy Policy at `/privacy` (already exists — verify content matches §1, §5, §13 above).
8. **Document the Data Breach Response Plan** in `docs/plans/incident-response.md`: detection sources, severity matrix, 30-day assessment clock, OAIC + IPC NSW + BJC notification template. Required as an APP 11 reasonable step.
9. **Confirm the Bedrock inference profile is `au.anthropic.*`, not `apac.anthropic.*`.** Add a startup assertion in `lib/vision-extractor.ts` that the model ID begins with `au.` to prevent accidental APAC-wide routing during a future config change.
10. **Lock down CloudWatch / Bedrock invocation logging.** Verify model invocation logging is **disabled** for the Bedrock profile in use (or, if enabled for debugging, that the destination S3/CloudWatch is encrypted with the same CMK and access-restricted to the SMEC AI ops role only). Lambda CloudWatch logs should not contain prompt bodies — audit `lib/vision-extractor.ts` to confirm.

Items 1–3 are the same-day actions. 4–6 are a week of work. 7–10 round out the floor.

---

## Sources

### OAIC (primary regulator)
- [APP 11 — Security of personal information (OAIC chapter)](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)
- [Guide to securing personal information (OAIC)](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/guide-to-securing-personal-information)
- [Guide to health privacy (OAIC, May 2025 collated PDF)](https://www.oaic.gov.au/__data/assets/pdf_file/0020/251183/Guide-to-Health-Privacy-Collated-May-2025.pdf)
- [Small business and the Privacy Act (OAIC)](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business)
- [Notifiable Data Breaches scheme (OAIC)](https://www.oaic.gov.au/privacy/notifiable-data-breaches/about-the-notifiable-data-breaches-scheme)
- [When to report a data breach (OAIC)](https://www.oaic.gov.au/privacy/notifiable-data-breaches/when-to-report-a-data-breach)
- [Part 4: NDB Scheme (OAIC)](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response/part-4-notifiable-data-breach-ndb-scheme)
- [APP 8 — Cross-border disclosure (OAIC chapter)](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information)
- [De-identification and the Privacy Act (OAIC)](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/de-identification-and-the-privacy-act)
- [Using the My Health Record system (OAIC)](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/health-service-providers/my-health-record/using-the-my-health-record-system)
- [NDB stats Jan–Jun 2025 (OAIC)](https://www.oaic.gov.au/news/blog/latest-notifiable-data-breach-statistics-for-january-to-june-2025)

### NSW IPC
- [HRIP Act overview (IPC NSW)](https://www.ipc.nsw.gov.au/privacy/nsw-privacy-laws/hrip)
- [Health Privacy Principles fact sheet (IPC NSW)](https://www.ipc.nsw.gov.au/resources/fact-sheet-health-privacy-principles-hpps-agencies)
- [HRIP Act (NSW Legislation)](https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-2002-071)
- [De-identification fact sheet (IPC NSW)](https://www.ipc.nsw.gov.au/fact-sheet-de-identification-personal-information)
- [NSW Health Privacy Manual 2025 (NSW Health)](https://www.health.nsw.gov.au/policies/manuals/documents/privacy-manual-for-health-information.pdf)

### ACSC / Cyber.gov.au
- [Essential Eight Maturity Model (Cyber.gov.au)](https://www.cyber.gov.au/resources-business-and-government/essential-cybersecurity/essential-eight)
- [IRAP overview (Cyber.gov.au)](https://www.cyber.gov.au/business-government/protecting-devices-systems/assessment-evaluation-programs/irap)

### Australian Digital Health Agency
- [Secure Messaging (ADHA developer portal)](https://developer.digitalhealth.gov.au/secure-messaging)
- [My Health Record participation obligations (ADHA)](https://www.digitalhealth.gov.au/healthcare-providers/initiatives-and-programs/my-health-record/register-and-set-up-access/participation-obligations)

### RACGP
- [Information and cyber security in general practice (RACGP)](https://www.racgp.org.au/running-a-practice/security/protecting-your-practice-information)
- [Information security in general practice (RACGP PDF)](https://www.racgp.org.au/FSDEDEV/media/documents/Running%20a%20practice/Security/Information-Security-in-General-Practice.pdf)

### AWS / Anthropic
- [AWS Bedrock data protection (AWS docs)](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)
- [AWS Bedrock security & compliance](https://aws.amazon.com/bedrock/security-compliance/)
- [Geographic cross-Region inference (AWS docs)](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html)
- [Anthropic on Bedrock — Commercial Terms of Service (PDF)](https://www-cdn.anthropic.com/6b68a6508f0210c5fe08f0199caa05c4ee6fb4dc/Anthropic-on-Bedrock-Commercial-Terms-of-Service_Dec_2023.pdf)
- [AWS IRAP compliance](https://aws.amazon.com/compliance/irap/)

### 2024–2025 Privacy Act reforms (commentary, all citing the Act/EM)
- [Norton Rose Fulbright — Privacy Act reform passes (2024)](https://www.nortonrosefulbright.com/en/knowledge/publications/be98b0ff/australian-privacy-alert-parliament-passes-major-and-meaningful-privacy-law-reform)
- [Ashurst — first tranche deep dive](https://www.ashurst.com/en/insights/australias-first-tranche-of-privacy-reforms-a-deep-dive-and-why-they-matter/)
- [FTI Consulting — reforms take effect](https://www.fticonsulting.com/insights/articles/australian-privacy-law-reforms-take-effect)
- [Clyde & Co — accountability gets real (Oct 2025)](https://www.clydeco.com/en/insights/2025/10/cyber-and-privacy-law-update-accountability-gets-r)

## Research Metadata

<meta>
research-date: 2026-04-30
confidence-level: high (regulatory baseline); medium (Bedrock cross-region routing — verify the exact `au.` profile behaviour against AWS docs at implementation time)
sources-validated: 25+
version-current: Privacy Act 1988 as amended by Privacy and Other Legislation Amendment Act 2024 (Royal Assent 10 Dec 2024); APP 11.3 effective 11 Dec 2024; Statutory tort commenced ~10 Jun 2025
</meta>
