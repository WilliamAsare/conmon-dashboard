"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function requireOrgAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("id, organization_id, role").eq("id", user.id).single();
  const profile = profileRaw as { id: string; organization_id: string; role: string } | null;
  if (!profile) redirect("/login");

  return profile;
}

const ItemSchema = z.object({
  system_id:  z.string().uuid("Select a system"),
  item_type:  z.enum(["hardware", "software"]),
  name:       z.string().min(1, "Name is required"),
  vendor:     z.string().optional(),
  version:    z.string().optional(),
  asset_tag:  z.string().optional(),
  ip_address: z.string().optional(),
  mac_address:z.string().optional(),
  os_name:    z.string().optional(),
  cpe:        z.string().optional(),
  notes:      z.string().optional(),
});

export type InventoryState = { status: "idle" } | { status: "error"; message: string };

export async function createInventoryItem(
  _prev: InventoryState,
  formData: FormData
): Promise<InventoryState> {
  const profile = await requireOrgAccess();

  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) {
    return { status: "error", message: "Insufficient permissions." };
  }

  const parsed = ItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const svc = createServiceClient();
  const { error } = await svc.from("inventory_items").insert({
    organization_id: profile.organization_id,
    system_id:       parsed.data.system_id,
    item_type:       parsed.data.item_type,
    name:            parsed.data.name,
    vendor:          parsed.data.vendor || null,
    version:         parsed.data.version || null,
    asset_tag:       parsed.data.asset_tag || null,
    ip_address:      parsed.data.ip_address || null,
    mac_address:     parsed.data.mac_address || null,
    os_name:         parsed.data.os_name || null,
    cpe:             parsed.data.cpe || null,
    notes:           parsed.data.notes || null,
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath("/inventory");
  return { status: "idle" };
}

export async function deleteInventoryItem(_formData: FormData): Promise<void> {
  const profile = await requireOrgAccess();
  if (!["admin", "issm", "isso"].includes(profile.role)) return;

  const itemId = _formData.get("item_id") as string;
  const svc = createServiceClient();
  await svc.from("inventory_items").delete().eq("id", itemId);
  revalidatePath("/inventory");
}
