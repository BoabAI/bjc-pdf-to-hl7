# BJC Health — PDF to Genie: Actions (4 May 2026)

**Meeting:** 4 May 2026, 02:01–02:42 PM (MS Teams)
**Attendees:** Sean O'Reilly (SMEC AI), Nicole Pyne (BJC)

## Status
- Prototype updated to handle **results** (in addition to referrals).
- Web portal now supports **multi-file drag-and-drop** and a configurable default carrier (set to **fax**).
- Audit log live with date filter (defaults to current month) and CSV export.
- IP/source-code-on-termination clause and 30-day no-charge trial incorporated into the proposal.

## Action items

### SMEC AI (Sean)
- **Email the updated proposal** (with IP termination clause + 30-day trial) to Nicole, Errol, and Amy. Ask for an "agree" reply for sign-off.
- **Fix the stats page pie charts** — they were rendering previously but have disappeared.
- **Rename audit-log outcome labels**: "OK / Failed" → "Successful / Failed".
- **Refine document type categories** to the 5 Nicole specified:
  1. Pathology result
  2. Radiology result
  3. Referral letter
  4. Letter (consult/correspondence — "thanks for referring…")
  5. Unknown
  Collapse the current overlapping `referral` / `referral_letter` and clarify/remove `consent_form` if not relevant to this scope.
- **Decide failed-document handling UX** for the email/fax inbox — pick one of: leave in inbox, tag as failed, or move to a "failed" folder. Need a way for BJC to map an audit-log row back to the originating email/document.
- **Plan production rollout against the 3 GoFax fax-email inboxes first** (not the admin@ inbox). Less complex, ~200 docs/week, no password-protected files.
- **Production cutover:** ~3 days work, can start within **2 business days** of testing sign-off. Needs Medihost server access (BJC now has 2 servers — capacity confirmed fine).
- **Authentication**: move portal off the Amplify default URL onto a SMEC AI subdomain; restrict access to BJC Health email addresses (consider 2FA — Nicole is relaxed since no patient data is stored).

### BJC (Nicole)
- **Run portal testing** with a reasonable volume of real fax-inbox documents (decide whether to use live data).
- **Two-step test cycle:**
  1. Test PDF → HL7 conversion via the web portal.
  2. Send generated HL7 files to **Amal** to upload into Genie and confirm correct ingestion.
- **Schedule internal meeting with Errol and Amy** in the next day or so to walk through the proposal and sign off.
- Report testing results back to Sean (Teams or email — no formal meeting needed unless issues arise).

## Next steps / sequencing
1. Sean sends proposal → BJC signs off (email "agree").
2. Nicole completes 2-step testing.
3. Sean implements production workflow for the 3 fax-email inboxes (PAD + API, mirroring the existing consent-form pipeline).
4. Soft launch — process one document at a time, verify, then scale.
5. Once stable on faxes, plan rollout to the admin@ inbox (more complex; needs UX design for failure handling among other admin email traffic).
