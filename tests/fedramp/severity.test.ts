import { describe, it, expect } from "vitest";
import { cvssToSeverity } from "@/lib/fedramp/severity";

describe("cvssToSeverity", () => {
  it("maps 10.0 to high", () => expect(cvssToSeverity(10.0)).toBe("high"));
  it("maps 9.8 to high", () => expect(cvssToSeverity(9.8)).toBe("high"));
  it("maps 7.0 to high", () => expect(cvssToSeverity(7.0)).toBe("high"));
  it("maps 6.9 to moderate", () => expect(cvssToSeverity(6.9)).toBe("moderate"));
  it("maps 5.5 to moderate", () => expect(cvssToSeverity(5.5)).toBe("moderate"));
  it("maps 4.0 to moderate", () => expect(cvssToSeverity(4.0)).toBe("moderate"));
  it("maps 3.9 to low", () => expect(cvssToSeverity(3.9)).toBe("low"));
  it("maps 2.5 to low", () => expect(cvssToSeverity(2.5)).toBe("low"));
  it("maps 0.1 to low", () => expect(cvssToSeverity(0.1)).toBe("low"));
  it("maps 0.0 to informational", () => expect(cvssToSeverity(0.0)).toBe("informational"));

  it("throws for negative CVSS", () =>
    expect(() => cvssToSeverity(-1)).toThrow(RangeError));
  it("throws for CVSS > 10", () =>
    expect(() => cvssToSeverity(10.1)).toThrow(RangeError));
});
