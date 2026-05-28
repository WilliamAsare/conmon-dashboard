/**
 * GET /api/export/oscal/[system_id]
 *
 * Exports all open/ongoing POA&M items for a system as an OSCAL 1.1.2 JSON
 * Plan of Action and Milestones document, suitable for FedRAMP PMO submission.
 *
 * Requires an authenticated session; auditor role and above can export.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildOscalPoam, type OscalPoamItem } from "@/lib/oscal/poam";

type SystemRow = {
  id: string;
  name: string;
  fedramp_level: string;
  organization_id: string;
  organizations: { name: string } | null;
};

type PoamRow = {
  id: string;
  poam_number: string;
  weakness_description: string;
  severity: "high" | "moderate" | "low" | "informational";
  status: string;
  scheduled_completion: string;
  identified_date: string;
  sla_status: string;
  days_to_sla: number | null;
  control_ids: string[];
  milestones: Array<{
    id: string;
    description: string;
    target_date: string;
    status: string;
  }>;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ system_id: string }> }
) {
  const { system_id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // All authenticated users with an org can export (auditor+)
  const { data: profileRaw } = await supabase
    .from("users")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();
  const profile = profileRaw as { organization_id: string; role: string } | null;
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  // Fetch system (ensures it belongs to user's org via RLS)
  const { data: sysRaw, error: sysErr } = await supabase
    .from("systems")
    .select("id, name, fedramp_level, organization_id, organizations(name)")
    .eq("id", system_id)
    .single();

  if (sysErr || !sysRaw) {
    return NextResponse.json({ error: "System not found" }, { status: 404 });
  }

  const system = sysRaw as unknown as SystemRow;

  // Fetch POA&M items with milestones (exclude closed/cancelled)
  const { data: poamsRaw } = await supabase
    .from("poam_items")
    .select(`
      id, poam_number, weakness_description, severity, status,
      scheduled_completion, identified_date, sla_status, days_to_sla, control_ids,
      milestones(id, description, target_date, status)
    `)
    .eq("system_id", system_id)
    .in("status", ["open", "ongoing", "completed"])
    .order("poam_number");

  const poams = (poamsRaw as unknown as PoamRow[] | null) ?? [];

  // Map to OSCAL input shape
  const items: OscalPoamItem[] = poams.map((p) => ({
    id:                  p.id,
    poamNumber:          p.poam_number,
    weakness:            p.weakness_description,
    severity:            p.severity,
    status:              p.status,
    scheduledCompletion: p.scheduled_completion,
    identifiedDate:      p.identified_date,
    slaStatus:           p.sla_status,
    daysToSla:           p.days_to_sla,
    controlIds:          p.control_ids ?? [],
    milestones:          (p.milestones ?? []).map((m) => ({
      id:          m.id,
      description: m.description,
      target_date: m.target_date,
      completed:   m.status === "completed",
    })),
  }));

  const document = buildOscalPoam({
    systemId:     system.id,
    systemName:   system.name,
    orgName:      system.organizations?.name ?? "Unknown Organization",
    fedrampLevel: system.fedramp_level,
    generatedAt:  new Date().toISOString(),
    items,
  });

  const filename = `oscal-poam-${system.name.replace(/[^a-zA-Z0-9-]/g, "_")}-${
    new Date().toISOString().split("T")[0]
  }.json`;

  return new NextResponse(JSON.stringify(document, null, 2), {
    status: 200,
    headers: {
      "Content-Type":        "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
