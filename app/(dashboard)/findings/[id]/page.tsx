import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import type { Database } from "@/types/supabase";
import { CONTROL_MAP } from "@/lib/fedramp/controls";

// Local row types.
// `as unknown as` casts required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference.
type FindingDetail = Pick<
  Database["public"]["Tables"]["findings"]["Row"],
  | "id"
  | "plugin_id"
  | "title"
  | "description"
  | "cvss_score"
  | "severity"
  | "affected_asset"
  | "first_detected"
  | "last_detected"
  | "status"
  | "control_ids"
  | "created_at"
> & {
  systems: Pick<
    Database["public"]["Tables"]["systems"]["Row"],
    "id" | "name"
  > | null;
  scans: Pick<
    Database["public"]["Tables"]["scans"]["Row"],
    "id" | "scan_type" | "scanner_name" | "scan_date"
  > | null;
};

type PoamRow = Pick<
  Database["public"]["Tables"]["poam_items"]["Row"],
  "id" | "poam_number" | "status" | "sla_status" | "days_to_sla" | "scheduled_completion"
>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("findings")
    .select("title")
    .eq("id", id)
    .single();
  const row = data as unknown as { title: string } | null;
  return { title: row?.title ?? "Finding" };
}

const SEVERITY_BADGE: Record<string, string> = {
  high:          "bg-[hsl(var(--severity-high))]/15 text-[hsl(var(--severity-high))] border-[hsl(var(--severity-high))]/30",
  moderate:      "bg-[hsl(var(--severity-moderate))]/15 text-[hsl(var(--severity-moderate))] border-[hsl(var(--severity-moderate))]/30",
  low:           "bg-[hsl(var(--severity-low))]/15 text-[hsl(var(--severity-low))] border-[hsl(var(--severity-low))]/30",
  informational: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<string, string> = {
  open:               "Open",
  remediated:         "Remediated",
  deviation_pending:  "Deviation Pending",
  deviation_approved: "Deviation Approved",
  risk_accepted:      "Risk Accepted",
};

const SCAN_TYPE_LABEL: Record<string, string> = {
  os:       "OS / Host",
  webapp:   "Web Application",
  database: "Database",
};

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: findingRaw, error } = await supabase
    .from("findings")
    .select(`
      id, plugin_id, title, description, cvss_score, severity,
      affected_asset, first_detected, last_detected, status, control_ids, created_at,
      systems ( id, name ),
      scans ( id, scan_type, scanner_name, scan_date )
    `)
    .eq("id", id)
    .single();

  if (error || !findingRaw) notFound();

  const finding = findingRaw as unknown as FindingDetail;

  // Fetch linked POA&M (if any)
  const { data: poamRaw } = await supabase
    .from("poam_items")
    .select("id, poam_number, status, sla_status, days_to_sla, scheduled_completion")
    .eq("finding_id", id)
    .maybeSingle();

  const poam = poamRaw as unknown as PoamRow | null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/findings" className="hover:underline">Findings</Link>
          {finding.systems && (
            <>
              {" / "}
              <Link href={`/systems/${finding.systems.id}`} className="hover:underline">
                {finding.systems.name}
              </Link>
            </>
          )}
        </p>
        <h1 className="text-2xl font-semibold mt-1">{finding.title}</h1>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_BADGE[finding.severity] ?? ""}`}>
            {finding.severity}
          </span>
          {finding.cvss_score !== null && (
            <span className="text-xs text-muted-foreground">CVSS {finding.cvss_score.toFixed(1)}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {STATUS_LABEL[finding.status] ?? finding.status}
          </span>
        </div>
      </div>

      {/* Details */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <Detail label="Plugin ID">
            <span className="font-mono">{finding.plugin_id}</span>
          </Detail>
          <Detail label="Affected asset">
            <span className="font-mono text-xs">{finding.affected_asset}</span>
          </Detail>
          {finding.systems && (
            <Detail label="System">
              <Link href={`/systems/${finding.systems.id}`} className="text-primary hover:underline">
                {finding.systems.name}
              </Link>
            </Detail>
          )}
          <Detail label="First detected">
            {format(new Date(finding.first_detected), "MMM d, yyyy")}
          </Detail>
          <Detail label="Last seen">
            {format(new Date(finding.last_detected), "MMM d, yyyy")}
          </Detail>
          <Detail label="Status">
            <span className="capitalize">{STATUS_LABEL[finding.status] ?? finding.status}</span>
          </Detail>
          {finding.scans && (
            <>
              <Detail label="Scanner">
                {finding.scans.scanner_name}
              </Detail>
              <Detail label="Scan type">
                {SCAN_TYPE_LABEL[finding.scans.scan_type] ?? finding.scans.scan_type}
              </Detail>
              <Detail label="Scan date">
                {format(new Date(finding.scans.scan_date), "MMM d, yyyy")}
              </Detail>
            </>
          )}
        </div>

        {finding.description && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">
              Description
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {finding.description}
            </p>
          </div>
        )}
      </section>

      {/* NIST 800-53 Control Mapping */}
      {finding.control_ids && finding.control_ids.length > 0 && (
        <section aria-labelledby="controls-heading">
          <h2 id="controls-heading" className="text-base font-semibold mb-3">
            NIST 800-53 Controls
          </h2>
          <div className="rounded-lg border border-border p-4 flex flex-wrap gap-2">
            {finding.control_ids.map((ctrl) => {
              const info = CONTROL_MAP.get(ctrl);
              return (
                <span
                  key={ctrl}
                  title={info?.title ?? ctrl}
                  className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs border border-border"
                >
                  <span className="font-mono font-semibold">{ctrl}</span>
                  {info && (
                    <span className="text-muted-foreground">{info.title}</span>
                  )}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* Linked POA&M */}
      {poam && (
        <section aria-labelledby="poam-heading">
          <h2 id="poam-heading" className="text-base font-semibold mb-3">
            Linked POA&amp;M
          </h2>
          <div className="rounded-lg border border-border p-4 flex items-center justify-between gap-4">
            <div>
              <Link
                href={`/poams/${poam.id}`}
                className="font-mono text-sm font-medium text-primary hover:underline"
              >
                {poam.poam_number}
              </Link>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                {poam.status.replace(/_/g, " ")} ·{" "}
                {poam.sla_status === "overdue"
                  ? `${Math.abs(poam.days_to_sla ?? 0)}d overdue`
                  : poam.sla_status === "warning"
                  ? `${poam.days_to_sla}d to SLA`
                  : poam.sla_status === "ok"
                  ? `${poam.days_to_sla}d to SLA`
                  : "No SLA"}
                {" · Sched. "}{format(new Date(poam.scheduled_completion), "MMM d, yyyy")}
              </p>
            </div>
            <Link
              href={`/poams/${poam.id}`}
              className="shrink-0 text-xs text-primary hover:underline"
            >
              View POA&amp;M →
            </Link>
          </div>
        </section>
      )}

      {/* No POA&M — informational findings don't get one */}
      {!poam && finding.severity !== "informational" && finding.status === "open" && (
        <p className="text-xs text-muted-foreground">
          No POA&amp;M linked. If this finding was uploaded via a scan, a POA&amp;M should have been created automatically.
          Check the{" "}
          <Link href="/poams" className="text-primary hover:underline">
            POA&amp;Ms list
          </Link>.
        </p>
      )}
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}
