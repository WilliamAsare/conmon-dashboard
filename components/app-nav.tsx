"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  FileSearch,
  ClipboardList,
  FileOutput,
  Bell,
  LogOut,
  ScrollText,
} from "lucide-react";
import { signOut } from "@/app/(dashboard)/actions";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  organization_id: string;
  organizations: { name: string } | null;
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/systems", label: "Systems", icon: Server },
  { href: "/scans", label: "Scans", icon: FileSearch },
  { href: "/poams", label: "POA&Ms", icon: ClipboardList },
  { href: "/deviations", label: "Deviations", icon: FileOutput },
  { href: "/reports", label: "Reports", icon: ScrollText },
] as const;

export function AppNav({ profile }: { profile: Profile }) {
  const pathname = usePathname();

  return (
    <nav
      className="w-56 shrink-0 border-r border-border bg-card flex flex-col"
      aria-label="Main navigation"
    >
      {/* Org name */}
      <div className="px-4 py-5 border-b border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {profile.organizations?.name ?? "ConMon"}
        </p>
      </div>

      {/* Nav links */}
      <ul className="flex-1 py-3 space-y-0.5 px-2" role="list">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                ].join(" ")}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* User area */}
      <div className="border-t border-border p-3 space-y-1">
        <Link
          href="/notifications"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Bell size={16} aria-hidden="true" />
          Notifications
        </Link>

        <div className="px-3 py-2 space-y-0.5">
          <p className="text-sm font-medium truncate">{profile.full_name}</p>
          <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
