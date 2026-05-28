import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { format } from "date-fns";
import { ClipboardList, AlertCircle, Clock, CheckCircle } from "lucide-react";
import type { Database } from "@/types/supabase";

export const metadata: Metadata = { title: "POA&Ms" };

// Local row types.
// `as unknown as` casts required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference.
type PoamRow = Pick<
  Database["public"]["Tables"]["poam_items"]["Row"],
  | "id"
  | "poam_number"
  | "weakness_description"
  | "severity"
  | "status"
  | "sla_status"
  | "days_to_sla"
  | "identified_date"
  | "scheduled_completion"
> & {
  systems: Pick<
    Database["public"]["Tables"]["systems"]["Row"],
    "id" | "name"
  > | null;
};

type SystemRow = Pick<
  Database["public"]["Tables"]["systems"]["Row"],
  "id" | "name"
>;
type UserProfile = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "organization_id"
>;

const SEVERITY_BADGE: Record<string, string> = {
  high:          "bg-[hsl(var(--severity-high))]/15 text-[hsl(var(--severity-high))] border-[hsl(var(--severity-high))]/30",
  moderate:      "bg-[hsl(var(--severity-moderate))]/15 text-[hsl(var(--severity-moderate))] border-[hsl(var(--severity-moderate))]/30",
  low:           "bg-[hsl(var(--severity-low))]/15 text-[hsl(var(--severity-low))] border-[hsl(var(--severity-low))]/30",
  informational: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<string, string> = {
  open:          "Open",
  ongoing:       "Ongoing",
  completed:     "Completed",
  risk_accepted: "Risk Accepted",
};

function SlaCell({
  slaStatus,
  daysToSla,
}: {
  slaStatus: string;
  daysToSla: number | null;
}) {
  if (slaStatus === "not_applicable")
    return <span className="text-xs text-muted-foreground">N/A</span>;
  if (slaStatus === "overdue")
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle size={12} aria-hidden="true" />
        {daysToSla !== null ? `${Math.abs(daysToSla)}d over` : "Overdue"}
      </span>
    );
  if (slaStatus === "warning")
    return (
      <span className="flex items-center gap-1 text-xs text-[hsl(var(--severity-moderate))]">
        <Clock size={12} aria-hidden="true" />
        {daysToSla !== null ? `${daysToSla}d left` : "Warning"}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-green-600">
      <CheckCircle size={12} aria-hidden="true" />
      {daysToSla !== null ? `${daysToSla}d` : "On track"}
    </span>
  );
}

