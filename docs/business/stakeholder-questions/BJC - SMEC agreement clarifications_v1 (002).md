# BJC HL7 Converter & SMEC AI Agreement

## Pricing & Costs

11 comments across pages 1, 2, 3, 6 and 7. The comments concentrate on the Terms & Conditions section — limitation of liability, IP licensing, source-code escrow, and the in-memory processing claim.

### Page 1 · Summary Table

**Anchor:** *Implementation (fixed price, covers referrals and results) — $11,000.*

**Question:** Is this covering stages 1 and 2? Please make this clear and specific.

**Response:** Yes — both stages are inside the fixed $11,000. Stage 1 is the production rollout across the three GoFax fax-line inboxes (pathology, radiology, other results) plus the existing referrals inbox. Stage 2 is bringing the `admin@` inbox into the automation once the failure-handling UX is finalised. Both are listed in §1 "Deliverables" and "What's Included" of the pricing document, and the per-document fee (10c) is the same in both stages — there is no additional implementation charge to move from stage 1 to stage 2. I'll tighten the wording in the next revision so the staged rollout is called out explicitly on the summary table.

### Page 2 · What's Included

**Anchor:** *Up to 3 rounds of revisions during testing/UAT.*

**Comment:** Please defined what a revision is? I.e. what if a revision is required because of changes that don't do what was expected/asked.

**Response:** A "revision" means a scope-aligned tuning pass requested by BJC during UAT — for example "the doctor matcher missed Dr X on this referral, retrain it", "rename this category label", "tighten the prompt for this pathology format". Anything that doesn't do what was expected or asked is a defect, not a revision — defects are fixed at no charge and don't consume the revision allowance, both during UAT and through the 30-day warranty period under §3. The three rounds exist so that genuine "we changed our mind about how this should work" requests have a clear, included budget; bug fixes against the agreed spec are uncapped. I'll add this distinction explicitly to §1 of the pricing document.

### Page 3 · §3 Warranty

**Anchor:** *A 30-day warranty period begins on BJC Health's acceptance of the system after the free trial. During this period: Bug fixes and issues caused by SMEC AI's implementation are resolved at no charge … Does not cover issues caused by third-party changes.*

**Comment:** Is the converter going to be a shared platform or will BJC have its own instance? BJC would not want to be paying for fixes that are needed and then applied that other Practices may benefit from.

**Response:** BJC has its own dedicated instance — a separate setup with its own database, its own web address (`bjchealth.smecai.au`), access limited to bjchealth.com.au accounts, and its own settings (doctor list, carrier, mailbox routing). It is not a shared platform — no other practice runs on BJC's instance. That answers the concern directly: because nothing is shared, no fix or improvement BJC funds is ever applied to, or benefits, another practice. The warranty covers issues BJC raises against their instance, and the Source Code on Termination clause — cleaner under a dedicated model, since the whole instance is BJC-specific — guarantees BJC the right to take the full system and run it themselves at any time.

### Page 3 · Manual Web Upload

**Anchor:** *Staff can covert PDF at any time via the web interface-useful for documents that arrive outside the automation (e.g. a faxed letter that didn't auto-process, a one-off scan, a document that landed in wrong inbox.*

**Queston:** Can we add 2FA to the login process & what happens to the document uploaded this way, can SMEC AI confirm that no copy is left on server?

**Response:** Yes — login uses Microsoft sign-in with your existing Microsoft 365 accounts. Staff sign in with their own BJC accounts, and Microsoft verifies them against BJC's own account directory — so BJC's existing Microsoft security rules apply automatically, including multi-factor authentication (2FA), device checks, and risky-sign-in blocking. Whatever 2FA rule BJC sets on a staff member's account also applies here; we don't run a separate, weaker login of our own. Access is limited to bjchealth.com.au accounts. On the document itself: a file uploaded through the web page is handled exactly like one that arrives by email — it is held only in the server's temporary memory for the few seconds the AI takes to read it, then discarded the moment the result is returned. It is never saved to disk, to cloud storage, to a database, or to any log — no copy is left on the server. The only thing we keep is an audit entry of non-identifying details (a scrambled version of the filename, the file size, the document type, success or failure, the patient's initials, and the time).

