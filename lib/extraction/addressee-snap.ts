/**
 * Deterministic backstop for AI addressee resolution.
 *
 * Runs after extraction, before the eligibility gate. The Bedrock prompt is
 * asked to return the BJC doctor-list entry verbatim, but nothing guarantees
 * it — this module snaps the extracted addressee onto the roster (whose names
 * are the exact Genie address-book strings, e.g. "Dr I Lim"), and promotes a
 * roster doctor found on the CC line when the primary recipient is external.
 *
 * Warnings must stay digit-free: `redactWarning` in lib/audit.ts drops any
 * warning containing long digit runs or DOB-shaped dates.
 *
 * Non-goals: diacritic folding, "Surname, First" candidates, nickname mapping.
 */

import type { ReferralInfo } from "../domain/types";

export interface SnapAddresseeResult {
  /** New object when anything changed; the input reference otherwise. */
  referralInfo: ReferralInfo | undefined;
  warnings: string[];
}

const TITLE_TOKENS = new Set([
  "dr",
  "dr.",
  "doctor",
  "prof",
  "prof.",
  "professor",
  "a/prof",
  "a/prof.",
  "assoc",
  "mr",
  "mrs",
  "ms",
  "miss",
  "cc",
  "cc:",
]);

/**
 * Reduce a raw name mention to bare name tokens. CC lines often embed the
 * doctor's rooms and phone numbers ("Dr Herman Lau Level 1, 17-21 Hunter
 * Street, PARRAMATTA NSW 2150 ..."), so we cut at the first comma, drop
 * everything from the first digit-bearing token onward, and strip leading
 * titles.
 */
function nameTokens(raw: string): string[] {
  const beforeComma = raw.split(",")[0].trim();
  const tokens: string[] = [];
  for (const token of beforeComma.split(/\s+/)) {
    if (!token) continue;
    if (/\d/.test(token)) break;
    tokens.push(token);
  }
  while (tokens.length > 0 && TITLE_TOKENS.has(tokens[0].toLowerCase())) {
    tokens.shift();
  }
  return tokens;
}

interface RosterEntry {
  /** Verbatim roster string, e.g. "Dr I Lim". */
  name: string;
  surname: string;
  firstGiven?: string;
}

function parseRosterEntry(name: string): RosterEntry | undefined {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return undefined;
  const surname = tokens[tokens.length - 1];
  return tokens.length > 1
    ? { name, surname, firstGiven: tokens[0] }
    : { name, surname };
}

/**
 * Given-name compatibility: either side missing, exact first-given equality,
 * or first-initial equality where the shorter side looks like initials
 * ("I", "I.", "I.G.S." — up to three letters once dots are stripped).
 */
function givensCompatible(candidate?: string, roster?: string): boolean {
  if (!candidate || !roster) return true;
  const c = candidate.toLowerCase();
  const r = roster.toLowerCase();
  if (c === r) return true;
  const cStripped = c.replace(/\./g, "");
  const rStripped = r.replace(/\./g, "");
  const looksLikeInitials = (s: string) => s.length >= 1 && s.length <= 3;
  if (looksLikeInitials(cStripped) || looksLikeInitials(rStripped)) {
    return cStripped[0] === rStripped[0];
  }
  return false;
}

function matchRoster(
  candidate: string,
  roster: RosterEntry[]
): RosterEntry | "ambiguous" | undefined {
  const candidateTokens = nameTokens(candidate);
  if (candidateTokens.length === 0) return undefined;

  const matches: RosterEntry[] = [];
  for (const entry of roster) {
    const surnameIdx = candidateTokens.findIndex(
      (t) => t.toLowerCase() === entry.surname.toLowerCase()
    );
    if (surnameIdx === -1) continue;
    // Tokens past the surname are trailing junk ("Level", suite names) —
    // only what precedes the surname counts as given names.
    const candidateGiven =
      surnameIdx > 0 ? candidateTokens[0] : undefined;
    if (givensCompatible(candidateGiven, entry.firstGiven)) {
      matches.push(entry);
    }
  }

  if (matches.length === 0) return undefined;
  if (matches.length > 1) return "ambiguous";
  return matches[0];
}

export function snapAddressee(
  referralInfo: ReferralInfo | undefined,
  rosterNames: string[]
): SnapAddresseeResult {
  if (!referralInfo || rosterNames.length === 0) {
    return { referralInfo, warnings: [] };
  }

  const roster = rosterNames
    .map(parseRosterEntry)
    .filter((e): e is RosterEntry => e !== undefined);
  const addressee = referralInfo.addresseeName?.trim();

  if (addressee) {
    const exact = roster.find(
      (e) => e.name.toLowerCase() === addressee.toLowerCase()
    );
    if (exact) {
      if (exact.name === referralInfo.addresseeName) {
        return { referralInfo, warnings: [] };
      }
      return {
        referralInfo: { ...referralInfo, addresseeName: exact.name },
        warnings: [],
      };
    }

    const match = matchRoster(addressee, roster);
    if (match === "ambiguous") {
      return {
        referralInfo,
        warnings: [
          "Addressee matches multiple doctors on the BJC doctor list — left as extracted",
        ],
      };
    }
    if (match) {
      return {
        referralInfo: { ...referralInfo, addresseeName: match.name },
        warnings: [],
      };
    }
  }

  for (const cc of referralInfo.ccNames ?? []) {
    const match = matchRoster(cc, roster);
    if (match && match !== "ambiguous") {
      const promoted: ReferralInfo = {
        ...referralInfo,
        addresseeName: match.name,
      };
      delete promoted.addresseeClinic;
      return {
        referralInfo: promoted,
        warnings: [`Addressee promoted from CC line: ${match.name}`],
      };
    }
  }

  if (addressee) {
    return {
      referralInfo,
      warnings: ["Addressee not matched to BJC doctor list — left as extracted"],
    };
  }

  return { referralInfo, warnings: [] };
}
