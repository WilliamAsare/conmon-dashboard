"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function requireAdminOrIssm(systemId: string) {
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
  const profile = profileRaw as { id: string; organization_id: string; role: string } | null;
  if (!profile) redirect("/login");

  if (!["admin", "issm"].includes(profile.role)) {
    throw new Error("Insufficient permissions.");
  }

  // Verify system belongs to user's org
  const { data: sysRaw } = await supabase
    .from("systems")
    .select("id")
    .eq("id", systemId)
    .eq("organization_id", profile.organization_id)
    .single();
  if (!sysRaw) throw new Error("System not found.");

  return { userId: user.id, orgId: profile.organization_id };
}

const CreateTokenSchema = z.object({
  system_id:  z.string().uuid(),
  label:      z.string().min(1, "Label is required").max(80),
  expires_in: z.enum(["30", "90", "365", "never"]),
});

export type CreateTokenState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; token: string };

export async function createShareToken(
  _prev: CreateTokenState,
  formData: FormData
): Promise<CreateTokenState> {
  const parsed = CreateTokenSchema.safeParse({
    system_id:  formData.get("system_id"),
    label:      formData.get("label"),
    expires_in: formData.get("expires_in"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  let auth: { userId: string; orgId: string };
  try {
    auth = await requireAdminOrIssm(parsed.data.system_id);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Unauthorized" };
  }

  const token = randomBytes(32).toString("hex");

  let expiresAt: string | null = null;
  if (parsed.data.expires_in !== "never") {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(parsed.data.expires_in, 10));
    expiresAt = d.toISOString();
  }

  const svc = createServiceClient();
  const { error } = await svc.from("share_tokens").insert({
    system_id:  parsed.data.system_id,
    org_id:     auth.orgId,
    token,
    label:      parsed.data.label,
    expires_at: expiresAt,
    created_by: auth.userId,
  });

  if (error) {
    return { status: "error", message: `Failed to create token: ${error.message}` };
  }

  revalidatePath(`/systems/${parsed.data.system_id}/share`);
  return { status: "success", token };
}

export async function revokeShareToken(_formData: FormData): Promise<void> {
  const tokenId  = _formData.get("token_id")  as string;
  const systemId = _formData.get("system_id") as string;

  try {
    await requireAdminOrIssm(systemId);
  } catch {
    return;
  }

  const svc = createServiceClient();
  await svc
    .from("share_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId);

  revalidatePath(`/systems/${systemId}/share`);
}
