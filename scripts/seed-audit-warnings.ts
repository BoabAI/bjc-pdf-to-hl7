/**
 * Seed fictional audit rows into the DynamoDB audit table so the /log UI has
 * visible warning detail to render. Mix of real-looking operational warnings,
 * mailbox mismatch, multi-warning rows, and one legacy row (warningCount > 0
 * but no warnings array) so the "(legacy)" affordance is visible too.
 *
 * Usage: bun run scripts/seed-audit-warnings.ts
 *
 * Requires AWS credentials with PutItem on the audit table (default
 * `bjc-pdf-to-hl7-audit`, override via DYNAMODB_TABLE).
 */

import { recordConversion, monthKey, randomSuffix, type AuditRow } from "@/lib/audit";

interface Seed {
  minutesAgo: number;
  outcome: "ok" | "fail";
  documentType?: AuditRow["documentType"];
  messageType?: string;
  diagnosticServiceSection?: string;
  patientInitials?: string;
  source?: AuditRow["source"];
  mailboxHint?: AuditRow["mailboxHint"];
  mailboxDisagreement?: boolean;
  warnings?: string[];
  /** When true, write warningCount > 0 but omit `warnings` to simulate a
   * pre-feature row. */
  legacy?: boolean;
  fileSizeBytes?: number;
  durationMs?: number;
}

const SEEDS: Seed[] = [
  {
    minutesAgo: 5,
    outcome: "ok",
    documentType: "pathology_result",
    messageType: "ORU^R01",
    diagnosticServiceSection: "LAB",
    patientInitials: "J.S.",
    warnings: ["Bedrock vision call timed out after 30s; retried once"],
  },
  {
    minutesAgo: 22,
    outcome: "ok",
    documentType: "referral",
    messageType: "REF^I12",
    diagnosticServiceSection: "PHY",
    patientInitials: "M.O.",
    source: "email",
    mailboxHint: "results",
    mailboxDisagreement: true,
    warnings: [
      "Mailbox/content mismatch: arrived via results mailbox but classified as referral_letter. Verify before filing.",
    ],
  },
  {
    minutesAgo: 47,
    outcome: "ok",
    documentType: "radiology_result",
    messageType: "ORU^R01",
    diagnosticServiceSection: "RAD",
    patientInitials: "T.W.",
    warnings: [
      "State inferred from postcode 2030 (Vaucluse) — model returned blank state",
      "Addressee resolved fuzzily: 'Dear Rheumatologist' → 'Dr Irwin Lim'",
    ],
  },
  {
    minutesAgo: 90,
    outcome: "fail",
    documentType: "generic",
    patientInitials: undefined,
    warnings: [
      "Vision extraction could not determine patient name",
      "Document family classification: low confidence (0.42)",
    ],
  },
  {
    minutesAgo: 180,
    outcome: "fail",
    warnings: ["AWS credentials missing or invalid for Bedrock"],
  },
  {
    minutesAgo: 240,
    outcome: "ok",
    documentType: "consent_form",
    messageType: "ORU^R01",
    patientInitials: "A.K.",
    // No warnings — sanity case so the UI shows a plain "0".
  },
  {
    minutesAgo: 360,
    outcome: "ok",
    documentType: "referral",
    messageType: "REF^I12",
    diagnosticServiceSection: "PHY",
    patientInitials: "P.H.",
    source: "email",
    mailboxHint: "referrals",
    legacy: true,
  },
  {
    minutesAgo: 720,
    outcome: "ok",
    documentType: "pathology_result",
    messageType: "ORU^R01",
    diagnosticServiceSection: "LAB",
    patientInitials: "K.P.",
    warnings: [
      "OBR-24 forced to LAB despite radiology header — verify routing",
      "Sender practice not in BJC doctor list — addressee left blank",
      "PDF rendered at 600 DPI; Bedrock latency 18.4s",
    ],
  },
];

function randomHex(length: number): string {
  let out = "";
  while (out.length < length) {
    out += Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, "0");
  }
  return out.slice(0, length);
}

function buildSeedRow(seed: Seed): AuditRow {
  const now = new Date(Date.now() - seed.minutesAgo * 60_000);
  const durationMs = seed.durationMs ?? 800 + Math.floor(Math.random() * 4500);
  const fileSizeBytes =
    seed.fileSizeBytes ?? 80_000 + Math.floor(Math.random() * 600_000);
  const warningCount = seed.legacy
    ? 1
    : seed.warnings?.length ?? 0;

  return {
    month: monthKey(now),
    ts: `${now.toISOString()}#${randomSuffix(6)}`,
    documentType: seed.documentType,
    outcome: seed.outcome,
    source: seed.source ?? "web",
    messageType: seed.messageType,
    diagnosticServiceSection: seed.diagnosticServiceSection,
    filenameHash: randomHex(12),
    filenameExt: ".pdf",
    fileSizeBytes,
    durationMs,
    warningCount,
    ...(seed.legacy ? {} : seed.warnings ? { warnings: seed.warnings } : {}),
    userEmail: "seed@bjchealth.com.au",
    patientInitials: seed.patientInitials,
    mailboxHint: seed.mailboxHint,
    ...(seed.mailboxDisagreement ? { mailboxDisagreement: true } : {}),
  };
}

async function main(): Promise<void> {
  const rows = SEEDS.map(buildSeedRow);
  console.log(
    `Seeding ${rows.length} audit rows into ${process.env.DYNAMODB_TABLE ?? "bjc-pdf-to-hl7-audit"} ...`
  );
  for (const row of rows) {
    await recordConversion(row);
    const tail =
      row.warnings && row.warnings.length > 0
        ? `${row.warnings.length} warning(s): "${row.warnings[0]?.slice(0, 60)}…"`
        : row.warningCount > 0
          ? `${row.warningCount} legacy warning(s)`
          : "no warnings";
    console.log(
      `  • ${row.ts}  ${row.outcome.padEnd(4)}  ${row.documentType ?? "—"}  ${tail}`
    );
  }
  console.log("Done. Reload http://localhost:3000/log to see them.");
}

void main();
