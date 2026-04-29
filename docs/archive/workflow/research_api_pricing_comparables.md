# PDF-to-HL7 API Pricing Comparables — Market Research

_Generated: 2026-04-01 | Sources: 25+ | For: BJC Health pricing context_

---

## Executive Summary

Pricing for services comparable to "PDF upload -> AI extraction -> structured output" spans a wide range depending on whether you look at raw infrastructure (cloud OCR APIs at fractions of a cent per page), document AI platforms ($0.01-0.66 per document), or healthcare-specific integration platforms ($0.08+ per transaction with $35K+ annual platform fees). Our BJC Health service sits in a unique intersection: healthcare-domain AI extraction + HL7 message generation + Genie-specific formatting.

**Key finding:** There is no direct public comparable for a "PDF-to-HL7 conversion API" sold as a SaaS product. The closest comparables are either (a) document AI extraction APIs that output JSON (not HL7), or (b) healthcare integration platforms that route existing HL7 messages but don't create them from PDFs. Our service combines both.

---

## 1. Healthcare HL7/FHIR Integration Platforms

These companies route, translate, and manage healthcare messages between systems. They charge for message throughput, not document extraction.

| Company | What They Do | Pricing Model | Per-Unit Cost |
|---------|-------------|---------------|---------------|
| **Redox** | HL7/FHIR API integration platform (EHR connectivity) | Platform fee + per-API-call | ~$0.08/API call; ~$35K-45K/yr platform fee + $7-12K per EHR connection |
| **Google Cloud Healthcare API** | FHIR/HL7v2/DICOM data store and routing | Per-operation | ~$0.01/1,000 operations (standard); $0.99/100K for advanced ops; 25K free/mo |
| **Rhapsody / Corepoint** | Integration engine (on-prem/cloud) | Annual license per server, flat fee (no per-message) | Enterprise pricing, not public; flat annual license per communication point |
| **Mirth Connect (NextGen)** | Integration engine (now commercial-only from v4.6) | Annual license per server, tiered | Flat annual license, no per-interface fees; pricing not public |
| **1upHealth** | Patient data API (FHIR) | Per-API-call (fractions of a cent) | Custom pricing; described as "fractions of a cent per API call" |
| **Particle Health** | Patient record retrieval API | Per-query | Custom pricing; not publicly disclosed |
| **Metriport** | Open-source FHIR API (300M+ patients) | Per-patient or per-query | Custom pricing; not publicly disclosed |

**Takeaway:** Healthcare integration platforms are either (a) enterprise-priced at $35K+/year with per-transaction fees around $0.05-0.10, or (b) message-routing infrastructure at fractions of a cent per operation. None of them do what our service does (extract from PDF + generate HL7).

---

## 2. Document AI / PDF Extraction APIs (Cloud Providers)

These are the raw OCR/extraction building blocks. They extract text or structured fields from documents but output JSON, not HL7.

| Company | Service | Per-Page Cost | Notes |
|---------|---------|---------------|-------|
| **Google Document AI** | Enterprise OCR | $0.0015/page (first 5M); $0.0006/page (5M+) | Basic text extraction |
| **Google Document AI** | Form Parser / Custom Extractors | $0.02-0.03/page | Structured field extraction |
| **Google Document AI** | Layout Parser | $0.01/page | Document layout understanding |
| **AWS Textract** | Detect Document Text (OCR) | $0.0015/page (first 1M); $0.0006/page (1M+) | Basic text extraction |
| **AWS Textract** | Analyze Document (forms/tables) | $0.065/page (first 1M); $0.05/page (1M+) | Structured extraction |
| **AWS Textract** | Custom Queries | $0.025/page | Natural language queries against documents |
| **Azure Document Intelligence** | Read/OCR | $0.0015/page | Basic text extraction |
| **Azure Document Intelligence** | General Document model | ~$0.0125/page | Pre-built structured extraction |
| **Azure Document Intelligence** | Invoice/Receipt models | $0.001/invoice | Specialized document types |

