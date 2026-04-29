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

mock.module("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: (...args: unknown[]) => {
      docClientFromMock(...args);
      return { send: sendMock };
    },
  },
  PutCommand: PutCommandMock,
  QueryCommand: QueryCommandMock,
}));

const {
  recordConversion,
  listConversions,
  hashFilename,
  extractFilenameExt,
  monthKey,
  buildSortKey,
  randomSuffix,
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
    ];

    const sensitiveTokens = [
      "Smith",
      "smith",
      "John",
      "john",
      "19800123",
      "1980",
      "OBRIEN",
      "obrien",
      "Mary",
      "mary",
      "14071982",
      "1982",
      "Henderson",
      "henderson",
      "Patricia",
      "patricia",
      "2950123456",
      "Karim",
      "karim",
      "Amira",
      "amira",
      "08111985",
      "1985",
      "DOB",
      "MEDICARE",
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

describe("extractFilenameExt", () => {
  test("returns lowercased extension with leading dot", () => {
    expect(extractFilenameExt("file.PDF")).toBe(".pdf");
    expect(extractFilenameExt("file.pdf")).toBe(".pdf");
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
