"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { SystemShortCodeSchema } from "@/lib/fedramp/poam";
import type { Database } from "@/types/supabase";

export type NewSystemState =
  | { status: "idle" }
  | { status: "error"; message: string };

const NewSystemSchema = z.object({
  name: z.string().min(1, "System name is required").max(200),
  short_code: SystemShortCodeSchema,
  fedramp_level: z.enum(["Low", "Moderate", "High"]),
  authorization_date: z.string().optional(),
  ato_expiration: z.string().optional(),
  agency_sponsor: z.string().max(200).optional(),
});

// Local row types.
// The `as unknown as` casts below are required because the placeholder
// types/supabase.ts lacks Relationships that enable Supabase's select-string
// inference. Casts are removed once `supabase gen types` runs.
type UserRow = Pick<Database["public"]["Tables"]["users"]["Row"], "organization_id" | "role">;
type SystemRow = Pick<Database["public"]["Tables"]["systems"]["Row"], "id">;

export async function createSystem(
  _prev: NewSystemState,
  formData: FormData
): Promise<NewSystemState> {
  const result = NewSystemSchema.safeParse({
    name: formData.get("name"),
    short_code: (formData.get("short_code") as string)?.toUpperCase(),
    fedramp_level: formData.get("fedramp_level"),
    authorization_date: formData.get("authorization_date") || undefined,
    ato_expiration: formData.get("ato_expiration") || undefined,
    agency_sponsor: formData.get("agency_sponsor") || undefined,
  });

  if (!result.success) {
    return { status: "error", message: result.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not authenticated" };

  const { data: profileRaw } = await supabase
    .from("users")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserRow | null;

  if (!profile) return { status: "error", message: "Profile not found" };
  if (!["admin", "issm", "isso"].includes(profile.role)) {
    return { status: "error", message: "You do not have permission to add systems" };
  }

  // Use service client for the write: the regular SSR client's insert types
  // break with placeholder types. Role was already verified above.
  const svc = createServiceClient();
  const { data: systemRaw, error } = await svc
    .from("systems")
    .insert({
      organization_id: profile.organization_id,
      name: result.data.name,
      short_code: result.data.short_code,
      fedramp_level: result.data.fedramp_level,
      authorization_date: result.data.authorization_date ?? null,
      ato_expiration: result.data.ato_expiration ?? null,
      agency_sponsor: result.data.agency_sponsor ?? null,
    } as Database["public"]["Tables"]["systems"]["Insert"])
    .select("id")
    .single();

  const system = systemRaw as unknown as SystemRow | null;

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: `Short code "${result.data.short_code}" is already used by another system in your organization.` };
    }
    return { status: "error", message: `Failed to create system: ${error.message}` };
  }

  if (!system) return { status: "error", message: "System created but ID not returned." };

  redirect(`/systems/${system.id}`);
}
