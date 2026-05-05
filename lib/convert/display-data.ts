import type { PatientData, ReferralInfo } from "../domain/types";

export interface FormattedExtractedData {
  firstName: string;
  lastName: string;
  dob: string;
  sex: string;
  medicareNo: string;
  sender?: string;
  addressee?: string;
  cc?: string;
}

function formatHL7Date(date: string): string {
  return date.length === 8
    ? `${date.slice(6, 8)}/${date.slice(4, 6)}/${date.slice(0, 4)}`
    : date;
}

function formatSex(sex: PatientData["sex"]): string {
  if (sex === "M") return "Male";
  if (sex === "F") return "Female";
  return "Unknown";
}

function formatMedicare(data: PatientData): string {
  if (!data.medicareNo) return "Not provided";
  return `${data.medicareNo}${data.medicareRef ? `-${data.medicareRef}` : ""}`;
}

function formatNameAndClinic(name?: string, clinic?: string): string | undefined {
  if (!name) return undefined;
  return clinic ? `${name} (${clinic})` : name;
}

export function formatExtractedData(
  data: PatientData,
  referralInfo?: ReferralInfo
): FormattedExtractedData {
  const sender = formatNameAndClinic(
    referralInfo?.senderName,
    referralInfo?.senderClinic
  );
  const addressee = formatNameAndClinic(
    referralInfo?.addresseeName,
    referralInfo?.addresseeClinic
  );

  return {
    firstName: data.firstName,
    lastName: data.lastName,
    dob: formatHL7Date(data.dob),
    sex: formatSex(data.sex),
    medicareNo: formatMedicare(data),
    ...(sender ? { sender } : {}),
    ...(addressee ? { addressee } : {}),
    ...(referralInfo?.ccNames && referralInfo.ccNames.length > 0
      ? { cc: referralInfo.ccNames.join(", ") }
      : {}),
  };
}
