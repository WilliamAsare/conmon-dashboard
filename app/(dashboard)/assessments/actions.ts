"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type AssessmentStatus = Database["public"]["Tables"]["assessments"]["Row"]["status"];

async function requireOrgAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("id, organization_id, role").eq("id", user.id).single();
  const profile = profileRaw as { id: string; organization_id: string; role: string } | null;
  if (!profile) redirect("/login");

  return { user, profile };
}

const AssessmentSchema = z.object({
  system_id:       z.string().uuid("Select a system"),
  assessment_type: z.enum(["annual", "significant_change", "focused"]),
  assessor_name:   z.string().min(1, "Assessor name is required"),
  planned_start:   z.string().min(1, "Planned start date is required"),
  planned_end:     z.string().min(1, "Planned end date is required"),
  notes:           z.string().optional(),
});

export type AssessmentState = { status: "idle" } | { status: "error"; message: string };

export async function createAssessment(
  _prev: AssessmentState,
  formData: FormData
): Promise<AssessmentState> {
  const { user, profile } = await requireOrgAccess();

  if (!["admin", "issm", "isso"].includes(profile.role)) {
    return { status: "error", message: "Insufficient permissions. Requires ISSM or above." };
  }

  const parsed = AssessmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  if (new Date(parsed.data.planned_end) <= new Date(parsed.data.planned_start)) {
    return { status: "error", message: "Planned end must be after planned start." };
  }

  const svc = createServiceClient();
  const { data: newRow, error } = await svc
    .from("assessments")
    .insert({
      organization_id: profile.organization_id,
      system_id:       parsed.data.system_id,
      assessment_type: parsed.data.assessment_type,
      assessor_name:   parsed.data.assessor_name,
      planned_start:   parsed.data.planned_start,
      planned_end:     parsed.data.planned_end,
      notes:           parsed.data.notes || null,
      created_by:      user.id,
    })
    .select("id")
    .single();

  if (error) return { status: "error", message: error.message };

  const id = (newRow as unknown as { id: string } | null)?.id;
  revalidatePath("/assessments");
  if (id) redirect(`/assessments/${id}`);
  return { status: "idle" };
}

export async function updateAssessmentStatus(
  assessmentId: string,
  newStatus: AssessmentStatus,
  _formData: FormData
): Promise<void> {
  const { profile } = await requireOrgAccess();

  if (!["admin", "issm", "isso"].includes(profile.role)) return;

  const now = new Date().toISOString().split("T")[0]; // date only
  const svc = createServiceClient();
  await svc
    .from("assessments")
    .update({
      status:       newStatus,
      actual_start: newStatus === "in_progress" ? now : undefined,
      actual_end:   newStatus === "completed" || newStatus === "cancelled" ? now : undefined,
    })
    .eq("id", assessmentId);

  revalidatePath(`/assessments/${assessmentId}`);
  revalidatePath("/assessments");
}

export async function updateAssessmentFindings(
  assessmentId: string,
  findingsCount: number
): Promise<void> {
  const { profile } = await requireOrgAccess();
  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) return;

  const svc = createServiceClient();
  await svc
    .from("assessments")
    .update({ findings_count: findingsCount })
    .eq("id", assessmentId);

  revalidatePath(`/assessments/${assessmentId}`);
}
