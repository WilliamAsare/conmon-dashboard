import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { differenceInDays } from "date-fns";
import { AlertCircle, Clock, ShieldAlert, ClipboardList, GitBranch } from "lucide-react";
import { SystemCard } from "@/components/system-card";
import type { Database } from "@/types/supabase";

export const metadata: Metadata = { title: "Dashboard" };

// Explicit types for the dashboard query result.
// `as unknown as` casts required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference.
type SystemRow  = Database["public"]["Tables"]["systems"]["Row"];
type ScanRow    = Database["public"]["Tables"]["scans"]["Row"];
type PoamRow    = Database["public"]["Tables"]["poam_items"]["Row"];

type DashboardSystem = Pick<
  SystemRow,
  "id" | "name" | "short_code" | "fedramp_level" | "ato_expiration" | "agency_sponsor" | "status"
> & {
  scans:      Pick<ScanRow, "scan_type" | "scan_date">[];
  poam_items: Pick<PoamRow, "id" | "severity" | "status" | "sla_status" | "scheduled_completion">[];
};

type DevRow = Pick<
  Database["public"]["Tables"]["deviation_requests"]["Row"],
  "id" | "status"
>;

type UserProfile = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "organization_id"
>;

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRaw } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserProfile | null;

  const [{ data, error }, { data: devsRaw }] = await Promise.all([
    supabase
      .from("systems")
      .select(`
        id, name, short_code, fedramp_level, ato_expiration, agency_sponsor, status,
        scans ( scan_type, scan_date ),
        poam_items ( id, severity, status, sla_status, scheduled_completion )
      `)
      .eq("status", "active")
      .order("name"),
    profile
      ? supabase
          .from("deviation_requests")
          .select("id, status")
          .eq("organization_id", profile.organization_id)
          .eq("status", "submitted")
      : Promise.resolve({ data: [] }),
  ]);

  const systems    = (data    as unknown as DashboardSystem[] | null) ?? [];
  const pendingDevs = (devsRaw as unknown as DevRow[]          | null) ?? [];

  if (error) throw new Error(`Failed to load systems: ${error.message}`);

  if (systems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <h2 className="text-xl font-semibold">No systems yet</h2>
        <p className="text-muted-foreground max-w-sm">
          Add your first FedRAMP-authorized system to start tracking its continuous monitoring posture.
        </p>
        <Link
          href="/systems/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Add system
        </Link>
      </div>
    );
  }

  // Aggregate stats across all systems
  const allPoams = systems.flatMap((s) => s.poam_items);
  const openPoams    = allPoams.filter((p) => p.status === "open" || p.status === "ongoing");
  const overdueCount = openPoams.filter((p) => p.sla_status === "overdue").length;
  const warningCount = openPoams.filter((p) => p.sla_status === "warning").length;
  const highCount    = openPoams.filter((p) => p.severity === "high").length;

  const today = new Date();
  const expiredAtos = systems.filter(
    (s) => s.ato_expiration && differenceInDays(new Date(s.ato_expiration), today) < 0
  ).length;
  const nearAtos = systems.filter(
    (s) => s.ato_expiration && differenceInDays(new Date(s.ato_expiration), today) <= 90 && differenceInDays(new Date(s.ato_expiration), today) >= 0
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Compliance posture across {systems.length} active system{systems.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Open POA&Ms"
          value={openPoams.length}
          href="/poams"
          icon={ClipboardList}
          variant="neutral"
        />
        <StatCard
          label="High severity"
          value={highCount}
          href="/poams?severity=high"
          icon={ShieldAlert}
          variant={highCount > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="SLA overdue"
          value={overdueCount}
          href="/poams?sla=overdue"
          icon={AlertCircle}
          variant={overdueCount > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="SLA warning"
          value={warningCount}
          href="/poams?sla=warning"
          icon={Clock}
          variant={warningCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label={expiredAtos > 0 ? "ATOs expired" : nearAtos > 0 ? "ATOs expiring" : "Deviations pending"}
          value={expiredAtos > 0 ? expiredAtos : nearAtos > 0 ? nearAtos : pendingDevs.length}
          href={expiredAtos > 0 || nearAtos > 0 ? "/systems" : "/deviations"}
          icon={GitBranch}
          variant={expiredAtos > 0 ? "danger" : nearAtos > 0 ? "warning" : pendingDevs.length > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* System cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {systems.map((system) => (
          <SystemCard key={system.id} system={system} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card helper
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  href,
  icon: Icon,
  variant,
}: {
  label:   string;
  value:   number;
  href:    string;
  icon:    typeof AlertCircle;
  variant: "neutral" | "warning" | "danger";
}) {
  const colorMap = {
    neutral: { num: "text-foreground",                              bg: "",                                                           icon: "text-muted-foreground" },
    warning: { num: "text-[hsl(var(--severity-moderate))]",        bg: "border-[hsl(var(--severity-moderate))]/30 bg-[hsl(var(--severity-moderate))]/5", icon: "text-[hsl(var(--severity-moderate))]" },
    danger:  { num: "text-destructive",                            bg: "border-destructive/30 bg-destructive/5",                     icon: "text-destructive" },
  };
  const c = colorMap[variant];

  return (
    <Link
      href={href}
      className={`rounded-lg border p-4 flex flex-col gap-2 hover:bg-accent/50 transition-colors ${
        variant === "neutral" ? "border-border" : c.bg
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium leading-snug">{label}</p>
        <Icon size={14} className={c.icon} aria-hidden="true" />
      </div>
      <p className={`text-2xl font-bold ${c.num}`}>{value}</p>
    </Link>
  );
}
