"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OrgActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const OrgNameSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name is too long").trim(),
});

export async function updateOrgName(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const result = OrgNameSchema.safeParse({ name: formData.get("name") });
  if (!result.success) {
    return { status: "error", message: result.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  // `as unknown as` cast: new RPC functions not yet in generated types
  const { error } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>
  ) => Promise<{ error: { message: string } | null }>)(
    "update_organization_name",
    { p_name: result.data.name }
  );

  if (error) return { status: "error", message: error.message };

  revalidatePath("/settings/org");
  return { status: "success", message: "Organization name updated" };
}
