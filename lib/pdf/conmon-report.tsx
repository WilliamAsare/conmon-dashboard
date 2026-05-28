/**
 * FedRAMP Continuous Monitoring Summary Report — PDF template.
 *
 * Rendered server-side via @react-pdf/renderer v4.
 * Call: renderToBuffer(<ConMonReportPdf data={...} />)
 *
 * Covers:
 *  • Cover page (system name, FedRAMP level, reporting period, org)
 *  • Executive summary (scan coverage, open POA&M counts, SLA performance)
 *  • Scan coverage table
 *  • POA&M summary by severity / status
 *  • Open deviation requests summary
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Palette — FedRAMP brand colours
// ---------------------------------------------------------------------------
const C = {
  navy:    "#1E3A5F",
  blue:    "#2B5EA7",
  red:     "#CC0000",
  orange:  "#996600",
  green:   "#2E7D32",
  grey:    "#6B7280",
  light:   "#F3F4F6",
  border:  "#D1D5DB",
  white:   "#FFFFFF",
  text:    "#111827",
  muted:   "#6B7280",
} as const;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize:   9,
    color:      C.text,
    paddingTop:    48,
    paddingBottom: 48,
    paddingLeft:   52,
    paddingRight:  52,
  },

  // Cover
  coverPage: {
    fontFamily: "Helvetica",
    paddingTop:    0,
    paddingBottom: 0,
    paddingLeft:   0,
    paddingRight:  0,
  },
  coverBanner: {
    backgroundColor: C.navy,
    paddingTop:      52,
    paddingBottom:   52,
    paddingLeft:     52,
    paddingRight:    52,
    marginBottom:    0,
  },
  coverTitle: {
    fontSize:   22,
    fontFamily: "Helvetica-Bold",
    color:      C.white,
    marginBottom: 6,
  },
  coverSubtitle: {
    fontSize: 11,
    color:    "#A5B4C8",
    marginBottom: 24,
  },
  coverMeta: {
    fontSize: 9,
    color:    "#A5B4C8",
    marginBottom: 3,
  },
  coverBody: {
    padding: 52,
  },
  coverInfoRow: {
    flexDirection:  "row",
    gap:            40,
    marginBottom:   16,
  },
  coverInfoLabel: {
    fontSize:   8,
    color:      C.muted,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  coverInfoValue: {
    fontSize: 11,
    color:    C.text,
  },

  // Section heading
  sectionHeading: {
    fontSize:        11,
    fontFamily:      "Helvetica-Bold",
    color:           C.navy,
    borderBottomWidth: 1,
    borderBottomColor: C.navy,
    paddingBottom:   3,
    marginBottom:    10,
    marginTop:       18,
  },

  // Stat cards row
  statsRow: {
    flexDirection: "row",
    gap:           8,
    marginBottom:  10,
  },
  statCard: {
    flex:            1,
    borderWidth:     1,
    borderColor:     C.border,
    borderRadius:    4,
    padding:         10,
    alignItems:      "center",
  },
  statNumber: {
    fontSize:   20,
    fontFamily: "Helvetica-Bold",
    color:      C.navy,
  },
  statLabel: {
    fontSize:  7,
    color:     C.muted,
    marginTop: 2,
    textAlign: "center",
  },
  statNumberRed:    { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.red },
  statNumberOrange: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.orange },
  statNumberGreen:  { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.green },

  // Table
  table: {
    borderWidth:  1,
    borderColor:  C.border,
    borderRadius: 4,
    overflow:     "hidden",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection:   "row",
    backgroundColor: C.navy,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    fontSize:   7,
    fontFamily: "Helvetica-Bold",
    color:      C.white,
    flex:       1,
  },
  tableRow: {
    flexDirection:    "row",
    paddingVertical:  5,
    paddingHorizontal: 8,
    borderTopWidth:   1,
    borderTopColor:   C.border,
  },
  tableRowAlt: {
    backgroundColor: C.light,
  },
  tableCell: {
    fontSize: 8,
    flex:     1,
    color:    C.text,
  },
  tableCellMuted: {
    fontSize: 8,
    flex:     1,
    color:    C.muted,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom:   24,
    left:     52,
    right:    52,
    flexDirection:  "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop:     6,
  },
  footerText: {
    fontSize: 7,
    color:    C.muted,
  },

  // Misc
  row: { flexDirection: "row", gap: 8 },
  pill: {
    fontSize:        7,
    paddingVertical:  2,
    paddingHorizontal: 5,
    borderRadius:    3,
    alignSelf:       "flex-start",
  },
});

// ---------------------------------------------------------------------------
// Data shape passed to the PDF component
// ---------------------------------------------------------------------------
export type ConMonReportData = {
  organization:    string;
  system:          string;
  fedrampLevel:    string;
  periodStart:     string; // "MMMM d, yyyy"
  periodEnd:       string;
  generatedOn:     string;

  // Scan coverage
  scans: {
    type:     "os" | "webapp" | "database";
    lastScan: string | null; // formatted date or null
    daysAgo:  number | null;
    status:   "current" | "stale" | "never";
  }[];

  // POA&M summary
  poamCounts: {
    high:          number;
    moderate:      number;
    low:           number;
    overdue:       number;
    warning:       number;
    riskAccepted:  number;
    total:         number;
  };

  // Open POA&M items (top 20 by SLA urgency)
  openPoams: {
    poamNumber:   string;
    weakness:     string;
    severity:     string;
    scheduledDate: string;
    slaStatus:    string;
    daysToSla:    number | null;
  }[];

  // Deviation summary
  deviations: {
    submitted: number;
    approved:  number;
    rejected:  number;
  };
};

// ---------------------------------------------------------------------------
// PDF Document component
// ---------------------------------------------------------------------------
export function ConMonReportPdf({ data }: { data: ConMonReportData }) {
  const scanTypeLabel: Record<string, string> = {
    os:      "OS / Host",
    webapp:  "Web Application",
    database: "Database",
  };

  return (
    <Document title={`ConMon Report — ${data.system}`} author="ConMon Dashboard">
      {/* ── Cover page ───────────────────────────────────────────────────── */}
      <Page size="LETTER" style={[styles.page, styles.coverPage]}>
        {/* Banner */}
        <View style={styles.coverBanner}>
          <Text style={styles.coverTitle}>
            Continuous Monitoring Summary Report
          </Text>
          <Text style={styles.coverSubtitle}>
            FedRAMP Authorized System — {data.fedrampLevel}
          </Text>
          <Text style={styles.coverMeta}>Reporting period: {data.periodStart} — {data.periodEnd}</Text>
          <Text style={styles.coverMeta}>Generated: {data.generatedOn}</Text>
        </View>

        {/* Info grid */}
        <View style={styles.coverBody}>
          <View style={styles.coverInfoRow}>
            <View>
              <Text style={styles.coverInfoLabel}>Organization</Text>
              <Text style={styles.coverInfoValue}>{data.organization}</Text>
            </View>
            <View>
              <Text style={styles.coverInfoLabel}>System</Text>
              <Text style={styles.coverInfoValue}>{data.system}</Text>
            </View>
            <View>
              <Text style={styles.coverInfoLabel}>FedRAMP Level</Text>
              <Text style={styles.coverInfoValue}>{data.fedrampLevel}</Text>
            </View>
          </View>

          {/* Summary stats */}
          <View style={styles.sectionHeading}>
            <Text>Executive Summary</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{data.poamCounts.total}</Text>
              <Text style={styles.statLabel}>Open POA&amp;Ms</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={data.poamCounts.high > 0 ? styles.statNumberRed : styles.statNumber}>
                {data.poamCounts.high}
              </Text>
              <Text style={styles.statLabel}>High severity</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={data.poamCounts.overdue > 0 ? styles.statNumberRed : styles.statNumber}>
                {data.poamCounts.overdue}
              </Text>
              <Text style={styles.statLabel}>SLA overdue</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={data.poamCounts.warning > 0 ? styles.statNumberOrange : styles.statNumber}>
                {data.poamCounts.warning}
              </Text>
              <Text style={styles.statLabel}>SLA warning (7d)</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumberGreen}>{data.deviations.approved}</Text>
              <Text style={styles.statLabel}>Deviations approved</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>
              {data.system} — ConMon Report — {data.periodEnd}
            </Text>
            <Text
              style={styles.footerText}
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} of ${totalPages}`
              }
            />
          </View>
        </View>
      </Page>

      {/* ── Scan coverage + POA&M detail page ───────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        {/* Scan coverage */}
        <Text style={styles.sectionHeading}>Scan Coverage</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Scan type</Text>
            <Text style={styles.tableHeaderCell}>Last scan</Text>
            <Text style={styles.tableHeaderCell}>Days ago</Text>
            <Text style={styles.tableHeaderCell}>Status</Text>
          </View>
          {data.scans.map((scan, i) => (
            <View key={scan.type} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tableCell, { flex: 2 }]}>{scanTypeLabel[scan.type] ?? scan.type}</Text>
              <Text style={styles.tableCell}>{scan.lastScan ?? "—"}</Text>
              <Text style={styles.tableCell}>
                {scan.daysAgo !== null ? `${scan.daysAgo}d` : "—"}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  scan.status === "current"
                    ? { color: C.green }
                    : scan.status === "stale"
                    ? { color: C.red }
                    : { color: C.muted },
                ]}
              >
                {scan.status === "current"
                  ? "Current"
                  : scan.status === "stale"
                  ? "Stale (>30d)"
                  : "No scan"}
              </Text>
            </View>
          ))}
        </View>

        {/* POA&M by severity */}
        <Text style={styles.sectionHeading}>Open POA&amp;M Summary</Text>
        <View style={styles.statsRow}>
          {(
            [
              { label: "High",     count: data.poamCounts.high,     color: C.red },
              { label: "Moderate", count: data.poamCounts.moderate, color: C.orange },
              { label: "Low",      count: data.poamCounts.low,      color: C.green },
              { label: "Risk Accepted", count: data.poamCounts.riskAccepted, color: C.muted },
            ] as const
          ).map(({ label, count, color }) => (
            <View key={label} style={styles.statCard}>
              <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color }}>{count}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Open POA&Ms table */}
        {data.openPoams.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>
              Open POA&amp;Ms — SLA Priority (top {data.openPoams.length})
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>POA&amp;M #</Text>
                <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Weakness</Text>
                <Text style={styles.tableHeaderCell}>Severity</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.3 }]}>Sched. Comp.</Text>
                <Text style={styles.tableHeaderCell}>SLA</Text>
              </View>
              {data.openPoams.map((p, i) => {
                const slaColor =
                  p.slaStatus === "overdue"
                    ? C.red
                    : p.slaStatus === "warning"
                    ? C.orange
                    : C.text;
                const slaText =
                  p.daysToSla !== null && p.daysToSla < 0
                    ? `${Math.abs(p.daysToSla)}d over`
                    : p.daysToSla !== null
                    ? `${p.daysToSla}d`
                    : p.slaStatus;

                return (
                  <View key={p.poamNumber} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
                    <Text style={[styles.tableCell, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>
                      {p.poamNumber}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 4 }]}>
                      {p.weakness.length > 120 ? p.weakness.slice(0, 120) + "…" : p.weakness}
                    </Text>
                    <Text
                      style={[
                        styles.tableCell,
                        {
                          color:
                            p.severity === "high"
                              ? C.red
                              : p.severity === "moderate"
                              ? C.orange
                              : C.text,
                          fontFamily: "Helvetica-Bold",
                        },
                      ]}
                    >
                      {p.severity.charAt(0).toUpperCase() + p.severity.slice(1)}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1.3 }]}>{p.scheduledDate}</Text>
                    <Text style={[styles.tableCell, { color: slaColor, fontFamily: "Helvetica-Bold" }]}>
                      {slaText}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Deviations */}
        {(data.deviations.submitted + data.deviations.approved + data.deviations.rejected) > 0 && (
          <>
            <Text style={styles.sectionHeading}>Deviation Requests</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={[styles.statNumber, { color: C.orange }]}>{data.deviations.submitted}</Text>
                <Text style={styles.statLabel}>Pending review</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statNumber, { color: C.green }]}>{data.deviations.approved}</Text>
                <Text style={styles.statLabel}>Approved</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statNumber, { color: C.red }]}>{data.deviations.rejected}</Text>
                <Text style={styles.statLabel}>Rejected</Text>
              </View>
            </View>
          </>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {data.system} — ConMon Report — {data.periodEnd}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
