import { beforeEach, describe, expect, mock, test } from "bun:test";

const listDoctorsMock = mock();

mock.module("../reference-data-store", () => ({
  listDoctors: listDoctorsMock,
}));

import { loadConversionRoster } from "./doctor-roster";
import { DEFAULT_BJC_DOCTORS } from "../conversion-config";

const DDB_DOCTORS = [
  { id: "doctor-irwin-lim", name: "Dr I Lim", providerNumber: "" },
  { id: "doctor-herman-lau", name: "Dr H Lau", providerNumber: "" },
];

describe("loadConversionRoster", () => {
  beforeEach(() => {
    listDoctorsMock.mockReset();
    listDoctorsMock.mockResolvedValue(DDB_DOCTORS);
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

  test("falls back to the seeded defaults when DynamoDB errors — never throws", async () => {
    listDoctorsMock.mockRejectedValue(new Error("ddb unavailable"));
    const roster = await loadConversionRoster(undefined);
    expect(roster).toEqual(DEFAULT_BJC_DOCTORS.map((d) => d.name));
  });
});
