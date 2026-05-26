# Connectors Strategy & Feasibility — "PDF → any inbox → any PMS"

> **Deliverable type:** Product strategy + feasibility ideation (not a build plan).
> **Plan file:** `/Users/sean/.claude/plans/ideate-using-connectors-to-hazy-sunset.md`
> On approval, this content is polished into a repo doc (`docs/strategy/connectors-feasibility.md`) and optionally a branded PDF via the `markdown-to-pdf` skill for stakeholders.

---

## Context — why this exists

SMEC AI has a working, contracted pipeline for BJC Health: PDFs arrive in **Microsoft 365** mailboxes, **Power Automate Desktop (PAD)** on BJC's Windows server POSTs them to `/api/convert`, the service classifies + extracts via Bedrock, builds **HL7 v2.4**, and delivers into **Genie** via an **HL7 file-drop** (LabRslts directory). Scope is deliberately narrow: **Genie + M365 only**, and the costs doc (`docs/business/bjc-pdf-to-hl7-costs-v2.md:168`) lists "integration with additional practice management systems (beyond Genie)" as a paid **§6 Variation**.

This ideation asks: what would it take to **generalise the BJC one-off into a product** that (a) ingests documents from **any inbox** — Google Workspace *and* Microsoft 365 — and (b) **delivers converted documents into the top 5 Australian practice management systems**, not just Genie. Plus: **what registration/approval is required for each PMS**.

The outcome is a strategy + feasibility doc: target architecture, the registration/cost reality per system, and rough phasing — enough to decide whether (and in what order) to pursue this.

---

## The two connector axes

The word "connector" spans two independent edges of the pipeline. The core (classify → extract → build message → audit) does **not** change.

```
 SOURCE connectors            CORE (unchanged)                 DESTINATION connectors
 ┌──────────────────┐    ┌──────────────────────────┐    ┌────────────────────────────┐
 │ MS365 (Graph)    │    │ /api/convert             │    │ Genie    (HL7 file-drop) ✅ │
 │ Google Workspace │ ─► │  classify (Bedrock)      │ ─► │ Bp Premier (Halo Connect)   │
 │ (manual upload)✅│    │  extract → eligibility   │    │ Zedmed     (Halo Connect)   │
 └──────────────────┘    │  build HL7 / FHIR        │    │ MD / Helix (Smart API+)     │
                         │  audit                    │    │ MediRecords (FHIR)          │
                         └──────────────────────────┘    └────────────────────────────┘
```

