/**
 * /portal/[token] — Public client portal.
 *
 * Read-only, no account required. Token validated server-side:
 *  • Must exist in share_tokens
 *  • Must not be revoked
 *  • Must not be expired
 *
 * Shows a live compliance summary for the linked system:
 *  • ATO status, FedRAMP level, reporting overview
 *  • Scan coverage (without raw scan data)
 *  • POA&M health by severity + SLA status (counts only, no descriptions)
 *  • Deviation summary
 *
 * Records last_used_at on every visit.
 */

import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { format, differenceInDays } from "date-fns";
import type { Database } from "@/types/supabase";

type TokenRow = Pick<
  Database["public"]["Tables"]["share_tokens"]["Row"],
  "id" | "system_id" | "org_id" | "expires_at" | "revoked_at" | "label"
>;

type SystemRow = Pick<
  Database["public"]["Tables"]["systems"]["Row"],
  "id" | "name" | "fedramp_level" | "authorization_date" | "ato_expiration" | "agency_sponsor" | "status"
>;

type OrgRow    = Pick<Database["public"]["Tables"]["organizations"]["Row"], "name">;
type ScanRow   = Pick<Database["public"]["Tables"]["scans"]["Row"], "scan_type" | "scan_date">;
type PoamCount = { severity: string; sla_status: string; status: string };
type DevRow    = Pick<Database["public"]["Tables"]["deviation_requests"]["Row"], "status">;

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {children}
    </span>
  );
}

