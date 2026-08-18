import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const sendMock = mock();
const docClientFromMock = mock();
const originalConsoleError = console.error;

class PutCommandMock {
  input: unknown;
  constructor(input: unknown) {
    this.input = input;
  }
}

class QueryCommandMock {
  input: unknown;
  constructor(input: unknown) {
    this.input = input;
  }
}

class DynamoDBClientMock {
  config: unknown;
  constructor(config: unknown) {
    this.config = config;
  }
}

mock.module("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: DynamoDBClientMock,
}));

class GetCommandStub {
  constructor(public readonly input: unknown) {}
}

mock.module("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: (...args: unknown[]) => {
      docClientFromMock(...args);
      return { send: sendMock };
    },
  },
  PutCommand: PutCommandMock,
  QueryCommand: QueryCommandMock,
  // Stub for lib/settings.ts which imports GetCommand from the same module.
  // audit.ts itself does not use GetCommand; this keeps the mock surface
  // matched to the real module so cross-imports don't fail.
  GetCommand: GetCommandStub,
}));

const {
  recordConversion,
  listConversions,
  listConversionsForSydneyMonth,
  utcMonthsForSydneyMonth,
  hashFilename,
  hashPdfContent,
  extractFilenameExt,
  monthKey,
  buildSortKey,
  randomSuffix,
  buildPatientInitials,
  redactWarning,
} = await import("./audit");
import type { AuditRow } from "./audit";

beforeEach(() => {
  sendMock.mockReset();
  docClientFromMock.mockReset();
  console.error = (() => {}) as typeof console.error;
});

afterEach(() => {
  console.error = originalConsoleError;
  delete process.env.DYNAMODB_TABLE;
});

function makeRow(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    month: "2026-04",
    ts: "2026-04-29T12:34:56.789Z#a3f9k1",
    documentType: "pathology_result",
    outcome: "ok",
    source: "web",
    messageType: "ORU^R01",
    diagnosticServiceSection: "LAB",
    filenameHash: "abcdef012345",
    filenameExt: ".pdf",
    fileSizeBytes: 1024,
    durationMs: 250,
    warningCount: 0,
    ...overrides,
  };
}

describe("buildPatientInitials", () => {
  test("returns F.L. form for valid names", () => {
    expect(buildPatientInitials("Jane", "Smith")).toBe("J.S.");
  });

  test("uppercases lowercase input", () => {
    expect(buildPatientInitials("jane", "smith")).toBe("J.S.");
  });

  test("trims whitespace before taking the first character", () => {
    expect(buildPatientInitials("  Mary  ", "  O'Brien  ")).toBe("M.O.");
  });

  test("handles single-letter names", () => {
    expect(buildPatientInitials("A", "B")).toBe("A.B.");
  });

  test("returns undefined when first name is missing", () => {
    expect(buildPatientInitials(undefined, "Smith")).toBeUndefined();
    expect(buildPatientInitials("", "Smith")).toBeUndefined();
    expect(buildPatientInitials("   ", "Smith")).toBeUndefined();
  });

  test("returns undefined when last name is missing", () => {
    expect(buildPatientInitials("Jane", undefined)).toBeUndefined();
    expect(buildPatientInitials("Jane", "")).toBeUndefined();
  });

  test("returns undefined for the UNKNOWN/PATIENT placeholder", () => {
    expect(buildPatientInitials("UNKNOWN", "PATIENT")).toBeUndefined();
    expect(buildPatientInitials("unknown", "patient")).toBeUndefined();
  });

  test("returns undefined when first character is not a letter", () => {
    expect(buildPatientInitials("123", "Smith")).toBeUndefined();
    expect(buildPatientInitials("Jane", "9Doe")).toBeUndefined();
  });
});

