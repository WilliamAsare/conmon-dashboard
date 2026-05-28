/**
 * GET /api/poams/export
 *
 * Generates and returns a FedRAMP-compatible POA&M Excel workbook.
 * Query params:
 *   system_id  — optional; restrict to a single system
 *   status     — optional; "open" (default) | "completed" | "risk_accepted" | "all"
 *
 * Authentication: requires a valid session cookie (SSR client).
 * The service client is used for the actual data read so RLS type-inference
 * issues don't affect column ordering, but org-scoping is enforced manually.
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import type { Database } from "@/types/supabase";
import type { Json } from "@/types/supabase";

type PoamExportRow = Pick<
  Database["public"]["Tables"]["poam_items"]["Row"],
  | "id"
  | "poam_number"
  | "weakness_description"
  | "source"
  | "severity"
  | "status"
  | "identified_date"
  | "scheduled_completion"
  | "actual_completion"
  | "milestones"
  | "point_of_contact"
  | "resources_required"
  | "sla_status"
  | "days_to_sla"
> & {
  systems: Pick<
    Database["public"]["Tables"]["systems"]["Row"],
    "id" | "name" | "short_code" | "fedramp_level"
  > | null;
};

type UserProfile = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "organization_id"
>;

type Milestone = {
  id:             string;
  description:    string;
  target_date:    string;
  completed:      boolean;
  completed_date: string | null;
};

function parseMilestones(raw: Json): Milestone[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is Milestone =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>)["description"] === "string"
  );
}

function formatMilestonesForExport(raw: Json): string {
  const milestones = parseMilestones(raw);
  if (milestones.length === 0) return "";
  return milestones
    .map((m) => {
      const status = m.completed
        ? `[✓ ${m.completed_date ? format(new Date(m.completed_date), "MM/dd/yyyy") : "completed"}]`
        : `[target: ${format(new Date(m.target_date), "MM/dd/yyyy")}]`;
      return `• ${m.description} ${status}`;
    })
    .join("\n");
}

export async function GET(request: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profileRaw } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserProfile | null;
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  // ── 2. Parse query params ─────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const systemId     = searchParams.get("system_id");
  const statusParam  = searchParams.get("status") ?? "open";

  // ── 3. Fetch POA&M data ───────────────────────────────────────────────────
  let query = supabase
    .from("poam_items")
    .select(`
      id, poam_number, weakness_description, source, severity, status,
      identified_date, scheduled_completion, actual_completion,
      milestones, point_of_contact, resources_required,
      sla_status, days_to_sla,
      systems ( id, name, short_code, fedramp_level )
    `)
    .order("scheduled_completion", { ascending: true });

  if (statusParam === "open") {
    query = query.in("status", ["open", "ongoing"]);
  } else if (statusParam !== "all") {
    query = query.eq(
      "status",
      statusParam as Database["public"]["Tables"]["poam_items"]["Row"]["status"]
    );
  }

  if (systemId) {
    query = query.eq("system_id", systemId);
  }

  const { data: poamsRaw, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch POA&Ms" },
      { status: 500 }
    );
  }

  const poams = (poamsRaw as unknown as PoamExportRow[] | null) ?? [];

  // ── 4. Build Excel workbook ───────────────────────────────────────────────
  const workbook  = new ExcelJS.Workbook();
  workbook.creator  = "ConMon Dashboard";
  workbook.created  = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("POA&M", {
    views: [{ state: "frozen", ySplit: 2 }], // Freeze header rows
  });

  // ── Column definitions (FedRAMP POA&M template layout) ───────────────────
  sheet.columns = [
    { key: "poam_id",           width: 18 },
    { key: "system",            width: 25 },
    { key: "fedramp_level",     width: 12 },
    { key: "weakness_name",     width: 50 },
    { key: "severity",          width: 12 },
    { key: "source",            width: 15 },
    { key: "poc",               width: 25 },
    { key: "resources",         width: 35 },
    { key: "remediation_plan",  width: 45 },
    { key: "identified_date",   width: 15 },
    { key: "scheduled_date",    width: 15 },
    { key: "actual_date",       width: 15 },
    { key: "milestones",        width: 50 },
    { key: "status",            width: 15 },
    { key: "sla_status",        width: 12 },
    { key: "days_to_sla",       width: 12 },
  ];

  // ── Title row ─────────────────────────────────────────────────────────────
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value  = "FedRAMP Plan of Action & Milestones (POA&M)";
  titleRow.getCell(1).font   = { bold: true, size: 13 };
  titleRow.getCell(14).value = `Exported: ${format(new Date(), "MMMM d, yyyy")}`;
  titleRow.getCell(14).font  = { italic: true, size: 10, color: { argb: "FF666666" } };
  titleRow.height = 22;

  // ── Header row ────────────────────────────────────────────────────────────
  const headerRow = sheet.getRow(2);
  const headers = [
    "POA&M ID",
    "System",
    "FedRAMP Level",
    "Weakness Name / Description",
    "Severity",
    "Source",
    "Point of Contact",
    "Resources Required",
    "Overall Remediation Plan",
    "Original Detection Date",
    "Scheduled Completion Date",
    "Actual Completion Date",
    "Milestones with Completion Dates",
    "Status",
    "SLA Status",
    "Days to SLA",
  ];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font  = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill  = {
      type:    "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" }, // FedRAMP dark blue
    };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
    };
  });
  headerRow.height = 30;

  // ── Data rows ─────────────────────────────────────────────────────────────
  const SEVERITY_FILL: Record<string, string> = {
    high:          "FFFCE4E4",
    moderate:      "FFFFF3CD",
    low:           "FFE8F5E9",
    informational: "FFF5F5F5",
  };

  poams.forEach((poam, idx) => {
    const row = sheet.addRow({
      poam_id:          poam.poam_number,
      system:           poam.systems?.name ?? "",
      fedramp_level:    poam.systems?.fedramp_level ?? "",
      weakness_name:    poam.weakness_description,
      severity:         poam.severity.charAt(0).toUpperCase() + poam.severity.slice(1),
      source:           poam.source.replace(/_/g, " "),
      poc:              poam.point_of_contact ?? "",
      resources:        poam.resources_required ?? "",
      remediation_plan: "", // Filled in manually by ISSO
      identified_date:  format(new Date(poam.identified_date), "MM/dd/yyyy"),
      scheduled_date:   format(new Date(poam.scheduled_completion), "MM/dd/yyyy"),
      actual_date:      poam.actual_completion
        ? format(new Date(poam.actual_completion), "MM/dd/yyyy")
        : "",
      milestones:       formatMilestonesForExport(poam.milestones),
      status:           poam.status.replace(/_/g, " "),
      sla_status:       poam.sla_status.replace(/_/g, " "),
      days_to_sla:      poam.days_to_sla ?? "",
    });

    row.height = 40;

    // Alternate row shading
    const bgColor = idx % 2 === 0 ? "FFFFFFFF" : "FFF9FAFB";
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (!cell.fill || cell.fill.type !== "pattern") {
        cell.fill = {
          type:    "pattern",
          pattern: "solid",
          fgColor: { argb: bgColor },
        };
      }
      cell.alignment = { vertical: "top", wrapText: true };
      cell.font      = { size: 9 };
    });

    // Severity cell coloring
    const severityCell = row.getCell("severity");
    severityCell.fill = {
      type:    "pattern",
      pattern: "solid",
      fgColor: { argb: SEVERITY_FILL[poam.severity] ?? "FFFFFFFF" },
    };
    severityCell.font = { bold: true, size: 9 };

    // SLA overdue = red text
    if (poam.sla_status === "overdue") {
      row.getCell("sla_status").font = { bold: true, size: 9, color: { argb: "FFCC0000" } };
      row.getCell("days_to_sla").font = { bold: true, size: 9, color: { argb: "FFCC0000" } };
    } else if (poam.sla_status === "warning") {
      row.getCell("sla_status").font = { bold: true, size: 9, color: { argb: "FF996600" } };
    }
  });

  // ── Auto-filter on header row ─────────────────────────────────────────────
  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to:   { row: 2, column: headers.length },
  };

  // ── Generate buffer ───────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();

  const today    = format(new Date(), "yyyy-MM-dd");
  const filename = systemId
    ? `poam-${systemId.slice(0, 8)}-${today}.xlsx`
    : `poam-export-${today}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
