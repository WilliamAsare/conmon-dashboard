/**
 * Nessus XML (.nessus) parser.
 *
 * Parses a Nessus v2 export file into ParsedFinding[].
 * This is a pure function: no I/O, no side effects.
 *
 * Nessus v2 file structure:
 *   <NessusClientData_v2>
 *     <Report name="...">
 *       <ReportHost name="hostname-or-ip">
 *         <HostProperties>
 *           <tag name="host-ip">10.0.0.1</tag>
 *           <tag name="HOST_END">Mon Jan  1 00:00:00 2024</tag>
 *         </HostProperties>
 *         <ReportItem port="443" svc_name="https" protocol="tcp"
 *                     severity="3" pluginID="12345" pluginName="...">
 *           <description>...</description>
 *           <cvss3_base_score>9.8</cvss3_base_score>
 *           <cvss_base_score>9.8</cvss_base_score>
 *           <cve>CVE-2023-1234</cve>
 *           <risk_factor>High</risk_factor>
 *         </ReportItem>
 *       </ReportHost>
 *     </Report>
 *   </NessusClientData_v2>
 */

import { XMLParser } from "fast-xml-parser";
import type { ParseResult, ParsedFinding } from "./types";
import { normalizeScore, deriveSeverity, toIsoDate } from "./types";

// Nessus severity integers: 0=None, 1=Low, 2=Medium, 3=High, 4=Critical
const NESSUS_SEVERITY_LABEL: Record<number, string> = {
  0: "informational",
  1: "low",
  2: "moderate",
  3: "high",
  4: "high", // Critical maps to high in the FedRAMP model
};

/**
 * Parse a Nessus v2 XML string into a ParseResult.
 *
 * @param xmlContent  Raw content of a .nessus file
 * @param scanDate    Override scan date (YYYY-MM-DD). If not provided, extracted
 *                    from HOST_END tags or falls back to today.
 */
export function parseNessus(xmlContent: string, scanDate?: string): ParseResult {
  const warnings: string[] = [];

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) =>
      ["ReportHost", "ReportItem", "tag", "cve"].includes(name),
    parseTagValue: true,
    trimValues: true,
  });

  let root: Record<string, unknown>;
  try {
    root = parser.parse(xmlContent) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Nessus XML parse error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const clientData = root["NessusClientData_v2"] as Record<string, unknown> | undefined;
  if (!clientData) {
    throw new Error(
      'Invalid Nessus file: missing <NessusClientData_v2> root element. ' +
      'Ensure the file is a Nessus v2 export (.nessus).'
    );
  }

  const report = clientData["Report"] as Record<string, unknown> | undefined;
  if (!report) {
    throw new Error('Invalid Nessus file: missing <Report> element.');
  }

  const reportHosts = (report["ReportHost"] as unknown[]) ?? [];
  const findings: ParsedFinding[] = [];
  const today = toIsoDate(new Date());

  for (const hostRaw of reportHosts) {
    const host = hostRaw as Record<string, unknown>;
    const hostName = String(host["@_name"] ?? "unknown-host");

    // Extract host IP from HostProperties tags
    const hostProps = host["HostProperties"] as Record<string, unknown> | undefined;
    const tags = (hostProps?.["tag"] as Array<Record<string, unknown>>) ?? [];

    const getTag = (name: string): string | undefined => {
      const t = tags.find((t) => t["@_name"] === name);
      return t ? String(t["#text"] ?? t["__text"] ?? "") : undefined;
    };

    const hostIp = getTag("host-ip") ?? hostName;
    const assetName = hostIp !== hostName ? `${hostName} (${hostIp})` : hostName;

    // Extract scan end date from HOST_END tag
    let hostScanDate = scanDate ?? today;
    const hostEnd = getTag("HOST_END");
    if (!scanDate && hostEnd) {
      const parsed = new Date(hostEnd);
      if (!isNaN(parsed.getTime())) {
        hostScanDate = toIsoDate(parsed);
      }
    }

    const reportItems = (host["ReportItem"] as unknown[]) ?? [];

    for (const itemRaw of reportItems) {
      const item = itemRaw as Record<string, unknown>;

      const pluginId = String(item["@_pluginID"] ?? "");
      if (!pluginId || pluginId === "0") continue; // Skip plugin ID 0 (host info)

      const nessusSeverityInt = parseInt(String(item["@_severity"] ?? "0"), 10);

      // Prefer CVSS v3, fall back to v2.
      // Cast: item is Record<string, unknown>; normalizeScore handles all falsy values.
      const cvssScore =
        normalizeScore(item["cvss3_base_score"] as string | number | null | undefined) ??
        normalizeScore(item["cvss_base_score"] as string | number | null | undefined);

      const fallbackLabel = NESSUS_SEVERITY_LABEL[nessusSeverityInt] ??
        String(item["risk_factor"] ?? "");
      const severity = deriveSeverity(cvssScore, fallbackLabel);

      // Collect CVEs (may be a single string or an array)
      const rawCves = item["cve"];
      const cves: string[] = Array.isArray(rawCves)
        ? rawCves.map(String)
        : rawCves
        ? [String(rawCves)]
        : [];

      const description = String(
        item["description"] ?? item["synopsis"] ?? ""
      ).trim();

      const title = String(item["@_pluginName"] ?? item["plugin_name"] ?? pluginId);

      findings.push({
        plugin_id: pluginId,
        title,
        description,
        cvss_score: cvssScore,
        severity,
        affected_asset: assetName,
        first_detected: hostScanDate,
        last_detected: hostScanDate,
        cves,
      });
    }
  }

  if (findings.length === 0) {
    warnings.push("No findings were extracted from this Nessus file. The scan may be clean or the file format may be unexpected.");
  }

  // Derive scanner name from report name attribute
  const reportName = String(report["@_name"] ?? "Nessus");
  const resolvedScanDate = scanDate ?? today;

  return {
    findings,
    scanner_name: `Nessus (${reportName})`,
    scan_date: resolvedScanDate,
    warnings,
  };
}