describe("redactWarning", () => {
  test("preserves operational warning strings unchanged", () => {
    expect(redactWarning("Bedrock vision call timed out after 30s")).toBe(
      "Bedrock vision call timed out after 30s"
    );
    expect(redactWarning("AWS credentials missing or invalid for Bedrock")).toBe(
      "AWS credentials missing or invalid for Bedrock"
    );
    expect(redactWarning("IAM access denied for ap-southeast-4")).toBe(
      "IAM access denied for ap-southeast-4"
    );
    expect(
      redactWarning(
        "Mailbox/content mismatch: arrived via referrals mailbox but classified as pathology_result. Verify before filing."
      )
    ).toBe(
      "Mailbox/content mismatch: arrived via referrals mailbox but classified as pathology_result. Verify before filing."
    );
  });

  test("drops messages containing a Medicare-like number (8+ consecutive digits)", () => {
    expect(redactWarning("Medicare 2950123456 mismatch")).toBeUndefined();
    expect(redactWarning("found id 12345678 in payload")).toBeUndefined();
  });

  test("drops messages containing a DOB-like date", () => {
    expect(redactWarning("Patient DOB 14/07/1982 missing")).toBeUndefined();
    expect(redactWarning("dob 1982-07-14 invalid")).toBeUndefined();
    expect(redactWarning("born 14-07-82 not parseable")).toBeUndefined();
  });

  test("truncates long messages to a sane cap", () => {
    const long = "A".repeat(1000);
    const out = redactWarning(long);
    expect(out).toBeDefined();
    expect((out as string).length).toBeLessThanOrEqual(300);
  });

  test("returns undefined for empty / whitespace-only strings", () => {
    expect(redactWarning("")).toBeUndefined();
    expect(redactWarning("   ")).toBeUndefined();
  });
});