- **Source connectors (email):** where PDFs come *from*. The user named Google Workspace **and** MS365 — a product signal, since other practices may run Google even though BJC is M365-only.
- **Destination connectors (PMS):** where the converted document *goes*. Per the clarified intent, this means **delivering documents INTO each PMS** (generalising today's Genie file-drop), with light patient-matching read-back as a pre-step.

---

## What already exists — reuse, don't rebuild

Verified in code; the ingestion contract is essentially **already a connector API**:

- **`app/api/convert/route.ts:41`** — accepts `X-Source: email`, `X-Source-Mailbox: <address>`, `Authorization: Bearer <PAD_TOKEN>`. Any new source connector just POSTs here.
- **`lib/pad-auth.ts:66`** (`isPadAuthenticated`) — service-to-service bearer auth. **Today: a single shared `PAD_TOKEN`.** A multi-connector product needs a per-connector token allow-list (small change).
- **`lib/conversion-config.ts:44`** (`MAILBOX_CATEGORIES`, `mailboxCategoryFor`, `allowedDocTypesForCategory`) — mailbox→category routing that constrains classification. New source mailboxes are a one-line code change today; a product would move this to per-tenant config.
- **Eligibility gate + manual-review feedback loop** (`lib/convert-service.ts`, eligibility module) — already returns `suggestedCategory` for low-confidence/mismatch cases. Reusable verbatim.
- **HL7 builder** (`lib/hl7-builder.ts`) — the *destination* format for Genie. A product adds a **FHIR builder** alongside it (see below).
- **Multi-tenant Entra app** already exists for SSO (Boab AI tenant, per costs doc §8) — a head start for the MS365 source connector.

**Implication:** the source-connector axis is mostly *plumbing onto an existing contract*. The destination-connector axis is the genuinely new engineering (FHIR write-back + per-vendor auth/registration).

---

## Target architecture

### Destination: FHIR is the lingua franca
Every modern AU PMS integration is **FHIR (AU Base, R4)**. Genie's HL7 file-drop is the legacy exception we already own. So the product introduces a **delivery abstraction**:

```
interface DeliveryConnector {
  matchPatient(demographics): Promise<PatientRef | Candidates>   // FHIR Patient search
  deliver(doc: ConvertedDocument, patient: PatientRef): Promise<DeliveryReceipt>
}
```

- **Genie** → existing HL7 file-drop implementation (keep — it's free and built).
- **Everything else** → a single **`FhirDocumentReferenceWriter`**: wrap the converted PDF as a base64 `DocumentReference.content.attachment` (and `Communication`/`ServiceRequest` for referrals), tied to a matched `Patient`. Per-vendor differences collapse to **auth + base URL + minor profile quirks**.

### The Halo Connect unlock
**Halo Connect collapses two of the top systems into one integration.** It is an interoperability layer (FHIR + SQL, one on-prem "Halo Link" agent) that, **from 1 Jan 2026, is the *only* sanctioned way to integrate with Bp Premier** (pairing codes mandatory 1 Feb 2026) — and it also covers **Zedmed**. Halo Connect retains no patient data and operates in-AU. So the on-prem heavyweights (Bp ~60%, Zedmed) are **one connector, not two**.

### Source: cloud-native email connectors
Replace/supplement PAD with cloud connectors that normalise to the existing `/api/convert` contract:
- **MS365** via Microsoft Graph (removes the on-prem Windows/PAD dependency).
- **Google Workspace** via Gmail API.
- Start with **polling** (every 5–15 min) before push (Graph change notifications / Gmail Pub/Sub) — simpler, no inbound firewall exposure.

---

## Destination PMS — registration & feasibility (the research core)

Market share is approximate (GP segment; specialist market skews to Genie).

| PMS | ~Market | Integration path | API | Registration gate | Recurring fee | Notes / gotchas |
|---|---|---|---|---|---|---|
| **Best Practice (Bp Premier)** | ~60–65% GP | **Halo Connect** (mandatory from Jan 2026) | FHIR + SQL | Approved **Bp Partner** + Halo Connect onboarding | Halo Connect commercial terms (per-integration) | On-prem **Halo Link agent** at each practice; pairing code per practice (7-day validity) |
| **Zedmed** | ~third place | **Halo Connect** (same as Bp) | FHIR | Bp Partner / Halo Connect (shared) | Shared with Halo Connect | **Same connector as Bp** — 2 systems, 1 build |
| **MedicalDirector / Helix** | ~25% | Telstra Health **Smart API+** | FHIR (native) | Telstra Health **partner program** (express interest; MD Clinical case-by-case) | TBC with Telstra Health | Helix = cloud (full API); legacy MD Clinical = limited/case-by-case |
| **Genie / Gentu** | specialist leader | (a) **HL7 file-drop** ✅ built/free · (b) **Genie Partner API** | FHIR + OAuth2 | Developer Partner program + assessment + Marketplace listing (for API path) | **$500/mo or 20% rev-share** (whichever higher) for Partner API | Keep file-drop for on-prem Genie; Partner API needed for cloud Gentu |
| **MediRecords** | emerging cloud | MediRecords **Connect** | FHIR R4 | Purchase **Connect** bundle; contact success@medirecords.com | Paid Connect bundle | Cloud-native; cleanest FHIR but smallest install base |

> **Alternative #5:** In the *specialist* market (BJC's segment) **Clinic to Cloud** may matter more than MediRecords — worth confirming against the actual target customer base before committing the 5th slot.

**Net:** "Top 5 PMS" decomposes to **~4 integrations**, all FHIR:
1. **Halo Connect** → Bp + Zedmed (largest reach, but mandatory partner approval + on-prem agent)
2. **Genie/Gentu** → keep HL7 file-drop; add Partner API only if cloud Gentu demand justifies the fee
3. **Smart API+** → MD / Helix
4. **MediRecords FHIR** (or Clinic to Cloud)

The dominant cost is **partner approval lead time + recurring platform fees**, not code — because one FHIR `DocumentReference` writer serves them all.

---

## Source email — registration & feasibility

| Platform | Mechanism | Mailbox scoping | Registration | Verification / cost | Notes |
|---|---|---|---|---|---|
| **Microsoft 365** | Graph **app-only** `Mail.Read` | **RBAC for Applications** (replaces Application Access Policies) — limit the app to specific mailboxes | Entra app + **admin consent** (we already have a multi-tenant Entra app) | **No** Microsoft 365 Certification for single-tenant internal use | Cloud-native; **removes the PAD/Windows dependency** entirely |
| **Google Workspace** | Service account + **domain-wide delegation** | DWD grant scoped per service account; impersonate the target mailbox | Customer **super admin** pastes client ID + `gmail.readonly` scope in Admin console (Security → API controls → DWD) | **DWD model avoids the annual CASA Tier-2 security assessment** that public restricted-scope apps require | `gmail.readonly` is a *restricted* scope — the DWD/internal path sidesteps the OAuth consent screen. **Confirm with Google** for a multi-customer SaaS posture |

**Key finding:** the per-customer **domain-wide-delegation / app-only** model keeps email-side registration *light and admin-granted* — no app-store certification, no paid security assessment — provided we don't ship a public OAuth-consent app using restricted Gmail scopes.

---

## Patient matching — the top clinical risk

Delivering *into* a PMS requires resolving the document to the **right patient record**. The product searches the PMS (FHIR `Patient?family=…&birthdate=…&identifier=<Medicare>`) before writing. This is the inverse of today's Genie flow (which lets Genie match on import). **Wrong-patient delivery is the highest-severity failure mode** — mitigations: require exact Medicare/DOB+name match for auto-deliver, divert ambiguous matches to the existing manual-review loop, and keep a human-confirm step for low-confidence matches (mirrors the eligibility gate already in code).

---

## Compliance / data residency (carry over existing posture)

- Patient data stays **in-AU**: Bedrock AU inference profiles (`ap-southeast-2`/`-4`), DynamoDB Sydney, PDFs in-memory only (per costs doc §8).
- On-prem PMSs (Bp/Zedmed via Halo Link) keep data on-prem; cloud PMSs (Helix, Gentu, MediRecords) are AU-hosted — **verify each vendor's residency** before write-back.
- Halo Connect retains no patient data and operates in-AU.
- Privacy Act 1988 / **APP 8** (cross-border) — no patient data leaves AU; document this per connector.

---

## Rough phasing (gated by partner-approval lead time, not code)

- **Phase 0 — Validate & apply early.** Pick the first non-Genie target by *actual* customer demand. **Submit Bp Partner + Telstra Health partner applications immediately** (approval is the long pole). Confirm Gmail DWD posture with Google.
- **Phase 1 — Delivery abstraction + FHIR writer.** Introduce `DeliveryConnector`; refactor Genie into it (no behaviour change); build `FhirDocumentReferenceWriter` + patient-match against a FHIR sandbox.
- **Phase 2 — Halo Connect (Bp + Zedmed).** Biggest market reach for one build. Includes Halo Link agent + pairing-code onboarding flow.
- **Phase 3 — Cloud-native source connectors.** MS365 Graph (retire PAD dependency) + Google Workspace, both normalising to `/api/convert`. Add per-connector token allow-list to `pad-auth.ts`.
- **Phase 4 — MD/Helix Smart API+ and MediRecords.** Same FHIR writer, new auth + registration.

Each phase is independently shippable; destination and source axes can proceed in parallel.

---

## Open questions / decisions for the strategy doc

1. **Commercial model** — BJC's 10c/doc single-practice pricing won't fund partner fees ($500/mo Genie API, Halo Connect terms, Connect bundle). A multi-PMS product needs its own pricing/packaging.
2. **5th PMS slot** — MediRecords (GP-cloud) vs Clinic to Cloud (specialist) — depends on target customer segment.
3. **Genie Partner API vs file-drop** — when does paid API access ($500/mo or 20%) beat the free HL7 file-drop? Likely only when targeting cloud Gentu practices.
4. **Multi-tenancy** — per-customer credential isolation (connector tokens, service-account keys, Halo pairing codes) needs a secrets store + tenant model the current single-practice build lacks.
5. **Push vs poll** for email — start polling; revisit Graph/Gmail push if latency matters.

---

## Verification / next steps (deliverable = a doc)

1. On approval, write the polished strategy to **`docs/strategy/connectors-feasibility.md`** (and copy the plan to `docs/plans/` per repo convention).
2. Optionally render a branded stakeholder PDF via the **`markdown-to-pdf`** skill.
3. Before any build commits: **confirm the registration facts directly with each vendor** (links in Sources) — partner terms and fees change, and approval lead times drive the whole roadmap.

### Sources
- Best Practice / Halo Connect mandate: kb.bpsoftware.net (Bp Partner Network, Halo Connect FAQ); bestpracticesoftware.com (Partner Network changes)
- Halo Connect: haloconnect.io (platform, FAQ, FHIR for Bp), docs.haloconnect.io
- MedicalDirector / Helix Smart API+: telstrahealth.com (Smart API+, Helix); medicaldirector.com
- Genie / Gentu Partner API: docs.geniesolutions.io (Partner API, FAQ — $500/mo or 20%); magentus.com (developer partners)
- Zedmed: zedmed.com.au (Halo Connect interoperability); MediRecords: connect.medirecords.com, fhir.medirecords.com
- Gmail DWD / restricted scopes / CASA: developers.google.com (restricted-scope verification, OAuth consent), support.google.com (domain-wide delegation)
- MS Graph Mail.Read / RBAC for Applications: learn.microsoft.com (permissions reference); office365itpros.com, c7solutions.com
