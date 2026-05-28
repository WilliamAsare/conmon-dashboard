import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import type { Database } from "@/types/supabase";

type AuditRow = Pick<
  Database["public"]["Tables"]["audit_log"]["Row"],
  "id" | "action" | "entity_type" | "entity_id" | "user_id" | "diff" | "created_at"
> & { users: { full_name: string } | null };

const ACTION_COLOR: Record<string, string> = {
  INSERT: "text-green-600 bg-green-50 border-green-200",
  UPDATE: "text-yellow-700 bg-yellow-50 border-yellow-200",
  DELETE: "text-red-600 bg-red-50 border-red-200",
};

const ENTITY_LABELS: Record<string, string> = {
  poam_items:         "POA&M",
  findings:           "Finding",
  scans:              "Scan",
  deviation_requests: "Deviation",
  scrs:               "SCR",
  conmon_reports:     "Report",
  inventory_items:    "Inventory",
  incidents:          "Incident",
  assessments:        "Assessment",
};

const ENTITY_HREFS: Record<string, (id: string) => string> = {
  poam_items:         (id) => `/poams/${id}`,
  findings:           (id) => `/findings/${id}`,
  deviation_requests: (id) => `/deviations/${id}`,
  scrs:               (id) => `/scrs/${id}`,
  incidents:          (id) => `/incidents/${id}`,
  assessments:        (id) => `/assessments/${id}`,
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity_type?: string; page?: string }>;
}) {
  const { entity_type, page: pageParam } = await searchParams;
  const page    = Math.max(1, parseInt(pageParam ?? "1", 10));
  const perPage = 50;
  const offset  = (page - 1) * perPage;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let query = supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, user_id, diff, created_at, users(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (entity_type) query = query.eq("entity_type", entity_type);

  const { data: rowsRaw, count } = await query;
  const rows = (rowsRaw as unknown as AuditRow[] | null) ?? [];
  const total = count ?? 0;

  const entityTypes = [
    "poam_items", "findings", "scans", "deviation_requests",
    "scrs", "conmon_reports", "inventory_items", "incidents", "assessments",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Append-only record of all changes to compliance data. {total.toLocaleString()} total entries.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <a
          href="/audit-log"
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            !entity_type
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          All
        </a>
        {entityTypes.map((et) => (
          <a
            key={et}
            href={`/audit-log?entity_type=${et}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              entity_type === et
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {ENTITY_LABELS[et] ?? et}
          </a>
        ))}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["When", "Action", "Entity", "User", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const href = ENTITY_HREFS[row.entity_type]?.(row.entity_id);
              return (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(row.created_at), "MMM d, HH:mm")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${ACTION_COLOR[row.action] ?? "text-muted-foreground"}`}>
                      {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-medium">{ENTITY_LABELS[row.entity_type] ?? row.entity_type}</span>
                    <span className="text-xs text-muted-foreground ml-1.5 font-mono">
                      {row.entity_id.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {row.users?.full_name ?? "System"}
                  </td>
                  <td className="px-4 py-2.5">
                    {href && (
                      <a href={href} className="text-xs text-primary hover:underline">View →</a>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No audit entries yet. Actions on compliance data will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > perPage && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Showing {offset + 1}–{Math.min(offset + perPage, total)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/audit-log?${entity_type ? `entity_type=${entity_type}&` : ""}page=${page - 1}`}
                className="px-3 py-1.5 rounded border border-border hover:bg-accent text-xs"
              >
                ← Previous
              </a>
            )}
            {offset + perPage < total && (
              <a
                href={`/audit-log?${entity_type ? `entity_type=${entity_type}&` : ""}page=${page + 1}`}
                className="px-3 py-1.5 rounded border border-border hover:bg-accent text-xs"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
