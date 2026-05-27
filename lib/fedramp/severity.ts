/**
 * CVSS v3 score to FedRAMP severity bucket mapping.
 *
 * Source: NIST NVD / FedRAMP Vulnerability Scanning Requirements.
 * Use this module for all severity conversions. Do not invent custom logic.
 */

export type Severity = "high" | "moderate" | "low" | "informational";

/**
 * CVSS score thresholds. Inclusive on the lower bound.
 *
 *   High:          7.0 – 10.0
 *   Moderate:      4.0 – 6.9
 *   Low:           0.1 – 3.9
 *   Informational: 0.0 (or no score)
 */
export function cvssToSeverity(cvssScore: number): Severity {
  if (cvssScore < 0 || cvssScore > 10) {
    throw new RangeError(
      `CVSS score must be between 0 and 10, received ${cvssScore}`
    );
  }
  if (cvssScore >= 7.0) return "high";
  if (cvssScore >= 4.0) return "moderate";
  if (cvssScore >= 0.1) return "low";
  return "informational";
}

/**
 * Display labels for severity values — short form used in table badges.
 */
export const SEVERITY_LABEL: Record<Severity, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
  informational: "Info",
};

/**
 * Sort weight for severity. Higher number = higher severity.
 * Used when sorting tables and computing aggregate risk.
 */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  high: 4,
  moderate: 3,
  low: 2,
  informational: 1,
};

export function compareBySeverity(a: Severity, b: Severity): number {
  return SEVERITY_WEIGHT[b] - SEVERITY_WEIGHT[a];
}
