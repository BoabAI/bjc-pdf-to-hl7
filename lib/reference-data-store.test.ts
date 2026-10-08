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

class DeleteCommandMock {
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

class BatchWriteCommandMock {
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
  DeleteCommand: DeleteCommandMock,
  QueryCommand: QueryCommandMock,
  BatchWriteCommand: BatchWriteCommandMock,
  // Stub for lib/settings.ts which imports GetCommand. Not used by
  // reference-data-store; included so cross-imports don't fail.
  GetCommand: GetCommandStub,
}));

const {
  listDoctors,
  listCarriers,
  putDoctor,
  putCarrier,
  deleteDoctor,
  deleteCarrier,
  listMailboxes,
  putMailbox,
  deleteMailbox,
} = await import("./reference-data-store");
import { DEFAULT_MAILBOXES, type MailboxConfig } from "./mailbox-config";
import {
  DEFAULT_BJC_DOCTORS,
  DEFAULT_CARRIERS,
  type Carrier,
  type Doctor,
} from "./conversion-config";

const TABLE = "bjc-pdf-to-hl7-reference-data";

beforeEach(() => {
  sendMock.mockReset();
  docClientFromMock.mockReset();
  console.error = (() => {}) as typeof console.error;
  delete process.env.REFERENCE_DATA_TABLE;
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("listDoctors", () => {
  test("queries kind=DOCTOR and returns rows", async () => {
    const rows: Doctor[] = [
      { id: "abc", name: "Dr Jane", providerNumber: "9123456Z" },
    ];
    sendMock.mockResolvedValue({ Items: rows });

    const result = await listDoctors();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as QueryCommandMock;
    expect(command).toBeInstanceOf(QueryCommandMock);
    const input = command.input as {
      TableName: string;
      KeyConditionExpression: string;
      ExpressionAttributeValues: Record<string, string>;
    };
    expect(input.TableName).toBe(TABLE);
    expect(input.KeyConditionExpression).toContain("kind");
    expect(input.ExpressionAttributeValues[":kind"]).toBe("DOCTOR");
    expect(result).toEqual(rows);
  });

  test("seeds defaults via BatchWriteCommand when table is empty, then returns them", async () => {
    sendMock
      .mockResolvedValueOnce({ Items: [] }) // first Query returns empty
      .mockResolvedValue({}); // BatchWrite resolves

    const result = await listDoctors();

    // First call: Query
    expect(sendMock.mock.calls[0][0]).toBeInstanceOf(QueryCommandMock);
    // Subsequent call(s): BatchWrite to seed defaults
    const batchCall = sendMock.mock.calls.find(
      (c) => c[0] instanceof BatchWriteCommandMock
    );
    expect(batchCall).toBeDefined();
    const batchInput = (batchCall![0] as BatchWriteCommandMock).input as {
      RequestItems: Record<string, Array<{ PutRequest: { Item: Doctor & { kind: string } } }>>;
    };
    const requests = batchInput.RequestItems[TABLE];
    // 17 doctors + 5 carriers
    expect(requests).toHaveLength(DEFAULT_BJC_DOCTORS.length + DEFAULT_CARRIERS.length);
    const doctorRequests = requests.filter((r) => r.PutRequest.Item.kind === "DOCTOR");
    expect(doctorRequests).toHaveLength(DEFAULT_BJC_DOCTORS.length);

    expect(result).toEqual(DEFAULT_BJC_DOCTORS);
  });

  test("returns empty array when DynamoDB throws", async () => {
    sendMock.mockRejectedValue(new Error("Throttled"));

    let consoleErrorCalled = false;
    console.error = (() => {
      consoleErrorCalled = true;
    }) as typeof console.error;

    const result = await listDoctors();
    expect(result).toEqual([]);
    expect(consoleErrorCalled).toBe(true);
  });
});

describe("listCarriers", () => {
  test("queries kind=CARRIER and returns rows", async () => {
    const rows: Carrier[] = [
      { id: "x", value: "SMECAI", label: "SMECAI", isDefault: true },
    ];
    sendMock.mockResolvedValue({ Items: rows });

    const result = await listCarriers();

    const command = sendMock.mock.calls[0][0] as QueryCommandMock;
    const input = command.input as {
      ExpressionAttributeValues: Record<string, string>;
    };
    expect(input.ExpressionAttributeValues[":kind"]).toBe("CARRIER");
    expect(result).toEqual(rows);
  });

  test("seeds defaults when table is empty", async () => {
    sendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValue({});

    const result = await listCarriers();

    expect(result).toEqual(DEFAULT_CARRIERS);
  });
});

describe("putDoctor / putCarrier", () => {
  test("putDoctor writes a PutCommand with kind=DOCTOR and provided fields", async () => {
    sendMock.mockResolvedValue({});
    const doctor: Doctor = {
      id: "new-id",
      name: "Dr Test",
      providerNumber: "9999999Z",
    };

    await putDoctor(doctor);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as PutCommandMock;
    expect(command).toBeInstanceOf(PutCommandMock);
    const input = command.input as {
      TableName: string;
      Item: Doctor & { kind: string; updatedAt: string };
    };
    expect(input.TableName).toBe(TABLE);
    expect(input.Item.kind).toBe("DOCTOR");
    expect(input.Item.id).toBe("new-id");
    expect(input.Item.name).toBe("Dr Test");
    expect(input.Item.providerNumber).toBe("9999999Z");
    expect(typeof input.Item.updatedAt).toBe("string");
  });

  test("putDoctor forces kind=DOCTOR even if the input carries a kind", async () => {
    sendMock.mockResolvedValue({});
    // Defence-in-depth: a doctor object must never write itself into the
    // CARRIER partition by smuggling a `kind`.
    await putDoctor({
      id: "x",
      name: "y",
      providerNumber: "z",
      kind: "CARRIER",
    } as unknown as Doctor);

    const command = sendMock.mock.calls[0][0] as PutCommandMock;
    const input = command.input as { Item: { kind: string } };
    expect(input.Item.kind).toBe("DOCTOR");
  });

  test("putCarrier writes a PutCommand with kind=CARRIER", async () => {
    sendMock.mockResolvedValue({});
    const carrier: Carrier = {
      id: "c1",
      value: "POST",
      label: "Post",
      isDefault: false,
    };

    await putCarrier(carrier);

    const command = sendMock.mock.calls[0][0] as PutCommandMock;
    const input = command.input as {
      Item: Carrier & { kind: string };
    };
    expect(input.Item.kind).toBe("CARRIER");
    expect(input.Item.value).toBe("POST");
  });

  test("putDoctor propagates the DynamoDB error so callers can surface it", async () => {
    sendMock.mockRejectedValue(new Error("nope"));

    await expect(
      putDoctor({ id: "x", name: "y", providerNumber: "z" })
    ).rejects.toThrow("nope");
  });

  test("putCarrier propagates the DynamoDB error so callers can surface it", async () => {
    sendMock.mockRejectedValue(new Error("nope"));

    await expect(
      putCarrier({ id: "x", value: "v", label: "l" })
    ).rejects.toThrow("nope");
  });
});

describe("deleteDoctor / deleteCarrier", () => {
  test("deleteDoctor sends DeleteCommand keyed by kind=DOCTOR + id", async () => {
    sendMock.mockResolvedValue({});

    await deleteDoctor("doc-id-1");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as DeleteCommandMock;
    expect(command).toBeInstanceOf(DeleteCommandMock);
    const input = command.input as {
      TableName: string;
      Key: { kind: string; id: string };
    };
    expect(input.TableName).toBe(TABLE);
    expect(input.Key.kind).toBe("DOCTOR");
    expect(input.Key.id).toBe("doc-id-1");
  });

  test("deleteCarrier sends DeleteCommand keyed by kind=CARRIER + id", async () => {
    sendMock.mockResolvedValue({});

    await deleteCarrier("car-id-1");

    const command = sendMock.mock.calls[0][0] as DeleteCommandMock;
    const input = command.input as { Key: { kind: string; id: string } };
    expect(input.Key.kind).toBe("CARRIER");
    expect(input.Key.id).toBe("car-id-1");
  });

  test("deleteDoctor propagates the DynamoDB error so callers can surface it", async () => {
    sendMock.mockRejectedValue(new Error("nope"));

    await expect(deleteDoctor("x")).rejects.toThrow("nope");
  });

  test("deleteCarrier propagates the DynamoDB error so callers can surface it", async () => {
    sendMock.mockRejectedValue(new Error("nope"));

    await expect(deleteCarrier("x")).rejects.toThrow("nope");
  });
});

describe("custom table name override", () => {
  test("respects REFERENCE_DATA_TABLE env var", async () => {
    process.env.REFERENCE_DATA_TABLE = "custom-table";
    sendMock.mockResolvedValue({ Items: [{ id: "a", name: "b", providerNumber: "c" }] });

    await listDoctors();

    const command = sendMock.mock.calls[0][0] as QueryCommandMock;
    const input = command.input as { TableName: string };
    expect(input.TableName).toBe("custom-table");
  });
});

describe("mailboxes", () => {
  const doctorAt: MailboxConfig = {
    id: "doctor@bjchealth.com.au",
    address: "doctor@bjchealth.com.au",
    sourceFolder: "Inbox/HL7",
    linkedFolder: "Inbox/HL7_linked",
    enabled: true,
  };

  test("listMailboxes queries kind=MAILBOX and strips meta", async () => {
    sendMock.mockResolvedValue({
      Items: [{ ...doctorAt, kind: "MAILBOX", updatedAt: "2026-10-08T00:00:00Z" }],
    });

    const result = await listMailboxes();

    const input = (sendMock.mock.calls[0][0] as QueryCommandMock).input as {
      ExpressionAttributeValues: Record<string, string>;
    };
    expect(input.ExpressionAttributeValues[":kind"]).toBe("MAILBOX");
    expect(result).toEqual([doctorAt]);
  });

  test("seeding an empty MAILBOX partition writes ONLY mailbox rows (never re-seeds doctors/carriers)", async () => {
    sendMock.mockResolvedValueOnce({ Items: [] }).mockResolvedValue({});

    const result = await listMailboxes();

    const batchCall = sendMock.mock.calls.find((c) => c[0] instanceof BatchWriteCommandMock);
    expect(batchCall).toBeDefined();
    const requests = ((batchCall![0] as BatchWriteCommandMock).input as {
      RequestItems: Record<string, Array<{ PutRequest: { Item: { kind: string } } }>>;
    }).RequestItems[TABLE];
    expect(requests).toHaveLength(DEFAULT_MAILBOXES.length);
    expect(requests.every((r) => r.PutRequest.Item.kind === "MAILBOX")).toBe(true);
    expect(result).toEqual(DEFAULT_MAILBOXES);
  });

  test("listMailboxes throws on DynamoDB failure so PAD can fall back instead of seeing an empty list", async () => {
    sendMock.mockRejectedValue(new Error("ddb down"));

    await expect(listMailboxes()).rejects.toThrow("ddb down");
  });

  test("listMailboxes drops malformed rows", async () => {
    sendMock.mockResolvedValue({ Items: [doctorAt, { kind: "MAILBOX", id: "x" }] });

    expect(await listMailboxes()).toEqual([doctorAt]);
  });

  test("putMailbox forces kind and updatedAt after the spread", async () => {
    sendMock.mockResolvedValue({});

    await putMailbox({ ...doctorAt, kind: "DOCTOR" } as MailboxConfig);

    const item = ((sendMock.mock.calls[0][0] as PutCommandMock).input as {
      Item: Record<string, unknown>;
    }).Item;
    expect(item.kind).toBe("MAILBOX");
    expect(typeof item.updatedAt).toBe("string");
    expect(item.sourceFolder).toBe("Inbox/HL7");
  });

  test("deleteMailbox deletes by kind=MAILBOX + id", async () => {
    sendMock.mockResolvedValue({});

    await deleteMailbox("doctor@bjchealth.com.au");

    const input = (sendMock.mock.calls[0][0] as DeleteCommandMock).input as {
      Key: { kind: string; id: string };
    };
    expect(input.Key).toEqual({ kind: "MAILBOX", id: "doctor@bjchealth.com.au" });
  });
});