### Page 3 · Web Dashoard

**Anchor:** *A secure web dashboard is available for staff to manage the automation, monitor its health, and view processing metrics*

**Question:** If or when not running properly, is there any auto notification, or does this requires someone to login to see?

**Response:** Today, staff see problems by opening the audit log in the dashboard. To answer directly: yes, we'll add automatic notification so no one has to log in to notice an outage. The simplest reliable signal is activity — every document the converter processes is recorded in the cloud audit log, so a few hours with nothing recorded means the pipeline has stopped, whatever the cause (our service, the workflow on the BJC server, or the mailbox sign-in). An automated monitor watches for that and emails a recipient list you choose (BJC ops plus me), with a follow-up email when things recover. This is included in the implementation fee and uses standard cloud monitoring. Individual documents that fail to read are handled separately — they go to the Review folder for staff and don't trigger the outage alert, because a document needing a human is not an outage. I also monitor proactively under the §5 retainer and respond within one business day.

### Page 6 · Limitation of Liability

**Anchor:** *SMEC AI's total aggregate liability under this agreement shall not exceed the total fees paid by BJC Health to SMEC AI in the 12 months immediately preceding the claim. SMEC AI shall not be liable for any indirect, incidental, special, or consequential damages, including but not limited to loss of revenue, loss of data, clinical outcomes, reputational damage, or business interruption …*

**Comment:** Please outline the potential risks of failure here for SMEC AI

**Response:** Honest framing: the failure modes I underwrite are (a) **incorrect output** — a document is converted but routed to the wrong patient or doctor; (b) **silent failure** — a document fails to process and isn't surfaced for review; (c) **outage** — the converter is down and referrals/results back up. At the quoted volume (~$110/mo at combined scope), the 12-month liability cap sits in the low thousands — so the clause does limit SMEC AI's downside in a contractual sense. The point of the cap is to protect a small business from very large consequential-damages claims (e.g. "a missed referral led to a clinical outcome and we want $10M") that are outside our direct control once BJC staff can see the documents arriving in Genie. It is not a release from our duty to fix our own bugs. The practical safeguards are: the AI is treated as an assistant and Genie users see the imported document before acting on it; failed conversions go to a manual review folder rather than being silently dropped; the warranty covers our implementation bugs free of charge; patient information is never stored; and the source-code-on-termination clause means BJC is never stranded if SMEC AI ceases trading.

### Page 6 · Intellectual Property — Licence Grant

**Anchor:** *BJC Health is granted a non-exclusive, non-transferable licence to use the system for their internal business purposes for so long as BJC Health maintains an active commercial relationship with SMEC AI … The hosted-service licence ends 30 days after the last active billing period; the source-code rights described below survive termination.*

**Comment:** Conflicts with the Source Code on Termination Notice below.

**Response:** The two clauses are intended to sit together, not in conflict. The Licence Grant covers the **hosted service** while the commercial relationship is active — that licence ends 30 days after the last billing period because SMEC AI is no longer running the service for you. The Source Code on Termination clause is the **off-ramp**: if the relationship ends (other than via SMEC AI terminating BJC for material breach), SMEC AI hands over the source for the BJC-specific automation so BJC can self-host or move to another provider, and that right survives the end of the hosted-service licence. I'll redraft the Licence Grant paragraph to make the relationship explicit, e.g. "Notwithstanding the termination of the hosted-service licence, the source-code rights described under 'Source Code on Termination' survive termination and grant BJC Health a perpetual, irrevocable licence to host, modify, and operate the BJC-specific automation for BJC Health's internal business purposes."

### Page 6 · Intellectual Property — Sublicensing

**Anchor:** *BJC Health may not sublicense, resell, redistribute, or make available the document processing API or any component of the system to third parties.*

**Question:** What if we need to give it to a 3rd party to make it operate properly?

