/**
 * /assessments — Security Assessment Plan / Report tracking.
 * FedRAMP CA-2: Security Assessments. Annual 3PAO assessments required.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format, differenceInDays } from "date-fns";
import Link from "next/link";

type AssessmentRow = {
  id: string;
  assessment_type: "annual" | "significant_change" | "focused";
  assessor_name: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  findings_count: number;
  systems: { name: string } | null;
};

const TYPE_LABEL: Record<string, string> = {
  annual:             "Annual",
  significant_change: "Sig. Change",
  focused:            "Focused",
};

const TYPE_COLOR: Record<string, string> = {
  annual:             "text-blue-600 bg-blue-50 border-blue-200",
  significant_change: "text-purple-600 bg-purple-50 border-purple-200",
  focused:            "text-yellow-700 bg-yellow-50 border-yellow-200",
};

const STATUS_COLOR: Record<string, string> = {
  planned:     "text-blue-600",
  in_progress: "text-yellow-600",
  completed:   "text-green-600",
  cancelled:   "text-muted-foreground",
};

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const { status: statusFilter, type: typeFilter } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  const role = (profileRaw as unknown as { role: string } | null)?.role ?? "";

  let query = supabase
    .from("assessments")
    .select("id, assessment_type, assessor_name, status, planned_start, planned_end, actual_start, actual_end, findings_count, systems(name)")
    .order("planned_start", { ascending: false });

  if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter);
  if (typeFilter && typeFilter !== "all") query = query.eq("assessment_type", typeFilter);

  const { data: rowsRaw } = await query;
  const assessments = (rowsRaw as unknown as AssessmentRow[] | null) ?? [];

  const canCreate = ["admin", "issm", "isso"].includes(role);
  const today = new Date();

  const upcoming = assessments.filter(
    (a) => a.status === "planned" && new Date(a.planned_start) > today
  ).length;
  const active   = assessments.filter((a) => a.status === "in_progress").length;
  const overdue  = assessments.filter(
    (a) => a.status === "planned" && new Date(a.planned_end) < today
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Assessments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Security Assessment Plans &amp; Reports — CA-2 compliance.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/assessments/new"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
          >
            Schedule Assessment
          </Link>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Upcoming",   value: upcoming, color: "text-foreground" },
          { label: "In Progress", value: active,  color: active > 0 ? "text-yellow-600" : "text-foreground" },
          { label: "Overdue",    value: overdue,  color: overdue > 0 ? "text-red-600" : "text-green-600" },
          { label: "Completed",  value: assessments.filter((a) => a.status === "completed").length, color: "text-green-600" },
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
          { label: "Planned", value: "planned" },
          { label: "In Progress", value: "in_progress" },
          { label: "Completed", value: "completed" },
        ].map(({ label, value }) => {
          const active = (statusFilter ?? "") === value;
          const base = value
            ? `/assessments?status=${value}${typeFilter ? `&type=${typeFilter}` : ""}`
            : `/assessments${typeFilter ? `?type=${typeFilter}` : ""}`;
          return (
            <a key={label} href={base}
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
          { label: "All types", value: "" },
          { label: "Annual", value: "annual" },
          { label: "Sig. Change", value: "significant_change" },
          { label: "Focused", value: "focused" },
        ].map(({ label, value }) => {
          const active = (typeFilter ?? "") === value;
          const base = value
            ? `/assessments?type=${value}${statusFilter ? `&status=${statusFilter}` : ""}`
            : `/assessments${statusFilter ? `?status=${statusFilter}` : ""}`;
          return (
            <a key={label} href={base}
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
              {["Type", "System / Assessor", "Planned Window", "Duration", "Findings", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assessments.map((a) => {
              const durationDays = differenceInDays(
                new Date(a.planned_end),
                new Date(a.planned_start)
              );
              const isOverdue = a.status === "planned" && new Date(a.planned_end) < today;
              return (
                <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${TYPE_COLOR[a.assessment_type] ?? ""}`}>
                      {TYPE_LABEL[a.assessment_type] ?? a.assessment_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-xs">{a.systems?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{a.assessor_name}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {format(new Date(a.planned_start), "MMM d")}
                    {" – "}
                    {format(new Date(a.planned_end), "MMM d, yyyy")}
                    {isOverdue && (
                      <span className="ml-1.5 text-red-600 font-semibold">overdue</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{durationDays}d</td>
                  <td className="px-4 py-2.5 text-xs">{a.findings_count}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold capitalize ${STATUS_COLOR[a.status] ?? ""}`}>
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/assessments/${a.id}`} className="text-xs text-primary hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {assessments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No assessments found. Schedule an assessment above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