function Stat({ label, value, color = "#1E3A5F" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center p-4">
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs mt-1 text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = createServiceClient();

  // Validate token
  const { data: tokenRaw } = await svc
    .from("share_tokens")
    .select("id, system_id, org_id, expires_at, revoked_at, label")
    .eq("token", token)
    .single();

  if (!tokenRaw) notFound();
  const tok = tokenRaw as unknown as TokenRow;

  // Revoked?
  if (tok.revoked_at) notFound();
  // Expired?
  if (tok.expires_at && new Date(tok.expires_at) < new Date()) notFound();

  // Record access (fire-and-forget)
  void svc
    .from("share_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tok.id);

  // Fetch system data
  const [
    { data: sysRaw },
    { data: orgRaw },
    { data: scansRaw },
    { data: poamsRaw },
    { data: devsRaw },
  ] = await Promise.all([
    svc
      .from("systems")
      .select("id, name, fedramp_level, authorization_date, ato_expiration, agency_sponsor, status")
      .eq("id", tok.system_id)
      .single(),
    svc
      .from("organizations")
      .select("name")
      .eq("id", tok.org_id)
      .single(),
    svc
      .from("scans")
      .select("scan_type, scan_date")
      .eq("system_id", tok.system_id)
      .order("scan_date", { ascending: false }),
    svc
      .from("poam_items")
      .select("severity, sla_status, status")
      .eq("system_id", tok.system_id)
      .in("status", ["open", "ongoing"]),
    svc
      .from("deviation_requests")
      .select("status")
      .eq("organization_id", tok.org_id),
  ]);

  if (!sysRaw) notFound();

  const system = sysRaw  as unknown as SystemRow;
  const org    = orgRaw  as unknown as OrgRow | null;
  const scans  = (scansRaw  as unknown as ScanRow[]   | null) ?? [];
  const poams  = (poamsRaw  as unknown as PoamCount[] | null) ?? [];
  const devs   = (devsRaw   as unknown as DevRow[]    | null) ?? [];

  const today = new Date();

  // Scan coverage
  const scanTypes = ["os", "webapp", "database"] as const;
  const scanLabels: Record<string, string> = { os: "OS / Host", webapp: "Web Application", database: "Database" };
  const scanCoverage = scanTypes.map((type) => {
    const latest = scans.filter((s) => s.scan_type === type).sort((a, b) => (a.scan_date > b.scan_date ? -1 : 1))[0];
    if (!latest) return { type, label: scanLabels[type]!, lastScan: null, daysAgo: null, current: false };
    const daysAgo = differenceInDays(today, new Date(latest.scan_date));
    return { type, label: scanLabels[type]!, lastScan: latest.scan_date, daysAgo, current: daysAgo <= 30 };
  });

  // POA&M counts
  const high    = poams.filter((p) => p.severity === "high").length;
  const moderate = poams.filter((p) => p.severity === "moderate").length;
  const low     = poams.filter((p) => p.severity === "low").length;
  const overdue = poams.filter((p) => p.sla_status === "overdue").length;
  const warning = poams.filter((p) => p.sla_status === "warning").length;

  // ATO status
  const atoExpiry = system.ato_expiration ? new Date(system.ato_expiration) : null;
  const daysToAto = atoExpiry ? differenceInDays(atoExpiry, today) : null;

  const LEVEL_COLOR: Record<string, string> = {
    High:     "#CC0000",
    Moderate: "#996600",
    Low:      "#2E7D32",
  };

  return (
    <div className="min-h-screen" style={{ background: "#F3F4F6", fontFamily: "Helvetica, Arial, sans-serif" }}>
      {/* Banner */}
      <header style={{ background: "#1E3A5F" }} className="px-8 py-6">
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#A5B4C8" }}>
          FedRAMP Continuous Monitoring — Client Portal
        </p>
        <h1 className="text-2xl font-bold text-white">{system.name}</h1>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <Badge color={LEVEL_COLOR[system.fedramp_level] ?? "#1E3A5F"}>
            {system.fedramp_level}
          </Badge>
          {org && <span style={{ color: "#A5B4C8" }} className="text-sm">{org.name}</span>}
          {system.agency_sponsor && (
            <span style={{ color: "#A5B4C8" }} className="text-sm">
              Agency: {system.agency_sponsor}
            </span>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* ATO Info */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-4">ATO Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Authorization Date</p>
              <p className="font-semibold text-gray-800">
                {system.authorization_date
                  ? format(new Date(system.authorization_date), "MMM d, yyyy")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">ATO Expiration</p>
              <p className="font-semibold" style={{ color: daysToAto !== null && daysToAto < 90 ? "#CC0000" : "#111827" }}>
                {atoExpiry ? format(atoExpiry, "MMM d, yyyy") : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Days to Expiry</p>
              <p className="font-semibold" style={{ color: daysToAto !== null && daysToAto < 90 ? "#CC0000" : "#111827" }}>
                {daysToAto !== null ? (daysToAto < 0 ? `${Math.abs(daysToAto)}d expired` : `${daysToAto}d`) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">System Status</p>
              <p className="font-semibold" style={{ color: system.status === "active" ? "#2E7D32" : "#6B7280" }}>
                {system.status.charAt(0).toUpperCase() + system.status.slice(1)}
              </p>
            </div>
          </div>
        </section>

        {/* Scan Coverage */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-4">Scan Coverage</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {scanCoverage.map((sc) => (
              <div
                key={sc.type}
                className="rounded-lg p-4 border"
                style={{
                  borderColor: sc.lastScan === null ? "#D1D5DB" : sc.current ? "#86EFAC" : "#FCA5A5",
                  background:  sc.lastScan === null ? "#F9FAFB"   : sc.current ? "#F0FDF4" : "#FEF2F2",
                }}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">{sc.label}</p>
                {sc.lastScan ? (
                  <>
                    <p className="font-semibold text-gray-800 text-sm">
                      {format(new Date(sc.lastScan), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: sc.current ? "#2E7D32" : "#CC0000" }}>
                      {sc.daysAgo}d ago — {sc.current ? "Current" : "Stale (>30 days)"}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No scan recorded</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* POA&M Summary */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-4">
            Open POA&amp;M Summary
          </h2>

          {/* Severity breakdown */}
          <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-gray-100 border border-gray-100 rounded-lg overflow-hidden mb-4">
            <Stat label="Total"    value={poams.length} />
            <Stat label="High"     value={high}     color={high > 0    ? "#CC0000" : "#1E3A5F"} />
            <Stat label="Moderate" value={moderate}  color={moderate > 0 ? "#996600" : "#1E3A5F"} />
            <Stat label="Low"      value={low} />
            <Stat label="Overdue"  value={overdue}  color={overdue > 0 ? "#CC0000" : "#2E7D32"} />
            <Stat label="Warning"  value={warning}  color={warning > 0 ? "#996600" : "#2E7D32"} />
          </div>

          {overdue > 0 && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              ⚠ {overdue} POA&amp;M item{overdue !== 1 ? "s are" : " is"} past the FedRAMP SLA deadline and require{overdue === 1 ? "s" : ""} immediate attention.
            </p>
          )}
          {overdue === 0 && poams.length > 0 && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              ✓ All open items are within their FedRAMP SLA windows.
            </p>
          )}
          {poams.length === 0 && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              ✓ No open POA&amp;M items.
            </p>
          )}
        </section>

        {/* Deviation Requests */}
        {devs.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-4">
              Deviation Requests
            </h2>
            <div className="grid grid-cols-3 divide-x divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
              <Stat label="Pending"  value={devs.filter((d) => d.status === "submitted").length} color="#996600" />
              <Stat label="Approved" value={devs.filter((d) => d.status === "approved").length}  color="#2E7D32" />
              <Stat label="Rejected" value={devs.filter((d) => d.status === "rejected").length}  color="#CC0000" />
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 pt-4 pb-8">
          <p>
            Live data — last refreshed {format(today, "MMMM d, yyyy 'at' HH:mm 'UTC'")}
          </p>
          <p className="mt-1">
            This is a read-only compliance summary generated by ConMon Dashboard.
            {tok.label && ` Access: ${tok.label}.`}
          </p>
        </footer>
      </div>
    </div>
  );
}
