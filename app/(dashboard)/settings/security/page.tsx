import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MfaPanel } from "./mfa-panel";

export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("full_name, role").eq("id", user.id).single();
  const profile = profileRaw as { full_name: string; role: string } | null;

  // Fetch enrolled MFA factors for this session
  const { data: mfaData } = await supabase.auth.mfa.listFactors();
  // `as unknown as` needed because listFactors() return type doesn't match
  // the Factor shape we need — we only use id, factor_type, status, created_at.
  const factors = (mfaData?.all ?? []) as unknown as Array<{
    id: string;
    factor_type: string;
    status: "verified" | "unverified";
    created_at: string;
  }>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {profile?.full_name} · <span className="capitalize">{profile?.role}</span>
        </p>
      </div>

      {/* MFA section */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Two-Factor Authentication</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            FedRAMP IA-2(1) mandates MFA for privileged accounts (admin, ISSM, ISSO).
            All roles are encouraged to enable it.
          </p>
        </div>
        <MfaPanel initialFactors={factors} role={profile?.role ?? ""} />
      </section>

      {/* Session info */}
      <section className="rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Account</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Email</p>
            <p className="mt-0.5">{user.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Role</p>
            <p className="mt-0.5 capitalize">{profile?.role}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">User ID</p>
            <p className="mt-0.5 font-mono text-xs">{user.id}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Last sign-in</p>
            <p className="mt-0.5 text-xs">
              {user.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
