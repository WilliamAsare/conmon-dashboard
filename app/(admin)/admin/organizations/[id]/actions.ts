"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function requirePlatformAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data } = await svc
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .single();

  if (!data) redirect("/dashboard");
  return user.id;
}

export async function suspendOrganization(_formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const orgId = _formData.get("org_id") as string;
  if (!orgId) return;

  const svc = createServiceClient();
  await svc
    .from("organizations")
    .update({ status: "suspended" })
    .eq("id", orgId);

  revalidatePath(`/admin/organizations/${orgId}`);
  revalidatePath("/admin/organizations");
  revalidatePath("/admin");
}

export async function reactivateOrganization(_formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const orgId = _formData.get("org_id") as string;
  if (!orgId) return;

  const svc = createServiceClient();
  await svc
    .from("organizations")
    .update({ status: "active" })
    .eq("id", orgId);

  revalidatePath(`/admin/organizations/${orgId}`);
  revalidatePath("/admin/organizations");
  revalidatePath("/admin");
}
