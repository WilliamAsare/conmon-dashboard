/**
 * Shared types for scan parsers.
 *
 * Both the Nessus and Qualys parsers produce ParsedFinding[] as output.
 * The ingestion pipeline maps these to the database schema.
 */

import { cvssToSeverity } from "@/lib/fedramp/severity";
import type { Severity } from "@/lib/fedramp/severity";

export type { Severity };

export interface ParsedFinding {
  /** Scanner-native plugin/QID identifier. Used for deduplication. */
  plugin_id: string;
  title: string;
  description: string;
  /** CVSS v3 base score, or v2 if v3 is unavailable. Null if the scanner didn't report one. */
  cvss_score: number | null;
  severity: Severity;
  affected_asset: string;
  /** ISO date string (YYYY-MM-DD) */
  first_detected: string;
  /** ISO date string (YYYY-MM-DD) */
  last_detected: string;
  /** CVE identifiers associated with this finding, if any. */
  cves: string[];
}

export interface ParseResult {
  findings: ParsedFinding[];
  scanner_name: string;
  /** ISO date string (YYYY-MM-DD) representing the scan date. */
  scan_date: string;
  /** Any non-fatal parse warnings. */
  warnings: string[];
}

/**
 * Normalize a raw CVSS score string from a scanner.
 * Returns null if the value is missing, zero, or not a valid number.
 */
export function normalizeScore(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (isNaN(n) || n < 0 || n > 10) return null;
  return n;
}

/**
 * Derive severity from a raw score, falling back to a scanner-reported
 * severity string when no CVSS score is available.
 */
export function deriveSeverity(
  cvssScore: number | null,
  fallbackLabel: string | undefined
): Severity {
  if (cvssScore !== null) return cvssToSeverity(cvssScore);

  const label = (fallbackLabel ?? "").toLowerCase();
  if (label.includes("critical") || label.includes("high")) return "high";
  if (label.includes("medium") || label.includes("moderate")) return "moderate";
  if (label.includes("low")) return "low";
  return "informational";
}

/**
 * Format a Date as an ISO date string (YYYY-MM-DD).
 */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
