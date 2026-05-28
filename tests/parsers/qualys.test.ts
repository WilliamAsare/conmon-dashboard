/**
 * Tests for the Qualys VMDR CSV parser.
 */

import { describe, it, expect } from "vitest";
import { parseQualys } from "@/lib/parsers/qualys";

// Minimal valid Qualys CSV
const MINIMAL_CSV = `IP,DNS,QID,Title,Severity,CVE ID,CVSS Base,CVSS3 Base,Threat,First Found,Last Found
10.0.0.1,server.example.com,370545,OpenSSL Vulnerability,5,CVE-2022-3786,9.0,9.8,OpenSSL buffer overflow.,2026-01-15,2026-05-27
10.0.0.1,server.example.com,90413,TLS 1.1 Protocol Detected,3,CVE-2011-3389,5.0,6.5,TLS 1.1 is deprecated.,2025-12-01,2026-05-27`;

// CSV with metadata lines before the header (common in Qualys exports)
const METADATA_CSV = `"Qualys Report","Generated: 2026-05-27"
"Scan Date","2026-05-27"
"Total Findings","2"
IP,DNS,QID,Title,Severity,CVE ID,CVSS Base,CVSS3 Base,Threat,First Found,Last Found
10.0.0.2,api.example.com,146784,Baron Samedit (sudo),5,CVE-2021-3156,7.2,7.8,Heap overflow in sudo.,2026-01-20,2026-05-27
10.0.0.2,api.example.com,197606,SSH Weak MAC,2,,2.6,5.3,Weak HMAC algorithms in SSH.,2025-11-15,2026-05-27`;

// CSV with no CVSS scores — fall back to Qualys severity integer
const NO_CVSS_CSV = `IP,QID,Title,Severity,Threat,First Found,Last Found
10.0.0.3,12345,Critical Finding,5,A critical issue.,2026-01-01,2026-05-20
10.0.0.3,12346,Low Finding,1,A low severity issue.,2026-01-01,2026-05-20
10.0.0.3,12347,Informational,1,Informational item.,2026-01-01,2026-05-20`;

// CSV with multiple CVEs (semicolon-separated)
const MULTI_CVE_CSV = `IP,DNS,QID,Title,Severity,CVE ID,CVSS3 Base,Threat,First Found,Last Found
10.0.0.4,db.example.com,46182,Exim 21Nails,5,"CVE-2020-28017;CVE-2020-28020;CVE-2020-28026",9.8,Multiple Exim RCEs.,2026-01-05,2026-05-27`;

// Empty CSV (header only)
const HEADER_ONLY_CSV = `IP,DNS,QID,Title,Severity,CVE ID,CVSS3 Base,Threat,First Found,Last Found`;

// CSV without QID column
const NO_QID_CSV = `IP,DNS,Title,Severity,Threat
10.0.0.5,host.example.com,Some Finding,3,Some threat.`;

// CSV with DNS same as IP (should use IP only, not "ip (ip)")
const DNS_EQUALS_IP_CSV = `IP,DNS,QID,Title,Severity,CVSS3 Base,Threat,First Found,Last Found
10.0.0.6,10.0.0.6,99999,No DNS Finding,3,7.5,A high finding.,2026-01-01,2026-05-27`;

// CSV with DNS blank
const DNS_BLANK_CSV = `IP,DNS,QID,Title,Severity,CVSS3 Base,Threat,First Found,Last Found
10.0.0.7,,88888,No DNS Finding,3,7.5,A high finding.,2026-01-01,2026-05-27`;

