import { describe, it, expect } from "vitest";
import {
  formatPoamNumber,
  parsePoamNumber,
  PoamNumberSchema,
  SystemShortCodeSchema,
} from "@/lib/fedramp/poam";

describe("formatPoamNumber", () => {
  it("formats correctly with zero padding", () =>
    expect(formatPoamNumber("ACME", 42)).toBe("V-ACME-0042"));
  it("forces uppercase short code", () =>
    expect(formatPoamNumber("acme", 1)).toBe("V-ACME-0001"));
  it("handles 4-digit sequence without extra padding", () =>
    expect(formatPoamNumber("ACME", 9999)).toBe("V-ACME-9999"));
  it("handles sequence > 9999", () =>
    expect(formatPoamNumber("ACME", 10000)).toBe("V-ACME-10000"));

  it("throws for sequence 0", () =>
    expect(() => formatPoamNumber("ACME", 0)).toThrow(RangeError));
  it("throws for negative sequence", () =>
    expect(() => formatPoamNumber("ACME", -1)).toThrow(RangeError));
  it("throws for non-integer", () =>
    expect(() => formatPoamNumber("ACME", 1.5)).toThrow(RangeError));
});

describe("parsePoamNumber", () => {
  it("parses a valid number", () =>
    expect(parsePoamNumber("V-ACME-0042")).toEqual({
      shortCode: "ACME",
      sequence: 42,
    }));
  it("returns null for invalid format", () =>
    expect(parsePoamNumber("INVALID")).toBeNull());
  it("returns null for lowercase", () =>
    expect(parsePoamNumber("v-acme-0042")).toBeNull());
});

describe("PoamNumberSchema", () => {
  it("accepts valid numbers", () => {
    expect(PoamNumberSchema.safeParse("V-ACME-0042").success).toBe(true);
  });
  it("rejects invalid numbers", () => {
    expect(PoamNumberSchema.safeParse("INVALID").success).toBe(false);
  });
});

describe("SystemShortCodeSchema", () => {
  it("accepts valid codes", () => {
    expect(SystemShortCodeSchema.safeParse("ACME").success).toBe(true);
    expect(SystemShortCodeSchema.safeParse("FED01").success).toBe(true);
  });
  it("rejects lowercase", () =>
    expect(SystemShortCodeSchema.safeParse("acme").success).toBe(false));
  it("rejects too-short codes", () =>
    expect(SystemShortCodeSchema.safeParse("A").success).toBe(false));
  it("rejects too-long codes", () =>
    expect(SystemShortCodeSchema.safeParse("TOOLONGCODE1").success).toBe(false));
  it("rejects special characters", () =>
    expect(SystemShortCodeSchema.safeParse("AC-ME").success).toBe(false));
});
