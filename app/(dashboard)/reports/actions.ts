"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type GenerateReportState =
  | { status: "idle" }
  | { status: "error"; message: string };

type UserRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "organization_id" | "role"
>;

const GenerateReportSchema = z.object({
  system_id:               z.string().uuid("Invalid system ID"),
  reporting_period_start:  z.string().min(1, "Start date is required"),
  reporting_period_end:    z.string().min(1, "End date is required"),
});

export async function generateReport(
  _prev: GenerateReportState,
  formData: FormData
): Promise<GenerateReportState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserRow | null;
  if (!profile) redirect("/login");

  if (!["admin", "issm", "isso"].includes(profile.role)) {
    return { status: "error", message: "You do not have permission to generate reports." };
  }

  const result = GenerateReportSchema.safeParse({
    system_id:              formData.get("system_id"),
    reporting_period_start: formData.get("reporting_period_start"),
    reporting_period_end:   formData.get("reporting_period_end"),
  });

  if (!result.success) {
    return { status: "error", message: result.error.errors[0]?.message ?? "Invalid input" };
  }

  if (result.data.reporting_period_end < result.data.reporting_period_start) {
    return { status: "error", message: "End date must be after start date." };
  }

  // Verify system belongs to this org
  const { data: sysRaw } = await supabase
    .from("systems")
    .select("id")
    .eq("id", result.data.system_id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!sysRaw) {
    return { status: "error", message: "System not found or not accessible." };
  }

  const svc = createServiceClient();
  const { data: reportRaw, error } = await svc
    .from("conmon_reports")
    .insert({
      organization_id:        profile.organization_id,
      system_id:              result.data.system_id,
      reporting_period_start: result.data.reporting_period_start,
      reporting_period_end:   result.data.reporting_period_end,
      generated_by:           user.id,
    } as Database["public"]["Tables"]["conmon_reports"]["Insert"])
    .select("id")
    .single();

  if (error || !reportRaw) {
    return { status: "error", message: `Failed to create report: ${error?.message ?? "unknown error"}` };
  }

  const report = reportRaw as unknown as { id: string };
  // Redirect directly to the download route so the browser receives the PDF
  redirect(`/api/reports/${report.id}/download`);
}
