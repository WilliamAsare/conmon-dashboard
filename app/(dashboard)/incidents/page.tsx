/**
 * /incidents — Incident response tracking.
 * FedRAMP IR-6: report incidents to US-CERT/CISA within 1 hour of detection.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format, differenceInHours } from "date-fns";
import Link from "next/link";

type IncidentRow = {
  id: string;
  title: string;
  severity: "high" | "moderate" | "low";
  status: "open" | "investigating" | "contained" | "resolved" | "closed";
  detected_at: string;
  reported_at: string;
  reported_within_sla: boolean;
  systems: { name: string } | null;
};

const SEV_COLOR: Record<string, string> = {
  high:     "text-red-600 bg-red-50 border-red-200",
  moderate: "text-yellow-700 bg-yellow-50 border-yellow-200",
  low:      "text-blue-600 bg-blue-50 border-blue-200",
};

const STATUS_COLOR: Record<string, string> = {
  open:          "text-red-600",
  investigating: "text-yellow-600",
  contained:     "text-blue-600",
  resolved:      "text-green-600",
  closed:        "text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  open:          "Open",
  investigating: "Investigating",
  contained:     "Contained",
  resolved:      "Resolved",
  closed:        "Closed",
};

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string }>;
}) {
  const { status: statusFilter, severity: sevFilter } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  const role = (profileRaw as unknown as { role: string } | null)?.role ?? "";

  let query = supabase
    .from("incidents")
    .select("id, title, severity, status, detected_at, reported_at, reported_within_sla, systems(name)")
    .order("detected_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter);
  if (sevFilter && sevFilter !== "all") query = query.eq("severity", sevFilter);

  const { data: rowsRaw } = await query;
  const incidents = (rowsRaw as unknown as IncidentRow[] | null) ?? [];

  const canCreate = ["admin", "issm", "isso", "engineer"].includes(role);

  const openCount = incidents.filter((i) => i.status === "open" || i.status === "investigating").length;
  const slaBreaches = incidents.filter((i) => !i.reported_within_sla).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Security incident tracking — IR-6 compliance (1-hour reporting SLA).
          </p>
        </div>
        {canCreate && (
          <Link
            href="/incidents/new"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
          >
            Report Incident
          </Link>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Incidents", value: openCount, color: openCount > 0 ? "text-red-600" : "text-foreground" },
          { label: "SLA Breaches", value: slaBreaches, color: slaBreaches > 0 ? "text-red-600" : "text-green-600" },
          { label: "Resolved (shown)", value: incidents.filter((i) => i.status === "resolved" || i.status === "closed").length, color: "text-foreground" },
          { label: "Total (shown)", value: incidents.length, color: "text-foreground" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap text-xs">
        {[
          { label: "All status", value: "" },
          { label: "Open", value: "open" },
          { label: "Investigating", value: "investigating" },
          { label: "Contained", value: "contained" },
          { label: "Resolved", value: "resolved" },
        ].map(({ label, value }) => {
          const active = (statusFilter ?? "") === value;
          const href = value
            ? `/incidents?status=${value}${sevFilter ? `&severity=${sevFilter}` : ""}`
            : `/incidents${sevFilter ? `?severity=${sevFilter}` : ""}`;
          return (
            <a key={label} href={href}
              className={`px-3 py-1.5 rounded-full border transition-colors ${
                active ? "bg-primary text-primary-foreground border-primary"
                       : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </a>
          );
        })}
        <span className="w-px bg-border self-stretch mx-1" />
        {[
          { label: "All severity", value: "" },
          { label: "High", value: "high" },
          { label: "Moderate", value: "moderate" },
          { label: "Low", value: "low" },
        ].map(({ label, value }) => {
          const active = (sevFilter ?? "") === value;
          const href = value
            ? `/incidents?severity=${value}${statusFilter ? `&status=${statusFilter}` : ""}`
            : `/incidents${statusFilter ? `?status=${statusFilter}` : ""}`;
          return (
            <a key={label} href={href}
              className={`px-3 py-1.5 rounded-full border transition-colors ${
                active ? "bg-primary text-primary-foreground border-primary"
                       : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </a>
          );
        })}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Severity", "Title", "System", "Detected", "SLA", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {incidents.map((inc) => {
              const hoursToReport = differenceInHours(
                new Date(inc.reported_at),
                new Date(inc.detected_at)
              );
              return (
                <tr key={inc.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border capitalize ${SEV_COLOR[inc.severity] ?? ""}`}>
                      {inc.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium max-w-xs truncate">{inc.title}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{inc.systems?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(inc.detected_at), "MMM d, HH:mm")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold ${inc.reported_within_sla ? "text-green-600" : "text-red-600"}`}>
                      {inc.reported_within_sla ? `✓ ${hoursToReport}h` : `✗ ${hoursToReport}h`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold capitalize ${STATUS_COLOR[inc.status] ?? ""}`}>
                      {STATUS_LABEL[inc.status] ?? inc.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/incidents/${inc.id}`} className="text-xs text-primary hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {incidents.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No incidents found. Report a security incident above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
