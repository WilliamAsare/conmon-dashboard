/**
 * Tests for the Nessus v2 XML parser.
 */

import { describe, it, expect } from "vitest";
import { parseNessus } from "@/lib/parsers/nessus";

// Minimal valid Nessus XML with one host and two findings
const MINIMAL_XML = `<?xml version="1.0"?>
<NessusClientData_v2>
  <Report name="Test Scan">
    <ReportHost name="10.0.0.1">
      <HostProperties>
        <tag name="host-ip">10.0.0.1</tag>
        <tag name="HOST_END">Mon Jan  1 00:00:00 2024</tag>
      </HostProperties>
      <ReportItem port="443" svc_name="https" protocol="tcp"
                  severity="4" pluginID="99999" pluginName="Test Critical Plugin">
        <description>A critical vulnerability exists.</description>
        <cvss3_base_score>9.8</cvss3_base_score>
        <cvss_base_score>9.0</cvss_base_score>
        <cve>CVE-2023-9999</cve>
        <risk_factor>Critical</risk_factor>
      </ReportItem>
      <ReportItem port="80" svc_name="http" protocol="tcp"
                  severity="2" pluginID="77777" pluginName="Test Medium Plugin">
        <description>A medium vulnerability.</description>
        <cvss3_base_score>5.3</cvss3_base_score>
        <risk_factor>Medium</risk_factor>
      </ReportItem>
    </ReportHost>
  </Report>
</NessusClientData_v2>`;

// XML with host-fqdn differing from host-ip
const HOST_FQDN_XML = `<?xml version="1.0"?>
<NessusClientData_v2>
  <Report name="FQDN Test">
    <ReportHost name="server.example.com">
      <HostProperties>
        <tag name="host-ip">192.168.1.1</tag>
        <tag name="HOST_END">Tue Feb 15 12:00:00 2022</tag>
      </HostProperties>
      <ReportItem port="22" svc_name="ssh" protocol="tcp"
                  severity="3" pluginID="55555" pluginName="SSH Weak Config">
        <description>SSH is misconfigured.</description>
        <cvss3_base_score>7.5</cvss3_base_score>
        <risk_factor>High</risk_factor>
      </ReportItem>
    </ReportHost>
  </Report>
</NessusClientData_v2>`;

// XML with multiple CVEs as separate elements (fast-xml-parser array mode)
const MULTI_CVE_XML = `<?xml version="1.0"?>
<NessusClientData_v2>
  <Report name="Multi-CVE">
    <ReportHost name="10.0.0.2">
      <HostProperties>
        <tag name="host-ip">10.0.0.2</tag>
        <tag name="HOST_END">Fri Mar  1 00:00:00 2024</tag>
      </HostProperties>
      <ReportItem port="443" svc_name="https" protocol="tcp"
                  severity="4" pluginID="11111" pluginName="Log4Shell">
        <description>Log4j vulnerability.</description>
        <cvss3_base_score>10.0</cvss3_base_score>
        <cve>CVE-2021-44228</cve>
        <cve>CVE-2021-45046</cve>
        <cve>CVE-2021-45105</cve>
        <risk_factor>Critical</risk_factor>
      </ReportItem>
    </ReportHost>
  </Report>
</NessusClientData_v2>`;

// Plugin ID 0 should be skipped
const PLUGIN_ZERO_XML = `<?xml version="1.0"?>
<NessusClientData_v2>
  <Report name="Plugin Zero">
    <ReportHost name="10.0.0.3">
      <HostProperties>
        <tag name="host-ip">10.0.0.3</tag>
        <tag name="HOST_END">Sat Apr 13 06:00:00 2024</tag>
      </HostProperties>
      <ReportItem port="0" svc_name="general" protocol="tcp"
                  severity="0" pluginID="0" pluginName="Host Info">
        <description>Host information.</description>
        <risk_factor>None</risk_factor>
      </ReportItem>
      <ReportItem port="443" svc_name="https" protocol="tcp"
                  severity="2" pluginID="22222" pluginName="Real Finding">
        <description>An actual vulnerability.</description>
        <cvss3_base_score>5.3</cvss3_base_score>
        <risk_factor>Medium</risk_factor>
      </ReportItem>
    </ReportHost>
  </Report>
</NessusClientData_v2>`;

