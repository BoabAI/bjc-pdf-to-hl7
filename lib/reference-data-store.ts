import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DEFAULT_BJC_DOCTORS,
  DEFAULT_CARRIERS,
  type Carrier,
  type Doctor,
} from "./conversion-config";
import { logOperationalError } from "./server/logging";

const REGION = "ap-southeast-2";
const DEFAULT_TABLE = "bjc-pdf-to-hl7-reference-data";

type Kind = "DOCTOR" | "CARRIER";

interface DoctorRow extends Doctor {
  kind: "DOCTOR";
  updatedAt: string;
}

interface CarrierRow extends Carrier {
  kind: "CARRIER";
  updatedAt: string;
}

function getTableName(): string {
  return process.env.REFERENCE_DATA_TABLE ?? DEFAULT_TABLE;
}

function buildDocClient(): DynamoDBDocumentClient {
  const base = new DynamoDBClient({ region: REGION });
  return DynamoDBDocumentClient.from(base);
}

function nowIso(): string {
  return new Date().toISOString();
}

async function queryByKind<T>(client: DynamoDBDocumentClient, kind: Kind): Promise<T[]> {
  const response = await client.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "#k = :kind",
      ExpressionAttributeNames: { "#k": "kind" },
      ExpressionAttributeValues: { ":kind": kind },
    })
  );
  return (response.Items ?? []) as T[];
}

/**
 * Seeds the reference-data table with the bundled defaults — both doctors and
 * carriers in one BatchWrite. Idempotent only via the empty-table check in
 * the list functions; calling this directly will overwrite.
 */
async function seedDefaults(client: DynamoDBDocumentClient): Promise<void> {
  const ts = nowIso();
  const doctorRequests = DEFAULT_BJC_DOCTORS.map((d) => ({
    PutRequest: {
      Item: { kind: "DOCTOR", updatedAt: ts, ...d } satisfies DoctorRow,
    },
  }));
  const carrierRequests = DEFAULT_CARRIERS.map((c) => ({
    PutRequest: {
      Item: { kind: "CARRIER", updatedAt: ts, ...c } satisfies CarrierRow,
    },
  }));

  await client.send(
    new BatchWriteCommand({
      RequestItems: {
        [getTableName()]: [...doctorRequests, ...carrierRequests],
      },
    })
  );
}

function stripMeta<T extends { kind?: unknown; updatedAt?: unknown }>(row: T): Omit<T, "kind" | "updatedAt"> {
  const { kind: _kind, updatedAt: _updatedAt, ...rest } = row;
  return rest;
}

function isDoctor(value: unknown): value is Doctor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.providerNumber === "string"
  );
}

function isCarrier(value: unknown): value is Carrier {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.value === "string" &&
    typeof v.label === "string"
  );
}

/**
 * Returns all BJC doctors. Seeds the bundled defaults on first run when the
 * table partition is empty. Returns `[]` rather than throwing when DynamoDB
 * is unavailable so the UI can degrade rather than crash.
 */
export async function listDoctors(): Promise<Doctor[]> {
  try {
    const client = buildDocClient();
    const items = await queryByKind<DoctorRow>(client, "DOCTOR");
    if (items.length === 0) {
      await seedDefaults(client);
      return DEFAULT_BJC_DOCTORS;
    }
    return items.filter(isDoctor).map(stripMeta);
  } catch (error) {
    logOperationalError("reference-data", error, { op: "listDoctors" });
    return [];
  }
}

/**
 * Returns all carriers. Seeds defaults on empty partition (same shape as
 * `listDoctors`). The seed pass writes BOTH kinds, so calling either list
 * function first triggers the seed for the whole table.
 */
export async function listCarriers(): Promise<Carrier[]> {
  try {
    const client = buildDocClient();
    const items = await queryByKind<CarrierRow>(client, "CARRIER");
    if (items.length === 0) {
      await seedDefaults(client);
      return DEFAULT_CARRIERS;
    }
    return items.filter(isCarrier).map(stripMeta);
  } catch (error) {
    logOperationalError("reference-data", error, { op: "listCarriers" });
    return [];
  }
}

/** Upsert a single doctor. Throws on DDB failure; caller is responsible for handling. */
export async function putDoctor(doctor: Doctor): Promise<void> {
  const client = buildDocClient();
  // Spread first so caller-supplied fields can never override the partition
  // key (kind) or updatedAt — defence-in-depth against mass assignment.
  const item: DoctorRow = { ...doctor, kind: "DOCTOR", updatedAt: nowIso() };
  await client.send(new PutCommand({ TableName: getTableName(), Item: item }));
}

/** Upsert a single carrier. Throws on DDB failure; caller is responsible for handling. */
export async function putCarrier(carrier: Carrier): Promise<void> {
  const client = buildDocClient();
  const item: CarrierRow = { ...carrier, kind: "CARRIER", updatedAt: nowIso() };
  await client.send(new PutCommand({ TableName: getTableName(), Item: item }));
}

/** Remove a doctor by id. Throws on DDB failure; caller is responsible for handling. */
export async function deleteDoctor(id: string): Promise<void> {
  const client = buildDocClient();
  await client.send(
    new DeleteCommand({
      TableName: getTableName(),
      Key: { kind: "DOCTOR", id },
    })
  );
}

/** Remove a carrier by id. Throws on DDB failure; caller is responsible for handling. */
export async function deleteCarrier(id: string): Promise<void> {
  const client = buildDocClient();
  await client.send(
    new DeleteCommand({
      TableName: getTableName(),
      Key: { kind: "CARRIER", id },
    })
  );
}
