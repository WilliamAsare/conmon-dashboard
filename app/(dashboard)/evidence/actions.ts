"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type EvidenceRegisterState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; fileId: string };

/**
 * Called after a successful client-side storage upload.
 * Registers the file metadata in the evidence_files table.
 */
export async function registerEvidenceFile(
  _prev: EvidenceRegisterState,
  formData: FormData
): Promise<EvidenceRegisterState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("organization_id, role").eq("id", user.id).single();
  const profile = profileRaw as { organization_id: string; role: string } | null;
  if (!profile) return { status: "error", message: "Profile not found." };

  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) {
    return { status: "error", message: "Insufficient permissions." };
  }

  const entityType = formData.get("entity_type") as string;
  const entityId   = formData.get("entity_id")   as string;
  const fileName   = formData.get("file_name")   as string;
  const filePath   = formData.get("file_path")   as string;
  const fileSize   = formData.get("file_size")   ? Number(formData.get("file_size")) : null;
  const mimeType   = formData.get("mime_type")   as string | null;

  if (!entityType || !entityId || !fileName || !filePath) {
    return { status: "error", message: "Missing required fields." };
  }

  const svc = createServiceClient();
  const { data: row, error } = await svc
    .from("evidence_files")
    .insert({
      organization_id: profile.organization_id,
      entity_type:     entityType as "poam_item" | "assessment" | "incident",
      entity_id:       entityId,
      file_name:       fileName,
      file_path:       filePath,
      file_size:       fileSize,
      mime_type:       mimeType || null,
      uploaded_by:     user.id,
    })
    .select("id")
    .single();

  if (error) return { status: "error", message: error.message };

  const id = (row as unknown as { id: string } | null)?.id ?? "";

  // Revalidate the page that contains this entity
  const revalidateMap: Record<string, string> = {
    poam_item:  `/poams/${entityId}`,
    assessment: `/assessments/${entityId}`,
    incident:   `/incidents/${entityId}`,
  };
  if (revalidateMap[entityType]) revalidatePath(revalidateMap[entityType]);

  return { status: "success", fileId: id };
}

export async function deleteEvidenceFile(
  fileId: string,
  filePath: string,
  entityType: string,
  entityId: string
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profileRaw } = await supabase
    .from("users").select("organization_id, role").eq("id", user.id).single();
  const profile = profileRaw as { organization_id: string; role: string } | null;
  if (!profile) return;
  if (!["admin", "issm", "isso"].includes(profile.role)) return;

  const svc = createServiceClient();
  // Delete from storage
  await svc.storage.from("evidence-files").remove([filePath]);
  // Delete metadata
  await svc.from("evidence_files").delete().eq("id", fileId);

  const revalidateMap: Record<string, string> = {
    poam_item:  `/poams/${entityId}`,
    assessment: `/assessments/${entityId}`,
    incident:   `/incidents/${entityId}`,
  };
  if (revalidateMap[entityType]) revalidatePath(revalidateMap[entityType]);
}
