import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";
import type { Database } from "@/types/supabase";

export const metadata: Metadata = { title: "Findings" };

// Local row types.
// `as unknown as` casts required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference.
type FindingRow = Pick<
  Database["public"]["Tables"]["findings"]["Row"],
  "id" | "plugin_id" | "title" | "severity" | "cvss_score" | "affected_asset" | "first_detected" | "last_detected" | "status"
> & {
  systems: Pick<Database["public"]["Tables"]["systems"]["Row"], "id" | "name"> | null;
};

type SystemRow = Pick<Database["public"]["Tables"]["systems"]["Row"], "id" | "name">;
type UserProfile = Pick<Database["public"]["Tables"]["users"]["Row"], "organization_id">;

const SEVERITY_BADGE: Record<string, string> = {
  high:          "bg-[hsl(var(--severity-high))]/15 text-[hsl(var(--severity-high))] border-[hsl(var(--severity-high))]/30",
  moderate:      "bg-[hsl(var(--severity-moderate))]/15 text-[hsl(var(--severity-moderate))] border-[hsl(var(--severity-moderate))]/30",
  low:           "bg-[hsl(var(--severity-low))]/15 text-[hsl(var(--severity-low))] border-[hsl(var(--severity-low))]/30",
  informational: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<string, string> = {
  open:               "Open",
  remediated:         "Remediated",
  deviation_pending:  "Dev. Pending",
  deviation_approved: "Dev. Approved",
  risk_accepted:      "Risk Accepted",
};

export default async function FindingsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | undefined>> }
) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRaw } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserProfile | null;
  if (!profile) return null;

  // Filter params
  const severityFilter = params["severity"] ?? null;
  const statusFilter   = params["status"]   ?? "open";
  const systemFilter   = params["system"]   ?? null;
  const searchQuery    = params["q"]        ?? null;

  // Build query — fetch with joined system name
  let query = supabase
    .from("findings")
    .select(`
      id, plugin_id, title, severity, cvss_score, affected_asset,
      first_detected, last_detected, status,
      systems ( id, name )
    `)
    .order("first_detected", { ascending: false })
    .limit(200);

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "open") {
      query = query.in("status", ["open", "deviation_pending", "deviation_approved", "risk_accepted"]);
    } else {
      query = query.eq("status", statusFilter as Database["public"]["Tables"]["findings"]["Row"]["status"]);
    }
  }

  if (severityFilter) {
    query = query.eq("severity", severityFilter as Database["public"]["Tables"]["findings"]["Row"]["severity"]);
  }

  if (systemFilter) {
    query = query.eq("system_id", systemFilter);
  }

  if (searchQuery) {
    // websearch_to_tsquery handles phrases, negation, OR — safe against injection
    query = query.textSearch("fts", searchQuery, { type: "websearch", config: "english" });
  }

  const { data: findingsRaw } = await query;
  const findings = (findingsRaw as unknown as FindingRow[] | null) ?? [];

  // Sort: high → moderate → low → informational
  const SEVERITY_ORDER: Record<string, number> = { high: 0, moderate: 1, low: 2, informational: 3 };
  const rows = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  // Systems for filter dropdown
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
      status: statusFilter,
      system: systemFilter,
      q: searchQuery,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return `/findings${s ? `?${s}` : ""}`;
  };

  const filterLinkClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "border-border hover:bg-accent"
    }`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Findings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Vulnerability findings across all systems.
        </p>
      </div>

      {/* Search */}
      <form method="GET" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={searchQuery ?? ""}
          placeholder="Search findings by title, asset, plugin ID…"
          className="flex-1 max-w-sm rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {/* Preserve other filters across search */}
        {severityFilter && <input type="hidden" name="severity" value={severityFilter} />}
        {statusFilter && statusFilter !== "open" && <input type="hidden" name="status" value={statusFilter} />}
        {systemFilter && <input type="hidden" name="system" value={systemFilter} />}
        <button type="submit" className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm">
          Search
        </button>
        {searchQuery && (
          <a href={buildUrl({ q: null })} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent">
            Clear
          </a>
        )}
      </form>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Severity filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Severity:</span>
          {[null, "high", "moderate", "low", "informational"].map(sev => (
            <Link
              key={sev ?? "all"}
              href={buildUrl({ severity: sev, system: systemFilter, status: statusFilter })}
              className={filterLinkClass(severityFilter === sev)}
            >
              {sev ?? "All"}
            </Link>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">Status:</span>
          {[
            { value: "open", label: "Open" },
            { value: "remediated", label: "Remediated" },
            { value: "all", label: "All" },
          ].map(({ value, label }) => (
            <Link
              key={value}
              href={buildUrl({ status: value === "all" ? null : value, severity: severityFilter, system: systemFilter })}
              className={filterLinkClass(statusFilter === value || (value === "open" && !statusFilter))}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* System filter */}
        {systems.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">System:</span>
            <Link
              href={buildUrl({ system: null, severity: severityFilter, status: statusFilter })}
              className={filterLinkClass(systemFilter === null)}
            >
              All
            </Link>
            {systems.map(s => (
              <Link
                key={s.id}
                href={buildUrl({ system: s.id, severity: severityFilter, status: statusFilter })}
                className={filterLinkClass(systemFilter === s.id)}
              >
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <ShieldAlert size={32} className="mx-auto text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm font-medium">No findings match this filter</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a scan to populate findings, or adjust the filters above.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium w-20">Sev.</th>
                <th className="text-left px-4 py-2.5 font-medium">Title</th>
                <th className="text-left px-4 py-2.5 font-medium">Asset</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">System</th>
                <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell">CVSS</th>
                <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">First detected</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(finding => (
                <tr key={finding.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_BADGE[finding.severity] ?? ""}`}>
                      {finding.severity === "informational" ? "Info" : finding.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 max-w-xs">
                    <p className="font-medium line-clamp-1">{finding.title}</p>
                    <p className="text-xs text-muted-foreground">{finding.plugin_id}</p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[180px] truncate">
                    {finding.affected_asset}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                    {finding.systems ? (
                      <Link href={`/systems/${finding.systems.id}`} className="hover:underline">
                        {finding.systems.name}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground hidden sm:table-cell">
                    {finding.cvss_score !== null ? finding.cvss_score.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">
                    {format(new Date(finding.first_detected), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs ${finding.status === "open" ? "text-foreground" : "text-muted-foreground"}`}>
                      {STATUS_LABEL[finding.status] ?? finding.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 200 && (
            <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
              Showing first 200 findings. Use filters to narrow results.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
