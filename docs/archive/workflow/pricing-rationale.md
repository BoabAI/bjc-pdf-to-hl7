# PDF-to-HL7 Pricing Rationale

For Andrew — background on how the BJC Health quote was put together.

---

## The Quote

| Component | Amount (ex GST) |
|-----------|--------|
| Implementation (fixed price) | $10,000 |
| Per-document processing | 10c per referral (inc GST) |
| Monthly support retainer | $100/mo (inc GST) |
| Variations | $175/hr |

---

## Why $8,500 for Implementation

The fixed price is based on **~48 hours of estimated effort**, priced as a value-based fixed fee rather than pure T&M.

| Work Item | Hours | Why |
|-----------|-------|-----|
| PAD automation workflow | 12 | Email retrieval, API calls, retry logic, email folder routing (Linked/Review). Similar to the consent form automation we already built for them, but with API integration instead of local processing. |
| Web dashboard | 16 | Doctor list management, health status, processing metrics, cloud audit log. New build — BJC needs visibility into what's being processed and a way to manage the doctor list without calling us. |
| API auth | 4 | The existing web app needs an API key/token layer so PAD can call it securely. Currently only has password auth for the browser UI. |
| Server config | 4 | Working with their IT provider (Medihost) to set up Task Scheduler, service account permissions, Genie folder access. Same pattern as the consent form automation but new mailbox + Genie LabRslts folder. |
| Testing | 6 | Real referral PDFs through the full pipeline — email to PAD to API to HL7 to Genie import. Need to verify patient matching, doctor routing, and auto-filing all work correctly. |
| Training | 2 | Remote session with their ops manager and receptionist. Show them the dashboard, Review folder process, and how to spot-check Genie. |
| Documentation | 4 | Workflow doc, costs doc, handover notes. Already partly done. |

### Why $175/hr

- Australian healthcare IT consulting runs $150-250/hr for specialists
- Power Platform / automation consultants sit around $100-200/hr
- $175 is mid-range, fair for a solo consultant with deep domain knowledge of their systems
- We've already built their consent form automation and the entire PDF-to-HL7 web app — we know their environment, their Genie setup, and their staff

### Why Fixed Price (Not T&M)

