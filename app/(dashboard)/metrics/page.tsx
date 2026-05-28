/**
 * /metrics — Remediation velocity and compliance health.
 *
 * Computes from live data:
 *  • Monthly findings remediated (last 6 months)
 *  • Average days to close POA&M by severity
 *  • Open POA&M aging buckets
 *  • Scan compliance rate (% scan types current within 30d)
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays } from "date-fns";
import type { Database } from "@/types/supabase";

type FindingRow = { status: string; last_detected: string };
type PoamRow    = {
  severity: string;
  status:   string;
  identified_date: string;
  actual_completion: string | null;
  sla_status: string;
};
type ScanRow    = { scan_type: string; scan_date: string };

function Stat({
  label, value, sub, color = "text-foreground",
}: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-muted-foreground w-6 text-right">{value}</span>
    </div>
  );
}

export default async function MetricsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("organization_id").eq("id", user.id).single();
  const orgId = (profileRaw as unknown as { organization_id: string } | null)?.organization_id;
  if (!orgId) redirect("/login");

  const sixMonthsAgo = subMonths(new Date(), 6).toISOString();

  const [
    { data: findingsRaw },
    { data: poamsRaw },
    { data: scansRaw },
  ] = await Promise.all([
    supabase
      .from("findings")
      .select("status, last_detected")
      .gte("last_detected", sixMonthsAgo),
    supabase
      .from("poam_items")
      .select("severity, status, identified_date, actual_completion, sla_status")
      .in("status", ["open", "ongoing", "completed"]),
    supabase
      .from("scans")
      .select("scan_type, scan_date")
      .order("scan_date", { ascending: false }),
  ]);

  const findings = (findingsRaw as unknown as FindingRow[] | null) ?? [];
  const poams    = (poamsRaw   as unknown as PoamRow[]    | null) ?? [];
  const scans    = (scansRaw   as unknown as ScanRow[]    | null) ?? [];

  // ── Monthly remediation (last 6 months) ────────────────────────────────────
  const today    = new Date();
  const months   = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(today, 5 - i);
    return { label: format(d, "MMM"), start: startOfMonth(d), end: endOfMonth(d) };
  });

  const remediatedByMonth = months.map(({ label, start, end }) => ({
    label,
    count: findings.filter(
      (f) =>
        f.status === "remediated" &&
        new Date(f.last_detected) >= start &&
        new Date(f.last_detected) <= end
    ).length,
  }));

  const maxRemCount = Math.max(...remediatedByMonth.map((m) => m.count), 1);

  // ── Avg days to close POA&M by severity ────────────────────────────────────
  const closedPoams = poams.filter((p) => p.status === "completed" && p.actual_completion);

  function avgDays(sev: string): number | null {
    const items = closedPoams.filter((p) => p.severity === sev);
    if (items.length === 0) return null;
    const total = items.reduce(
      (sum, p) =>
        sum + differenceInDays(new Date(p.actual_completion!), new Date(p.identified_date)),
      0
    );
    return Math.round(total / items.length);
  }

  const avgHigh     = avgDays("high");
  const avgModerate = avgDays("moderate");
  const avgLow      = avgDays("low");

  // ── Open POA&M aging ───────────────────────────────────────────────────────
  const openPoams = poams.filter((p) => p.status === "open" || p.status === "ongoing");
  const agingBuckets = [
    { label: "< 30 days",   count: openPoams.filter((p) => differenceInDays(today, new Date(p.identified_date)) < 30).length },
    { label: "30–90 days",  count: openPoams.filter((p) => { const d = differenceInDays(today, new Date(p.identified_date)); return d >= 30 && d < 90; }).length },
    { label: "90–180 days", count: openPoams.filter((p) => { const d = differenceInDays(today, new Date(p.identified_date)); return d >= 90 && d < 180; }).length },
    { label: "> 180 days",  count: openPoams.filter((p) => differenceInDays(today, new Date(p.identified_date)) >= 180).length },
  ];
  const maxAgingCount = Math.max(...agingBuckets.map((b) => b.count), 1);

  // ── Scan coverage ──────────────────────────────────────────────────────────
  const scanTypes = ["os", "webapp", "database"] as const;
  const scanCompliance = scanTypes.map((type) => {
    const latest = scans.find((s) => s.scan_type === type);
    if (!latest) return { type, current: false, daysAgo: null };
    const daysAgo = differenceInDays(today, new Date(latest.scan_date));
    return { type, current: daysAgo <= 30, daysAgo };
  });
  const scanCompliancePct = Math.round(
    (scanCompliance.filter((s) => s.current).length / scanTypes.length) * 100
  );

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Metrics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Remediation velocity and compliance health for your organization.
        </p>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Open POA&Ms"      value={openPoams.length} />
        <Stat
          label="SLA Overdue"
          value={openPoams.filter((p) => p.sla_status === "overdue").length}
          color={openPoams.some((p) => p.sla_status === "overdue") ? "text-destructive" : "text-foreground"}
        />
        <Stat
          label="Scan Coverage"
          value={`${scanCompliancePct}%`}
          sub={`${scanCompliance.filter((s) => s.current).length} of ${scanTypes.length} current`}
          color={scanCompliancePct === 100 ? "text-green-600" : scanCompliancePct >= 66 ? "text-yellow-600" : "text-destructive"}
        />
        <Stat
          label="Closed POA&Ms"
          value={closedPoams.length}
          sub="all time"
          color="text-green-600"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Monthly remediation */}
        <section className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Findings Remediated — Last 6 Months</h2>
          <div className="space-y-2.5">
            {remediatedByMonth.map(({ label, count }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{label}</span>
                </div>
                <Bar value={count} max={maxRemCount} color="#2B5EA7" />
              </div>
            ))}
          </div>
        </section>

        {/* Avg days to close */}
        <section className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Avg Days to Close POA&M</h2>
          <div className="space-y-4">
            {[
              { label: "High severity",     value: avgHigh,     sla: 30,  color: "#CC0000" },
              { label: "Moderate severity", value: avgModerate, sla: 90,  color: "#996600" },
              { label: "Low severity",      value: avgLow,      sla: 180, color: "#2E7D32" },
            ].map(({ label, value, sla, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold" style={{ color: value !== null && value > sla ? "#CC0000" : color }}>
                    {value !== null ? `${value}d avg` : "No data"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">SLA: {sla} days</div>
              </div>
            ))}
          </div>
        </section>

        {/* POA&M aging */}
        <section className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Open POA&M Aging</h2>
          <div className="space-y-2.5">
            {agingBuckets.map(({ label, count }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{label}</span>
                </div>
                <Bar
                  value={count}
                  max={maxAgingCount}
                  color={label === "> 180 days" ? "#CC0000" : label === "90–180 days" ? "#996600" : "#2B5EA7"}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Scan coverage detail */}
        <section className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Scan Coverage</h2>
          <div className="space-y-3">
            {scanCompliance.map(({ type, current, daysAgo }) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="capitalize text-muted-foreground">
                  {type === "os" ? "OS / Host" : type === "webapp" ? "Web Application" : "Database"}
                </span>
                <div className="flex items-center gap-2">
                  {daysAgo !== null && (
                    <span className="text-xs text-muted-foreground">{daysAgo}d ago</span>
                  )}
                  <span
                    className="text-xs font-bold"
                    style={{ color: current ? "#2E7D32" : daysAgo === null ? "#6B7280" : "#CC0000" }}
                  >
                    {current ? "Current" : daysAgo === null ? "Never" : "Stale"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
