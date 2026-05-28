/**
 * Qualys VMDR CSV parser.
 *
 * Parses a Qualys vulnerability export CSV into ParsedFinding[].
 * Pure function: no I/O, no side effects.
 *
 * Expected Qualys CSV columns (order may vary -- we match by header name):
 *   IP, DNS, NetBIOS, OS, QID, Title, Type, Severity, Port, Protocol,
 *   CVE ID, CVSS Base, CVSS3 Base, Threat, Impact, Solution,
 *   First Found, Last Found, Category
 *
 * Qualys severity scale: 1=Minimal, 2=Medium, 3=Serious, 4=Critical, 5=Urgent
 * We map to FedRAMP severity using CVSS3 Base Score first, then Qualys severity.
 */

import { parse as parseCsv } from "csv-parse/sync";
import type { ParseResult, ParsedFinding } from "./types";
import { normalizeScore, deriveSeverity, toIsoDate } from "./types";

// Qualys severity integers to label strings (for CVSS fallback)
const QUALYS_SEVERITY_LABEL: Record<number, string> = {
  1: "informational",
  2: "low",
  3: "moderate",
  4: "high",
  5: "high", // Urgent maps to high
};

/**
 * Parse a Qualys VMDR CSV export string into a ParseResult.
 *
 * @param csvContent  Raw CSV file content
 * @param scanDate    Override scan date (YYYY-MM-DD). Defaults to today.
 */
export function parseQualys(csvContent: string, scanDate?: string): ParseResult {
  const warnings: string[] = [];
  const today = toIsoDate(new Date());
  const resolvedScanDate = scanDate ?? today;

  // Qualys CSVs sometimes have metadata lines before the header row.
  // Find the header row by looking for a line containing "QID" or "IP".
  const lines = csvContent.split(/\r?\n/);
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i] ?? "";
    if (line.includes("QID") || (line.includes("IP") && line.includes("Title"))) {
      headerIndex = i;
      break;
    }
  }

  const cleanedCsv = lines.slice(headerIndex).join("\n");

  let rows: Record<string, string>[];
  try {
    rows = parseCsv(cleanedCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new Error(
      `Qualys CSV parse error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (rows.length === 0) {
    warnings.push("No rows found in the Qualys CSV export.");
    return { findings: [], scanner_name: "Qualys VMDR", scan_date: resolvedScanDate, warnings };
  }

  // Detect column names (Qualys exports vary in capitalization and spacing)
  const firstRow = rows[0] ?? {};
  const headers = Object.keys(firstRow);
  const col = (candidates: string[]): string | undefined =>
    candidates.find(c => headers.some(h => h.toLowerCase() === c.toLowerCase()));

  const colIP        = col(["IP", "ip"]);
  const colDNS       = col(["DNS", "dns"]);
  const colQID       = col(["QID", "Vuln ID"]);
  const colTitle     = col(["Title", "Vulnerability Title"]);
  const colSeverity  = col(["Severity"]);
  const colCVE       = col(["CVE ID", "CVE", "CVEs"]);
  const colCVSS3     = col(["CVSS3 Base", "CVSS3", "CVSS v3 Base"]);
  const colCVSS      = col(["CVSS Base", "CVSS", "CVSS v2 Base"]);
  const colThreat    = col(["Threat", "Description"]);
  const colFirstFound = col(["First Found", "First Detected", "First Found Date"]);
  const colLastFound  = col(["Last Found", "Last Detected", "Last Found Date"]);

  if (!colQID) {
    throw new Error(
      'Qualys CSV is missing a QID column. ' +
      'Export the file using the default VMDR column set and try again.'
    );
  }

  const findings: ParsedFinding[] = [];

  for (const row of rows) {
    const qid = row[colQID ?? ""] ?? "";
    if (!qid || qid === "QID") continue; // Skip header rows mixed into data

    const ip = colIP ? (row[colIP] ?? "") : "";
    const dns = colDNS ? (row[colDNS] ?? "") : "";
    const assetName = dns && dns !== ip ? `${dns} (${ip})` : ip || "unknown";

    const cvssScore =
      normalizeScore(colCVSS3 ? row[colCVSS3] : null) ??
      normalizeScore(colCVSS ? row[colCVSS] : null);

    const qualysSeverityInt = parseInt(colSeverity ? (row[colSeverity] ?? "0") : "0", 10);
    const fallbackLabel = QUALYS_SEVERITY_LABEL[qualysSeverityInt] ?? "";
    const severity = deriveSeverity(cvssScore, fallbackLabel);

    const rawCves = colCVE ? (row[colCVE] ?? "") : "";
    const cves = rawCves
      ? rawCves.split(/[,;|\s]+/).map(s => s.trim()).filter(s => s.startsWith("CVE-"))
      : [];

    const parseDate = (raw: string | undefined): string => {
      if (!raw) return resolvedScanDate;
      const d = new Date(raw);
      return isNaN(d.getTime()) ? resolvedScanDate : toIsoDate(d);
    };

    const firstDetected = parseDate(colFirstFound ? row[colFirstFound] : undefined);
    const lastDetected  = parseDate(colLastFound  ? row[colLastFound]  : undefined);

    findings.push({
      plugin_id: `Q-${qid}`, // Prefix to avoid collision with Nessus plugin IDs
      title: colTitle ? (row[colTitle] ?? qid) : qid,
      description: colThreat ? (row[colThreat] ?? "") : "",
      cvss_score: cvssScore,
      severity,
      affected_asset: assetName,
      first_detected: firstDetected,
      last_detected: lastDetected,
      cves,
    });
  }

  if (findings.length === 0) {
    warnings.push("No findings were extracted from this Qualys CSV. The scan may be clean or columns may not match the expected format.");
  }

  return {
    findings,
    scanner_name: "Qualys VMDR",
    scan_date: resolvedScanDate,
    warnings,
  };
}
