"use client";

import Link from "next/link";
import { AppFooter } from "../components/AppFooter";
import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";
import { SectionHeader } from "../components/ui/SectionHeader";

interface ComplianceSection {
  icon: React.ReactNode;
  title: string;
  items: { label: string; detail: string }[];
}

const ShieldIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const ServerIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
  </svg>
);

const LockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const DocumentIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4 text-[var(--success)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

export default function CompliancePage() {
  const sections: ComplianceSection[] = [
    {
      icon: <ShieldIcon />,
      title: "Privacy Act 1988 & Australian Privacy Principles",
      items: [
        {
          label: "Health information handled with highest protections",
          detail:
            "All patient data processed by this tool is classified as \"health information\" under s 6FA of the Privacy Act 1988 (Cth). This includes names, dates of birth, Medicare numbers, and clinical content \u2014 all of which attract the strictest privacy protections as \"sensitive information\" under the Act.",
        },
        {
          label: "No persistent data storage (APP 11)",
          detail:
            "PDF documents are processed in-memory only. Patient data is extracted, converted to HL7 format, and returned in the same request. No patient information is written to disk, database, or any persistent storage. Once the response is returned, all in-memory data is released.",
        },
        {
          label: "Purpose limitation (APP 6)",
          detail:
            "Uploaded documents are used solely for the purpose of generating HL7 messages. Data is not repurposed, shared with third parties, or used for any secondary purpose. This tool acts as a processor on behalf of the health practice.",
        },
        {
          label: "Data minimisation (APP 3)",
          detail:
            "Only the minimum patient data fields required for HL7 message generation are extracted: name, date of birth, sex, Medicare number, and referring/receiving provider details.",
        },
        {
          label: "Notifiable Data Breaches scheme",
          detail:
            "As a transient processing tool with no persistent data storage, the risk of an eligible data breach is minimised. A data breach response plan is maintained in accordance with Part IIIC of the Privacy Act.",
        },
      ],
    },
    {
      icon: <GlobeIcon />,
      title: "Data Sovereignty & Australian Infrastructure",
      items: [
        {
          label: "Australian AWS infrastructure",
          detail:
            "The application is deployed on AWS Amplify in the ap-southeast-2 (Sydney) region. Bedrock is invoked through the Australian inference profile and may process within Australian AWS regions, including Sydney and Melbourne.",
        },
        {
          label: "IRAP PROTECTED-assessed infrastructure",
          detail:
            "AWS services used by this tool, including Amazon Bedrock, are assessed at the PROTECTED level under the Australian Government\u2019s Information Security Registered Assessors Program (IRAP). This is the standard required for government systems handling sensitive information.",
        },
        {
          label: "AI processing stays in Australia",
          detail:
            "Document classification and data extraction uses AWS Bedrock through Australian regional infrastructure. AWS Bedrock does not store or log prompts and completions, and does not use customer data for model training.",
        },
        {
          label: "No cross-border data transfer (APP 8)",
          detail:
            "Patient data is not transferred to overseas recipients. All processing infrastructure, including AI services, operates within Australian borders. AWS contractual commitments and IRAP assessment provide reasonable steps under APP 8.",
        },
      ],
    },
    {
      icon: <LockIcon />,
      title: "Access Control & Security (APP 11)",
      items: [
        {
          label: "Password-protected access",
          detail:
            "The application requires authentication before any features are accessible. Only authorised practice staff with the access password can upload documents or generate HL7 messages.",
        },
        {
          label: "HTTPS encryption in transit",
          detail:
            "All data transmitted between the browser and server is encrypted using TLS. PDF uploads and HL7 downloads are protected against interception. AWS Bedrock API calls are also encrypted in transit.",
        },
        {
          label: "Secure session management",
          detail:
            "Authentication uses httpOnly cookies that cannot be accessed by client-side scripts. Sessions expire after 7 days, requiring re-authentication.",
        },
        {
          label: "No server-side logging of patient data",
          detail:
            "Application logs capture operational events (errors, performance metrics) but do not record patient names, Medicare numbers, dates of birth, or any extracted health information.",
        },
      ],
    },
    {
      icon: <SparklesIcon />,
      title: "AI Transparency",
      items: [
        {
          label: "AI used for data extraction only",
          detail:
            "AWS Bedrock (Claude AI) is used to classify document types and extract structured patient data from PDF documents. AI is not used for clinical decision-making. Extracted data is presented to the operator for review before HL7 generation.",
        },
        {
          label: "No AI training on patient data",
          detail:
            "AWS Bedrock does not retain, log, or learn from patient data processed through this tool. Customer data is not used to improve or train any AI models.",
        },
        {
          label: "Operator review before output",
          detail:
            "Extracted patient data is displayed on-screen for the operator to verify before the HL7 file is generated. The operator can correct the document type classification if the AI detection is incorrect.",
        },
      ],
    },
    {
      icon: <ServerIcon />,
      title: "Transient Processing Architecture",
      items: [
        {
          label: "Stateless request handling",
          detail:
            "Each PDF conversion is an independent, stateless request. The server does not maintain any patient data between requests. The application does not use a database, file storage, or caching layer for patient information.",
        },
        {
          label: "Client-side download",
          detail:
            "The generated HL7 file is delivered directly to the user\u2019s browser as a download. The file exists only in the server\u2019s response stream and is not retained server-side.",
        },
        {
          label: "No data retained on access request (APP 12)",
          detail:
            "Because patient data is not persistently stored, there is no data to access or correct after processing. This is documented in accordance with APP 12 and APP 13.",
        },
      ],
    },
    {
      icon: <DocumentIcon />,
      title: "HL7 & Clinical Standards",
      items: [
        {
          label: "ADRM-compliant HL7 v2.4 messages",
          detail:
            "Generated messages conform to the Australian Diagnostics and Referral Messaging standard (HL7AUSD-STD-OO-ADRM-2021.1), the Australian localisation of HL7 v2.4 used by pathology, radiology, and referral messaging systems.",
        },
        {
          label: "Genie clinical software compatible",
          detail:
            "Output format is designed for import into Genie practice management software, including correct segment structure (MSH, PID, PV1, OBR, OBX), Australian field conventions, and configurable auto-filing and doctor routing.",
        },
        {
          label: "Medicare number formatting",
          detail:
            "Medicare numbers are formatted per AUSHIC standards (number-reference^^^AUSHIC^MC) with proper identifier type coding. Provider numbers use the AUSHICPR assigning authority.",
        },
        {
          label: "Original PDF preserved",
          detail:
            "The complete original PDF document is embedded as Base64 within the HL7 message (OBX segment with AUSPDI coding), ensuring no loss of clinical information during conversion.",
        },
      ],
    },
  ];

  return (
    <>
      <AppNav />
      <main className="min-h-screen flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-[680px]">
          <LogoStrip />

          {/* Main card */}
          <div className="card mt-4 animate-fade-in-up stagger-1">
          {/* Header */}
          <div className="px-7 pt-7 pb-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--blue-50)] border border-[var(--blue-200)] text-[var(--bjc-blue)]">
                <ShieldIcon />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  Data Handling & Compliance
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  How this application protects patient information
                </p>
              </div>
            </div>
          </div>

          <div className="divider-subtle" />

          {/* Intro */}
          <div className="px-7 pt-5 pb-2">
            <div className="p-4 rounded-xl bg-[var(--info-bg)] border border-[var(--info-border)]">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                This application is a <strong>transient document conversion tool</strong> that
                processes PDF uploads in-memory, extracts patient data using Australian-hosted AI,
                generates an HL7 message, and returns it immediately.{" "}
                <strong>No patient data is stored</strong> on the server at any point. All
                infrastructure operates within Australia on IRAP PROTECTED-assessed AWS services.
              </p>
            </div>
          </div>

          {/* Sections */}
          <div className="px-7 py-5 space-y-6">
            {sections.map((section, sectionIdx) => (
              <div
                key={sectionIdx}
                className="animate-fade-in"
                style={{ animationDelay: `${0.08 * (sectionIdx + 1)}s` }}
              >
                <div className="mb-3">
                  <SectionHeader icon={section.icon} title={section.title} />
                </div>
                <div className="card-inner p-4 space-y-3">
                  {section.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="flex gap-3">
                      <CheckIcon />
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {item.label}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-0.5">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="divider-subtle" />

          {/* Practice responsibility notice */}
          <div className="px-7 py-5 space-y-4">
            <div className="card-inner p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                Practice responsibility
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                This tool acts as a data processor on behalf of the health practice. The uploading
                practice remains the primary entity responsible for patient consent, privacy
                obligations, and compliance with the Privacy Act 1988 (Cth), applicable state health
                records legislation (including the Health Records and Information Privacy Act 2002 for
                NSW practices), and AHPRA professional standards. Practices should ensure their own
                privacy policies cover the use of third-party document processing tools.
              </p>
            </div>

            <div className="card-inner p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                Important notice
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                This page describes the technical data handling measures implemented in this
                application. It is provided for informational purposes and does not constitute legal
                advice. Healthcare organisations should conduct their own privacy impact assessment as
                appropriate. See our{" "}
                <Link
                  href="/privacy"
                  className="text-[var(--bjc-blue)] hover:underline font-medium"
                >
                  Privacy Policy
                </Link>{" "}
                for full details on how personal information is handled.
              </p>
            </div>
          </div>
        </div>

        <AppFooter />
        </div>
      </main>
    </>
  );
}
