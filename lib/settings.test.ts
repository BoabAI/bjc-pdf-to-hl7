import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const sendMock = mock();
const originalConsoleError = console.error;

class PutCommandMock {
  input: unknown;
  constructor(input: unknown) {
    this.input = input;
  }
}

class GetCommandMock {
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
    from: () => ({ send: sendMock }),
  },
  PutCommand: PutCommandMock,
  GetCommand: GetCommandMock,
}));

const {
  clearSettingsCache,
  coerceConfidenceFloor,
  DEFAULT_MIN_CLASSIFICATION_CONFIDENCE,
  getSettings,
  updateSettings,
} = await import("./settings");

beforeEach(() => {
  sendMock.mockReset();
  clearSettingsCache();
  console.error = (() => {}) as typeof console.error;
  delete process.env.MIN_CLASSIFICATION_CONFIDENCE;
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("coerceConfidenceFloor", () => {
  test("accepts integers in 0-100", () => {
    expect(coerceConfidenceFloor(0)).toBe(0);
    expect(coerceConfidenceFloor(75)).toBe(75);
    expect(coerceConfidenceFloor(100)).toBe(100);
  });

  test("accepts numeric strings", () => {
    expect(coerceConfidenceFloor("75")).toBe(75);
    expect(coerceConfidenceFloor("85.4")).toBe(85);
  });

  test("rejects out-of-range values", () => {
    expect(coerceConfidenceFloor(-1)).toBeUndefined();
    expect(coerceConfidenceFloor(101)).toBeUndefined();
    expect(coerceConfidenceFloor("250")).toBeUndefined();
  });

  test("rejects non-numeric / missing", () => {
    expect(coerceConfidenceFloor(undefined)).toBeUndefined();
    expect(coerceConfidenceFloor(null)).toBeUndefined();
    expect(coerceConfidenceFloor("")).toBeUndefined();
    expect(coerceConfidenceFloor("abc")).toBeUndefined();
    expect(coerceConfidenceFloor(Number.NaN)).toBeUndefined();
  });
});

describe("getSettings — fallback when record is missing", () => {
  test("returns the in-code default when env var is unset and no record exists", async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined });
    const settings = await getSettings({ cacheTtlMs: 0 });
    expect(settings.minClassificationConfidence).toBe(
      DEFAULT_MIN_CLASSIFICATION_CONFIDENCE
    );
    expect(settings.updatedAt).toBeUndefined();
    expect(settings.updatedBy).toBeUndefined();
  });

  test("returns the env-var default when record is missing and MIN_CLASSIFICATION_CONFIDENCE is set", async () => {
    process.env.MIN_CLASSIFICATION_CONFIDENCE = "85";
    sendMock.mockResolvedValueOnce({ Item: undefined });
    const settings = await getSettings({ cacheTtlMs: 0 });
    expect(settings.minClassificationConfidence).toBe(85);
  });

  test("ignores an invalid env-var default and falls through to the in-code default", async () => {
    process.env.MIN_CLASSIFICATION_CONFIDENCE = "garbage";
    sendMock.mockResolvedValueOnce({ Item: undefined });
    const settings = await getSettings({ cacheTtlMs: 0 });
    expect(settings.minClassificationConfidence).toBe(
      DEFAULT_MIN_CLASSIFICATION_CONFIDENCE
    );
  });

  test("falls back to defaults when DynamoDB read throws", async () => {
    sendMock.mockRejectedValueOnce(new Error("ddb down"));
    const settings = await getSettings({ cacheTtlMs: 0 });
    expect(settings.minClassificationConfidence).toBe(
      DEFAULT_MIN_CLASSIFICATION_CONFIDENCE
    );
  });
});

