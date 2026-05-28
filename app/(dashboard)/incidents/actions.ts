"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type IncidentStatus = Database["public"]["Tables"]["incidents"]["Row"]["status"];

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

const IncidentSchema = z.object({
  system_id:         z.string().uuid("Select a system"),
  title:             z.string().min(1, "Title is required"),
  description:       z.string().min(1, "Description is required"),
  severity:          z.enum(["high", "moderate", "low"]),
  detected_at:       z.string().min(1, "Detection time is required"),
  affected_controls: z.string().optional(),
  notes:             z.string().optional(),
});

export type IncidentState = { status: "idle" } | { status: "error"; message: string };

export async function createIncident(
  _prev: IncidentState,
  formData: FormData
): Promise<IncidentState> {
  const { user, profile } = await requireOrgAccess();

  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) {
    return { status: "error", message: "Insufficient permissions." };
  }

  const parsed = IncidentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const controlIds = parsed.data.affected_controls
    ? parsed.data.affected_controls.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  const svc = createServiceClient();
  const { data: newRow, error } = await svc
    .from("incidents")
    .insert({
      organization_id:   profile.organization_id,
      system_id:         parsed.data.system_id,
      title:             parsed.data.title,
      description:       parsed.data.description,
      severity:          parsed.data.severity,
      detected_at:       new Date(parsed.data.detected_at).toISOString(),
      reported_at:       new Date().toISOString(),
      affected_controls: controlIds,
      reported_by:       user.id,
      notes:             parsed.data.notes || null,
    })
    .select("id")
    .single();

  if (error) return { status: "error", message: error.message };

  const id = (newRow as unknown as { id: string } | null)?.id;
  revalidatePath("/incidents");
  if (id) redirect(`/incidents/${id}`);
  return { status: "idle" };
}

export async function updateIncidentStatus(
  incidentId: string,
  newStatus: IncidentStatus,
  _formData: FormData
): Promise<void> {
  const { profile } = await requireOrgAccess();

  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) return;

  const now = new Date().toISOString();
  const svc = createServiceClient();
  await svc
    .from("incidents")
    .update({
      status:        newStatus,
      contained_at:  newStatus === "contained" ? now : undefined,
      resolved_at:   newStatus === "resolved" || newStatus === "closed" ? now : undefined,
    })
    .eq("id", incidentId);

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");
}
