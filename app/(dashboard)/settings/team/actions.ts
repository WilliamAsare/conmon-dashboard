"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email/send";

export type TeamActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const InviteSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  role: z.enum(["admin", "issm", "isso", "engineer", "auditor"]),
});

// ── Invite a new member ──────────────────────────────────────────────────────

export async function inviteUser(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const result = InviteSchema.safeParse({
    email: formData.get("email"),
    role:  formData.get("role"),
  });
  if (!result.success) {
    return { status: "error", message: result.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not authenticated" };

  const { data: profileRaw } = await supabase
    .from("users").select("organization_id, role, full_name").eq("id", user.id).single();
  const profile = profileRaw as { organization_id: string; role: string; full_name: string } | null;

  if (!profile || profile.role !== "admin") {
    return { status: "error", message: "Only admins can invite team members" };
  }

  // Create the invitation row.
  // `as unknown as` cast: supabase-js generic doesn't infer the new invitations
  // table Insert type from the placeholder types/supabase.ts.
  const { data: inviteRaw, error: inviteErr } = await supabase
    .from("invitations")
    .insert({
      organization_id: profile.organization_id,
      email:           result.data.email.toLowerCase(),
      role:            result.data.role,
      invited_by:      user.id,
    } as unknown as never)
    .select("token, email")
    .single();

  if (inviteErr) {
    // Unique constraint: already invited
    if (inviteErr.code === "23505") {
      return { status: "error", message: "An invitation has already been sent to that email address" };
    }
    return { status: "error", message: `Could not create invitation: ${inviteErr.message}` };
  }

  const invite = inviteRaw as { token: string; email: string };

  // Fetch org name for the email
  const { data: orgRaw } = await supabase
    .from("organizations").select("name").eq("id", profile.organization_id).single();
  const orgName = (orgRaw as { name: string } | null)?.name ?? "ConMon";

  // Send invite email (best-effort — don't fail the action if email fails)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  await sendInviteEmail({
    to:          invite.email,
    inviterName: profile.full_name,
    orgName,
    role:        result.data.role,
    inviteUrl:   `${appUrl}/invite/${invite.token}`,
  });

  revalidatePath("/settings/team");
  return { status: "success", message: `Invitation sent to ${invite.email}` };
}

// ── Cancel a pending invitation ──────────────────────────────────────────────

export async function cancelInvite(inviteId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", inviteId);
  revalidatePath("/settings/team");
}

// ── Change a member's role ───────────────────────────────────────────────────

export async function changeMemberRole(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const userId = formData.get("user_id") as string;
  const role   = formData.get("role") as string;

  if (!userId || !role) return { status: "error", message: "Invalid input" };

  const supabase = await createClient();
  // `as unknown as` cast: new RPC functions not yet in generated types
  const { error } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>
  ) => Promise<{ error: { message: string } | null }>)(
    "update_member_role",
    { p_user_id: userId, p_role: role }
  );

  if (error) return { status: "error", message: error.message };

  revalidatePath("/settings/team");
  return { status: "success", message: "Role updated" };
}

// ── Remove a member ──────────────────────────────────────────────────────────

export async function removeMember(userId: string): Promise<void> {
  const supabase = await createClient();
  // `as unknown as` cast: new RPC functions not yet in generated types
  await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>
  ) => Promise<unknown>)("remove_member", { p_user_id: userId });
  revalidatePath("/settings/team");
}
