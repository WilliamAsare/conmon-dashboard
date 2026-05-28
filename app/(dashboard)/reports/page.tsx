import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ScrollText, Download } from "lucide-react";
import type { Database } from "@/types/supabase";
import { GenerateReportForm } from "./generate-form";

export const metadata: Metadata = { title: "Reports" };

// Local row types.
// `as unknown as` casts required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference.
type ReportRow = Pick<
  Database["public"]["Tables"]["conmon_reports"]["Row"],
  "id" | "reporting_period_start" | "reporting_period_end" | "generated_at"
> & {
  systems: Pick<
    Database["public"]["Tables"]["systems"]["Row"],
    "id" | "name" | "fedramp_level"
  > | null;
};

type SystemRow = Pick<
  Database["public"]["Tables"]["systems"]["Row"],
  "id" | "name"
>;

type UserProfile = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "organization_id" | "role"
>;

export default async function ReportsPage() {
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

  // Fetch report history
  const { data: reportsRaw } = await supabase
    .from("conmon_reports")
    .select(`
      id, reporting_period_start, reporting_period_end, generated_at,
      systems ( id, name, fedramp_level )
    `)
    .eq("organization_id", profile.organization_id)
    .order("generated_at", { ascending: false })
    .limit(50);

  const reports = (reportsRaw as unknown as ReportRow[] | null) ?? [];

  // Fetch systems for the form
  const { data: systemsRaw } = await supabase
    .from("systems")
    .select("id, name")
    .eq("organization_id", profile.organization_id)
    .eq("status", "active")
    .order("name");

  const systems = (systemsRaw as unknown as SystemRow[] | null) ?? [];

  const canGenerate = ["admin", "issm", "isso"].includes(profile.role);

  // Default reporting period: last full calendar month
  const lastMonth   = subMonths(new Date(), 1);
  const defaultStart = format(startOfMonth(lastMonth), "yyyy-MM-dd");
  const defaultEnd   = format(endOfMonth(lastMonth),   "yyyy-MM-dd");

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generate FedRAMP ConMon summary reports as PDF deliverables.
        </p>
      </div>

      {/* Generate new report */}
      {canGenerate && systems.length > 0 && (
        <section className="rounded-lg border border-border p-6 space-y-4">
          <h2 className="text-base font-semibold">Generate new report</h2>
          <GenerateReportForm
            systems={systems}
            defaultStart={defaultStart}
            defaultEnd={defaultEnd}
          />
        </section>
      )}

      {canGenerate && systems.length === 0 && (
        <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
          No active systems found.{" "}
          <Link href="/systems/new" className="text-primary hover:underline">
            Create a system
          </Link>{" "}
          before generating a report.
        </div>
      )}

      {/* Report history */}
      <section>
        <h2 className="text-base font-semibold mb-3">Report history</h2>
        {reports.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center">
            <ScrollText size={32} className="mx-auto text-muted-foreground mb-3" aria-hidden="true" />
            <p className="text-sm font-medium">No reports generated yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Generated reports will appear here for download.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium">System</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Level</th>
                  <th className="text-left px-4 py-2.5 font-medium">Reporting period</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Generated</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      {r.systems ? (
                        <Link href={`/systems/${r.systems.id}`} className="font-medium hover:underline">
                          {r.systems.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">
                      {r.systems?.fedramp_level ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {format(new Date(r.reporting_period_start), "MMM d")}
                      {" – "}
                      {format(new Date(r.reporting_period_end), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                      {format(new Date(r.generated_at), "MMM d, yyyy 'at' HH:mm")}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={`/api/reports/${r.id}/download`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Download size={11} aria-hidden="true" />
                        PDF
                      </a>
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
