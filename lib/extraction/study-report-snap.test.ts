import { describe, expect, test } from "bun:test";

import { snapStudyReport } from "./study-report-snap";

const sleepClinic = { senderName: "Dr Alan Reed", senderClinic: "Sydney Sleep Diagnostics" };

describe("snapStudyReport", () => {
  test("promotes a consult_letter from a sleep service when the model missed the flag", () => {
    const result = snapStudyReport("consult_letter", false, sleepClinic);
    expect(result.isStudyReport).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  test("recognises nerve conduction / neurophysiology senders", () => {
    const result = snapStudyReport("consult_letter", false, {
      senderClinic: "NSW Neurophysiology Services",
    });
    expect(result.isStudyReport).toBe(true);
  });

  test("recognises optometry / eye examination senders", () => {
    const result = snapStudyReport("consult_letter", false, {
      senderClinic: "Optometry Parramatta",
    });
    expect(result.isStudyReport).toBe(true);
  });

  test("matches on senderName as well as senderClinic", () => {
    const result = snapStudyReport("consult_letter", false, {
      senderName: "Dr Priya Nair, Sleep Physician",
    });
    expect(result.isStudyReport).toBe(true);
  });

  test("leaves an already-flagged document alone and adds no warning", () => {
    const result = snapStudyReport("consult_letter", true, sleepClinic);
    expect(result.isStudyReport).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("never demotes: a flagged correspondence letter keeps the flag", () => {
    const result = snapStudyReport("consult_letter", true, {
      senderClinic: "Westmead Gastroenterology Centre",
    });
    expect(result.isStudyReport).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("does not fire for other document types", () => {
    for (const docType of ["referral", "pathology_result", "radiology_result", "generic", "consent_form"] as const) {
      const result = snapStudyReport(docType, false, sleepClinic);
      expect(result.isStudyReport).toBe(false);
      expect(result.warnings).toEqual([]);
    }
  });

  test("leaves genuine correspondence from a rheumatology-adjacent specialist alone", () => {
    for (const senderClinic of [
      "Westmead Gastroenterology Centre",
      "Parramatta Orthopaedic Clinic",
      "BJC Health Specialists",
      "Rozelle Medical Centre",
      "Bondi Family Practice",
    ]) {
      const result = snapStudyReport("consult_letter", false, { senderClinic });
      expect(result.isStudyReport).toBe(false);
      expect(result.warnings).toEqual([]);
    }
  });

  test("does not flag ophthalmology or cardiology correspondence — BJC is a rheumatology practice", () => {
    for (const senderClinic of [
      "Sydney Eye Hospital",
      "Prince of Wales Ophthalmology Department",
      "Eastern Heart Clinic",
      "Sydney Cardiology Associates",
    ]) {
      const result = snapStudyReport("consult_letter", false, { senderClinic });
      expect(result.isStudyReport).toBe(false);
    }
  });

  test("leaves ECG / echo / spirometry to the model — those destinations are unresolved with the client", () => {
    for (const senderClinic of [
      "Westmead Respiratory Function Laboratory",
      "Eastern Heart Clinic Echocardiography",
    ]) {
      const result = snapStudyReport("consult_letter", false, { senderClinic });
      expect(result.isStudyReport).toBe(false);
    }
  });

  test("handles absent referral info", () => {
    const result = snapStudyReport("consult_letter", false, undefined);
    expect(result.isStudyReport).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  test("matches case-insensitively", () => {
    const result = snapStudyReport("consult_letter", false, {
      senderClinic: "SLEEP DIAGNOSTICS GROUP",
    });
    expect(result.isStudyReport).toBe(true);
  });

  test("warning is digit-free so redactWarning keeps it", () => {
    const result = snapStudyReport("consult_letter", false, sleepClinic);
    expect(result.warnings[0]).not.toMatch(/\d/);
  });
});
