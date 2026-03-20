import { beforeEach, describe, expect, mock, test } from "bun:test";

const sendMock = mock();
const clientConfigs: Array<{ region: string }> = [];

class BedrockRuntimeClientMock {
  send = sendMock;

  constructor(config: { region: string }) {
    clientConfigs.push(config);
  }
}

class ConverseCommandMock {
  input: unknown;

  constructor(input: unknown) {
    this.input = input;
  }
}

mock.module("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: BedrockRuntimeClientMock,
  ConverseCommand: ConverseCommandMock,
}));

const { extractPatientDataWithVision } = await import("./vision-extractor");

const PDF_BUFFER = Buffer.from("%PDF-1.4 test");

beforeEach(() => {
  sendMock.mockReset();
  clientConfigs.length = 0;
});

describe("extractPatientDataWithVision success path", () => {
  test("sends the expected Bedrock request and normalizes extracted fields", async () => {
    sendMock.mockResolvedValue({
      output: {
        message: {
          content: [
            {
              toolUse: {
                input: {
                  documentType: "not_real",
                  firstName: "  Jane  ",
                  lastName: " Smith ",
                  dob: "5/6/1984",
                  sex: "X",
                  phone: "(0412) 345 678",
                  address: " 10 Collins St ",
                  suburb: " Melbourne ",
                  state: null,
                  postcode: "3000",
                  medicareNo: "1234 56789 0",
                  medicareRef: " 2 ",
                  senderName: " Dr Sarah Jones ",
                  senderClinic: " Springfield Medical ",
                  senderProviderNumber: " 1234567A ",
                  addresseeName: " Dr Michael Brown ",
                  addresseeClinic: " BJC Health ",
                },
              },
            },
          ],
        },
      },
      usage: {
        inputTokens: 12,
        outputTokens: 34,
      },
    });

    const result = await extractPatientDataWithVision(PDF_BUFFER, {
      model: "custom-model",
      timeoutMs: 1_000,
      documentTypeHint: "gp_referral",
    });

    expect(clientConfigs).toEqual([{ region: "ap-southeast-2" }]);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const [command, requestOptions] = sendMock.mock.calls[0]!;
    const input = (command as ConverseCommandMock).input as any;

    expect(input.modelId).toBe("custom-model");
    expect(input.system[0].text).toContain(
      "medical document data extraction assistant"
    );
    expect(input.messages[0].content[0].text).toContain(
      "A document type hint was provided: gp_referral"
    );
    expect(input.messages[0].content[1].document.source.bytes).toEqual(PDF_BUFFER);
    expect(input.toolConfig.toolChoice.tool.name).toBe("extract_patient_data");
    expect(requestOptions.abortSignal).toBeInstanceOf(AbortSignal);

    expect(result).toEqual({
      success: true,
      data: {
        firstName: "Jane",
        lastName: "Smith",
        dob: "19840605",
        sex: "U",
        phone: "0412 345 678",
        address: "10 Collins St",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
        medicareNo: "1234567890",
        medicareRef: "2",
      },
      warnings: [
        "Vision extraction returned an invalid document type; defaulted to gp_referral",
      ],
      model: "custom-model",
      documentType: "gp_referral",
      referralInfo: {
        senderName: "Dr Sarah Jones",
        senderClinic: "Springfield Medical",
        senderProviderNumber: "1234567A",
        addresseeName: "Dr Michael Brown",
        addresseeClinic: "BJC Health",
      },
      tokensUsed: {
        input: 12,
        output: 34,
      },
    });
  });

  test("uses the default prompt when no document type hint is provided", async () => {
    sendMock.mockResolvedValue({
      output: {
        message: {
          content: [
            {
              toolUse: {
                input: {
                  documentType: "generic",
                  firstName: "Jane",
                  lastName: "Smith",
                  dob: "14/05/1992",
                  sex: "F",
                  phone: null,
                  address: null,
                  suburb: null,
                  state: null,
                  postcode: null,
                  medicareNo: null,
                  medicareRef: null,
                },
              },
            },
          ],
        },
      },
    });

    const result = await extractPatientDataWithVision(PDF_BUFFER);
    const [command] = sendMock.mock.calls[0]!;
    const input = (command as ConverseCommandMock).input as any;

    expect(input.messages[0].content[0].text).toBe(
      "Classify this Australian medical PDF and extract the patient information using the extract_patient_data tool."
    );
    expect(result.documentType).toBe("generic");
    expect(result.model).toBe("au.anthropic.claude-sonnet-4-6");
  });
});

