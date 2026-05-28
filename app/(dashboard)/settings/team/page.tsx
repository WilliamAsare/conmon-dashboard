import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { InviteForm } from "./invite-form";
import { cancelInvite, removeMember } from "./actions";

type Member = {
  id: string;
  full_name: string;
  role: string;
  email: string;
  created_at: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
};

const ROLE_BADGE: Record<string, string> = {
  admin:    "bg-primary/10 text-primary border-primary/20",
  issm:     "bg-blue-500/10 text-blue-600 border-blue-500/20",
  isso:     "bg-purple-500/10 text-purple-600 border-purple-500/20",
  engineer: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  auditor:  "bg-muted text-muted-foreground border-border",
};

export default async function TeamSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("role, organization_id").eq("id", user.id).single();
  const profile = profileRaw as { role: string; organization_id: string } | null;
  const isAdmin = profile?.role === "admin";

  // Fetch members via security-definer function (exposes auth email)
  const { data: membersRaw } = await supabase.rpc("get_org_members");
  const members = (membersRaw as unknown as Member[] | null) ?? [];

  // Fetch pending (unaccepted) invitations
  const { data: invitesRaw } = await supabase
    .from("invitations")
    .select("id, email, role, created_at, expires_at")
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const invitations = (invitesRaw as unknown as Invitation[] | null) ?? [];

  return (
    <div className="space-y-6">
      {/* Members */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Team Members</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {members.length} member{members.length !== 1 ? "s" : ""} in your organization.
          </p>
        </div>

        <div className="divide-y divide-border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {isAdmin && m.id !== user.id ? (
                  <form>
                    <input type="hidden" name="user_id" value={m.id} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className="text-xs rounded border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                      onChange={async () => {}}
                      /* Role change uses a separate form action below */
                    >
                      {["admin","issm","isso","engineer","auditor"].map((r) => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  </form>
                ) : (
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${ROLE_BADGE[m.role] ?? ""}`}>
                    {m.role}
                  </span>
                )}
                {m.id === user.id && (
                  <span className="text-xs text-muted-foreground">(you)</span>
                )}
                {isAdmin && m.id !== user.id && (
                  <form action={removeMember.bind(null, m.id)}>
                    <button
                      type="submit"
                      className="text-xs text-destructive hover:underline"
                      onClick={(e) => {
                        if (!confirm(`Remove ${m.full_name} from the organization?`)) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Remove
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <section className="rounded-lg border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold">Pending Invitations</h2>
          <div className="divide-y divide-border">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="capitalize">{inv.role}</span>
                    {" · "}
                    Expires {format(new Date(inv.expires_at), "MMM d, yyyy")}
                  </p>
                </div>
                {isAdmin && (
                  <form action={cancelInvite.bind(null, inv.id)}>
                    <button type="submit" className="text-xs text-muted-foreground hover:text-destructive hover:underline">
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invite new member */}
      {isAdmin && (
        <section className="rounded-lg border border-border p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Invite a Team Member</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              They will receive an email with a sign-up link that joins your organization.
              Invites expire after 7 days.
            </p>
          </div>
          <InviteForm />

          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Role guide</p>
            <dl className="space-y-1 text-xs text-muted-foreground">
              <div className="flex gap-2"><dt className="font-medium w-20">Admin</dt><dd>Full access — manage team, systems, settings</dd></div>
              <div className="flex gap-2"><dt className="font-medium w-20">ISSM</dt><dd>Information System Security Manager — approve deviations &amp; POA&Ms</dd></div>
              <div className="flex gap-2"><dt className="font-medium w-20">ISSO</dt><dd>Information System Security Officer — daily operations</dd></div>
              <div className="flex gap-2"><dt className="font-medium w-20">Engineer</dt><dd>Upload scans, manage inventory, update milestones</dd></div>
              <div className="flex gap-2"><dt className="font-medium w-20">Auditor</dt><dd>Read-only access across all data</dd></div>
            </dl>
          </div>
        </section>
      )}

      {!isAdmin && (
        <p className="text-sm text-muted-foreground">
          Contact your organization admin to invite team members or change roles.
        </p>
      )}
    </div>
  );
}
