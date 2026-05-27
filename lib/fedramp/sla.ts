/**
 * FedRAMP remediation SLA windows in calendar days.
 *
 * Source: FedRAMP Continuous Monitoring Strategy Guide, Table 2.
 * These are constants. Do not hardcode them anywhere else.
 */

import type { Severity } from "./severity";

export const SLA_DAYS = {
  high: 30,
  moderate: 90,
  low: 180,
  // Informational findings have no SLA requirement.
  informational: null,
} as const satisfies Record<Severity, number | null>;

export type SlaDays = typeof SLA_DAYS;

/**
 * Returns the SLA window in days for a given severity, or null if none applies.
 */
export function getSlaDays(severity: Severity): number | null {
  return SLA_DAYS[severity];
}

/**
 * Computes the SLA deadline given the date a finding was first detected
 * and its severity.
 *
 * All arithmetic is UTC-based so timezone offsets cannot shift a deadline
 * by a calendar day. This is important for compliance tracking where the
 * exact calendar date matters for audit purposes.
 *
 * Returns null for informational findings.
 */
export function computeSlaDeadline(
  firstDetected: Date,
  severity: Severity
): Date | null {
  const days = getSlaDays(severity);
  if (days === null) return null;

  // Use UTC constructor to avoid DST/timezone shifts.
  return new Date(
    Date.UTC(
      firstDetected.getUTCFullYear(),
      firstDetected.getUTCMonth(),
      firstDetected.getUTCDate() + days
    )
  );
}

/**
 * Computes whole calendar days remaining until the SLA deadline from a
 * reference date (typically today). Negative values mean the finding is
 * overdue. Partial days are rounded up (a deadline at any point today
 * counts as 0 days remaining, not -1).
 *
 * All arithmetic is UTC-based.
 *
 * Returns null for informational findings.
 */
export function computeDaysToSla(
  firstDetected: Date,
  severity: Severity,
  referenceDate: Date = new Date()
): number | null {
  const deadline = computeSlaDeadline(firstDetected, severity);
  if (deadline === null) return null;

  // Truncate both dates to UTC midnight before diffing to get whole-day counts.
  const deadlineDay = Date.UTC(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth(),
    deadline.getUTCDate()
  );
  const referenceDay = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  );

  return Math.ceil((deadlineDay - referenceDay) / (1000 * 60 * 60 * 24));
}

/**
 * SLA status buckets for display and filtering.
 */
export type SlaStatus = "ok" | "warning" | "overdue" | "not_applicable";

/** Number of days before the deadline at which a warning is issued. */
export const SLA_WARNING_THRESHOLD_DAYS = 7;

/**
 * Returns the SLA status for a given days-remaining value.
 */
export function getSlaStatus(daysToSla: number | null): SlaStatus {
  if (daysToSla === null) return "not_applicable";
  if (daysToSla < 0) return "overdue";
  if (daysToSla <= SLA_WARNING_THRESHOLD_DAYS) return "warning";
  return "ok";
}
