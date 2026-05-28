"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const ScrSchema = z.object({
  system_id:         z.string().uuid("Select a system"),
  title:             z.string().min(3, "Title must be at least 3 characters"),
  description:       z.string().min(10, "Description must be at least 10 characters"),
  change_type:       z.string().min(1, "Select a change type"),
  controls_impacted: z.string().transform((s) =>
    s.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
  ),
});

export type ScrFormState = { status: "idle" } | { status: "error"; message: string };

export async function createScr(
  _prev: ScrFormState,
  formData: FormData
): Promise<ScrFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .single();
  const profile = profileRaw as { id: string; organization_id: string; role: string } | null;
  if (!profile) redirect("/login");

  if (!["admin", "issm", "isso"].includes(profile.role)) {
    return { status: "error", message: "Insufficient permissions to create SCRs." };
  }

  const parsed = ScrSchema.safeParse({
    system_id:         formData.get("system_id"),
    title:             formData.get("title"),
    description:       formData.get("description"),
    change_type:       formData.get("change_type"),
    controls_impacted: formData.get("controls_impacted") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const svc = createServiceClient();
  const { data: scrRaw, error } = await svc
    .from("scrs")
    .insert({
      organization_id:   profile.organization_id,
      system_id:         parsed.data.system_id,
      title:             parsed.data.title,
      description:       parsed.data.description,
      change_type:       parsed.data.change_type,
      controls_impacted: parsed.data.controls_impacted,
      created_by:        user.id,
      status:            "draft",
    })
    .select("id")
    .single();

  if (error || !scrRaw) {
    return { status: "error", message: `Failed to create SCR: ${error?.message ?? "unknown error"}` };
  }

  const scr = scrRaw as unknown as { id: string };
  redirect(`/scrs/${scr.id}`);
}
