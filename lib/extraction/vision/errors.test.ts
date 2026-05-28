import { describe, expect, test } from "bun:test";
import { mapBedrockError } from "./errors";

const CONTEXT = { timeoutMs: 30_000, model: "au.anthropic.claude-opus-4-7" };

describe("mapBedrockError — timeout", () => {
  test("returns a timeout warning for AbortError", () => {
    const error = new Error("request aborted");
    error.name = "AbortError";
    expect(mapBedrockError(error, { timeoutMs: 10, model: "any" })).toBe(
      "Vision extraction timed out after 0.01s"
    );
  });

  test("formats the timeout in seconds based on context", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    expect(mapBedrockError(error, { ...CONTEXT, timeoutMs: 30_000 })).toBe(
      "Vision extraction timed out after 30s"
    );
  });
});

describe("mapBedrockError — IAM / access denied", () => {
  test("returns IAM warning for AccessDeniedException error name", () => {
    const error = new Error("denied");
    error.name = "AccessDeniedException";
    expect(mapBedrockError(error, { ...CONTEXT, model: "custom-model" })).toBe(
      "Vision extraction failed: Bedrock access denied — ensure the runtime IAM role has bedrock:InvokeModel permission for custom-model"
    );
  });

  test("returns IAM warning when message contains AccessDenied", () => {
    const error = new Error("AccessDenied: missing permissions");
    expect(mapBedrockError(error, CONTEXT)).toContain(
      "Bedrock access denied"
    );
    expect(mapBedrockError(error, CONTEXT)).toContain(CONTEXT.model);
  });
});

describe("mapBedrockError — credentials", () => {
  test("returns credentials warning when message mentions missing credentials", () => {
    const error = new Error("Could not load credentials from any providers");
    expect(mapBedrockError(error, CONTEXT)).toBe(
      "Vision extraction failed: AWS credentials unavailable. In Amplify SSR, attach a compute role with Bedrock permissions; locally, configure AWS credentials."
    );
  });
});

describe("mapBedrockError — generic fallback", () => {
  test("surfaces unknown Error messages generically", () => {
    expect(mapBedrockError(new Error("Upstream crashed"), CONTEXT)).toBe(
      "Vision extraction error: Upstream crashed"
    );
  });

  test("surfaces non-Error throws as Unknown", () => {
    expect(mapBedrockError("just a string", CONTEXT)).toBe(
      "Vision extraction error: Unknown"
    );
    expect(mapBedrockError(undefined, CONTEXT)).toBe(
      "Vision extraction error: Unknown"
    );
  });

  test("never throws on weird inputs", () => {
    expect(() => mapBedrockError({}, CONTEXT)).not.toThrow();
    expect(() => mapBedrockError(null, CONTEXT)).not.toThrow();
  });
});