// Empty report (no hosts)
const EMPTY_REPORT_XML = `<?xml version="1.0"?>
<NessusClientData_v2>
  <Report name="Empty Scan">
  </Report>
</NessusClientData_v2>`;

// Missing root element
const BAD_XML = `<?xml version="1.0"?>
<SomethingElse>
  <Report name="Wrong Format">
  </Report>
</SomethingElse>`;

// No CVSS scores — fall back to Nessus severity integer
const NO_CVSS_XML = `<?xml version="1.0"?>
<NessusClientData_v2>
  <Report name="No CVSS">
    <ReportHost name="10.0.0.4">
      <HostProperties>
        <tag name="host-ip">10.0.0.4</tag>
      </HostProperties>
      <ReportItem port="0" svc_name="general" protocol="tcp"
                  severity="1" pluginID="33333" pluginName="Low Severity">
        <description>Low severity issue.</description>
        <risk_factor>Low</risk_factor>
      </ReportItem>
      <ReportItem port="0" svc_name="general" protocol="tcp"
                  severity="3" pluginID="44444" pluginName="High Severity">
        <description>High severity issue.</description>
        <risk_factor>High</risk_factor>
      </ReportItem>
    </ReportHost>
  </Report>
</NessusClientData_v2>`;

describe("parseNessus", () => {
  describe("basic parsing", () => {
    it("returns a ParseResult with correct scanner_name", () => {
      const result = parseNessus(MINIMAL_XML);
      expect(result.scanner_name).toBe("Nessus (Test Scan)");
    });

    it("uses today as scan_date when no scanDate override is provided", () => {
      // ParseResult.scan_date is scanDate ?? today; HOST_END affects per-finding dates only
      const result = parseNessus(MINIMAL_XML);
      const today = new Date().toISOString().slice(0, 10);
      expect(result.scan_date).toBe(today);
    });

    it("overrides scan_date when scanDate param is provided", () => {
      const result = parseNessus(MINIMAL_XML, "2026-05-01");
      expect(result.scan_date).toBe("2026-05-01");
    });

    it("returns findings array", () => {
      const result = parseNessus(MINIMAL_XML);
      expect(result.findings).toHaveLength(2);
    });

    it("returns empty warnings array for valid file", () => {
      const result = parseNessus(MINIMAL_XML);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("finding fields", () => {
    it("maps pluginID to plugin_id", () => {
      const result = parseNessus(MINIMAL_XML);
      const critical = result.findings.find(f => f.plugin_id === "99999");
      expect(critical).toBeDefined();
    });

    it("maps pluginName to title", () => {
      const result = parseNessus(MINIMAL_XML);
      const critical = result.findings.find(f => f.plugin_id === "99999");
      expect(critical?.title).toBe("Test Critical Plugin");
    });

    it("maps description element", () => {
      const result = parseNessus(MINIMAL_XML);
      const critical = result.findings.find(f => f.plugin_id === "99999");
      expect(critical?.description).toBe("A critical vulnerability exists.");
    });

    it("prefers CVSS3 score over CVSS2", () => {
      const result = parseNessus(MINIMAL_XML);
      const critical = result.findings.find(f => f.plugin_id === "99999");
      expect(critical?.cvss_score).toBe(9.8); // CVSS3, not 9.0 CVSS2
    });

    it("uses CVSS2 when CVSS3 is absent", () => {
      // 77777 has only CVSS3 score 5.3, no CVSS2
      const result = parseNessus(MINIMAL_XML);
      const medium = result.findings.find(f => f.plugin_id === "77777");
      expect(medium?.cvss_score).toBe(5.3);
    });

    it("derives severity=high from CVSS3 score 9.8", () => {
      const result = parseNessus(MINIMAL_XML);
      const critical = result.findings.find(f => f.plugin_id === "99999");
      expect(critical?.severity).toBe("high");
    });

    it("derives severity=moderate from CVSS3 score 5.3", () => {
      const result = parseNessus(MINIMAL_XML);
      const medium = result.findings.find(f => f.plugin_id === "77777");
      expect(medium?.severity).toBe("moderate");
    });

    it("sets affected_asset to hostName when it equals host-ip", () => {
      const result = parseNessus(MINIMAL_XML);
      const finding = result.findings[0];
      expect(finding?.affected_asset).toBe("10.0.0.1");
    });

    it("combines fqdn and ip as 'hostname (ip)' when different", () => {
      const result = parseNessus(HOST_FQDN_XML);
      const finding = result.findings[0];
      expect(finding?.affected_asset).toBe("server.example.com (192.168.1.1)");
    });

    it("sets first_detected and last_detected to HOST_END date", () => {
      // HOST_END "Mon Jan  1 00:00:00 2024" → 2024-01-01
      const result = parseNessus(MINIMAL_XML, "2026-05-27");
      const finding = result.findings[0];
      // With scanDate override, hostScanDate = override (not HOST_END)
      expect(finding?.first_detected).toBe("2026-05-27");
      expect(finding?.last_detected).toBe("2026-05-27");
    });

    it("uses HOST_END for per-finding dates when no scanDate override", () => {
      const result = parseNessus(HOST_FQDN_XML);
      // HOST_END "Tue Feb 15 12:00:00 2022" → 2022-02-15
      expect(result.findings[0]?.first_detected).toBe("2022-02-15");
    });

    it("parses single CVE into cves array", () => {
      const result = parseNessus(MINIMAL_XML);
      const critical = result.findings.find(f => f.plugin_id === "99999");
      expect(critical?.cves).toEqual(["CVE-2023-9999"]);
    });

    it("parses multiple CVE elements into cves array", () => {
      const result = parseNessus(MULTI_CVE_XML);
      expect(result.findings[0]?.cves).toEqual([
        "CVE-2021-44228",
        "CVE-2021-45046",
        "CVE-2021-45105",
      ]);
    });

    it("sets cves to empty array when no CVEs present", () => {
      const result = parseNessus(MINIMAL_XML);
      const medium = result.findings.find(f => f.plugin_id === "77777");
      expect(medium?.cves).toEqual([]);
    });
  });

  describe("plugin ID 0 filtering", () => {
    it("skips plugin ID 0 (host info items)", () => {
      const result = parseNessus(PLUGIN_ZERO_XML);
      const ids = result.findings.map(f => f.plugin_id);
      expect(ids).not.toContain("0");
    });

    it("includes real findings after filtering plugin 0", () => {
      const result = parseNessus(PLUGIN_ZERO_XML);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.plugin_id).toBe("22222");
    });
  });

  describe("severity fallback (no CVSS scores)", () => {
    it("uses Nessus severity int 1 → 'low'", () => {
      const result = parseNessus(NO_CVSS_XML);
      const low = result.findings.find(f => f.plugin_id === "33333");
      expect(low?.severity).toBe("low");
      expect(low?.cvss_score).toBeNull();
    });

    it("uses Nessus severity int 3 → 'high'", () => {
      const result = parseNessus(NO_CVSS_XML);
      const high = result.findings.find(f => f.plugin_id === "44444");
      expect(high?.severity).toBe("high");
    });

    it("falls back to today when no HOST_END tag present", () => {
      const result = parseNessus(NO_CVSS_XML);
      const today = new Date().toISOString().slice(0, 10);
      expect(result.scan_date).toBe(today);
    });
  });

  describe("empty and error cases", () => {
    it("returns empty findings array and a warning for empty report", () => {
      const result = parseNessus(EMPTY_REPORT_XML);
      expect(result.findings).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("throws when NessusClientData_v2 root element is missing", () => {
      expect(() => parseNessus(BAD_XML)).toThrow(/Invalid Nessus file/);
    });

    it("throws a descriptive error on malformed XML", () => {
      expect(() => parseNessus("<not valid <xml")).toThrow(/Nessus XML parse error/);
    });
  });

  describe("sample fixture smoke test", () => {
    it("parses the sample-scan.nessus fixture successfully", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const fixturePath = path.join(process.cwd(), "fixtures", "sample-scan.nessus");
      const xml = fs.readFileSync(fixturePath, "utf-8");
      const result = parseNessus(xml);
      expect(result.findings.length).toBeGreaterThanOrEqual(50);
      expect(result.scanner_name).toContain("Nessus");
      expect(result.warnings).toHaveLength(0);
      // Verify at least one critical finding is present
      const hasHigh = result.findings.some(f => f.severity === "high");
      expect(hasHigh).toBe(true);
    });
  });
});
