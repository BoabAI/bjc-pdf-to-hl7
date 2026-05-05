# Provider numbers — questions for Nicole

**Status:** Open
**Raised:** 2026-04-30
**Owner:** Sean
**Context:** Reference data UI (`/reference`) lists BJC doctors as `{ name, providerNumber }` — one provider number per doctor. Need to confirm this matches Genie's reality at BJC before locking the schema.

## Background

In Australia, Medicare provider numbers are **location-specific**, not practitioner-specific. A doctor working across multiple sites has a separate provider number for each site (AHPRA registration is portable; the Medicare provider number is not). See [Services Australia — Apply for additional provider numbers](https://www.servicesaustralia.gov.au/apply-for-additional-provider-numbers?context=20).

Genie Desktop's data model — based on Magentus and Medical-Objects' integration guides — appears to be **one provider number per practitioner contact card**. The Medical-Objects setup guide warns: *"If you miss this step for provider numbers the message will not be sent."* No public documentation describes multiple provider numbers being attached to a single Genie practitioner record.

Practices that need to handle multi-site doctors typically work around this by:

1. Creating **one Genie contact per site** for the same doctor (e.g. "Dr Irwin Lim — Chatswood", "Dr Irwin Lim — Brookvale"), each with its own provider number, OR
2. Picking a **single canonical provider number** for the practitioner record — incoming HL7 addressed with any of the doctor's other location numbers will fail to match.

Routing behaviour: incoming HL7 messages are matched against the registered provider number in `PV1-9`. Mismatches drop the message into Genie's default inbox instead of the target doctor.

## Questions for Nicole

1. **Do any BJC specialists consult at more than one BJC site under separate Medicare provider numbers?**
   (e.g. a rheumatologist running clinics at Chatswood AND Brookvale would typically have a different provider number for each site.)

2. **In BJC's Genie, does each doctor have one practitioner contact card, or are there separate contacts per site?**
   We can check directly in Genie if easier — looking for whether "Dr X" appears once or multiple times in the practitioner list.

3. **For each BJC doctor, what is the provider number that routes incoming HL7 to their inbox today?**
   Right now `/reference` is seeded with placeholder numbers (`9000001Z`, `9000002Z`, etc.). These need to be replaced with the real provider numbers BJC's Genie expects.

4. **If a doctor has multiple provider numbers, which one should we use in our HL7 output?**
   Two options if multi-site doctors exist:
   - **Option A (no schema change):** add them as separate rows in `/reference` — e.g. "Dr Irwin Lim (Chatswood)" + "Dr Irwin Lim (Brookvale)". Operator picks the right one per document. Cleanest for our codebase.
   - **Option B (schema change):** support an array of `{ site, providerNumber }` per doctor and let the AI/operator pick at conversion time. More work, only justified if Option A is unworkable for ops.

## Recommended path

If the answer to Q1 is "no" → current schema (`{ name, providerNumber }`) is correct, just need real numbers from BJC.

If the answer to Q1 is "yes" → start with Option A (separate rows). It requires zero code change and matches how Genie itself handles the same problem (one contact per location).

## References

- [Services Australia — Apply for additional provider numbers](https://www.servicesaustralia.gov.au/apply-for-additional-provider-numbers?context=20)
- [Services Australia — Manage your provider and prescriber numbers](https://www.servicesaustralia.gov.au/manage-your-provider-and-prescriber-numbers?context=20)
- [Medical-Objects KB — Genie Sending](https://kb.medical-objects.com.au/display/PUB/Genie+Sending)
- [Medical-Objects KB — Genie](https://kb.medical-objects.com.au/display/PUB/Genie)
- Project doc: `docs/research/genie-hl7-input-format.md` (PV1-9 routing, OBR-24 inbox routing)
