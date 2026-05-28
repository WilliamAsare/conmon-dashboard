/**
 * Platform Admin layout.
 *
 * Visually distinct from the org dashboard (dark navy).
 * Access gate: user must have a row in platform_admins.
 * Non-admins are silently redirected to /dashboard.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const NAV_ITEMS = [
  { href: "/admin",                   label: "Overview"      },
  { href: "/admin/organizations",     label: "Organizations" },
  { href: "/admin/users",             label: "Users"         },
  { href: "/admin/crons",             label: "Cron Health"   },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Verify session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 2. Verify platform-admin status via service role (bypasses RLS)
  const svc = createServiceClient();
  const { data: adminRow } = await svc
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .single();

  if (!adminRow) redirect("/dashboard");

  return (
    <div className="min-h-screen" style={{ background: "#0D1B2A" }}>
      {/* Top bar */}
      <header
        style={{ background: "#1E3A5F", borderBottom: "1px solid rgba(43,94,167,.4)" }}
        className="px-6 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-8">
          {/* Brand */}
          <span className="text-white font-bold text-sm tracking-widest uppercase select-none">
            ConMon &middot; Platform Admin
          </span>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded text-sm text-[#A5B4C8] hover:text-white hover:bg-white/10 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <Link
          href="/dashboard"
          className="text-xs text-[#A5B4C8] hover:text-white transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </header>

      {/* Page content */}
      <main className="p-6 text-white">{children}</main>
    </div>
  );
}
