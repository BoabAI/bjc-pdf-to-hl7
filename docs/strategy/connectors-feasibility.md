# Connectors Strategy & Feasibility — "PDF → any inbox → any PMS"

**Prepared by SMEC AI · May 2026 · Strategy / feasibility (not a committed build plan)**

---

## Executive summary

SMEC AI has a working, contracted pipeline for BJC Health that ingests PDFs from **Microsoft 365** mailboxes (via Power Automate Desktop), classifies and extracts them with AI, and delivers them into **Genie** as **HL7 v2.4** via a file-drop. This document explores generalising that one-off into a **product**: ingest from **any inbox** (Google Workspace *and* Microsoft 365) and **deliver converted documents into the top 5 Australian practice management systems (PMSs)** — with a focus on what **registration/approval** each system requires.

Three findings drive the whole picture:

1. **Halo Connect collapses the on-prem heavyweights into one integration.** From **1 January 2026, Halo Connect is the only sanctioned way to integrate with Best Practice (Bp Premier, ~60–65% of GP)**, and it also covers **Zedmed**. Two systems, one FHIR integration.
2. **"Top 5 PMS" decomposes to ~4 FHIR integrations, and a single FHIR `DocumentReference` writer serves nearly all of them.** The dominant cost is **partner approval lead time + recurring platform fees, not code**.
3. **The email side is light.** Microsoft Graph (app-only, per-mailbox RBAC) and Gmail (service-account domain-wide delegation) avoid app-store certification and the paid annual Google CASA security assessment — provided we use the admin-granted delegation model rather than a public OAuth-consent app.

This sits **beyond the contracted BJC scope** — multi-PMS integration is explicitly a paid §6 Variation in `docs/business/bjc-pdf-to-hl7-costs-v2.md` — so it should be evaluated as a product investment with its own commercial model.

---

## The two connector axes

"Connector" spans two independent edges of the pipeline. The core (classify → extract → eligibility gate → build message → audit) does **not** change.

```
 SOURCE connectors            CORE (unchanged)                 DESTINATION connectors
 ┌──────────────────┐    ┌──────────────────────────┐    ┌────────────────────────────┐
 │ MS365 (Graph)    │    │ /api/convert             │    │ Genie    (HL7 file-drop) ✅ │
 │ Google Workspace │ ─► │  classify (Bedrock)      │ ─► │ Bp Premier (Halo Connect)   │
 │ manual upload ✅ │    │  extract → eligibility   │    │ Zedmed     (Halo Connect)   │
 └──────────────────┘    │  build HL7 / FHIR        │    │ MD / Helix (Smart API+)     │
                         │  audit                    │    │ MediRecords (FHIR)          │
                         └──────────────────────────┘    └────────────────────────────┘
```

