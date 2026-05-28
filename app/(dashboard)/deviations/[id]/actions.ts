"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type ReviewState =
  | { status: "idle" }
  | { status: "error"; message: string };

type UserRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "role" | "organization_id"
>;

type DeviationRow = Pick<
  Database["public"]["Tables"]["deviation_requests"]["Row"],
  "id" | "status" | "poam_id" | "deviation_type" | "organization_id"
>;

type PoamRow = Pick<
  Database["public"]["Tables"]["poam_items"]["Row"],
  "id" | "finding_id"
>;

const ReviewSchema = z.object({
  action:       z.enum(["approved", "rejected"]),
  review_notes: z.string().max(2000).optional(),
});

export async function reviewDeviationRequest(
  deviationId: string,
  _prev: ReviewState,
  formData: FormData
): Promise<ReviewState> {
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

  if (!["admin", "issm"].includes(profile.role)) {
    return { status: "error", message: "Only ISSM and Admin roles can review deviation requests." };
  }

  // ── 2. Validate input ──────────────────────────────────────────────────────
  const result = ReviewSchema.safeParse({
    action:       formData.get("action"),
    review_notes: formData.get("review_notes") || undefined,
  });

  if (!result.success) {
    return { status: "error", message: result.error.errors[0]?.message ?? "Invalid input" };
  }

  if (result.data.action === "rejected" && !result.data.review_notes?.trim()) {
    return { status: "error", message: "Review notes are required when rejecting a request." };
  }

  // ── 3. Fetch and verify the deviation request ──────────────────────────────
  const { data: devRaw } = await supabase
    .from("deviation_requests")
    .select("id, status, poam_id, deviation_type, organization_id")
    .eq("id", deviationId)
    .single();

  const dev = devRaw as unknown as DeviationRow | null;

  if (!dev) return { status: "error", message: "Deviation request not found." };
  if (dev.organization_id !== profile.organization_id) {
    return { status: "error", message: "Not authorized." };
  }
  if (dev.status !== "submitted") {
    return { status: "error", message: "Only submitted requests can be reviewed." };
  }

  // ── 4. Fetch the linked POA&M ──────────────────────────────────────────────
  const { data: poamRaw } = await supabase
    .from("poam_items")
    .select("id, finding_id")
    .eq("id", dev.poam_id)
    .single();

  const poam = poamRaw as unknown as PoamRow | null;

  const svc    = createServiceClient();
  const today  = new Date().toISOString().split("T")[0]!;
  const action = result.data.action;

  // ── 5. Update the deviation request ───────────────────────────────────────
  await svc
    .from("deviation_requests")
    .update({
      status:       action,
      reviewer_id:  user.id,
      review_date:  today,
      review_notes: result.data.review_notes ?? null,
    } as Database["public"]["Tables"]["deviation_requests"]["Update"])
    .eq("id", deviationId);

  // ── 6. Update linked finding + POA&M status ───────────────────────────────
  if (action === "approved") {
    if (poam?.finding_id) {
      // FP: vulnerability doesn't exist → risk_accepted
      // RA/OR: vulnerability real but deviation accepted → deviation_approved
      const findingStatus = dev.deviation_type === "FP"
        ? "risk_accepted"
        : "deviation_approved";

      await svc
        .from("findings")
        .update({
          status: findingStatus,
        } as Database["public"]["Tables"]["findings"]["Update"])
        .eq("id", poam.finding_id);
    }

    if (poam) {
      // FP: false positive → POA&M completed (no real vuln)
      // RA/OR: real vuln but accepted → risk_accepted
      const poamStatus = dev.deviation_type === "FP" ? "completed" : "risk_accepted";

      await svc
        .from("poam_items")
        .update({
          status:            poamStatus,
          actual_completion: dev.deviation_type === "FP" ? today : null,
        } as Database["public"]["Tables"]["poam_items"]["Update"])
        .eq("id", dev.poam_id);
    }
  } else {
    // Rejected: revert finding to open, POA&M back to ongoing
    if (poam?.finding_id) {
      await svc
        .from("findings")
        .update({ status: "open" } as Database["public"]["Tables"]["findings"]["Update"])
        .eq("id", poam.finding_id);
    }
  }

  redirect(`/deviations/${deviationId}`);
}