export default async function PoamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
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
  if (!profile) return null;

  const severityFilter = params["severity"] ?? null;
  const statusFilter   = params["status"]   ?? "open";
  const systemFilter   = params["system"]   ?? null;
  const slaFilter      = params["sla"]      ?? null;
  const searchQuery    = params["q"]        ?? null;

  let query = supabase
    .from("poam_items")
    .select(
      `id, poam_number, weakness_description, severity, status,
       sla_status, days_to_sla, identified_date, scheduled_completion,
       systems ( id, name )`
    )
    .order("scheduled_completion", { ascending: true })
    .limit(200);

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "open") {
      query = query.in("status", ["open", "ongoing"]);
    } else {
      query = query.eq(
        "status",
        statusFilter as Database["public"]["Tables"]["poam_items"]["Row"]["status"]
      );
    }
  }

  if (severityFilter) {
    query = query.eq(
      "severity",
      severityFilter as Database["public"]["Tables"]["poam_items"]["Row"]["severity"]
    );
  }

  if (systemFilter) query = query.eq("system_id", systemFilter);

  if (slaFilter) {
    query = query.eq(
      "sla_status",
      slaFilter as Database["public"]["Tables"]["poam_items"]["Row"]["sla_status"]
    );
  }

  if (searchQuery) {
    query = query.textSearch("fts", searchQuery, { type: "websearch", config: "english" });
  }

  const { data: poamsRaw } = await query;
  const poams = (poamsRaw as unknown as PoamRow[] | null) ?? [];

  // Sort: overdue → warning → ok → n/a, then by severity
  const SEVERITY_ORDER: Record<string, number> = { high: 0, moderate: 1, low: 2, informational: 3 };
  const SLA_ORDER: Record<string, number>      = { overdue: 0, warning: 1, ok: 2, not_applicable: 3 };
  const rows = [...poams].sort((a, b) => {
    const slaA = SLA_ORDER[a.sla_status] ?? 9;
    const slaB = SLA_ORDER[b.sla_status] ?? 9;
    if (slaA !== slaB) return slaA - slaB;
    return (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
  });

  const { data: systemsRaw } = await supabase
    .from("systems")
    .select("id, name")
    .eq("organization_id", profile.organization_id)
    .order("name");

  const systems = (systemsRaw as unknown as SystemRow[] | null) ?? [];

  const buildUrl = (overrides: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | null> = {
      severity: severityFilter,
      status:   statusFilter,
      system:   systemFilter,
      sla:      slaFilter,
      q:        searchQuery,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return `/poams${s ? `?${s}` : ""}`;
  };

  const filterClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "border-border hover:bg-accent"
    }`;

  const exportHref = systemFilter
    ? `/api/poams/export?system_id=${systemFilter}`
    : "/api/poams/export";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">POA&amp;Ms</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan of Action &amp; Milestones across all systems.
          </p>
        </div>
        <a
          href={exportHref}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          Export XLSX
        </a>
      </div>

      {/* Live refresh when any poam_items row changes */}
      <RealtimeRefresh table="poam_items" />

      {/* Search */}
      <form method="GET" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={searchQuery ?? ""}
          placeholder="Search by weakness, POA&M number, contact…"
          className="flex-1 max-w-sm rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {severityFilter && <input type="hidden" name="severity" value={severityFilter} />}
        {statusFilter && statusFilter !== "open" && <input type="hidden" name="status" value={statusFilter} />}
        {systemFilter && <input type="hidden" name="system" value={systemFilter} />}
        {slaFilter && <input type="hidden" name="sla" value={slaFilter} />}
        <button type="submit" className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm">Search</button>
        {searchQuery && (
          <a href={buildUrl({ q: null })} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent">Clear</a>
        )}
      </form>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Status */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Status:</span>
          {[
            { value: "open",          label: "Open" },
            { value: "completed",     label: "Completed" },
            { value: "risk_accepted", label: "Risk Accepted" },
            { value: "all",           label: "All" },
          ].map(({ value, label }) => (
            <Link
              key={value}
              href={buildUrl({ status: value === "all" ? null : value })}
              className={filterClass(statusFilter === value)}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Severity */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Severity:</span>
          {([null, "high", "moderate", "low"] as (string | null)[]).map((sev) => (
            <Link
              key={sev ?? "all"}
              href={buildUrl({ severity: sev })}
              className={filterClass(severityFilter === sev)}
            >
              {sev ? sev.charAt(0).toUpperCase() + sev.slice(1) : "All"}
            </Link>
          ))}
        </div>

        {/* SLA */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">SLA:</span>
          {([null, "overdue", "warning"] as (string | null)[]).map((sla) => (
            <Link
              key={sla ?? "all"}
              href={buildUrl({ sla })}
              className={filterClass(slaFilter === sla)}
            >
              {sla ? sla.charAt(0).toUpperCase() + sla.slice(1) : "All"}
            </Link>
          ))}
        </div>

        {/* System */}
        {systems.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">System:</span>
            <Link href={buildUrl({ system: null })} className={filterClass(systemFilter === null)}>
              All
            </Link>
            {systems.map((s) => (
              <Link key={s.id} href={buildUrl({ system: s.id })} className={filterClass(systemFilter === s.id)}>
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <ClipboardList size={32} className="mx-auto text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm font-medium">No POA&amp;Ms match this filter</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a scan to auto-generate POA&amp;M items, or adjust the filters above.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">POA&amp;M #</th>
                <th className="text-left px-4 py-2.5 font-medium">Weakness</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">System</th>
                <th className="text-left px-4 py-2.5 font-medium w-24">Sev.</th>
                <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Identified</th>
                <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell whitespace-nowrap">Sched. Completion</th>
                <th className="text-left px-4 py-2.5 font-medium">SLA</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((poam) => (
                <tr key={poam.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/poams/${poam.id}`}
                      className="font-mono text-xs font-medium text-primary hover:underline"
                    >
                      {poam.poam_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 max-w-[280px]">
                    <Link href={`/poams/${poam.id}`} className="hover:underline line-clamp-2 text-xs leading-snug">
                      {poam.weakness_description}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground text-xs">
                    {poam.systems ? (
                      <Link href={`/systems/${poam.systems.id}`} className="hover:underline">
                        {poam.systems.name}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_BADGE[poam.severity] ?? ""}`}>
                      {poam.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs hidden lg:table-cell">
                    {format(new Date(poam.identified_date), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">
                    {format(new Date(poam.scheduled_completion), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-2.5">
                    <SlaCell slaStatus={poam.sla_status} daysToSla={poam.days_to_sla} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs ${
                      poam.status === "open" || poam.status === "ongoing"
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}>
                      {STATUS_LABEL[poam.status] ?? poam.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 200 && (
            <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
              Showing first 200 POA&amp;Ms. Use filters to narrow results.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
