"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type { Json } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PoamStatus = Database["public"]["Tables"]["poam_items"]["Row"]["status"];

type UserRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "role" | "organization_id"
>;

/** Shape of a single milestone in the JSONB column. */
export type Milestone = {
  id: string;
  description: string;
  target_date: string;
  completed: boolean;
  completed_date: string | null;
};

export function parseMilestones(raw: Json): Milestone[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is Milestone =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>)["id"] === "string" &&
      typeof (item as Record<string, unknown>)["description"] === "string"
  );
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserRow | null;
  if (!profile) redirect("/login");
  return { supabase, profile };
}

// ---------------------------------------------------------------------------
// updatePoamDetails
// ---------------------------------------------------------------------------

export type UpdatePoamState =
  | { status: "idle" }
  | { status: "error"; message: string };

const UpdatePoamSchema = z.object({
  weakness_description: z
    .string()
    .min(1, "Weakness description is required")
    .max(2000),
  point_of_contact:    z.string().max(200).optional(),
  resources_required:  z.string().max(1000).optional(),
  scheduled_completion: z.string().min(1, "Scheduled completion date is required"),
});

export async function updatePoamDetails(
  poamId: string,
  _prev: UpdatePoamState,
  formData: FormData
): Promise<UpdatePoamState> {
  const result = UpdatePoamSchema.safeParse({
    weakness_description: formData.get("weakness_description"),
    point_of_contact:    formData.get("point_of_contact") || undefined,
    resources_required:  formData.get("resources_required") || undefined,
    scheduled_completion: formData.get("scheduled_completion"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: result.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const { supabase, profile } = await requireAuth();

  if (!["admin", "issm", "isso"].includes(profile.role)) {
    return { status: "error", message: "You do not have permission to edit POA&Ms." };
  }

  // Verify POA&M is accessible to this user (SSR client respects RLS)
  const { data: existing } = await supabase
    .from("poam_items")
    .select("id")
    .eq("id", poamId)
    .single();

  if (!existing) return { status: "error", message: "POA&M not found." };

  const svc = createServiceClient();
  const { error } = await svc
    .from("poam_items")
    .update({
      weakness_description: result.data.weakness_description,
      point_of_contact:    result.data.point_of_contact ?? null,
      resources_required:  result.data.resources_required ?? null,
      scheduled_completion: result.data.scheduled_completion,
    } as Database["public"]["Tables"]["poam_items"]["Update"])
    .eq("id", poamId);

  if (error) {
    return { status: "error", message: `Failed to update: ${error.message}` };
  }

  redirect(`/poams/${poamId}`);
}

// ---------------------------------------------------------------------------
// updatePoamStatus
// ---------------------------------------------------------------------------

export async function updatePoamStatus(
  poamId: string,
  newStatus: PoamStatus,
  _formData: FormData
): Promise<void> {
  const { supabase, profile } = await requireAuth();

  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) {
    throw new Error("Permission denied");
  }

  // Verify accessibility
  const { data: existing } = await supabase
    .from("poam_items")
    .select("id")
    .eq("id", poamId)
    .single();

  if (!existing) throw new Error("POA&M not found");

  const update: Database["public"]["Tables"]["poam_items"]["Update"] = {
    status: newStatus,
  };
  if (newStatus === "completed") {
    update.actual_completion = new Date().toISOString().split("T")[0]!;
  }
  if (newStatus === "open" || newStatus === "ongoing") {
    update.actual_completion = null;
  }

  const svc = createServiceClient();
  await svc
    .from("poam_items")
    .update(update)
    .eq("id", poamId);

  revalidatePath(`/poams/${poamId}`);
  revalidatePath("/poams");
}

// ---------------------------------------------------------------------------
// addMilestone
// ---------------------------------------------------------------------------

export type AddMilestoneState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };

const AddMilestoneSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  target_date: z.string().min(1, "Target date is required"),
});

export async function addMilestone(
  poamId: string,
  _prev: AddMilestoneState,
  formData: FormData
): Promise<AddMilestoneState> {
  const result = AddMilestoneSchema.safeParse({
    description: formData.get("description"),
    target_date: formData.get("target_date"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: result.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const { supabase, profile } = await requireAuth();

  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) {
    return { status: "error", message: "Permission denied." };
  }

  const { data: poamRaw } = await supabase
    .from("poam_items")
    .select("id, milestones")
    .eq("id", poamId)
    .single();

  const poam = poamRaw as unknown as Pick<
    Database["public"]["Tables"]["poam_items"]["Row"],
    "id" | "milestones"
  > | null;

  if (!poam) return { status: "error", message: "POA&M not found." };

  const milestones = parseMilestones(poam.milestones);
  milestones.push({
    id:             crypto.randomUUID(),
    description:    result.data.description,
    target_date:    result.data.target_date,
    completed:      false,
    completed_date: null,
  });

  const svc = createServiceClient();
  const { error } = await svc
    .from("poam_items")
    .update({
      milestones: milestones as unknown as Json,
    } as Database["public"]["Tables"]["poam_items"]["Update"])
    .eq("id", poamId);

  if (error) {
    return { status: "error", message: `Failed to add milestone: ${error.message}` };
  }

  revalidatePath(`/poams/${poamId}`);
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// completeMilestone
// ---------------------------------------------------------------------------

export async function completeMilestone(
  poamId: string,
  milestoneId: string,
  completed: boolean
): Promise<void> {
  const { supabase, profile } = await requireAuth();

  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) {
    throw new Error("Permission denied");
  }

  const { data: poamRaw } = await supabase
    .from("poam_items")
    .select("id, milestones")
    .eq("id", poamId)
    .single();

  const poam = poamRaw as unknown as Pick<
    Database["public"]["Tables"]["poam_items"]["Row"],
    "id" | "milestones"
  > | null;

  if (!poam) throw new Error("POA&M not found");

  const milestones = parseMilestones(poam.milestones).map((m) =>
    m.id === milestoneId
      ? {
          ...m,
          completed,
          completed_date: completed
            ? new Date().toISOString().split("T")[0]!
            : null,
        }
      : m
  );

  const svc = createServiceClient();
  await svc
    .from("poam_items")
    .update({
      milestones: milestones as unknown as Json,
    } as Database["public"]["Tables"]["poam_items"]["Update"])
    .eq("id", poamId);

  revalidatePath(`/poams/${poamId}`);
}

// ---------------------------------------------------------------------------
// deleteMilestone
// ---------------------------------------------------------------------------

export async function deleteMilestone(
  poamId: string,
  milestoneId: string
): Promise<void> {
  const { supabase, profile } = await requireAuth();

  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) {
    throw new Error("Permission denied");
  }

  const { data: poamRaw } = await supabase
    .from("poam_items")
    .select("id, milestones")
    .eq("id", poamId)
    .single();

  const poam = poamRaw as unknown as Pick<
    Database["public"]["Tables"]["poam_items"]["Row"],
    "id" | "milestones"
  > | null;

  if (!poam) throw new Error("POA&M not found");

  const milestones = parseMilestones(poam.milestones).filter(
    (m) => m.id !== milestoneId
  );

  const svc = createServiceClient();
  await svc
    .from("poam_items")
    .update({
      milestones: milestones as unknown as Json,
    } as Database["public"]["Tables"]["poam_items"]["Update"])
    .eq("id", poamId);

  revalidatePath(`/poams/${poamId}`);
}