**Response:** The sublicensing restriction is aimed at commercial redistribution — reselling the converter to other practices, packaging it inside a third-party product, or making the API available as a service to outside parties. It is not aimed at the operational vendors BJC reasonably needs to engage to run the system for BJC's own internal use. To remove ambiguity, I'll add an explicit carve-out: "The sublicensing restriction does not apply to bona fide service providers engaged by BJC Health to operate, host, maintain, or support the system for BJC Health's internal business purposes — including, without limitation, Medihost, BJC Health's IT provider, or a successor provider engaged after termination." That covers Medihost, any future IT vendor, and the source-code-on-termination handover.

### Page 7 · Source Code on Termination

**Anchor:** *On termination by either party (other than termination by SMEC AI for BJC Health's material breach), SMEC AI will provide BJC Health with a full copy of the source code for the BJC Health–specific automation, comprising: the Power Automate Desktop workflow; the web dashboard; the conversion service code as deployed for BJC Health (referrals and results processing logic, HL7 generation, doctor-matching configuration).*

**Comment:** As per my earlier comments from Intellectual property – Licence Grant & Sublicensing, this needs to reflect the 2 points above.

**Response:** Agreed — I'll consolidate the three clauses (Licence Grant, Sublicensing, Source Code on Termination) into one consistent IP section in the next revision. The combined narrative will read: (i) the hosted-service licence is tied to the active commercial relationship and ends 30 days after billing stops; (ii) the sublicensing restriction is anti-resale only and explicitly does not block operational vendors BJC engages to run the system for BJC's internal business purposes; (iii) on termination by either party (other than termination by SMEC AI for BJC's material breach), BJC receives the full source for the BJC-specific automation under a perpetual, irrevocable licence to host, modify, and operate it for BJC's internal business purposes, with the right to assign that licence to a successor operational vendor. I'll circulate the consolidated draft alongside this response document for review.

### Page 7 · Data Processing & Privacy

**Anchor:** *Not store, retain, or log patient document content (PDFs are processed in-memory only).*

**Comment:** This is not clearly enough defined, when considering the retry process, is there a period of potential storage to undertake that process, even if for a short period. If it is retained for that short period, then there is a system failure what steps are in place for it being removed, please define process of for assurance that no patient information is stored.

**Response:** There is no point on our side where the document is held for a retry. When a document comes in, it is held only in the server's temporary memory for the few seconds the AI (running in Australia) takes to read it, then discarded the moment the result is returned. It is never saved to disk, to cloud storage, to a database, or to any log. Retries happen on BJC's side: if a document fails, the Power Automate workflow on the BJC server simply re-reads the original from the BJC mailbox and sends it again — the mailbox is BJC's own Microsoft 365, under BJC's existing retention rules, and we never keep a copy. If the server were to crash mid-conversion, its memory is wiped automatically; there is nowhere on our side for a stray document to be left behind. The only thing we keep is a non-identifying audit entry — a scrambled filename, file size, document type, success or failure, the patient's initials only (e.g. "JM"), and the time. By design, patient names, dates of birth, and Medicare numbers are never written to that record.

### Page 7 · Third-Party Dependencies

**Anchor:** *The system relies on third-party services and infrastructure including AWS (cloud hosting and AI), Microsoft 365 (email and Power Automate), Medihost (server and Genie), and Genie (practice management software). SMEC AI is not liable for outages, changes, or failures caused by these third parties.*

**Question:** What is the backup process, this is extremely important to have in place (standard is daily), otherwise everything could be lost in an failure.

**Response:** The only data SMEC AI stores is the audit log and the settings (doctor list, carriers), held in our database in AWS Sydney. That database has **continuous backup turned on** — we can restore it to any moment within the previous 35 days, which is stronger than a once-a-day backup because every change is captured as it happens. Documents themselves are never stored by us, so there is nothing to lose there — the original of every document stays in BJC's Microsoft 365 mailbox, which BJC already backs up under your existing policy. The software itself (the Power Automate workflow, the dashboard, and the converter) is kept in version-controlled source control with an off-site copy; the Source Code on Termination clause guarantees BJC a copy on exit and I'll provide one on request at any time.
