import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TabLinkClient } from "./tab-link-client";

const TABS = [
  { href: "/settings/org",      label: "Organization" },
  { href: "/settings/team",     label: "Team" },
  { href: "/settings/security", label: "Security" },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your organization, team members, and account security.
        </p>
      </div>

      {/* Tab bar */}
      <nav className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <TabLinkClient key={tab.href} href={tab.href} label={tab.label} />
        ))}
      </nav>

      {children}
    </div>
  );
}
