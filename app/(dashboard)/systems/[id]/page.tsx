import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { differenceInDays, format } from "date-fns";
import { Upload, AlertCircle, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import type { Database } from "@/types/supabase";

// Local types for the system detail query.
// `as unknown as` casts are required because placeholder types/supabase.ts
// lacks Relationships needed for Supabase select-string type inference.
// These casts are removed once `supabase gen types` runs.
type SystemRow = Database["public"]["Tables"]["systems"]["Row"];
type ScanRow = Database["public"]["Tables"]["scans"]["Row"];
type PoamRow = Database["public"]["Tables"]["poam_items"]["Row"];

type SystemDetail = Pick<
  SystemRow,
  "id" | "name" | "short_code" | "fedramp_level" | "authorization_date" | "ato_expiration" | "agency_sponsor" | "status"
> & {
  scans: Pick<ScanRow, "id" | "scan_type" | "scan_date" | "total_findings" | "scanner_name">[];
  poam_items: Pick<PoamRow, "id" | "severity" | "status" | "sla_status" | "scheduled_completion" | "poam_number">[];
};

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("systems").select("name").eq("id", id).single();
  const row = data as unknown as { name: string } | null;
  return { title: row?.name ?? "System" };
}

export default async function SystemDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: systemRaw, error } = await supabase
    .from("systems")
    .select(`
      id, name, short_code, fedramp_level, authorization_date,
      ato_expiration, agency_sponsor, status,
      scans ( id, scan_type, scan_date, total_findings, scanner_name ),
      poam_items ( id, severity, status, sla_status, scheduled_completion, poam_number )
    `)
    .eq("id", id)
    .single();

  if (error || !systemRaw) notFound();

  const s = systemRaw as unknown as SystemDetail;

  const today = new Date();
  const daysUntilAto = s.ato_expiration ? differenceInDays(new Date(s.ato_expiration), today) : null;

  const openPoams = s.poam_items.filter(p => p.status === "open" || p.status === "ongoing");
  const overdue = openPoams.filter(p => p.sla_status === "overdue");
  const atRisk = openPoams.filter(p => p.sla_status === "warning");

  const latestScans = s.scans.reduce<Record<string, string>>((acc, scan) => {
    if (!acc[scan.scan_type] || scan.scan_date > acc[scan.scan_type]!) {
      acc[scan.scan_type] = scan.scan_date;
    }
    return acc;
  }, {});

  const scanTypes = ["os", "webapp", "database"] as const;

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/systems" className="hover:underline">Systems</Link>
            {" / "}
          </p>
          <h1 className="text-2xl font-semibold mt-1">{s.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {s.fedramp_level} &middot; {s.short_code}
            {s.agency_sponsor && ` · ${s.agency_sponsor}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/export/oscal/${s.id}`}
            download
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            OSCAL Export
          </a>
          <Link
            href={`/systems/${s.id}/share`}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Share
          </Link>
          <Link
            href={`/scans/new?system=${s.id}`}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Upload size={15} aria-hidden="true" />
            Upload scan
          </Link>
        </div>
      </div>

      {/* ATO countdown */}
      {daysUntilAto !== null && (
        <div className={`rounded-lg border p-4 flex items-center gap-3 ${
          daysUntilAto < 0 ? "border-destructive/50 bg-destructive/5" :
          daysUntilAto <= 90 ? "border-[hsl(var(--severity-moderate))]/50 bg-[hsl(var(--severity-moderate))]/5" :
          "border-border"
        }`}>
          {daysUntilAto < 0
            ? <AlertCircle size={18} className="text-destructive shrink-0" aria-hidden="true" />
            : daysUntilAto <= 90
            ? <AlertTriangle size={18} className="text-[hsl(var(--severity-moderate))] shrink-0" aria-hidden="true" />
            : <CheckCircle size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
          }
          <div>
            <p className="text-sm font-medium">
              {daysUntilAto < 0
                ? `ATO expired ${Math.abs(daysUntilAto)} days ago`
                : daysUntilAto === 0
                ? "ATO expires today"
                : `ATO expires in ${daysUntilAto} days`}
            </p>
            {s.ato_expiration && (
              <p className="text-xs text-muted-foreground">
                Expiration date: {format(new Date(s.ato_expiration), "MMMM d, yyyy")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* POA&M summary */}
      <section aria-labelledby="poam-summary-heading">
        <h2 id="poam-summary-heading" className="text-base font-semibold mb-3">Open POA&Ms</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["high", "moderate", "low"] as const).map(sev => {
            const count = openPoams.filter(p => p.severity === sev).length;
            return (
              <div key={sev} className="rounded-lg border border-border p-3 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground capitalize">{sev}</p>
              </div>
            );
          })}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{overdue.length}</p>
            <p className="text-xs text-muted-foreground">Overdue</p>
          </div>
          <div className="rounded-lg border border-[hsl(var(--severity-moderate))]/30 bg-[hsl(var(--severity-moderate))]/5 p-3 text-center">
            <p className="text-2xl font-bold text-[hsl(var(--severity-moderate))]">{atRisk.length}</p>
            <p className="text-xs text-muted-foreground">At risk (7d)</p>
          </div>
        </div>
        {openPoams.length > 0 && (
          <Link href={`/poams?system=${s.id}`} className="mt-3 inline-block text-sm text-primary hover:underline">
            View all POA&Ms
          </Link>
        )}
      </section>

      {/* Scan coverage */}
      <section aria-labelledby="scan-coverage-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="scan-coverage-heading" className="text-base font-semibold">Scan coverage</h2>
          <Link href={`/scans/new?system=${s.id}`} className="text-sm text-primary hover:underline">
            Upload scan
          </Link>
        </div>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                <th className="text-left px-4 py-2.5 font-medium">Last scan</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {scanTypes.map(type => {
                const latest = latestScans[type];
                const daysAgo = latest ? differenceInDays(today, new Date(latest)) : null;
                const stale = daysAgo === null || daysAgo > 30;
                return (
                  <tr key={type} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium capitalize">{type === "os" ? "OS / Host" : type === "webapp" ? "Web Application" : "Database"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {latest ? format(new Date(latest), "MMM d, yyyy") : "Never"}
                    </td>
                    <td className="px-4 py-2.5">
                      {stale ? (
                        <span className="flex items-center gap-1 text-destructive text-xs">
                          <Clock size={12} aria-hidden="true" />
                          {daysAgo === null ? "No scan" : `${daysAgo}d ago`}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle size={12} aria-hidden="true" />
                          {daysAgo}d ago
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
