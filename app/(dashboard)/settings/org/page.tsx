import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { OrgNameForm } from "./org-form";

export default async function OrgSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("role, organization_id").eq("id", user.id).single();
  const profile = profileRaw as { role: string; organization_id: string } | null;

  const { data: orgRaw } = await supabase
    .from("organizations").select("id, name, created_at").eq("id", profile?.organization_id ?? "").single();
  const org = orgRaw as { id: string; name: string; created_at: string } | null;

  // Member count
  const { count } = await supabase
    .from("users").select("id", { count: "exact", head: true })
    .eq("organization_id", profile?.organization_id ?? "");

  const isAdmin = profile?.role === "admin";

  return (
    <div className="space-y-6">
      {/* Org details */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <h2 className="text-sm font-semibold">Organization Details</h2>

        {isAdmin ? (
          <OrgNameForm currentName={org?.name ?? ""} />
        ) : (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Name</p>
            <p className="mt-0.5 text-sm">{org?.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Only admins can rename the organization.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-3 border-t border-border text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Organization ID</p>
            <p className="mt-0.5 font-mono text-xs truncate">{org?.id}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Created</p>
            <p className="mt-0.5 text-sm">
              {org?.created_at ? format(new Date(org.created_at), "MMM d, yyyy") : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Members</p>
            <p className="mt-0.5 text-sm">{count ?? 0}</p>
          </div>
        </div>
      </section>

      {/* Danger zone — admin only */}
      {isAdmin && (
        <section className="rounded-lg border border-destructive/30 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
          <p className="text-xs text-muted-foreground">
            Deleting the organization is permanent and will remove all systems, findings,
            POA&Ms, and evidence files. This action cannot be undone.
            Contact <a href="mailto:support@conmon.app" className="underline">support</a> to
            request organization deletion.
          </p>
        </section>
      )}
    </div>
  );
}
