"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  FileSearch,
  ShieldAlert,
  ClipboardList,
  FileOutput,
  ScrollText,
  Bell,
  LogOut,
  GitMerge,
  BookOpen,
  BarChart2,
  Package,
  Siren,
  ClipboardCheck,
  Settings,
} from "lucide-react";
import { signOut } from "@/app/(dashboard)/actions";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  organization_id: string;
  organizations: { name: string } | null;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard },
      { href: "/metrics",   label: "Metrics",    icon: BarChart2 },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { href: "/systems",   label: "Systems",    icon: Server },
      { href: "/scans",     label: "Scans",      icon: FileSearch },
      { href: "/findings",  label: "Findings",   icon: ShieldAlert },
      { href: "/inventory", label: "Inventory",  icon: Package },
    ],
  },
  {
    title: "Compliance",
    items: [
      { href: "/poams",      label: "POA&Ms",    icon: ClipboardList },
      { href: "/deviations", label: "Deviations", icon: FileOutput },
      { href: "/scrs",       label: "SCRs",       icon: GitMerge },
      { href: "/assessments",label: "Assessments",icon: ClipboardCheck },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/incidents",  label: "Incidents",  icon: Siren },
      { href: "/reports",    label: "Reports",    icon: ScrollText },
      { href: "/audit-log",  label: "Audit Log",  icon: BookOpen },
    ],
  },
];

export function AppNav({ profile }: { profile: Profile }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav
      className="w-56 shrink-0 border-r border-border bg-card flex flex-col"
      aria-label="Main navigation"
    >
      {/* Org name */}
      <div className="px-4 py-5 border-b border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium truncate">
          {profile.organizations?.name ?? "ConMon"}
        </p>
      </div>

      {/* Sectioned nav */}
      <div className="flex-1 py-3 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="px-5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {section.title}
            </p>
            <ul className="space-y-0.5 px-2" role="list">
              {section.items.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive(href)
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    ].join(" ")}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* User area */}
      <div className="border-t border-border p-3 space-y-1">
        <Link
          href="/notifications"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Bell size={15} aria-hidden="true" />
          Notifications
        </Link>
        <Link
          href="/settings/security"
          className={[
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            isActive("/settings")
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          ].join(" ")}
        >
          <Settings size={15} aria-hidden="true" />
          Settings
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
            <LogOut size={15} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