- **Source connectors (email):** where PDFs come *from*. Naming both Google Workspace and MS365 is a product signal — prospects may run Google even though BJC is M365-only.
- **Destination connectors (PMS):** where the converted document *goes*. The intent here is **delivering documents INTO each PMS** (generalising today's Genie file-drop), with a light patient-matching read-back as a pre-step.

---

## What already exists — reuse, don't rebuild

Verified in the current codebase; the ingestion contract is essentially **already a connector API**:

- **`app/api/convert/route.ts`** — accepts `X-Source: email`, `X-Source-Mailbox: <address>`, `Authorization: Bearer <PAD_TOKEN>`. Any new source connector just POSTs here.
- **`lib/pad-auth.ts`** (`isPadAuthenticated`) — service-to-service bearer auth. Today a **single shared `PAD_TOKEN`**; a multi-connector product needs a per-connector token allow-list (small change).
- **`lib/conversion-config.ts`** (`MAILBOX_CATEGORIES`, `mailboxCategoryFor`, `allowedDocTypesForCategory`) — mailbox→category routing that constrains classification. New mailboxes are a one-line code change today; a product moves this to per-tenant config.
- **Eligibility gate + manual-review feedback loop** (`lib/convert-service.ts`) — already returns `suggestedCategory` for low-confidence/mismatch cases. Reusable as-is, and directly relevant to the patient-match safety step below.
- **HL7 builder** (`lib/hl7-builder.ts`) — the Genie destination format. A product adds a **FHIR builder** alongside it.
- **Multi-tenant Entra app** for SSO already exists (Boab AI tenant) — a head start for the MS365 source connector.

**Implication:** the source-connector axis is mostly plumbing onto an existing contract. The destination-connector axis is the genuinely new engineering (FHIR write-back + per-vendor auth/registration).

---

## Target architecture

### Destination: FHIR is the lingua franca
Every modern AU PMS integration is **FHIR (AU Base, R4)**. Genie's HL7 file-drop is the legacy exception we already own. The product introduces a **delivery abstraction**:

```ts
interface DeliveryConnector {
  matchPatient(demographics): Promise<PatientRef | Candidates>; // FHIR Patient search
  deliver(doc: ConvertedDocument, patient: PatientRef): Promise<DeliveryReceipt>;
}
```

- **Genie** → keep the existing HL7 file-drop (free and built).
- **Everything else** → one **`FhirDocumentReferenceWriter`**: wrap the converted PDF as a base64 `DocumentReference.content.attachment` (and `Communication`/`ServiceRequest` for referrals), tied to a matched `Patient`. Per-vendor differences collapse to **auth + base URL + minor profile quirks**.

### The Halo Connect unlock
Halo Connect is an interoperability layer (FHIR + SQL, one on-prem "Halo Link" agent) that, **from 1 Jan 2026, is the only sanctioned route into Bp Premier** (pairing codes mandatory 1 Feb 2026), and **also covers Zedmed**. It retains no patient data and operates in-AU. So Bp (~60%) + Zedmed are **one connector, not two**.

### Source: cloud-native email connectors
Normalise to the existing `/api/convert` contract:
- **MS365** via Microsoft Graph (removes the on-prem Windows/PAD dependency).
- **Google Workspace** via Gmail API.
- Start with **polling** (5–15 min) before push (Graph change notifications / Gmail Pub/Sub) — simpler, no inbound firewall exposure.

---

## Destination PMS — registration & feasibility

Market share is approximate (GP segment; the specialist market skews to Genie).

| PMS | ~Market | Integration path | API | Registration gate | Recurring fee | Notes / gotchas |
|---|---|---|---|---|---|---|
| **Best Practice (Bp Premier)** | ~60–65% GP | **Halo Connect** (mandatory from Jan 2026) | FHIR + SQL | Approved **Bp Partner** + Halo Connect onboarding | Halo Connect commercial terms (per-integration) | On-prem **Halo Link agent** per practice; pairing code per practice (7-day validity) |
| **Zedmed** | ~third place | **Halo Connect** (same as Bp) | FHIR | Bp Partner / Halo Connect (shared) | Shared with Halo Connect | **Same connector as Bp** — 2 systems, 1 build |
| **MedicalDirector / Helix** | ~25% | Telstra Health **Smart API+** | FHIR (native) | Telstra Health **partner program** (express interest; MD Clinical case-by-case) | TBC with Telstra Health | Helix = cloud (full API); legacy MD Clinical limited/case-by-case |
| **Genie / Gentu** | specialist leader | (a) **HL7 file-drop** ✅ built/free · (b) **Genie Partner API** | FHIR + OAuth2 | Developer Partner program + assessment + Marketplace listing (API path) | **$500/mo or 20% rev-share** (whichever higher) for Partner API | Keep file-drop for on-prem Genie; Partner API needed for cloud Gentu |
| **MediRecords** | emerging cloud | MediRecords **Connect** | FHIR R4 | Purchase **Connect** bundle (contact success@medirecords.com) | Paid Connect bundle | Cloud-native; cleanest FHIR but smallest install base |

> **Alternative 5th slot:** In the *specialist* market (BJC's segment), **Clinic to Cloud** may matter more than MediRecords — confirm against the actual target customer base.

**Net — "Top 5 PMS" = ~4 FHIR integrations:**
1. **Halo Connect** → Bp + Zedmed (largest reach; needs partner approval + on-prem agent)
2. **Genie/Gentu** → keep HL7 file-drop; add Partner API only if cloud Gentu demand justifies the fee
3. **Smart API+** → MD / Helix
4. **MediRecords FHIR** (or Clinic to Cloud)

One FHIR `DocumentReference` writer serves them all; the cost is partner approval and recurring fees.

---

## Source email — registration & feasibility

| Platform | Mechanism | Mailbox scoping | Registration | Verification / cost | Notes |
|---|---|---|---|---|---|
| **Microsoft 365** | Graph **app-only** `Mail.Read` | **RBAC for Applications** (replaces Application Access Policies) — limit the app to specific mailboxes | Entra app + **admin consent** (multi-tenant Entra app already exists) | **No** Microsoft 365 Certification for single-tenant internal use | Cloud-native; **removes the PAD/Windows dependency** |
| **Google Workspace** | Service account + **domain-wide delegation (DWD)** | DWD grant scoped per service account; impersonate the target mailbox | Customer **super admin** pastes client ID + `gmail.readonly` scope in Admin console (Security → API controls → DWD) | **DWD model avoids the annual CASA Tier-2 security assessment** that public restricted-scope apps require | `gmail.readonly` is a *restricted* scope; the DWD/internal path sidesteps the OAuth consent screen. **Confirm with Google** for a multi-customer SaaS posture |

**Key finding:** the per-customer **domain-wide-delegation / app-only** model keeps email-side registration *light and admin-granted* — no app-store certification, no paid security assessment — as long as we don't ship a public OAuth-consent app using restricted Gmail scopes.

---

## Patient matching — the top clinical risk

Delivering *into* a PMS requires resolving the document to the **right patient record**. The product searches the PMS (`Patient?family=…&birthdate=…&identifier=<Medicare>`) before writing — the inverse of today's Genie flow, which lets Genie match on import. **Wrong-patient delivery is the highest-severity failure mode.** Mitigations:
- require an exact Medicare (or DOB + name) match for auto-deliver;
- divert ambiguous matches to the **existing manual-review loop**;
- keep a human-confirm step for low-confidence matches (mirrors the eligibility gate already in code).

---

## Compliance / data residency

- Patient data stays **in-AU**: Bedrock AU inference profiles (`ap-southeast-2`/`-4`), DynamoDB Sydney, PDFs in-memory only (per costs doc §8).
- On-prem PMSs (Bp/Zedmed via Halo Link) keep data on-prem; cloud PMSs (Helix, Gentu, MediRecords) are AU-hosted — **verify each vendor's residency** before write-back.
- Halo Connect retains no patient data and operates in-AU.
- Privacy Act 1988 (Cth) / **APP 8** (cross-border disclosure) — document per connector that no patient data leaves AU.

---

## Rough phasing (gated by partner-approval lead time, not code)

- **Phase 0 — Validate & apply early.** Pick the first non-Genie target by *actual* customer demand. **Submit Bp Partner + Telstra Health partner applications immediately** (approval is the long pole). Confirm the Gmail DWD posture with Google.
- **Phase 1 — Delivery abstraction + FHIR writer.** Introduce `DeliveryConnector`; refactor Genie into it (no behaviour change); build `FhirDocumentReferenceWriter` + patient-match against a FHIR sandbox.
- **Phase 2 — Halo Connect (Bp + Zedmed).** Biggest market reach for one build; includes Halo Link agent + pairing-code onboarding.
- **Phase 3 — Cloud-native source connectors.** MS365 Graph (retire PAD dependency) + Google Workspace, both normalising to `/api/convert`; add the per-connector token allow-list to `pad-auth.ts`.
- **Phase 4 — MD/Helix Smart API+ and MediRecords.** Same FHIR writer, new auth + registration.

Each phase is independently shippable; source and destination axes can proceed in parallel.

---

## Open decisions

1. **Commercial model** — BJC's 10c/doc single-practice pricing won't fund partner fees ($500/mo Genie API, Halo Connect terms, Connect bundle). A multi-PMS product needs its own pricing/packaging.
2. **5th PMS slot** — MediRecords (GP-cloud) vs Clinic to Cloud (specialist), depending on target segment.
3. **Genie Partner API vs file-drop** — paid API ($500/mo or 20%) likely only worth it for cloud Gentu practices.
4. **Multi-tenancy** — per-customer credential isolation (connector tokens, service-account keys, Halo pairing codes) needs a secrets store + tenant model the single-practice build lacks.
5. **Push vs poll** for email — start polling; revisit Graph/Gmail push if latency matters.

---

## Sources

- Best Practice — Halo Connect mandate & Bp Partner Network: <https://kb.bpsoftware.net/bppremier/spectra/Integrations/HaloConnect/HaloConnectFAQ.htm>, <https://kb.bpsoftware.net/bppremier/spectra/Management/PartnerNetwork.htm>, <https://bestpracticesoftware.com/blog/important-changes-to-bp-partner-network-integrations/>
- Halo Connect: <https://haloconnect.io/>, <https://haloconnect.io/faq>, <https://haloconnect.io/blog/fhir-for-bp-premier>, <https://docs.haloconnect.io/>
- MedicalDirector / Helix — Smart API+: <https://www.telstrahealth.com/products/smart-api/>, <https://www.telstrahealth.com/products/helix/>, <https://www.medicaldirector.com/telstra-health-smart>
- Genie / Gentu — Partner API (incl. $500/mo or 20% fee): <https://docs.geniesolutions.io/genie-partner-api>, <https://docs.geniesolutions.io/genie-partner-api/getting-started/faq>, <https://www.magentus.com/practice-management/developer-partners/>
- Zedmed — Halo Connect interoperability: <https://www.zedmed.com.au/integrations/>, <https://zedmed.com.au/halo-connect-interoperability-platform/>
- MediRecords — Connect / FHIR: <https://connect.medirecords.com/our-apis/>, <https://fhir.medirecords.com/>, <https://support.medirecords.com/hc/en-us/articles/14028174756623-MediRecords-Connect-A-Simple-Introduction-to-APIs-Integration>
- Gmail — restricted scopes, DWD, CASA: <https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification>, <https://support.google.com/a/answer/162106>, <https://developers.google.com/workspace/gmail/api/auth/scopes>
- Microsoft Graph — Mail.Read & RBAC for Applications: <https://learn.microsoft.com/en-us/graph/permissions-reference>, <https://www.appgovscore.com/blog/how-to-restrict-microsoft-graph-api-access-to-mailboxes>, <https://c7solutions.com/2024/09/secure-access-to-mailboxes-via-graph>
