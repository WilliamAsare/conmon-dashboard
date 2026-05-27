import { describe, it, expect } from "vitest";
import {
  computeSlaDeadline,
  computeDaysToSla,
  getSlaStatus,
  SLA_DAYS,
} from "@/lib/fedramp/sla";

const date = (s: string) => new Date(s);

describe("SLA_DAYS constants", () => {
  it("high is 30", () => expect(SLA_DAYS.high).toBe(30));
  it("moderate is 90", () => expect(SLA_DAYS.moderate).toBe(90));
  it("low is 180", () => expect(SLA_DAYS.low).toBe(180));
  it("informational is null", () => expect(SLA_DAYS.informational).toBeNull());
});

describe("computeSlaDeadline", () => {
  it("adds 30 days for high", () => {
    const result = computeSlaDeadline(date("2024-01-01"), "high");
    expect(result?.toISOString().slice(0, 10)).toBe("2024-01-31");
  });

  it("adds 90 days for moderate", () => {
    // 2024-01-01 + 90 days = 2024-03-31
    // Jan (31) + Feb 2024 (29, leap) + 30 days into March = March 30? No:
    // day 0 = Jan 1, day 90 = March 31 (Jan 31 remaining = 30d, Feb = 29d, Mar 31d total 90)
    const result = computeSlaDeadline(date("2024-01-01"), "moderate");
    expect(result?.toISOString().slice(0, 10)).toBe("2024-03-31");
  });

  it("adds 180 days for low", () => {
    // 2024-01-01 + 180 days = 2024-06-29
    // Jan(30) + Feb(29) + Mar(31) + Apr(30) + May(31) + 29 days of Jun = 180 days
    const result = computeSlaDeadline(date("2024-01-01"), "low");
    expect(result?.toISOString().slice(0, 10)).toBe("2024-06-29");
  });

  it("returns null for informational", () => {
    expect(computeSlaDeadline(date("2024-01-01"), "informational")).toBeNull();
  });
});

describe("computeDaysToSla", () => {
  it("returns positive days when deadline is in the future", () => {
    const firstDetected = date("2024-01-01");
    const reference = date("2024-01-15"); // 15 days after detection
    const days = computeDaysToSla(firstDetected, "high", reference);
    // deadline = 2024-01-31, reference = 2024-01-15, diff = 16 days
    expect(days).toBe(16);
  });

  it("returns negative days when overdue", () => {
    const firstDetected = date("2024-01-01");
    const reference = date("2024-02-15"); // past the 30-day high deadline
    const days = computeDaysToSla(firstDetected, "high", reference);
    expect(days).toBeLessThan(0);
  });

  it("returns null for informational", () => {
    expect(
      computeDaysToSla(date("2024-01-01"), "informational", date("2024-01-15"))
    ).toBeNull();
  });
});

describe("getSlaStatus", () => {
  it("null -> not_applicable", () =>
    expect(getSlaStatus(null)).toBe("not_applicable"));
  it("negative -> overdue", () => expect(getSlaStatus(-1)).toBe("overdue"));
  it("0 -> warning", () => expect(getSlaStatus(0)).toBe("warning"));
  it("7 -> warning", () => expect(getSlaStatus(7)).toBe("warning"));
  it("8 -> ok", () => expect(getSlaStatus(8)).toBe("ok"));
  it("large positive -> ok", () => expect(getSlaStatus(100)).toBe("ok"));
});
