"use client";

import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="mt-6 text-center animate-fade-in stagger-3 space-y-1.5">
      <p className="text-[11px] text-[var(--text-muted)] tracking-wide">
        HL7 v2.4 &middot; Genie Compatible &middot; AI processed via AWS Bedrock AU regions
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link
          href="/compliance"
          className="inline-flex items-center gap-1 text-[11px] text-[var(--bjc-blue)] hover:text-[var(--bjc-navy)] transition-colors tracking-wide"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Data Handling &amp; Compliance
        </Link>
        <span className="text-[var(--border-medium)]">&middot;</span>
        <Link
          href="/privacy"
          className="inline-flex items-center gap-1 text-[11px] text-[var(--bjc-blue)] hover:text-[var(--bjc-navy)] transition-colors tracking-wide"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
