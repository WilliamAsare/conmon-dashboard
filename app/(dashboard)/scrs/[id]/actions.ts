"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type ScrStatus = Database["public"]["Tables"]["scrs"]["Row"]["status"];

async function requireScrAccess(scrId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("id, organization_id, role").eq("id", user.id).single();
  const profile = profileRaw as { id: string; organization_id: string; role: string } | null;
  if (!profile) redirect("/login");

  const { data: scrRaw } = await supabase
    .from("scrs").select("id, status, created_by").eq("id", scrId).single();
  const scr = scrRaw as unknown as { id: string; status: string; created_by: string } | null;
  if (!scr) redirect("/scrs");

  return { user, profile, scr };
}

export async function updateScrStatus(
  scrId: string,
  newStatus: ScrStatus,
  _formData: FormData
): Promise<void> {
  const { profile, scr } = await requireScrAccess(scrId);

  const allowedRoles: Record<string, string[]> = {
    submitted:    ["admin", "issm", "isso"],
    under_review: ["admin", "issm"],
    approved:     ["admin", "issm"],
    rejected:     ["admin", "issm"],
    withdrawn:    ["admin", "issm", "isso"],
  };

  const allowed = allowedRoles[newStatus] ?? [];
  if (!allowed.includes(profile.role)) return;

  // Submitter can only submit their own draft
  if (newStatus === "submitted" && scr.created_by !== profile.id) return;

  const svc = createServiceClient();
  await svc
    .from("scrs")
    .update({
      status:         newStatus,
      submitted_date: newStatus === "submitted" ? new Date().toISOString() : undefined,
      approval_date:  newStatus === "approved"  ? new Date().toISOString() : undefined,
    })
    .eq("id", scrId);

  revalidatePath(`/scrs/${scrId}`);
  revalidatePath("/scrs");
}
