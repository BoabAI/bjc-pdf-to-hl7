"use client";

import Link from "next/link";
import { AppFooter } from "../components/AppFooter";
import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";

const EFFECTIVE_DATE = "20 March 2026";
const ENTITY_NAME = "SMEC AI";
const CONTACT_EMAIL = "info@smecai.au";

interface PolicySection {
  id: string;
  title: string;
  content: React.ReactNode;
}

export default function PrivacyPolicyPage() {
  const sections: PolicySection[] = [
    {
      id: "about",
      title: "1. About this Policy",
      content: (
        <>
          <p>
            This Privacy Policy describes how {ENTITY_NAME} (&ldquo;we&rdquo;,
            &ldquo;us&rdquo;, &ldquo;our&rdquo;) handles personal information in
            connection with the PDF to HL7 Converter application (&ldquo;the
            Application&rdquo;).
          </p>
          <p>
            This policy is provided in accordance with Australian Privacy Principle 1
            (APP 1) under the Privacy Act 1988 (Cth) and is made freely available to
            all users of the Application.
          </p>
          <p>
            The Application is a document conversion tool operated on behalf of
            healthcare practices. It converts patient PDF documents into HL7 v2.4
            format for import into clinical practice management software (Genie).
          </p>
        </>
      ),
    },
    {
      id: "information-collected",
      title: "2. Information We Collect",
      content: (
        <>
          <p>
            When a PDF document is uploaded for conversion, the Application
            temporarily processes the following types of personal information:
          </p>
          <ul>
            <li>
              <strong>Patient identifying information</strong> &mdash; name, date of
              birth, sex, address, and phone number
            </li>
            <li>
              <strong>Medicare number</strong> &mdash; extracted for inclusion in the
              HL7 message patient identification segment
            </li>
            <li>
              <strong>Clinical content</strong> &mdash; referral details, clinical
              notes, diagnoses, and other health information contained in the uploaded
              PDF
            </li>
            <li>
              <strong>Provider information</strong> &mdash; referring and receiving
              practitioner names and provider numbers
            </li>
          </ul>
          <p>
            All of this information is classified as &ldquo;health
            information&rdquo; under section 6FA of the Privacy Act 1988 and is
            treated as sensitive information attracting the highest level of privacy
            protection.
          </p>
          <p>
            We also collect the following non-patient information:
          </p>
          <ul>
            <li>
              <strong>Authentication credentials</strong> &mdash; the access password
              entered by the operator to use the Application
            </li>
            <li>
              <strong>Operational logs</strong> &mdash; error events, performance
              metrics, and request metadata. These logs do not contain patient names,
              dates of birth, Medicare numbers, or any extracted health information.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "how-collected",
      title: "3. How We Collect Information",
      content: (
        <>
          <p>
            Personal information is collected directly from the healthcare practice
            operator who uploads a PDF document through the Application&rsquo;s web
            interface.
          </p>
          <p>
            We do not collect personal information from patients directly. The
            healthcare practice using the Application is responsible for the patient
            relationship and for obtaining any necessary consent for the handling of
            patient health information.
          </p>
          <p>
            <strong>AI-assisted extraction:</strong> The Application uses Amazon Web
            Services (AWS) Bedrock, a cloud-based AI service, to classify uploaded
            documents and extract structured patient data from PDF content. This AI
            processing occurs through AWS Bedrock Australian regional infrastructure.
            AWS Bedrock does not store, log, or use patient data for model training.
          </p>
        </>
      ),
    },
    {
      id: "purpose",
      title: "4. Purpose of Collection",
      content: (
        <>
          <p>
            Personal information is collected and used for the sole purpose of:
          </p>
          <ul>
            <li>
              Classifying the type of uploaded document (consent form, referral
              letter, GP referral, or other)
            </li>
            <li>
              Extracting structured patient data from the PDF for inclusion in the
              HL7 message
            </li>
            <li>
              Generating an HL7 v2.4 message compliant with the Australian ADRM
              standard for import into Genie clinical software
            </li>
          </ul>
          <p>
            We do not use personal information for any secondary purpose, including
            marketing, analytics, profiling, research, or AI model training.
          </p>
        </>
      ),
    },
    {
      id: "storage-retention",
      title: "5. Storage and Retention",
      content: (
        <>
          <p>
            <strong>
              The Application does not persistently store patient data.
            </strong>
          </p>
          <p>
            All patient information is processed in-memory during the active HTTP
            request. Once the HL7 file is returned to the operator&rsquo;s browser,
            all patient data is released from server memory. No patient information is
            written to disk, database, cache, or any persistent storage system.
          </p>
          <p>
            The generated HL7 file is delivered as a browser download and is not
            retained on the server.
          </p>
          <p>
            Operational logs (which do not contain patient data) are retained in
            accordance with standard AWS CloudWatch log retention policies.
          </p>
        </>
      ),
    },
    {
      id: "disclosure",
      title: "6. Disclosure of Information",
      content: (
        <>
          <p>
            We do not disclose patient personal information to any third party.
          </p>
          <p>
            Patient data is transmitted to AWS Bedrock Australian regional infrastructure for AI-assisted
            extraction as part of the conversion process. AWS acts as a sub-processor
            under its standard customer agreement. AWS Bedrock does not retain or log
            the data, and does not use it for model training.
          </p>
          <p>
            We do not sell, rent, or share personal information with any other
            organisation for any purpose.
          </p>
        </>
      ),
    },
    {
      id: "overseas",
      title: "7. Overseas Disclosure (APP 8)",
      content: (
        <>
          <p>
            Data processing occurs within Australia using AWS infrastructure in
            Australian regions, including ap-southeast-2 (Sydney). Patient data is not intentionally
            transferred to any overseas recipient.
          </p>
          <p>
            AWS, as a global infrastructure provider headquartered in the United
            States, has operational staff in multiple countries. However, the AWS
            services used by this Application are IRAP-assessed at the PROTECTED
            level for supported Australian regions, and AWS contractual commitments provide
            reasonable steps to ensure data protection in accordance with APP 8.
          </p>
        </>
      ),
    },
    {
      id: "security",
      title: "8. Security Measures (APP 11)",
      content: (
        <>
          <p>
            We take reasonable steps to protect personal information from misuse,
            interference, loss, and unauthorised access, modification, or disclosure.
            Security measures include:
          </p>
          <ul>
            <li>
              <strong>Encryption in transit</strong> &mdash; all data transmitted
              between the browser and server uses TLS encryption. AWS Bedrock API
              calls are also encrypted in transit.
            </li>
            <li>
              <strong>Access control</strong> &mdash; the Application requires
              password authentication. Only authorised practice staff can access
              conversion features.
            </li>
            <li>
              <strong>Secure sessions</strong> &mdash; authentication uses httpOnly
              cookies inaccessible to client-side scripts, with automatic expiry after
              7 days.
            </li>
            <li>
              <strong>No patient data in logs</strong> &mdash; application logs do not
              record patient names, Medicare numbers, dates of birth, or clinical
              content.
            </li>
            <li>
              <strong>IRAP PROTECTED infrastructure</strong> &mdash; the underlying
              AWS services are assessed under the Australian Government&rsquo;s
              Information Security Registered Assessors Program at the PROTECTED
              level.
            </li>
            <li>
              <strong>Transient architecture</strong> &mdash; no persistent storage of
              patient data eliminates the primary vector for data breach.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "access-correction",
      title: "9. Access and Correction (APP 12 & 13)",
      content: (
        <>
          <p>
            Under the Australian Privacy Principles, individuals have the right to
            request access to, and correction of, their personal information.
          </p>
          <p>
            Because this Application does not persistently store personal information,
            there is no patient data available to access or correct after processing
            is complete. If you wish to confirm this, or have any concerns about
            information that may have been processed, please contact us using the
            details in Section 12.
          </p>
          <p>
            The healthcare practice that uploaded the document may hold the original
            PDF and generated HL7 file. Requests for access to or correction of health
            records should be directed to the relevant practice.
          </p>
        </>
      ),
    },
    {
      id: "data-breach",
      title: "10. Data Breach Response",
      content: (
        <>
          <p>
            We maintain a data breach response plan in accordance with Part IIIC of
            the Privacy Act 1988 (Notifiable Data Breaches scheme).
          </p>
          <p>
            In the event of an eligible data breach involving personal information
            that is likely to result in serious harm, we will:
          </p>
          <ul>
            <li>
              Assess the breach within 30 days of becoming aware of it
            </li>
            <li>
              Notify the Office of the Australian Information Commissioner (OAIC) if
              the breach is eligible
            </li>
            <li>
              Notify affected individuals with a description of the breach, the types
              of information involved, and recommended steps
            </li>
          </ul>
          <p>
            The transient processing architecture of this Application significantly
            reduces the risk of eligible data breaches, as patient data is not
            retained after processing.
          </p>
        </>
      ),
    },
    {
      id: "ai-use",
      title: "11. Use of Artificial Intelligence",
      content: (
        <>
          <p>
            This Application uses AI (AWS Bedrock, Claude model) to:
          </p>
          <ul>
            <li>Classify the type of uploaded PDF document</li>
            <li>
              Extract structured patient data fields (name, date of birth, sex,
              Medicare number, provider details) from PDF content
            </li>
          </ul>
          <p>
            AI is used solely for data extraction. It is not used for clinical
            decision-making, diagnosis, treatment recommendations, or any automated
            decision that directly affects patient care.
          </p>
          <p>
            Extracted data is displayed to the operator for review before the HL7
            file is generated. The operator may override the AI&rsquo;s document type
            classification.
          </p>
          <p>
            AWS Bedrock does not retain, log, or learn from data processed by this
            Application. Patient data is not used to train or improve any AI model.
          </p>
        </>
      ),
    },
    {
      id: "complaints",
      title: "12. Complaints and Contact",
      content: (
        <>
          <p>
            If you believe we have handled your personal information in a way that
            breaches the Australian Privacy Principles, you may lodge a complaint by
            contacting us at:
          </p>
          <div className="card-inner p-4 mt-2 mb-3">
            <p className="font-semibold">{ENTITY_NAME} &mdash; Privacy Officer</p>
            <p>
              Email:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[var(--bjc-blue)] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
          <p>
            We will acknowledge your complaint within 7 business days and aim to
            resolve it within 30 days. We will keep you informed of the progress of
            your complaint.
          </p>
          <p>
            If you are not satisfied with our response, you may lodge a complaint with
            the Office of the Australian Information Commissioner (OAIC) at{" "}
            <span className="mono text-xs">www.oaic.gov.au</span> or by calling 1300
            363 992.
          </p>
        </>
      ),
    },
    {
      id: "changes",
      title: "13. Changes to this Policy",
      content: (
        <>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be
            reflected on this page with an updated effective date. We encourage users
            to review this policy periodically.
          </p>
        </>
      ),
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  Privacy Policy
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Effective {EFFECTIVE_DATE}
                </p>
              </div>
            </div>
          </div>

          <div className="divider-subtle" />

          {/* Table of contents */}
          <div className="px-7 pt-5 pb-2">
            <div className="card-inner p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                Contents
              </h3>
              <nav className="space-y-1">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="block text-sm text-[var(--bjc-blue)] hover:text-[var(--bjc-navy)] transition-colors"
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </div>
          </div>

          {/* Policy sections */}
          <div className="px-7 py-5 space-y-6">
            {sections.map((section, idx) => (
              <section
                key={section.id}
                id={section.id}
                className="animate-fade-in"
                style={{ animationDelay: `${0.05 * (idx + 1)}s` }}
              >
                <h2 className="text-base font-bold text-[var(--text-primary)] mb-3">
                  {section.title}
                </h2>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed space-y-3 policy-body">
                  {section.content}
                </div>
                {idx < sections.length - 1 && (
                  <div className="divider-subtle mt-6" />
                )}
              </section>
            ))}
          </div>

          <div className="divider-subtle" />

          {/* Cross-link to compliance page */}
          <div className="px-7 py-5">
            <div className="p-4 rounded-xl bg-[var(--info-bg)] border border-[var(--info-border)]">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                For detailed technical information about how this application protects
                patient data, see our{" "}
                <Link
                  href="/compliance"
                  className="text-[var(--bjc-blue)] hover:underline font-medium"
                >
                  Data Handling & Compliance
                </Link>{" "}
                page.
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
