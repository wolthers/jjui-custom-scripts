import { describe, expect, it } from "vitest";
import { parsePrNumberFromMessage } from "./common.js";

describe("parsePrNumberFromMessage", () => {
  it("extracts PR number from (#1234)", () => {
    expect(parsePrNumberFromMessage("Fix sidebar (#1234)")).toBe(1234);
  });

  it("extracts first PR number when multiple present", () => {
    expect(parsePrNumberFromMessage("Fix (#10) and (#20)")).toBe(10);
  });

  it("returns undefined when no PR reference", () => {
    expect(parsePrNumberFromMessage("Just a commit message")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parsePrNumberFromMessage("")).toBeUndefined();
  });

  it("handles PR number in multiline description", () => {
    const msg = "Move notes/tasks back to sidebar (#1271)\n\nBody here\n";
    expect(parsePrNumberFromMessage(msg)).toBe(1271);
  });

  it("does not match bare #number without parens", () => {
    expect(parsePrNumberFromMessage("Fix #42 issue")).toBeUndefined();
  });

  it("trims whitespace before matching", () => {
    expect(parsePrNumberFromMessage("  (#99)  ")).toBe(99);
  });
});
