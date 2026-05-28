/**
 * /admin/organizations/[id] — Organization detail.
 *
 * Shows org members, systems, POA&M health summary,
 * and Suspend / Reactivate controls.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { suspendOrganization, reactivateOrganization } from "./actions";
import type { Database } from "@/types/supabase";

type OrgRow = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  "id" | "name" | "status" | "created_at"
>;

type UserRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "full_name" | "role" | "created_at"
>;

type SystemRow = Pick<
  Database["public"]["Tables"]["systems"]["Row"],
  "id" | "name" | "fedramp_level" | "status"
>;

type PoamSummaryRow = {
  severity: string;
  sla_status: string;
  status: string;
};

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const svc = createServiceClient();

  const { data: orgRaw, error: orgErr } = await svc
    .from("organizations")
    .select("id, name, status, created_at")
    .eq("id", id)
    .single();

  if (orgErr || !orgRaw) notFound();
  const org = orgRaw as unknown as OrgRow;

  // Parallel: users, systems, system IDs for POA&M lookup
  const [{ data: usersRaw }, { data: systemsRaw }] = await Promise.all([
    svc
      .from("users")
      .select("id, full_name, role, created_at")
      .eq("organization_id", id)
      .order("created_at", { ascending: true }),
    svc
      .from("systems")
      .select("id, name, fedramp_level, status")
      .eq("organization_id", id)
      .order("name"),
  ]);

  const users   = (usersRaw   as unknown as UserRow[]   | null) ?? [];
  const systems = (systemsRaw as unknown as SystemRow[] | null) ?? [];

  // POA&M health — join through system IDs
  let openPoams: PoamSummaryRow[] = [];
  if (systems.length > 0) {
    const sysIds = systems.map((s) => s.id);
    const { data: poamsRaw } = await svc
      .from("poam_items")
      .select("severity, sla_status, status")
      .in("system_id", sysIds)
      .in("status", ["open", "ongoing"]);
    openPoams = (poamsRaw as unknown as PoamSummaryRow[] | null) ?? [];
  }

  const poamCounts = {
    high:         openPoams.filter((p) => p.severity === "high").length,
    moderate:     openPoams.filter((p) => p.severity === "moderate").length,
    low:          openPoams.filter((p) => p.severity === "low").length,
    overdue:      openPoams.filter((p) => p.sla_status === "overdue").length,
    warning:      openPoams.filter((p) => p.sla_status === "warning").length,
    total:        openPoams.length,
  };

  const ROLE_COLOR: Record<string, string> = {
    admin:    "#2B5EA7",
    issm:     "#996600",
    isso:     "#2E7D32",
    engineer: "#A5B4C8",
    auditor:  "#6B7280",
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs mb-1" style={{ color: "#A5B4C8" }}>
            <Link href="/admin/organizations" className="hover:underline">Organizations</Link>
            {" / "}
            {org.name}
          </p>
          <h1 className="text-2xl font-bold text-white">{org.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span
              className="text-xs font-bold uppercase"
              style={{ color: org.status === "active" ? "#2E7D32" : "#CC0000" }}
            >
              {org.status}
            </span>
            <span className="text-xs" style={{ color: "#6B7280" }}>
              Created {format(new Date(org.created_at), "MMM d, yyyy")}
            </span>
          </div>
        </div>

        {/* Suspend / Reactivate */}
        {org.status === "active" ? (
          <form action={suspendOrganization}>
            <input type="hidden" name="org_id" value={org.id} />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded border transition-colors"
              style={{ borderColor: "#CC0000", color: "#CC0000" }}
            >
              Suspend Org
            </button>
          </form>
        ) : (
          <form action={reactivateOrganization}>
            <input type="hidden" name="org_id" value={org.id} />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded border transition-colors"
              style={{ borderColor: "#2E7D32", color: "#2E7D32" }}
            >
              Reactivate Org
            </button>
          </form>
        )}
      </div>

      {/* POA&M Health */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">POA&amp;M Health</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: "Total Open",  value: poamCounts.total,    color: "#A5B4C8" },
            { label: "High",        value: poamCounts.high,     color: poamCounts.high    > 0 ? "#CC0000" : "#A5B4C8" },
            { label: "Moderate",    value: poamCounts.moderate, color: poamCounts.moderate > 0 ? "#996600" : "#A5B4C8" },
            { label: "Low",         value: poamCounts.low,      color: "#A5B4C8" },
            { label: "SLA Overdue", value: poamCounts.overdue,  color: poamCounts.overdue > 0 ? "#CC0000" : "#2E7D32" },
            { label: "SLA Warning", value: poamCounts.warning,  color: poamCounts.warning > 0 ? "#996600" : "#A5B4C8" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-lg border p-4 text-center"
              style={{ borderColor: "rgba(165,180,200,.2)", background: "rgba(255,255,255,.04)" }}
            >
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
              <p className="text-xs mt-1" style={{ color: "#6B7280" }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Systems */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">
          Systems{" "}
          <span className="text-sm font-normal" style={{ color: "#A5B4C8" }}>
            ({systems.length})
          </span>
        </h2>
        {systems.length === 0 ? (
          <p className="text-sm" style={{ color: "#6B7280" }}>No systems.</p>
        ) : (
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: "rgba(165,180,200,.2)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(30,58,95,.6)" }}>
                  {["System", "FedRAMP Level", "Status"].map((h) => (
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
                {systems.map((sys, i) => (
                  <tr
                    key={sys.id}
                    style={{
                      borderTop: "1px solid rgba(165,180,200,.15)",
                      background: i % 2 === 1 ? "rgba(255,255,255,.02)" : undefined,
                    }}
                  >
                    <td className="px-4 py-2.5 text-white font-medium">{sys.name}</td>
                    <td className="px-4 py-2.5" style={{ color: "#A5B4C8" }}>{sys.fedramp_level}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-xs font-bold uppercase"
                        style={{ color: sys.status === "active" ? "#2E7D32" : "#6B7280" }}
                      >
                        {sys.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Users */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">
          Members{" "}
          <span className="text-sm font-normal" style={{ color: "#A5B4C8" }}>
            ({users.length})
          </span>
        </h2>
        {users.length === 0 ? (
          <p className="text-sm" style={{ color: "#6B7280" }}>No users.</p>
        ) : (
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: "rgba(165,180,200,.2)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(30,58,95,.6)" }}>
                  {["Name", "Role", "Joined"].map((h) => (
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
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{
                      borderTop: "1px solid rgba(165,180,200,.15)",
                      background: i % 2 === 1 ? "rgba(255,255,255,.02)" : undefined,
                    }}
                  >
                    <td className="px-4 py-2.5 text-white">{u.full_name}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-xs font-bold uppercase"
                        style={{ color: ROLE_COLOR[u.role] ?? "#A5B4C8" }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "#A5B4C8" }}>
                      {format(new Date(u.created_at), "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