- BJC Health is a small medical practice, not an enterprise with a flexible IT budget
- Fixed price gives them certainty — they know exactly what they're paying
- If it takes us longer, we absorb the risk (but given we've already built the hard parts, the risk is low)
- The 30/50/20 payment schedule keeps cash flow moving and ties payments to real milestones

---

## Why 10c/doc (No Separate Infrastructure Charge)

Simpler for the client — one per-document fee that covers everything (AI extraction, hosting, storage). No confusing infrastructure line item.

**Actual AWS costs per document:**
- Bedrock Claude Sonnet (1-3 page PDF): ~$0.02-0.03/doc
- Amplify hosting: ~$0-5/mo fixed (mostly free tier at this volume)
- DynamoDB: negligible (free tier covers it)
- **Total COGS: ~$0.03/doc**

At 10c/doc, that's ~70% margin. The margin covers the fixed hosting costs and provides a buffer if AWS raises Bedrock prices.

At 500 docs/mo: $50/mo revenue, ~$15/mo COGS = ~$35/mo margin on per-doc fees.

### Why not lower?

- 10c is already a fraction of the $1.50-2.50 manual cost — no need to go lower
- 10c is a clean, memorable number for the client
- Competitors charge 5c-66c per document for AI extraction alone (no HL7, no healthcare domain logic)
- The margin needs to absorb hosting costs and price fluctuations

## Why $100/mo Retainer

Reduced from the original $300/mo to keep the fixed commitment low. The per-document fee now carries more of the revenue.

- $100/mo covers ~30 min of proactive monitoring per month
- Small enough that BJC doesn't question it
- Still enough that we proactively monitor rather than waiting for a call
- Excess hours billed at $175/hr — so BJC only pays more if they actually need more
- They can cancel with 30 days notice — low commitment

### Why Not Hourly-Only Support

- Hourly-only means they hesitate to report issues ("is this worth calling about?")
- A small retainer means they contact us freely for small things before they become big things
- $100/mo is less than the cost of one misfiled referral causing a clinical issue

---

## Value to BJC Health

BJC Health has 8 practitioners receiving referrals. Here's what the automation saves them.

### Assumptions

| Factor | Estimate | Basis |
|--------|----------|-------|
| Practitioners receiving referrals | 8 | Confirmed by BJC Health |
| Incoming referrals per doctor per week | 10-20 | Typical for busy specialist practices; rheumatology is in high demand with reported workforce shortfalls nationally |
| Total referrals per month | ~350-700 | 8 doctors x 10-20/week x 4.3 weeks |
| Time to manually process one referral into Genie | 3-5 min | Open PDF, read details, find/create patient, attach document, file to correct doctor |
| Medical receptionist rate | ~$30/hr | AU average including super (PayScale $26-30/hr, Indeed $31/hr) |

### Time & Cost Savings

| Scenario | Conservative | Moderate | Optimistic |
|----------|-------------|----------|-----------|
| Referrals per month | 350 | 500 | 700 |
| Manual time per referral | 3 min | 4 min | 5 min |
| **Hours saved per month** | **17.5 hrs** | **33 hrs** | **58 hrs** |
| **Hours saved per year** | **210 hrs** | **400 hrs** | **700 hrs** |
| **$ saved per month** (@$30/hr) | **$525** | **$1,000** | **$1,750** |
| **$ saved per year** | **$6,300** | **$12,000** | **$21,000** |

### ROI

| | Conservative | Moderate | Optimistic |
|---|---|---|---|
| Annual savings | $6,300 | $12,000 | $21,000 |
| Implementation cost (year 1 only) | $10,000 | $10,000 | $10,000 |
| Annual running cost ($100/mo retainer + 10c/doc) | $1,620 | $1,800 | $2,040 |
| **Net year 1** | **-$5,320** | **$200** | **$8,960** |
| **Net year 2+ (annual)** | **$4,680** | **$10,200** | **$18,960** |
| **Payback period** | ~14 months | ~10 months | ~5 months |

In the moderate case (most likely for a practice with 8 specialists), the automation pays for itself within 10 months and saves ~$10,000/year ongoing. Even conservatively, it's cash-positive within 14 months.

The new pricing model is cheaper for BJC at every volume level compared to the old model ($150/mo retainer + ~$30/mo infra = $180/mo vs $100/mo + $50/mo = $150/mo at 500 docs).

### Value Beyond Dollars

These don't show up in the numbers but matter to the practice:

- **Reduced errors** — no more misfiled referrals or wrong patient matches
- **Faster turnaround** — referrals in Genie within minutes, not hours or days
- **Staff freed up** — Nicole and reception can focus on patients instead of data entry
- **Doctor visibility** — referrals land in the right doctor's inbox automatically
- **Audit trail** — cloud log of every processed document for compliance

### Framing for the Quote

At $10,000 implementation + ~$150/mo running costs (at 500 docs/mo):
- The automation costs BJC Health roughly **$1.97/referral** in the first year (assuming 500/mo)
- From year 2, it drops to **$0.30/referral**
- Compare that to **$1.50-$2.50/referral** in manual staff time
- The headline: **"10 cents per referral vs $2 of staff time"**
- The more referrals they process, the better the economics get

$10,000 is a fair price for a practice this size. The ROI is clear, the payback is under 10 months at moderate volume, and they save $10K+/year ongoing.

---

## What We've Already Built (Context)

This quote doesn't start from zero. We've already delivered:

1. **PDF-to-Directory automation** (live) — consent forms from email to Genie, fully automated via PAD
2. **PDF-to-HL7 web app** (live) — referral letter conversion with AI extraction, REF^I12 messages, addressee resolution
3. **Bedrock AI extraction** (live) — document classification, patient data extraction, doctor matching

The new work connects these existing pieces with a PAD workflow and adds the dashboard. That's why the quote is $10,000 and not $50,000+ — the hard engineering is done.

---

## Market Comparison

### Implementation

| What Others Charge | Range |
|--------------------|-------|
| Enterprise HL7 integration projects | $48,000 - $750,000+ |
| Healthcare IT consulting (AU) | $150 - $250/hr |
| Small practice automation projects | $5,000 - $20,000 |
| Our quote | **$10,000 fixed** |

### Per-Document / Transaction Pricing

| Competitor | What They Do | Per-Unit Cost |
|---|---|---|
| Redox (US) | HL7/FHIR message routing between existing systems (no document extraction) | ~8c-$2/message + $35-45K/yr platform + $7-12K/EHR |
| HealthLink (AU/NZ) | Clinical messaging between providers | Per-practice annual licence (~$2-5K/yr), no per-message |
| Medical Objects (AU) | Clinical correspondence delivery | Per-practice annual licence, no per-message |
| Google Document AI | OCR + structured extraction | 2-6.5c/page (no healthcare logic) |
| AWS Textract | OCR + forms extraction | 1.5-5c/page (no healthcare logic) |
| Mindee | AI document parsing API | 5-10c/page |
| Sensible | AI document extraction | ~66c/document |
| Nanonets / Docsumo | AI document processing | ~30c/document |
| Manual staff processing | Receptionist data entry | **$1.50-2.50/referral** (3-5 min @ $30/hr) |
| **Our quote** | **AI extraction + HL7 + doctor matching + Genie import** | **10c/referral** |

Key insight: no competitor offers our full stack (AI extraction → HL7 generation → doctor routing → PMS import) as a per-document API. Redox is often cited as a healthcare integration reference point but serves a completely different market — US health tech vendors integrating with hospital EHRs at enterprise scale. It routes and translates *existing* HL7/FHIR messages between systems; it does not extract data from documents or create HL7 from PDFs. HealthLink and Medical Objects handle electronic referrals between providers but don't process legacy PDF referrals.

We're at the lower end of small practice automation because:
- Most of the platform already exists
- We know their systems intimately
- Solo consultant = no agency overhead

### IP as a Product

The PDF-to-HL7 API is our proprietary product, not a one-off project deliverable. BJC is the first customer, but the same API can serve any Australian practice using Genie, Best Practice, or Medical Director. The per-document model means each new customer adds recurring revenue without significant additional development.

Protect this in every contract:
- SMEC AI owns all IP (API, extraction logic, prompts, dashboard)
- Client gets a non-exclusive, non-transferable licence for internal use only
- No sublicensing, resale, or redistribution
- Licence is tied to the support agreement — if they cancel support, they lose access to the cloud API

---

## Risk to Us

| Risk | Mitigation |
|------|-----------|
| Medihost is slow to provision access | Server config hours could blow out. But 4 hours has buffer — the consent form setup took ~2 hours. |
| Genie REF modifier isn't enabled | Could delay testing. Not our cost — Medihost/BJC responsibility, documented in the workflow doc. |
| AI extraction needs more tuning | Unlikely — already proven on their real referral PDFs. Prompt changes are quick. |
| Dashboard scope creep | Capped at 3 rounds of revisions. Variations at $175/hr after that. |

Overall risk is low. The foundation is solid and we've done this before for the same client.