describe("extractPatientDataWithVision failure handling", () => {
  test("returns a structured failure when Bedrock does not return tool output", async () => {
    sendMock.mockResolvedValue({
      output: {
        message: {
          content: [{ text: "No tool use" }],
        },
      },
    });

    const result = await extractPatientDataWithVision(PDF_BUFFER, {
      documentTypeHint: "consent_form",
    });

    expect(result).toEqual({
      success: false,
      data: {
        firstName: "UNKNOWN",
        lastName: "PATIENT",
        dob: "19000101",
        sex: "U",
      },
      warnings: ["Bedrock returned no tool use result"],
      model: "au.anthropic.claude-sonnet-4-6",
      documentType: "consent_form",
    });
  });

  test("marks extraction as failed when patient name or DOB cannot be determined", async () => {
    sendMock.mockResolvedValue({
      output: {
        message: {
          content: [
            {
              toolUse: {
                input: {
                  documentType: "generic",
                  firstName: null,
                  lastName: " ",
                  dob: "not-a-date",
                  sex: "F",
                  phone: null,
                  address: null,
                  suburb: null,
                  state: " ",
                  postcode: "99",
                  medicareNo: null,
                  medicareRef: null,
                  senderName: null,
                  senderClinic: null,
                  senderProviderNumber: null,
                  addresseeName: null,
                  addresseeClinic: null,
                },
              },
            },
          ],
        },
      },
    });

    const result = await extractPatientDataWithVision(PDF_BUFFER);

    expect(result.success).toBe(false);
    expect(result.data).toEqual({
      firstName: "UNKNOWN",
      lastName: "PATIENT",
      dob: "19000101",
      sex: "F",
      phone: undefined,
      address: undefined,
      suburb: undefined,
      state: undefined,
      postcode: "99",
      medicareNo: undefined,
      medicareRef: undefined,
    });
    expect(result.warnings).toEqual([
      "Vision extraction could not determine patient name",
      "Vision extraction could not determine date of birth",
    ]);
    expect(result.referralInfo).toBeUndefined();
    expect(result.tokensUsed).toBeUndefined();
  });

  test("returns a timeout warning for aborted requests", async () => {
    sendMock.mockImplementation(
      (_command: unknown, options?: { abortSignal?: AbortSignal }) =>
        new Promise((_, reject) => {
          options?.abortSignal?.addEventListener("abort", () => {
            const error = new Error("request aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    );

    const result = await extractPatientDataWithVision(PDF_BUFFER, {
      timeoutMs: 10,
    });

    expect(result.success).toBe(false);
    expect(result.warnings).toEqual([
      "Vision extraction timed out after 0.01s",
    ]);
    expect(result.documentType).toBe("generic");
  });

  test("returns an access denied warning when Bedrock permissions are missing", async () => {
    const error = new Error("AccessDenied: denied");
    error.name = "AccessDeniedException";
    sendMock.mockRejectedValue(error);

    const result = await extractPatientDataWithVision(PDF_BUFFER, {
      model: "custom-model",
      documentTypeHint: "referral_letter",
    });

    expect(result.warnings).toEqual([
      "Vision extraction failed: Bedrock access denied — ensure the runtime IAM role has bedrock:InvokeModel permission for custom-model",
    ]);
    expect(result.documentType).toBe("referral_letter");
  });

  test("returns a credentials warning when AWS credentials are unavailable", async () => {
    sendMock.mockRejectedValue(
      new Error("Could not load credentials from any providers")
    );

    const result = await extractPatientDataWithVision(PDF_BUFFER);

    expect(result.warnings).toEqual([
      "Vision extraction failed: AWS credentials unavailable. In Amplify SSR, attach a compute role with Bedrock permissions; locally, configure AWS credentials.",
    ]);
  });

  test("surfaces unexpected Bedrock errors generically", async () => {
    sendMock.mockRejectedValue(new Error("Upstream crashed"));

    const result = await extractPatientDataWithVision(PDF_BUFFER);

    expect(result.warnings).toEqual([
      "Vision extraction error: Upstream crashed",
    ]);
    expect(result.data).toEqual({
      firstName: "UNKNOWN",
      lastName: "PATIENT",
      dob: "19000101",
      sex: "U",
    });
  });
});
