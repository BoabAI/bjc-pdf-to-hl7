"use client";

const SUPPORTED_FORMATS = [
  "Consent Forms",
  "Specialist Referrals",
  "GP Referrals",
  "Pathology Results",
  "Radiology Results",
];

export function SupportedFormatBadges() {
  return (
    <div className="flex flex-wrap gap-2 animate-fade-in stagger-2">
      {SUPPORTED_FORMATS.map((label) => (
        <span key={label} className="badge badge-blue">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}
