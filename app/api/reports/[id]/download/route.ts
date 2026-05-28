/**
 * GET /api/reports/[id]/download
 *
 * Generates and streams a FedRAMP ConMon summary PDF for the given report ID.
 * The report record (conmon_reports) holds the system + period metadata;
 * the PDF is generated on the fly from live data.
 */

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { format, differenceInDays } from "date-fns";
import React from "react";
import { ConMonReportPdf, type ConMonReportData } from "@/lib/pdf/conmon-report";
import type { Database } from "@/types/supabase";

type ReportRow = Pick<
  Database["public"]["Tables"]["conmon_reports"]["Row"],
  "id" | "system_id" | "reporting_period_start" | "reporting_period_end" | "organization_id"
>;

type SystemRow = Pick<
  Database["public"]["Tables"]["systems"]["Row"],
  "id" | "name" | "fedramp_level"
>;

type OrgRow = Pick<Database["public"]["Tables"]["organizations"]["Row"], "name">;

type ScanRow = Pick<
  Database["public"]["Tables"]["scans"]["Row"],
  "scan_type" | "scan_date"
>;

type PoamRow = Pick<
  Database["public"]["Tables"]["poam_items"]["Row"],
  | "id"
  | "poam_number"
  | "weakness_description"
  | "severity"
  | "status"
  | "sla_status"
  | "days_to_sla"
  | "scheduled_completion"
>;

type DevRow = Pick<
  Database["public"]["Tables"]["deviation_requests"]["Row"],
  "status"
>;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch report metadata
  const { data: reportRaw, error: reportErr } = await supabase
    .from("conmon_reports")
    .select("id, system_id, reporting_period_start, reporting_period_end, organization_id")
    .eq("id", id)
    .single();

  if (reportErr || !reportRaw) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const report = reportRaw as unknown as ReportRow;

  // Parallel data fetches
  const [
    { data: systemRaw },
    { data: orgRaw },
    { data: scansRaw },
    { data: poamsRaw },
    { data: devsRaw },
  ] = await Promise.all([
    supabase
      .from("systems")
      .select("id, name, fedramp_level")
      .eq("id", report.system_id)
      .single(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", report.organization_id)
      .single(),
    supabase
      .from("scans")
      .select("scan_type, scan_date")
      .eq("system_id", report.system_id)
      .order("scan_date", { ascending: false }),
    supabase
      .from("poam_items")
      .select(
        "id, poam_number, weakness_description, severity, status, sla_status, days_to_sla, scheduled_completion"
      )
      .eq("system_id", report.system_id)
      .in("status", ["open", "ongoing"]),
    // deviation_requests has no system_id column; scope to org only
    supabase
      .from("deviation_requests")
      .select("status")
      .eq("organization_id", report.organization_id),
  ]);

  const system = systemRaw as unknown as SystemRow | null;
  const org    = orgRaw    as unknown as OrgRow    | null;
  const scans  = (scansRaw  as unknown as ScanRow[]  | null) ?? [];
  const poams  = (poamsRaw  as unknown as PoamRow[]  | null) ?? [];
  const devs   = (devsRaw   as unknown as DevRow[]   | null) ?? [];

  // Build scan coverage
  const scanTypes = ["os", "webapp", "database"] as const;
  const today     = new Date();

  const scanCoverage: ConMonReportData["scans"] = scanTypes.map((type) => {
    const latestScan = scans
      .filter((s) => s.scan_type === type)
      .sort((a, b) => (a.scan_date > b.scan_date ? -1 : 1))[0];

    if (!latestScan) {
      return { type, lastScan: null, daysAgo: null, status: "never" };
    }
    const daysAgo = differenceInDays(today, new Date(latestScan.scan_date));
    return {
      type,
      lastScan: format(new Date(latestScan.scan_date), "MMM d, yyyy"),
      daysAgo,
      status: daysAgo <= 30 ? "current" : "stale",
    };
  });

  // POA&M counts
  const poamCounts: ConMonReportData["poamCounts"] = {
    high:         poams.filter((p) => p.severity === "high").length,
    moderate:     poams.filter((p) => p.severity === "moderate").length,
    low:          poams.filter((p) => p.severity === "low").length,
    overdue:      poams.filter((p) => p.sla_status === "overdue").length,
    warning:      poams.filter((p) => p.sla_status === "warning").length,
    riskAccepted: 0, // already filtered out (status != risk_accepted in query)
    total:        poams.length,
  };

  // Top 20 by SLA urgency
  const SLA_ORDER: Record<string, number>      = { overdue: 0, warning: 1, ok: 2, not_applicable: 3 };
  const SEV_ORDER: Record<string, number>      = { high: 0, moderate: 1, low: 2, informational: 3 };
  const openPoams: ConMonReportData["openPoams"] = [...poams]
    .sort((a, b) => {
      const s = (SLA_ORDER[a.sla_status] ?? 9) - (SLA_ORDER[b.sla_status] ?? 9);
      if (s !== 0) return s;
      return (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
    })
    .slice(0, 20)
    .map((p) => ({
      poamNumber:    p.poam_number,
      weakness:      p.weakness_description,
      severity:      p.severity,
      scheduledDate: format(new Date(p.scheduled_completion), "MM/dd/yyyy"),
      slaStatus:     p.sla_status,
      daysToSla:     p.days_to_sla,
    }));

  // Deviation counts
  const deviations: ConMonReportData["deviations"] = {
    submitted: devs.filter((d) => d.status === "submitted").length,
    approved:  devs.filter((d) => d.status === "approved").length,
    rejected:  devs.filter((d) => d.status === "rejected").length,
  };

  const reportData: ConMonReportData = {
    organization:  org?.name ?? "—",
    system:        system?.name ?? "—",
    fedrampLevel:  system?.fedramp_level ?? "—",
    periodStart:   format(new Date(report.reporting_period_start), "MMMM d, yyyy"),
    periodEnd:     format(new Date(report.reporting_period_end), "MMMM d, yyyy"),
    generatedOn:   format(today, "MMMM d, yyyy 'at' HH:mm 'UTC'"),
    scans:         scanCoverage,
    poamCounts,
    openPoams,
    deviations,
  };

  // Generate PDF.
  // Cast to ReactElement<DocumentProps> so renderToBuffer accepts it —
  // TypeScript can't see through the wrapper component to the Document root.
  const pdfElement = React.createElement(
    ConMonReportPdf,
    { data: reportData }
  ) as React.ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(pdfElement);

  const filename = `conmon-${system?.name?.replace(/\s+/g, "-").toLowerCase() ?? "report"}-${format(new Date(report.reporting_period_end), "yyyy-MM")}.pdf`;

  return new NextResponse(buffer as unknown as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