**Takeaway:** Raw cloud OCR is extremely cheap ($0.001-0.003/page). Structured extraction with field mapping costs 10-50x more ($0.01-0.065/page). These are building blocks, not end-to-end solutions.

---

## 3. Specialized Document AI Platforms (Startups/SaaS)

These offer higher-level document extraction with better developer experience, pre-built models, and more intelligence than raw OCR APIs.

| Company | What They Do | Pricing Model | Per-Unit Cost |
|---------|-------------|---------------|---------------|
| **Mindee** | Document parsing API (invoices, receipts, IDs) | Per-page | Free: 25 pages/mo; then $0.05-0.10/page; custom at volume |
| **Nanonets** | AI document processing + workflow | Per-page / per-block-run | ~$0.30/page (Starter); Pro at $999/mo per workflow |
| **Reducto** | LLM-optimized document parser | Per-page (credits) | $0.015/page for parsing |
| **LandingAI** | Agentic document extraction | Per-page | $0.03/page |
| **Sensible** | Developer document extraction API | Per-document (not per-page) | $499/mo for 750 docs = ~$0.66/doc; 100 free/mo |
| **Docsumo** | Intelligent document processing | Per-page | $0.30/page (Growth); from $25/mo for low volume |
| **Rossum** | AI document processing for transactional workflows | Annual subscription + per-transaction | From $18K/yr (~$1,500/mo); $0.02-0.30/page depending on volume |
| **V7 (V7 Labs)** | AI document extraction platform | Custom quotes | Not public; requires consultation |

**Takeaway:** Purpose-built document AI platforms charge $0.015-0.66 per document/page, with the median around $0.05-0.30 per document. These extract structured data but none produce HL7 output.

---

## 4. LLM-Based Document Extraction (Our Approach)

Our service uses Bedrock Claude Sonnet for vision-based extraction. Here's what that costs us and what the market charges for similar LLM-powered extraction.

### Our Cost of Goods (Bedrock Claude Sonnet 4.6)

| Factor | Value |
|--------|-------|
| Input token pricing | $3.00 / 1M tokens |
| Output token pricing | $15.00 / 1M tokens |
| Tokens per PDF page | ~1,500-3,000 (input) |
| Output tokens per extraction | ~500-1,500 |
| **Cost per 1-page PDF** | **~$0.005-0.015** (input) + ~$0.008-0.023 (output) = **~$0.013-0.038** |
| **Cost per typical 2-3 page referral** | **~$0.03-0.10** |
| Batch inference discount | 50% off on-demand rates |

### Market Pricing for LLM-Based Extraction

| Approach | Cost Per Document | Notes |
|----------|-------------------|-------|
| Direct LLM API (Claude/GPT) | $0.20-1.00+ per document | General-purpose, no pre-built extraction logic |
| LLM + structured extraction platform | $0.05-0.30 per document | Reducto, LandingAI, Nanonets |
| Our Bedrock cost (COGS) | ~$0.03-0.10 per referral | Vision extraction + classification |
| Our total infra cost (hosting + AI) | ~$0.06-0.12 per referral | Including Amplify compute |

---

## 5. Summary Comparison Table

| Category | Company/Approach | Per-Document Cost | What You Get |
|----------|-----------------|-------------------|-------------|
| **Raw OCR** | Google/AWS/Azure OCR | $0.001-0.003 | Plain text, no structure |
| **Structured extraction** | AWS Textract Analyze | $0.05-0.065 | Forms/tables as JSON |
| **Structured extraction** | Google Doc AI Custom | $0.02-0.03 | Custom fields as JSON |
| **Document AI platform** | Mindee | $0.05-0.10 | Pre-built models, JSON output |
| **Document AI platform** | Reducto | $0.015 | LLM-optimized parsing |
| **Document AI platform** | Sensible | ~$0.66 | Per-document, any type |
| **Document AI platform** | Nanonets | $0.30 | AI extraction + workflows |
| **Document AI platform** | Docsumo | $0.30 | IDP with validation |
| **LLM direct** | Claude/GPT raw | $0.20-1.00+ | Unstructured, flexible |
| **Healthcare integration** | Redox | $0.08/call + $35K+/yr | HL7/FHIR routing (not creation) |
| **Healthcare integration** | Google Healthcare API | ~$0.00001/op | FHIR store/routing only |
| **Our COGS** | Bedrock + Amplify | ~$0.06-0.12 | Full PDF-to-HL7 with AI extraction |

