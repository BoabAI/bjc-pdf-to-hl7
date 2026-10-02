import { beforeEach, describe, expect, mock, test } from "bun:test";

const listDoctorsMock = mock();

mock.module("../reference-data-store", () => ({
  listDoctors: listDoctorsMock,
}));

import { clearRosterCache, loadConversionRoster } from "./doctor-roster";
import { DEFAULT_BJC_DOCTORS } from "../conversion-config";

const DDB_DOCTORS = [
  { id: "doctor-irwin-lim", name: "Dr I Lim", providerNumber: "" },
  { id: "doctor-herman-lau", name: "Dr H Lau", providerNumber: "" },
];

describe("loadConversionRoster", () => {
  beforeEach(() => {
    listDoctorsMock.mockReset();
    listDoctorsMock.mockResolvedValue(DDB_DOCTORS);
    clearRosterCache();
  });

  test("request-supplied names win and skip DynamoDB entirely", async () => {
    const roster = await loadConversionRoster(["Dr Irwin Lim", "Dr Herman Lau"]);
    expect(roster).toEqual(["Dr Irwin Lim", "Dr Herman Lau"]);
    expect(listDoctorsMock).not.toHaveBeenCalled();
  });

  test("falls back to the DynamoDB reference-data roster when the request has none", async () => {
    const roster = await loadConversionRoster(undefined);
    expect(roster).toEqual(["Dr I Lim", "Dr H Lau"]);
    expect(listDoctorsMock).toHaveBeenCalledTimes(1);
  });

  test("an empty request list is treated as absent", async () => {
    const roster = await loadConversionRoster([]);
    expect(roster).toEqual(["Dr I Lim", "Dr H Lau"]);
  });

  test("falls back to the seeded defaults when DynamoDB returns no doctors", async () => {
    listDoctorsMock.mockResolvedValue([]);
    const roster = await loadConversionRoster(undefined);
    expect(roster).toEqual(DEFAULT_BJC_DOCTORS.map((d) => d.name));
  });

  test("caches the DynamoDB roster so back-to-back conversions query once", async () => {
    await loadConversionRoster(undefined);
    const roster = await loadConversionRoster(undefined);
    expect(roster).toEqual(["Dr I Lim", "Dr H Lau"]);
    expect(listDoctorsMock).toHaveBeenCalledTimes(1);
  });

  test("re-queries after the cache TTL expires", async () => {
    await loadConversionRoster(undefined, { cacheTtlMs: 0 });
    await loadConversionRoster(undefined, { cacheTtlMs: 0 });
    expect(listDoctorsMock).toHaveBeenCalledTimes(2);
  });

  test("does not cache an empty result, so a DynamoDB blip is retried", async () => {
    listDoctorsMock.mockResolvedValueOnce([]);
    expect(await loadConversionRoster(undefined)).toEqual(
      DEFAULT_BJC_DOCTORS.map((d) => d.name)
    );
    expect(await loadConversionRoster(undefined)).toEqual(["Dr I Lim", "Dr H Lau"]);
    expect(listDoctorsMock).toHaveBeenCalledTimes(2);
  });
});
