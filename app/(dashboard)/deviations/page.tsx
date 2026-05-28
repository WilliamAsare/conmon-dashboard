import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { FileOutput } from "lucide-react";
import type { Database } from "@/types/supabase";

export const metadata: Metadata = { title: "Deviation Requests" };

// Local row types.
// `as unknown as` casts required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference.
type DeviationRow = Pick<
  Database["public"]["Tables"]["deviation_requests"]["Row"],
  "id" | "deviation_type" | "status" | "requested_date"
> & {
  poam_items: (Pick<
    Database["public"]["Tables"]["poam_items"]["Row"],
    "id" | "poam_number" | "severity"
  > & {
    systems: Pick<
      Database["public"]["Tables"]["systems"]["Row"],
      "id" | "name"
    > | null;
  }) | null;
  requester: { id: string; full_name: string } | null;
};

type UserProfile = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "organization_id" | "role"
>;

const DEVIATION_LABEL: Record<string, string> = {
  RA: "Risk Adjustment",
  FP: "False Positive",
  OR: "Operational Requirement",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  draft:     { label: "Draft",          className: "text-muted-foreground",                 dot: "bg-muted-foreground" },
  submitted: { label: "Pending review", className: "text-[hsl(var(--severity-moderate))]", dot: "bg-[hsl(var(--severity-moderate))]" },
  approved:  { label: "Approved",       className: "text-green-600",                        dot: "bg-green-600" },
  rejected:  { label: "Rejected",       className: "text-destructive",                      dot: "bg-destructive" },
};

const SEVERITY_BADGE: Record<string, string> = {
  high:          "bg-[hsl(var(--severity-high))]/15 text-[hsl(var(--severity-high))] border-[hsl(var(--severity-high))]/30",
  moderate:      "bg-[hsl(var(--severity-moderate))]/15 text-[hsl(var(--severity-moderate))] border-[hsl(var(--severity-moderate))]/30",
  low:           "bg-[hsl(var(--severity-low))]/15 text-[hsl(var(--severity-low))] border-[hsl(var(--severity-low))]/30",
  informational: "bg-muted text-muted-foreground border-border",
};

export default async function DeviationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params   = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRaw } = await supabase
    .from("users")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserProfile | null;
  if (!profile) return null;

  const statusFilter = params["status"] ?? "submitted";
  const typeFilter   = params["type"]   ?? null;

  let query = supabase
    .from("deviation_requests")
    .select(`
      id, deviation_type, status, requested_date,
      poam_items (
        id, poam_number, severity,
        systems ( id, name )
      ),
      requester:users!requested_by ( id, full_name )
    `)
    .eq("organization_id", profile.organization_id)
    .order("requested_date", { ascending: false })
    .limit(200);

  if (statusFilter !== "all") {
    query = query.eq(
      "status",
      statusFilter as Database["public"]["Tables"]["deviation_requests"]["Row"]["status"]
    );
  }

  if (typeFilter) {
    query = query.eq(
      "deviation_type",
      typeFilter as Database["public"]["Tables"]["deviation_requests"]["Row"]["deviation_type"]
    );
  }

  const { data: devsRaw } = await query;
  const deviations = (devsRaw as unknown as DeviationRow[] | null) ?? [];

  const canReview = ["admin", "issm"].includes(profile.role);

  const buildUrl = (overrides: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | null> = {
      status: statusFilter,
      type:   typeFilter,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return `/deviations${s ? `?${s}` : ""}`;
  };

  const filterClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "border-border hover:bg-accent"
    }`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Deviation Requests</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {canReview
            ? "Review and approve or reject deviation requests from your team."
            : "Track the status of your submitted deviation requests."}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Status:</span>
          {[
            { value: "submitted", label: "Pending" },
            { value: "approved",  label: "Approved" },
            { value: "rejected",  label: "Rejected" },
            { value: "all",       label: "All" },
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

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">Type:</span>
          {([null, "RA", "FP", "OR"] as (string | null)[]).map((type) => (
            <Link
              key={type ?? "all"}
              href={buildUrl({ type })}
              className={filterClass(typeFilter === type)}
            >
              {type ?? "All"}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      {deviations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <FileOutput size={32} className="mx-auto text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm font-medium">No deviation requests</p>
          <p className="text-xs text-muted-foreground mt-1">
            Submit a deviation request from a POA&amp;M detail page.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">POA&amp;M #</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">System</th>
                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                <th className="text-left px-4 py-2.5 font-medium w-24">Severity</th>
                <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Requested by</th>
                <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {deviations.map((dev) => {
                const cfg = STATUS_CONFIG[dev.status];
                return (
                  <tr key={dev.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      {dev.poam_items ? (
                        <Link
                          href={`/poams/${dev.poam_items.id}`}
                          className="font-mono text-xs font-medium text-primary hover:underline"
                        >
                          {dev.poam_items.poam_number}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-xs text-muted-foreground">
                      {dev.poam_items?.systems ? (
                        <Link href={`/systems/${dev.poam_items.systems.id}`} className="hover:underline">
                          {dev.poam_items.systems.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="font-mono font-medium">{dev.deviation_type}</span>
                      <span className="text-muted-foreground ml-1 hidden sm:inline">
                        — {DEVIATION_LABEL[dev.deviation_type]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {dev.poam_items && (
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_BADGE[dev.poam_items.severity] ?? ""}`}>
                          {dev.poam_items.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                      {dev.requester?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                      {format(new Date(dev.requested_date), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-2.5">
                      {cfg && (
                        <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.className}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} aria-hidden="true" />
                          {cfg.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/deviations/${dev.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        {canReview && dev.status === "submitted" ? "Review" : "View"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