---

## 6. What This Means for Pricing Our Service

### As an API product (if we ever sell per-transaction)

Based on the market data, reasonable per-transaction pricing for a "PDF in, HL7 out" API would be:

| Pricing Tier | Per-Conversion Price | Rationale |
|-------------|---------------------|-----------|
| Budget/commodity | $0.25-0.50 | Competes with document AI platforms; thin margin |
| Mid-market | $0.50-1.00 | Healthcare premium over generic doc AI; reflects domain expertise |
| Premium/healthcare | $1.00-2.50 | Comparable to Redox per-transaction; HL7 compliance + AI extraction |
| Enterprise | $2.00-5.00+ | Custom HL7 profiles, guaranteed SLAs, compliance certifications |

### Healthcare premium justification

- Generic document AI: $0.05-0.30/doc (no healthcare knowledge)
- Healthcare integration: $0.08/call + platform fees (no document extraction)
- Our service combines both: AI extraction + healthcare-specific output
- Healthcare SaaS commands a 15-30% premium over horizontal competitors
- Compliance, audit trails, and Australian data residency add further value

### For BJC Health specifically

At ~$0.06-0.12/referral COGS and $330/mo all-in running costs:
- At 500 referrals/month: effective cost is ~$0.66/referral (including retainer)
- At 700 referrals/month: effective cost is ~$0.47/referral
- This compares favourably to $1.50-2.50/referral in manual staff time
- And well below what any healthcare integration platform would charge for equivalent functionality

---

## Sources

- [Redox Pricing (Vendr)](https://www.vendr.com/marketplace/redox)
- [Redox Integration Guide (Invene)](https://www.invene.com/blog/redox-integration)
- [Google Document AI Pricing](https://cloud.google.com/document-ai/pricing)
- [AWS Textract Pricing](https://aws.amazon.com/textract/pricing/)
- [Azure Document Intelligence Pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/)
- [Mindee Pricing](https://www.mindee.com/pricing)
- [Nanonets Pricing](https://nanonets.com/pricing)
- [Reducto Pricing](https://reducto.ai/pricing)
- [LandingAI Pricing](https://landing.ai/pricing-agentic-apis)
- [Sensible Pricing](https://www.sensible.so/pricing)
- [Docsumo Pricing](https://www.docsumo.com/pricing)
- [Rossum Pricing](https://rossum.ai/pricing/)
- [Google Cloud Healthcare API Pricing](https://cloud.google.com/healthcare-api/pricing)
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Mirth Connect Licensing (NextGen)](https://www.nextgen.com/solutions/interoperability/mirth-integration-engine)
- [Mindee: LLM vs OCR Cost Comparison](https://www.mindee.com/blog/llm-vs-ocr-api-cost-comparison)
- [HL7 vs API Integration Costs (Enter Health)](https://www.enter.health/post/hl7-implementation-costs-vs-api-integration-costs-rcm-leaders)
- [Healthcare API Transaction Costs (Oreate AI)](https://www.oreateai.com/blog/navigating-the-shifting-tides-of-healthcare-api-pricing-a-look-at-transaction-costs/f9cdfd09ffa06efe0fa6167425e53fc9)
- [B2B SaaS AI Pricing Predictions (Ibbaka)](https://www.ibbaka.com/ibbaka-market-blog/b2b-saas-and-agentic-ai-pricing-predictions-for-2026)

---

_Prepared for BJC Health pricing context | April 2026_
