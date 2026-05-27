import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";

/**
 * Dashboard shell layout.
 *
 * All routes inside (dashboard) share this layout. It:
 *   1. Verifies the session is active (belt-and-suspenders: middleware handles
 *      the redirect but we check here too to avoid any edge cases).
 *   2. Loads the user's profile and org for use in the nav.
 *   3. Renders the persistent sidebar and top bar.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, role, organization_id, organizations(name)")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Profile missing — something went wrong during sign-up. Log out and retry.
    redirect("/login?error=Profile+not+found.+Please+sign+in+again.");
  }

  return (
    <div className="flex min-h-screen">
      <AppNav profile={profile} />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