describe("getSettings — record present", () => {
  test("returns persisted floor + audit metadata", async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        month: "settings",
        ts: "runtime",
        minClassificationConfidence: 85,
        updatedAt: "2026-05-14T01:00:00.000Z",
        updatedBy: "nicole@bjchealth.com.au",
      },
    });
    const settings = await getSettings({ cacheTtlMs: 0 });
    expect(settings.minClassificationConfidence).toBe(85);
    expect(settings.updatedAt).toBe("2026-05-14T01:00:00.000Z");
    expect(settings.updatedBy).toBe("nicole@bjchealth.com.au");
  });

  test("clamps an out-of-range persisted value", async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        month: "settings",
        ts: "runtime",
        minClassificationConfidence: 250,
      },
    });
    const settings = await getSettings({ cacheTtlMs: 0 });
    expect(settings.minClassificationConfidence).toBe(100);
  });

  test("falls back to defaults when persisted record is malformed", async () => {
    sendMock.mockResolvedValueOnce({
      Item: { month: "settings", ts: "runtime", minClassificationConfidence: "not a number" },
    });
    const settings = await getSettings({ cacheTtlMs: 0 });
    expect(settings.minClassificationConfidence).toBe(
      DEFAULT_MIN_CLASSIFICATION_CONFIDENCE
    );
  });
});

describe("getSettings — cache behaviour", () => {
  test("subsequent reads inside the TTL window do not hit DynamoDB", async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        month: "settings",
        ts: "runtime",
        minClassificationConfidence: 60,
      },
    });
    const a = await getSettings({ cacheTtlMs: 60_000 });
    const b = await getSettings({ cacheTtlMs: 60_000 });
    expect(a).toEqual(b);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("clearSettingsCache forces the next read to hit DynamoDB", async () => {
    sendMock.mockResolvedValue({
      Item: {
        month: "settings",
        ts: "runtime",
        minClassificationConfidence: 60,
      },
    });
    await getSettings({ cacheTtlMs: 60_000 });
    clearSettingsCache();
    await getSettings({ cacheTtlMs: 60_000 });
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

describe("updateSettings", () => {
  test("writes a settings row and returns previous + next", async () => {
    // First call: GET previous (empty)
    sendMock.mockResolvedValueOnce({ Item: undefined });
    // Second call: PUT new value
    sendMock.mockResolvedValueOnce({});

    const result = await updateSettings({
      minClassificationConfidence: 80,
      updatedBy: "sean@smecai.au",
    });

    expect(result.next.minClassificationConfidence).toBe(80);
    expect(result.next.updatedBy).toBe("sean@smecai.au");
    expect(result.next.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.previous.minClassificationConfidence).toBe(
      DEFAULT_MIN_CLASSIFICATION_CONFIDENCE
    );

    // Inspect the PUT command — the partition key sentinel must not collide
    // with the audit table's YYYY-MM partition.
    const putCall = sendMock.mock.calls[1]![0] as PutCommandMock;
    const putInput = putCall.input as { Item: Record<string, unknown> };
    expect(putInput.Item.month).toBe("settings");
    expect(putInput.Item.ts).toBe("runtime");
    expect(putInput.Item.minClassificationConfidence).toBe(80);
    expect(putInput.Item.updatedBy).toBe("sean@smecai.au");
  });

  test("rejects out-of-range floors before writing", async () => {
    await expect(
      updateSettings({ minClassificationConfidence: 250, updatedBy: "x@y.com" })
    ).rejects.toThrow(/must be an integer between 0 and 100/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("rejects an empty updatedBy", async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined });
    await expect(
      updateSettings({ minClassificationConfidence: 75, updatedBy: "" })
    ).rejects.toThrow(/updatedBy is required/);
  });

  test("clears the cache so the next read sees the new value", async () => {
    // Seed cache with old value
    sendMock.mockResolvedValueOnce({
      Item: {
        month: "settings",
        ts: "runtime",
        minClassificationConfidence: 60,
      },
    });
    const before = await getSettings({ cacheTtlMs: 60_000 });
    expect(before.minClassificationConfidence).toBe(60);

    // Update: GET previous + PUT
    sendMock.mockResolvedValueOnce({
      Item: {
        month: "settings",
        ts: "runtime",
        minClassificationConfidence: 60,
      },
    });
    sendMock.mockResolvedValueOnce({});
    await updateSettings({
      minClassificationConfidence: 90,
      updatedBy: "sean@smecai.au",
    });

    // Next read must hit DDB and see the new value
    sendMock.mockResolvedValueOnce({
      Item: {
        month: "settings",
        ts: "runtime",
        minClassificationConfidence: 90,
      },
    });
    const after = await getSettings({ cacheTtlMs: 60_000 });
    expect(after.minClassificationConfidence).toBe(90);
  });
});
