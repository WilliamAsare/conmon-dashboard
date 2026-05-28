/**
 * /admin — Platform overview dashboard.
 *
 * Shows platform-wide aggregate metrics:
 *   • Total organizations, users, systems
 *   • Open POA&Ms, SLA overdue, pending deviations
 *   • Recent organizations
 *   • Last cron run status for SLA + notify jobs
 */

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { format, formatDistanceToNowStrict } from "date-fns";
import type { Database } from "@/types/supabase";

type CronRunRow = Pick<
  Database["public"]["Tables"]["cron_runs"]["Row"],
  "id" | "cron_name" | "started_at" | "finished_at" | "status" | "result" | "error_message"
>;

type OrgRow = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  "id" | "name" | "status" | "created_at"
>;

function StatCard({
  label,
  value,
  variant = "neutral",
  href,
}: {
  label: string;
  value: number | string;
  variant?: "neutral" | "warning" | "danger" | "ok";
  href?: string;
}) {
  const color =
    variant === "danger"  ? "#CC0000" :
    variant === "warning" ? "#996600" :
    variant === "ok"      ? "#2E7D32" :
    "#A5B4C8";

  const card = (
    <div
      className="rounded-lg border p-5"
      style={{ borderColor: "rgba(165,180,200,.2)", background: "rgba(255,255,255,.04)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#A5B4C8" }}>
        {label}
      </p>
      <p className="text-3xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}

export default async function AdminOverviewPage() {
  const svc = createServiceClient();

  // ── Parallel aggregate queries ─────────────────────────────────────────────
  const [
    { count: orgCount },
    { count: userCount },
    { count: systemCount },
    { count: openPoamCount },
    { count: overdueCount },
    { count: pendingDevCount },
    { data: recentOrgsRaw },
    { data: lastSlaRunRaw },
    { data: lastNotifyRunRaw },
  ] = await Promise.all([
    svc.from("organizations").select("id", { count: "exact", head: true }),
    svc.from("users").select("id", { count: "exact", head: true }),
    svc.from("systems").select("id", { count: "exact", head: true }),
    svc
      .from("poam_items")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "ongoing"]),
    svc
      .from("poam_items")
      .select("id", { count: "exact", head: true })
      .eq("sla_status", "overdue")
      .in("status", ["open", "ongoing"]),
    svc
      .from("deviation_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),
    svc
      .from("organizations")
      .select("id, name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    svc
      .from("cron_runs")
      .select("id, cron_name, started_at, finished_at, status, result, error_message")
      .eq("cron_name", "sla")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    svc
      .from("cron_runs")
      .select("id, cron_name, started_at, finished_at, status, result, error_message")
      .eq("cron_name", "notify")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const recentOrgs  = (recentOrgsRaw  as unknown as OrgRow[]      | null) ?? [];
  const lastSla     = lastSlaRunRaw   as unknown as CronRunRow     | null;
  const lastNotify  = lastNotifyRunRaw as unknown as CronRunRow    | null;

  function CronCard({ run, label }: { run: CronRunRow | null; label: string }) {
    if (!run) {
      return (
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "rgba(165,180,200,.2)", background: "rgba(255,255,255,.04)" }}
        >
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#A5B4C8" }}>
            {label}
          </p>
          <p className="text-sm" style={{ color: "#6B7280" }}>No runs recorded yet</p>
        </div>
      );
    }

    const statusColor = run.status === "ok" ? "#2E7D32" : "#CC0000";
    const ago = formatDistanceToNowStrict(new Date(run.started_at), { addSuffix: true });

    return (
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: "rgba(165,180,200,.2)", background: "rgba(255,255,255,.04)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#A5B4C8" }}>
            {label}
          </p>
          <span
            className="text-xs font-bold uppercase"
            style={{ color: statusColor }}
          >
            {run.status}
          </span>
        </div>
        <p className="text-sm text-white">
          {format(new Date(run.started_at), "MMM d, yyyy 'at' HH:mm 'UTC'")}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{ago}</p>
        {run.status === "error" && run.error_message && (
          <p className="text-xs mt-1" style={{ color: "#CC0000" }}>{run.error_message}</p>
        )}
        {run.status === "ok" && run.result && (
          <p className="text-xs mt-1" style={{ color: "#A5B4C8" }}>
            {Object.entries(run.result as Record<string, unknown>)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <p className="text-sm mt-1" style={{ color: "#A5B4C8" }}>
          Aggregate metrics across all organizations.
        </p>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Organizations" value={orgCount ?? 0} href="/admin/organizations" />
        <StatCard label="Users"         value={userCount  ?? 0} href="/admin/users" />
        <StatCard label="Systems"       value={systemCount ?? 0} />
        <StatCard
          label="Open POA&Ms"
          value={openPoamCount ?? 0}
          variant={openPoamCount && openPoamCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="SLA Overdue"
          value={overdueCount ?? 0}
          variant={overdueCount && overdueCount > 0 ? "danger" : "ok"}
        />
        <StatCard
          label="Pending Deviations"
          value={pendingDevCount ?? 0}
          variant={pendingDevCount && pendingDevCount > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* Cron health */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">
          Cron Health{" "}
          <Link href="/admin/crons" className="text-xs font-normal ml-2" style={{ color: "#2B5EA7" }}>
            View history →
          </Link>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CronCard run={lastSla}    label="SLA Recalculation (00:30 UTC)" />
          <CronCard run={lastNotify} label="SLA Notifications (01:00 UTC)" />
        </div>
      </section>

      {/* Recent organizations */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">
          Recent Organizations{" "}
          <Link href="/admin/organizations" className="text-xs font-normal ml-2" style={{ color: "#2B5EA7" }}>
            View all →
          </Link>
        </h2>
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: "rgba(165,180,200,.2)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "rgba(30,58,95,.6)" }}>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest" style={{ color: "#A5B4C8" }}>
                  Organization
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest" style={{ color: "#A5B4C8" }}>
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest" style={{ color: "#A5B4C8" }}>
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {recentOrgs.map((org, i) => (
                <tr
                  key={org.id}
                  style={{ borderTop: "1px solid rgba(165,180,200,.15)", background: i % 2 === 1 ? "rgba(255,255,255,.02)" : undefined }}
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="text-white hover:underline font-medium"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-xs font-bold uppercase"
                      style={{ color: org.status === "active" ? "#2E7D32" : "#CC0000" }}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#A5B4C8" }}>
                    {format(new Date(org.created_at), "MMM d, yyyy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