describe("parseQualys", () => {
  describe("basic parsing", () => {
    it("returns scanner_name of 'Qualys VMDR'", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      expect(result.scanner_name).toBe("Qualys VMDR");
    });

    it("uses provided scanDate", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      expect(result.scan_date).toBe("2026-05-27");
    });

    it("defaults scan_date to today when not provided", () => {
      const result = parseQualys(MINIMAL_CSV);
      const today = new Date().toISOString().slice(0, 10);
      expect(result.scan_date).toBe(today);
    });

    it("parses two findings from minimal CSV", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      expect(result.findings).toHaveLength(2);
    });

    it("returns empty warnings for valid file", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("metadata line skipping", () => {
    it("skips pre-header metadata lines and parses findings", () => {
      const result = parseQualys(METADATA_CSV, "2026-05-27");
      expect(result.findings).toHaveLength(2);
    });

    it("finds the correct QID after skipping metadata", () => {
      const result = parseQualys(METADATA_CSV, "2026-05-27");
      expect(result.findings[0]?.plugin_id).toBe("Q-146784");
    });
  });

  describe("finding fields", () => {
    it("prefixes QID with 'Q-' to avoid collision with Nessus IDs", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const ids = result.findings.map(f => f.plugin_id);
      expect(ids).toContain("Q-370545");
      expect(ids).toContain("Q-90413");
    });

    it("maps Title to finding title", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const first = result.findings.find(f => f.plugin_id === "Q-370545");
      expect(first?.title).toBe("OpenSSL Vulnerability");
    });

    it("maps Threat to description", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const first = result.findings.find(f => f.plugin_id === "Q-370545");
      expect(first?.description).toBe("OpenSSL buffer overflow.");
    });

    it("prefers CVSS3 Base over CVSS Base", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const first = result.findings.find(f => f.plugin_id === "Q-370545");
      expect(first?.cvss_score).toBe(9.8); // CVSS3, not 9.0
    });

    it("derives severity=high from CVSS3 score 9.8", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const first = result.findings.find(f => f.plugin_id === "Q-370545");
      expect(first?.severity).toBe("high");
    });

    it("derives severity=moderate from CVSS3 score 6.5", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const tls = result.findings.find(f => f.plugin_id === "Q-90413");
      expect(tls?.severity).toBe("moderate");
    });

    it("maps First Found date", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const first = result.findings.find(f => f.plugin_id === "Q-370545");
      expect(first?.first_detected).toBe("2026-01-15");
    });

    it("maps Last Found date", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const first = result.findings.find(f => f.plugin_id === "Q-370545");
      expect(first?.last_detected).toBe("2026-05-27");
    });

    it("parses single CVE into cves array", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const first = result.findings.find(f => f.plugin_id === "Q-370545");
      expect(first?.cves).toEqual(["CVE-2022-3786"]);
    });

    it("parses multiple semicolon-separated CVEs", () => {
      const result = parseQualys(MULTI_CVE_CSV, "2026-05-27");
      expect(result.findings[0]?.cves).toEqual([
        "CVE-2020-28017",
        "CVE-2020-28020",
        "CVE-2020-28026",
      ]);
    });

    it("sets cves to empty array when CVE column is blank", () => {
      const result = parseQualys(METADATA_CSV, "2026-05-27");
      const ssh = result.findings.find(f => f.plugin_id === "Q-197606");
      expect(ssh?.cves).toEqual([]);
    });
  });

  describe("asset name construction", () => {
    it("combines dns and ip as 'dns (ip)' when different", () => {
      const result = parseQualys(MINIMAL_CSV, "2026-05-27");
      const first = result.findings.find(f => f.plugin_id === "Q-370545");
      expect(first?.affected_asset).toBe("server.example.com (10.0.0.1)");
    });

    it("uses IP only when DNS equals IP", () => {
      const result = parseQualys(DNS_EQUALS_IP_CSV, "2026-05-27");
      expect(result.findings[0]?.affected_asset).toBe("10.0.0.6");
    });

    it("uses IP only when DNS is blank", () => {
      const result = parseQualys(DNS_BLANK_CSV, "2026-05-27");
      expect(result.findings[0]?.affected_asset).toBe("10.0.0.7");
    });

    it("falls back to 'unknown' when both IP and DNS are absent", () => {
      const csv = `QID,Title,Severity,CVSS3 Base,Threat,First Found,Last Found
11111,No Asset,3,7.5,A finding.,2026-01-01,2026-05-01`;
      const result = parseQualys(csv, "2026-05-27");
      expect(result.findings[0]?.affected_asset).toBe("unknown");
    });
  });

  describe("severity fallback (no CVSS scores)", () => {
    it("maps Qualys severity 5 (Urgent) → 'high'", () => {
      const result = parseQualys(NO_CVSS_CSV, "2026-05-27");
      const critical = result.findings.find(f => f.plugin_id === "Q-12345");
      expect(critical?.severity).toBe("high");
      expect(critical?.cvss_score).toBeNull();
    });

    it("maps Qualys severity 1 (Minimal) → 'informational'", () => {
      // Qualys severity 1 label is "informational" per QUALYS_SEVERITY_LABEL
      const result = parseQualys(NO_CVSS_CSV, "2026-05-27");
      const info = result.findings.find(f => f.plugin_id === "Q-12346");
      expect(info?.severity).toBe("informational");
    });
  });

  describe("date fallback", () => {
    it("falls back to scanDate when First Found is invalid", () => {
      const csv = `IP,QID,Title,Severity,CVSS3 Base,Threat,First Found,Last Found
10.0.0.1,55555,Bad Date,3,7.5,A finding.,NOT-A-DATE,ALSO-BAD`;
      const result = parseQualys(csv, "2026-05-27");
      expect(result.findings[0]?.first_detected).toBe("2026-05-27");
      expect(result.findings[0]?.last_detected).toBe("2026-05-27");
    });
  });

  describe("empty and error cases", () => {
    it("returns empty findings and a warning for header-only CSV", () => {
      const result = parseQualys(HEADER_ONLY_CSV, "2026-05-27");
      expect(result.findings).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("throws when QID column is absent", () => {
      expect(() => parseQualys(NO_QID_CSV, "2026-05-27")).toThrow(/QID/);
    });

    it("throws descriptive error on malformed CSV", () => {
      // Force a parse error with invalid quoting that csv-parse can't handle
      const broken = `"unclosed quote,col2,col3\nnext,row,data`;
      expect(() => parseQualys(broken, "2026-05-27")).toThrow(/Qualys CSV parse error/);
    });
  });

  describe("sample fixture smoke test", () => {
    it("parses the sample-qualys.csv fixture successfully", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const fixturePath = path.join(process.cwd(), "fixtures", "sample-qualys.csv");
      const csv = fs.readFileSync(fixturePath, "utf-8");
      const result = parseQualys(csv, "2026-05-27");
      expect(result.findings.length).toBeGreaterThanOrEqual(20);
      expect(result.scanner_name).toBe("Qualys VMDR");
      expect(result.warnings).toHaveLength(0);
      // All plugin IDs should start with Q-
      for (const f of result.findings) {
        expect(f.plugin_id).toMatch(/^Q-/);
      }
      // Should have high severity findings
      const hasHigh = result.findings.some(f => f.severity === "high");
      expect(hasHigh).toBe(true);
    });
  });
});
