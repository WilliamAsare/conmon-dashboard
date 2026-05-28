/**
 * /admin/crons — Cron run history.
 *
 * Shows the last 30 runs per cron job (SLA + notify) in a timeline.
 * Entries are written by the cron routes via service role.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { format, formatDistanceToNowStrict } from "date-fns";
import type { Database } from "@/types/supabase";

type CronRunRow = Pick<
  Database["public"]["Tables"]["cron_runs"]["Row"],
  "id" | "cron_name" | "started_at" | "finished_at" | "status" | "result" | "error_message"
>;

function RunRow({ run, i }: { run: CronRunRow; i: number }) {
  const ok     = run.status === "ok";
  const color  = ok ? "#2E7D32" : "#CC0000";
  const bg     = i % 2 === 1 ? "rgba(255,255,255,.02)" : undefined;

  const durationMs =
    run.finished_at
      ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
      : null;

  return (
    <tr style={{ borderTop: "1px solid rgba(165,180,200,.15)", background: bg }}>
      <td className="px-4 py-2.5">
        <span className="text-xs font-bold uppercase" style={{ color }}>
          {run.status}
        </span>
      </td>
      <td className="px-4 py-2.5 text-sm text-white">
        {format(new Date(run.started_at), "MMM d, yyyy HH:mm")} UTC
      </td>
      <td className="px-4 py-2.5 text-xs" style={{ color: "#A5B4C8" }}>
        {formatDistanceToNowStrict(new Date(run.started_at), { addSuffix: true })}
      </td>
      <td className="px-4 py-2.5 text-xs" style={{ color: "#A5B4C8" }}>
        {durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : "—"}
      </td>
      <td className="px-4 py-2.5 text-xs" style={{ color: ok ? "#A5B4C8" : "#CC0000" }}>
        {run.status === "error"
          ? run.error_message ?? "unknown error"
          : run.result
          ? Object.entries(run.result as Record<string, unknown>)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")
          : "—"}
      </td>
    </tr>
  );
}

function RunTable({ runs, label }: { runs: CronRunRow[]; label: string }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-white mb-3">{label}</h2>
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "rgba(165,180,200,.2)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(30,58,95,.6)" }}>
              {["Result", "Started at", "Relative", "Duration", "Details"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest"
                  style={{ color: "#A5B4C8" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => (
              <RunRow key={run.id} run={run} i={i} />
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "#6B7280" }}>
                  No runs recorded yet. Crons execute daily — check back after the first run.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AdminCronsPage() {
  const svc = createServiceClient();

  const [{ data: slaRunsRaw }, { data: notifyRunsRaw }] = await Promise.all([
    svc
      .from("cron_runs")
      .select("id, cron_name, started_at, finished_at, status, result, error_message")
      .eq("cron_name", "sla")
      .order("started_at", { ascending: false })
      .limit(30),
    svc
      .from("cron_runs")
      .select("id, cron_name, started_at, finished_at, status, result, error_message")
      .eq("cron_name", "notify")
      .order("started_at", { ascending: false })
      .limit(30),
  ]);

  const slaRuns    = (slaRunsRaw    as unknown as CronRunRow[] | null) ?? [];
  const notifyRuns = (notifyRunsRaw as unknown as CronRunRow[] | null) ?? [];

  const slaOkRate    = slaRuns.length    > 0 ? Math.round((slaRuns.filter((r)    => r.status === "ok").length / slaRuns.length)    * 100) : null;
  const notifyOkRate = notifyRuns.length > 0 ? Math.round((notifyRuns.filter((r) => r.status === "ok").length / notifyRuns.length) * 100) : null;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Cron Health</h1>
        <p className="text-sm mt-1" style={{ color: "#A5B4C8" }}>
          Last 30 runs per job. Jobs run daily — SLA at 00:30 UTC, notifications at 01:00 UTC.
        </p>
      </div>

      {/* Summary pills */}
      <div className="flex gap-4 flex-wrap">
        {[
          {
            label: "SLA recalc",
            schedule: "Daily 00:30 UTC",
            okRate: slaOkRate,
            lastRun: slaRuns[0],
          },
          {
            label: "Notifications",
            schedule: "Daily 01:00 UTC",
            okRate: notifyOkRate,
            lastRun: notifyRuns[0],
          },
        ].map(({ label, schedule, okRate, lastRun }) => (
          <div
            key={label}
            className="rounded-lg border px-5 py-4 min-w-56"
            style={{ borderColor: "rgba(165,180,200,.2)", background: "rgba(255,255,255,.04)" }}
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#A5B4C8" }}>
              {label}
            </p>
            <p className="text-xs mb-2" style={{ color: "#6B7280" }}>{schedule}</p>
            {okRate !== null ? (
              <p className="text-2xl font-bold" style={{ color: okRate >= 90 ? "#2E7D32" : okRate >= 70 ? "#996600" : "#CC0000" }}>
                {okRate}%{" "}
                <span className="text-sm font-normal" style={{ color: "#6B7280" }}>success</span>
              </p>
            ) : (
              <p className="text-sm" style={{ color: "#6B7280" }}>No data</p>
            )}
            {lastRun && (
              <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                Last: {formatDistanceToNowStrict(new Date(lastRun.started_at), { addSuffix: true })}
              </p>
            )}
          </div>
        ))}
      </div>

      <RunTable runs={slaRuns}    label="SLA Recalculation — last 30 runs" />
      <RunTable runs={notifyRuns} label="SLA Notifications — last 30 runs" />
    </div>
  );
}
