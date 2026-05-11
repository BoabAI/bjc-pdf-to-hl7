Subject: PDF → HL7 Converter — what's new + how to log in

Hi Nicole,

A quick update on the converter — there's been a round of changes since yesterday afternoon and it's ready for another look.

WHAT'S CHANGED

- **Microsoft sign-in** — you can now log in with your Microsoft (bjchealth.com.au) account instead of the shared password. Either still works for now, but SSO is the path we want everyone on. Your activity is then tied to your email in the audit log.
- **Walkthrough video on the login page** — short instructional video plays right on the login screen so new users can see the flow before they sign in.
- **Audit log improvements** — outcomes now read as "Successful" / "Failed" (clearer than the old labels), and document types are grouped into five buckets: Pathology result, Radiology result, Referral letter, Letter, Unknown. Any extraction warnings are now stored against the row so you can see why a conversion flagged.
- **Filename hash helper** — a new page lets you paste a filename and get its hash, so you can find the matching row in the audit log without us ever storing the patient's name. Linked from the audit log.
- **Stats page** — the donut charts now render properly with colours (doc type / outcome / source).
- **Default carrier** set to "fax" so the HL7 reflects the most common ingest path.
- Behind the scenes: tidied the codebase and imported the docs for the upcoming PAD email-to-HL7 pipeline.

HOW TO ACCESS

URL: https://main.ddv0o3k8wcjhr.amplifyapp.com

Two ways to sign in:
1. **Microsoft** — click "Sign in with Microsoft" and use your bjchealth.com.au account
2. **Password** — Mh2Hl7Cv (still works as a fallback)

NEXT STEPS

- Have a play with Microsoft sign-in and let me know if anything trips up
- If you spot any conversions where the warning message is unhelpful or the doc-type bucket looks wrong, send me the filename hash and I'll dig in
- The next piece of work is the PAD pipeline — automatically pulling PDFs from a mailbox into the converter. Happy to walk you through the plan whenever suits

As always, send through any PDFs that don't convert cleanly and I'll tune the extractor.

Cheers,
Sean
SMEC AI
