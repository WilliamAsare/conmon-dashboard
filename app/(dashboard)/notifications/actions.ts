"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { supabase, user } = await getUser();

  // Verify the notification belongs to this user (SSR client + RLS)
  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .single();

  if (!data) return;

  const svc = createServiceClient();
  await svc
    .from("notifications")
    .update({
      read_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["notifications"]["Update"])
    .eq("id", notificationId);

  revalidatePath("/notifications");
}

export async function markAllRead(_formData: FormData): Promise<void> {
  const { user } = await getUser();

  const svc = createServiceClient();
  await svc
    .from("notifications")
    .update({
      read_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["notifications"]["Update"])
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidatePath("/notifications");
}
