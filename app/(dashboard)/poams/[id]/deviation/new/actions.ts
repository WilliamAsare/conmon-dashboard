"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  DeviationJustificationSchema,
} from "@/lib/fedramp/deviations";
import type { Database } from "@/types/supabase";

export type DeviationState =
  | { status: "idle" }
  | { status: "error"; message: string };

type UserRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "role" | "organization_id"
>;

type PoamRow = Pick<
  Database["public"]["Tables"]["poam_items"]["Row"],
  "id" | "status" | "finding_id"
>;

export async function submitDeviationRequest(
  poamId: string,
  _prev: DeviationState,
  formData: FormData
): Promise<DeviationState> {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
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

  if (!["admin", "issm", "isso"].includes(profile.role)) {
    return {
      status: "error",
      message: "You do not have permission to submit deviation requests.",
    };
  }

  // ── 2. Validate deviation type ────────────────────────────────────────────
  const deviationType = formData.get("deviation_type");
  if (
    !deviationType ||
    !["RA", "FP", "OR"].includes(deviationType as string)
  ) {
    return { status: "error", message: "Please select a deviation type." };
  }

  // ── 3. Parse type-specific fields ─────────────────────────────────────────
  let justificationData: Record<string, string>;

  if (deviationType === "RA") {
    justificationData = {
      deviation_type:           "RA",
      operational_context:      (formData.get("operational_context") as string) ?? "",
      compensating_controls:    (formData.get("compensating_controls") as string) ?? "",
      residual_risk_statement:  (formData.get("residual_risk_statement") as string) ?? "",
    };
  } else if (deviationType === "FP") {
    justificationData = {
      deviation_type:          "FP",
      technical_justification: (formData.get("technical_justification") as string) ?? "",
      evidence_description:    (formData.get("evidence_description") as string) ?? "",
    };
  } else {
    justificationData = {
      deviation_type:           "OR",
      business_justification:   (formData.get("business_justification") as string) ?? "",
      impact_if_remediated:     (formData.get("impact_if_remediated") as string) ?? "",
      compensating_controls:    (formData.get("compensating_controls") as string) ?? "",
      expected_resolution_date: (formData.get("expected_resolution_date") as string) || "",
    };
  }

  // Remove empty optional field to satisfy zod schema (OR.expected_resolution_date)
  if (deviationType === "OR" && !justificationData["expected_resolution_date"]) {
    delete justificationData["expected_resolution_date"];
  }

  const validationResult = DeviationJustificationSchema.safeParse(justificationData);
  if (!validationResult.success) {
    return {
      status: "error",
      message:
        validationResult.error.errors[0]?.message ?? "Validation failed.",
    };
  }

  // ── 4. Verify POA&M belongs to this org ───────────────────────────────────
  const { data: poamRaw } = await supabase
    .from("poam_items")
    .select("id, status, finding_id")
    .eq("id", poamId)
    .single();

  const poam = poamRaw as unknown as PoamRow | null;
  if (!poam) return { status: "error", message: "POA&M not found." };

  if (poam.status !== "open" && poam.status !== "ongoing") {
    return {
      status: "error",
      message: "Deviation requests can only be submitted for open POA&Ms.",
    };
  }

  // ── 5. Insert deviation request ───────────────────────────────────────────
  const svc = createServiceClient();
  const { error: insertError } = await svc
    .from("deviation_requests")
    .insert({
      organization_id: profile.organization_id,
      poam_id:         poamId,
      deviation_type:  deviationType as "RA" | "FP" | "OR",
      justification:   validationResult.data as unknown as Database["public"]["Tables"]["deviation_requests"]["Row"]["justification"],
      requested_by:    user.id,
      status:          "submitted",
    } as Database["public"]["Tables"]["deviation_requests"]["Insert"]);

  if (insertError) {
    return {
      status: "error",
      message: `Failed to submit request: ${insertError.message}`,
    };
  }

  // ── 6. Mark linked finding as deviation_pending ───────────────────────────
  if (poam.finding_id) {
    await svc
      .from("findings")
      .update({
        status: "deviation_pending",
      } as Database["public"]["Tables"]["findings"]["Update"])
      .eq("id", poam.finding_id);
  }

  redirect(`/poams/${poamId}`);
}
