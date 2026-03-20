import { describe, expect, test } from "bun:test";
import { cn } from "./utils";

describe("cn", () => {
  test("joins only truthy class names", () => {
    expect(cn("btn", undefined, false, "active")).toBe("btn active");
  });

  test("returns an empty string when every class name is falsy", () => {
    expect(cn(undefined, false)).toBe("");
  });
});