describe("hashFilename", () => {
  test("returns a 12-character hex string", () => {
    const hash = hashFilename("anything.pdf");
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  test("is deterministic for the same input", () => {
    expect(hashFilename("x.pdf")).toBe(hashFilename("x.pdf"));
  });

  test("differs for different inputs", () => {
    expect(hashFilename("a.pdf")).not.toBe(hashFilename("b.pdf"));
  });

  test("uses sha256 (not a substring or reversible encoding)", async () => {
    // Anti-tautology: a hex string can't contain alphabetic substrings anyway,
    // so "hash doesn't contain 'Smith'" is vacuous unless we also pin the
    // algorithm. Compute the expected sha256 prefix and compare directly.
    const { createHash } = await import("node:crypto");
    const cases = [
      "Smith_John_19800123.pdf",
      "anything.pdf",
      "Müller_José_19850605.pdf",
    ];
    for (const filename of cases) {
      const expected = createHash("sha256")
        .update(filename)
        .digest("hex")
        .slice(0, 12);
      expect(hashFilename(filename)).toBe(expected);
      // Sanity: not a substring/passthrough of input.
      expect(hashFilename(filename)).not.toBe(filename.slice(0, 12));
    }
  });

  test("does not leak patient name or DOB from filename", () => {
    // CRITICAL PHI TEST: realistic Best Practice / specialist export filenames
    // must hash to a 12-char hex with NO patient-identifying substring leaking
    // through. Getting this wrong leaks PHI permanently into DynamoDB.
    const realisticFilenames = [
      "Smith_John_19800123.pdf",
      "Smith, John (23-01-1980).pdf",
      "OBRIEN, Mary - DOB 14071982 - referral.pdf",
      "MEDICARE_2950123456_Henderson_Patricia.pdf",
      "Karim_Amira_08111985_GP_referral.pdf",
      // Apostrophe surnames
      "O'Brien_Mary_14-07-1982.pdf",
      // Hyphenated / compound names
      "McDonald-Jane_19800123.pdf",
      // Diacritics — verify UTF-8 normalization doesn't leak through
      "Müller_José_19850605.pdf",
      // Filename with combined Medicare + name + DOB tokens
      "Smith_John_DOB19800123_MEDICARE2950123456.pdf",
    ];

    const sensitiveTokens = [
      "Smith", "smith",
      "John", "john",
      "19800123", "1980",
      "OBRIEN", "obrien", "O'Brien", "OBrien",
      "Mary", "mary",
      "14071982", "14-07-1982", "1982",
      "Henderson", "henderson",
      "Patricia", "patricia",
      "2950123456",
      "Karim", "karim",
      "Amira", "amira",
      "08111985", "1985",
      "McDonald", "mcdonald", "Jane", "jane",
      "Müller", "müller", "muller", "José", "jose",
      "19850605", "05-06-1985",
      "DOB", "MEDICARE",
    ];

    for (const filename of realisticFilenames) {
      const hash = hashFilename(filename);
      expect(hash).toMatch(/^[0-9a-f]{12}$/);
      for (const token of sensitiveTokens) {
        expect(hash).not.toContain(token);
        expect(hash).not.toContain(token.toLowerCase());
      }
    }
  });
});

describe("hashPdfContent", () => {
  test("returns a 12-character hex string", () => {
    expect(hashPdfContent(Buffer.from("%PDF-1.4 hello"))).toMatch(/^[0-9a-f]{12}$/);
  });

  test("is deterministic and independent of filename", () => {
    const a = Buffer.from("%PDF-1.4 same bytes");
    expect(hashPdfContent(a)).toBe(hashPdfContent(Buffer.from(a)));
  });

  test("differs on a single-byte change", () => {
    const a = Buffer.from("%PDF-1.4 abc");
    const b = Buffer.from("%PDF-1.4 abd");
    expect(hashPdfContent(a)).not.toBe(hashPdfContent(b));
  });

  test("matches sha256 of the bytes (what `shasum -a 256` / Get-FileHash print)", () => {
    const buf = Buffer.from("%PDF-1.4 fixture");
    const expected = createHash("sha256").update(buf).digest("hex").slice(0, 12);
    expect(hashPdfContent(buf)).toBe(expected);
  });
});

describe("extractFilenameExt", () => {
  test("returns '.pdf' for PDF filenames (case-insensitive)", () => {
    expect(extractFilenameExt("file.PDF")).toBe(".pdf");
    expect(extractFilenameExt("file.pdf")).toBe(".pdf");
    expect(extractFilenameExt("REPORT.Pdf")).toBe(".pdf");
  });

  test("returns empty string for non-PDF extensions", () => {
    expect(extractFilenameExt("file.png")).toBe("");
    expect(extractFilenameExt("file.docx")).toBe("");
    expect(extractFilenameExt("file.exe")).toBe("");
  });

  test("returns empty string for filenames without extension", () => {
    expect(extractFilenameExt("nodot")).toBe("");
  });

  test("returns empty string for trailing dot", () => {
    expect(extractFilenameExt("file.")).toBe("");
  });

  test("returns empty string for hidden file with no real extension", () => {
    expect(extractFilenameExt(".env")).toBe("");
  });

  // Critical PHI safety: filenames that LOOK like they have an extension but
  // actually carry a patient name/DOB after the last dot must NEVER write
  // that token to DynamoDB. Without an allowlist, "Referral.Smith" would
  // leak ".smith".
  test("does not leak patient suffix when filename has no real extension", () => {
    expect(extractFilenameExt("Referral.Smith")).toBe("");
    expect(extractFilenameExt("OBrien.John")).toBe("");
    expect(extractFilenameExt("DOB19800123.PATRICIA")).toBe("");
    expect(extractFilenameExt("Note.JOHN")).toBe("");
    expect(extractFilenameExt("Smith_John_19800123")).toBe("");
  });
});

describe("monthKey / buildSortKey / randomSuffix", () => {
  test("monthKey formats as YYYY-MM in UTC", () => {
    const d = new Date(Date.UTC(2026, 3, 29, 12, 0, 0));
    expect(monthKey(d)).toBe("2026-04");
  });

  test("buildSortKey contains ISO timestamp + # + suffix", () => {
    const d = new Date(Date.UTC(2026, 3, 29, 12, 34, 56, 789));
    const sk = buildSortKey(d);
    expect(sk.startsWith("2026-04-29T12:34:56.789Z#")).toBe(true);
    expect(sk.split("#")[1]).toMatch(/^[0-9a-z]{6}$/);
  });

  test("randomSuffix produces base36 of requested length", () => {
    const s = randomSuffix(6);
    expect(s).toMatch(/^[0-9a-z]{6}$/);
    expect(randomSuffix(10)).toHaveLength(10);
  });
});

describe("recordConversion", () => {
  test("sends a PutCommand to the configured table", async () => {
    sendMock.mockResolvedValue({});
    process.env.DYNAMODB_TABLE = "custom-audit-table";

    const row = makeRow();
    await recordConversion(row);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as PutCommandMock;
    expect(command).toBeInstanceOf(PutCommandMock);
    const input = command.input as { TableName: string; Item: AuditRow };
    expect(input.TableName).toBe("custom-audit-table");
    expect(input.Item).toEqual(row);
  });

  test("uses default table name when DYNAMODB_TABLE is unset", async () => {
    sendMock.mockResolvedValue({});
    delete process.env.DYNAMODB_TABLE;

    await recordConversion(makeRow());

    const command = sendMock.mock.calls[0][0] as PutCommandMock;
    const input = command.input as { TableName: string };
    expect(input.TableName).toBe("bjc-pdf-to-hl7-audit");
  });

  test("does not throw when DynamoDB rejects", async () => {
    sendMock.mockRejectedValue(new Error("DynamoDB unavailable"));

    let consoleErrorCalled = false;
    console.error = (() => {
      consoleErrorCalled = true;
    }) as typeof console.error;

    await expect(recordConversion(makeRow())).resolves.toBeUndefined();
    expect(consoleErrorCalled).toBe(true);
  });

  test("warnings array round-trips through PutCommand when present", async () => {
    sendMock.mockResolvedValue({});
    const row = makeRow({
      warningCount: 2,
      warnings: ["Bedrock vision call timed out after 30s", "Mailbox/content mismatch"],
    });
    await recordConversion(row);
    const command = sendMock.mock.calls[0][0] as PutCommandMock;
    const input = command.input as { Item: AuditRow };
    expect(input.Item.warnings).toEqual([
      "Bedrock vision call timed out after 30s",
      "Mailbox/content mismatch",
    ]);
  });

  test("audit row contract has no patient-identifying fields", async () => {
    // This documents the contract: AuditRow's keys are a fixed set, and none
    // of them should be patient PHI. This test is a guard against future drift.
    sendMock.mockResolvedValue({});
    const row = makeRow();
    const allowedKeys = new Set([
      "month",
      "ts",
      "documentType",
      "outcome",
      "source",
      "messageType",
      "diagnosticServiceSection",
      "filenameHash",
      "filenameExt",
      "fileSizeBytes",
      "durationMs",
      "warningCount",
      "warnings",
      "userEmail",
      "patientInitials",
      "mailboxHint",
      "mailboxDisagreement",
    ]);
    const forbiddenKeys = [
      "firstName",
      "lastName",
      "dob",
      "medicareNo",
      "address",
      "filename",
      "patientName",
      "name",
    ];
    for (const key of Object.keys(row)) {
      expect(allowedKeys.has(key)).toBe(true);
      expect(forbiddenKeys).not.toContain(key);
    }
  });
});

describe("listConversions", () => {
  test("queries the partition key for the given month and returns rows", async () => {
    const rows = [makeRow({ ts: "2026-04-29T12:00:00.000Z#aaaaaa" })];
    sendMock.mockResolvedValue({ Items: rows });

    const result = await listConversions("2026-04");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as QueryCommandMock;
    expect(command).toBeInstanceOf(QueryCommandMock);
    const input = command.input as {
      TableName: string;
      KeyConditionExpression: string;
      ExpressionAttributeValues: Record<string, string>;
      ScanIndexForward: boolean;
    };
    expect(input.KeyConditionExpression).toContain("month");
    expect(input.ExpressionAttributeValues[":month"]).toBe("2026-04");
    expect(input.ScanIndexForward).toBe(false);
    expect(result).toEqual(rows);
  });

  test("returns empty array when DynamoDB throws", async () => {
    sendMock.mockRejectedValue(new Error("Throttled"));

    let consoleErrorCalled = false;
    console.error = (() => {
      consoleErrorCalled = true;
    }) as typeof console.error;

    const result = await listConversions("2026-04");
    expect(result).toEqual([]);
    expect(consoleErrorCalled).toBe(true);
  });

  test("accepts rows with a warnings string array (isAuditRow guard)", async () => {
    const rowWithWarnings = makeRow({
      warningCount: 1,
      warnings: ["Bedrock vision call timed out after 30s"],
    });
    const rowWithBadWarnings = makeRow({
      ts: "2026-04-29T13:00:00.000Z#bad001",
      warningCount: 1,
      // warnings must be string[]; numbers must be filtered out as malformed.
      warnings: [42 as unknown as string],
    });
    sendMock.mockResolvedValue({
      Items: [rowWithWarnings, rowWithBadWarnings],
    });
    const result = await listConversions("2026-04");
    expect(result).toHaveLength(1);
    expect(result[0]?.warnings).toEqual([
      "Bedrock vision call timed out after 30s",
    ]);
  });

  test("accepts rows with and without contentHash (isAuditRow guard)", async () => {
    const withHash = makeRow({ contentHash: "0123456789ab" });
    const legacy = makeRow({ ts: "2026-04-29T13:00:00.000Z#legacy" });
    const badHash = makeRow({
      ts: "2026-04-29T13:00:00.000Z#bad002",
      contentHash: 42 as unknown as string,
    });
    sendMock.mockResolvedValue({ Items: [withHash, legacy, badHash] });
    const result = await listConversions("2026-04");
    expect(result).toHaveLength(2);
    expect(result[0]?.contentHash).toBe("0123456789ab");
    expect(result[1]?.contentHash).toBeUndefined();
  });

  test("filters out malformed items", async () => {
    sendMock.mockResolvedValue({
      Items: [
        makeRow(),
        { not: "a valid row" },
        null,
      ],
    });

    const result = await listConversions("2026-04");
    expect(result).toHaveLength(1);
  });
});

describe("utcMonthsForSydneyMonth", () => {
  test("April 2026 (DST end on Apr 5) spans UTC March + April", () => {
    // Sydney April 2026 starts 2026-04-01T00:00+11 = 2026-03-31T13:00Z (UTC March)
    // Sydney April 2026 ends 2026-04-30T23:59:59+10 = 2026-04-30T13:59:59Z (UTC April)
    expect(utcMonthsForSydneyMonth("2026-04")).toEqual(["2026-03", "2026-04"]);
  });

  test("July 2026 (austral winter, UTC+10) spans UTC June + July", () => {
    // Sydney July 2026 starts 2026-07-01T00:00+10 = 2026-06-30T14:00Z (UTC June)
    // Sydney July 2026 ends 2026-07-31T23:59:59+10 = 2026-07-31T13:59:59Z (UTC July)
    expect(utcMonthsForSydneyMonth("2026-07")).toEqual(["2026-06", "2026-07"]);
  });

  test("January 2026 spans UTC December 2025 + January 2026", () => {
    // Sydney January starts 2026-01-01T00:00+11 = 2025-12-31T13:00Z (UTC Dec 2025)
    expect(utcMonthsForSydneyMonth("2026-01")).toEqual(["2025-12", "2026-01"]);
  });

  test("December 2026 spans UTC November + December", () => {
    // Sydney Dec starts 2026-12-01T00:00+11 = 2026-11-30T13:00Z
    expect(utcMonthsForSydneyMonth("2026-12")).toEqual(["2026-11", "2026-12"]);
  });

  test("returns ascending, deduplicated keys", () => {
    const months = utcMonthsForSydneyMonth("2026-04");
    expect(months[0] < months[1]).toBe(true);
    expect(new Set(months).size).toBe(months.length);
  });

  test("rejects invalid format", () => {
    expect(() => utcMonthsForSydneyMonth("garbage")).toThrow();
    expect(() => utcMonthsForSydneyMonth("2026-4")).toThrow();
    expect(() => utcMonthsForSydneyMonth("2026-13")).toThrow();
    expect(() => utcMonthsForSydneyMonth("")).toThrow();
    // @ts-expect-error - intentionally testing runtime guard for non-string
    expect(() => utcMonthsForSydneyMonth(undefined)).toThrow();
  });
});

describe("listConversionsForSydneyMonth", () => {
  test("queries both UTC partitions and filters to the Sydney month", async () => {
    // Sydney April 2026 spans UTC 2026-03 and 2026-04. Underlying DDB queries
    // run once per partition; we mock send() to return rows tagged by which
    // partition was queried.
    const inMarchPartitionInsideAprilSydney = makeRow({
      month: "2026-03",
      // 2026-03-31T14:00Z = 2026-04-01T01:00+11 = inside Sydney April
      ts: "2026-03-31T14:00:00.000Z#aaaaaa",
    });
    const inMarchPartitionOutsideAprilSydney = makeRow({
      month: "2026-03",
      // 2026-03-30T00:00Z = 2026-03-30T11:00+11 = inside Sydney March, NOT April
      ts: "2026-03-30T00:00:00.000Z#bbbbbb",
    });
    const inAprilPartitionInsideAprilSydney = makeRow({
      month: "2026-04",
      ts: "2026-04-15T03:00:00.000Z#cccccc",
    });
    const inAprilPartitionOutsideAprilSydney = makeRow({
      month: "2026-04",
      // 2026-04-30T14:30Z = 2026-05-01T00:30+10 = inside Sydney May, NOT April
      ts: "2026-04-30T14:30:00.000Z#dddddd",
    });

    sendMock.mockImplementation((command: { input: { ExpressionAttributeValues: Record<string, string> } }) => {
      const month = command.input.ExpressionAttributeValues[":month"];
      if (month === "2026-03") {
        return Promise.resolve({
          Items: [
            inMarchPartitionInsideAprilSydney,
            inMarchPartitionOutsideAprilSydney,
          ],
        });
      }
      if (month === "2026-04") {
        return Promise.resolve({
          Items: [
            inAprilPartitionInsideAprilSydney,
            inAprilPartitionOutsideAprilSydney,
          ],
        });
      }
      return Promise.resolve({ Items: [] });
    });

    const result = await listConversionsForSydneyMonth("2026-04");

    expect(sendMock).toHaveBeenCalledTimes(2);
    // Only the two rows whose Sydney date falls in April 2026 should remain.
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.ts)).toContain(
      inMarchPartitionInsideAprilSydney.ts
    );
    expect(result.map((r) => r.ts)).toContain(
      inAprilPartitionInsideAprilSydney.ts
    );
  });

  test("returns rows sorted by descending timestamp", async () => {
    const earlier = makeRow({
      month: "2026-03",
      ts: "2026-03-31T14:00:00.000Z#aaaaaa",
    });
    const middle = makeRow({
      month: "2026-04",
      ts: "2026-04-10T00:00:00.000Z#bbbbbb",
    });
    const later = makeRow({
      month: "2026-04",
      ts: "2026-04-25T05:00:00.000Z#cccccc",
    });

    sendMock.mockImplementation((command: { input: { ExpressionAttributeValues: Record<string, string> } }) => {
      const month = command.input.ExpressionAttributeValues[":month"];
      if (month === "2026-03") return Promise.resolve({ Items: [earlier] });
      if (month === "2026-04") return Promise.resolve({ Items: [later, middle] });
      return Promise.resolve({ Items: [] });
    });

    const result = await listConversionsForSydneyMonth("2026-04");
    expect(result.map((r) => r.ts)).toEqual([later.ts, middle.ts, earlier.ts]);
  });

  test("filters out rows with an unparseable timestamp", async () => {
    // Both UTC partitions get queried; only the April partition returns rows
    // here so we can pin assertions to a known set.
    sendMock.mockImplementation((command: { input: { ExpressionAttributeValues: Record<string, string> } }) => {
      const month = command.input.ExpressionAttributeValues[":month"];
      if (month === "2026-04") {
        return Promise.resolve({
          Items: [
            makeRow({ ts: "not-a-real-iso-timestamp" }),
            makeRow({ ts: "2026-04-15T03:00:00.000Z#good01" }),
          ],
        });
      }
      return Promise.resolve({ Items: [] });
    });

    const result = await listConversionsForSydneyMonth("2026-04");
    expect(result).toHaveLength(1);
    expect(result[0]?.ts).toBe("2026-04-15T03:00:00.000Z#good01");
  });

  test("returns empty array when both partitions are empty", async () => {
    sendMock.mockResolvedValue({ Items: [] });
    const result = await listConversionsForSydneyMonth("2026-07");
    expect(result).toEqual([]);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  test("propagates throws from utcMonthsForSydneyMonth on bad input", async () => {
    await expect(
      listConversionsForSydneyMonth("garbage")
    ).rejects.toThrow();
  });
});
