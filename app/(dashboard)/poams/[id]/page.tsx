import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { AlertCircle, Clock, Edit, GitBranch } from "lucide-react";
import type { Database } from "@/types/supabase";
import type { Json } from "@/types/supabase";
import { AddMilestoneForm } from "./add-milestone-form";
import { MilestoneItem } from "./milestone-item";
import { parseMilestones, updatePoamStatus } from "./actions";
import { EvidenceUploadWidget } from "@/app/(dashboard)/evidence/upload-widget";

// Local row types.
// `as unknown as` casts required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference.
type PoamDetail = Database["public"]["Tables"]["poam_items"]["Row"] & {
  systems: Pick<
    Database["public"]["Tables"]["systems"]["Row"],
    "id" | "name" | "short_code"
  > | null;
  findings: Pick<
    Database["public"]["Tables"]["findings"]["Row"],
    | "id"
    | "plugin_id"
    | "title"
    | "affected_asset"
    | "cvss_score"
    | "severity"
    | "first_detected"
    | "last_detected"
    | "status"
  > | null;
};

type DeviationRow = Pick<
  Database["public"]["Tables"]["deviation_requests"]["Row"],
  "id" | "deviation_type" | "status" | "requested_date" | "review_notes"
>;

const SEVERITY_BADGE: Record<string, string> = {
  high:          "bg-[hsl(var(--severity-high))]/15 text-[hsl(var(--severity-high))] border-[hsl(var(--severity-high))]/30",
  moderate:      "bg-[hsl(var(--severity-moderate))]/15 text-[hsl(var(--severity-moderate))] border-[hsl(var(--severity-moderate))]/30",
  low:           "bg-[hsl(var(--severity-low))]/15 text-[hsl(var(--severity-low))] border-[hsl(var(--severity-low))]/30",
  informational: "bg-muted text-muted-foreground border-border",
};

const DEVIATION_LABEL: Record<string, string> = {
  RA: "Risk Adjustment",
  FP: "False Positive",
  OR: "Operational Requirement",
};

const DEVIATION_STATUS_CLASS: Record<string, string> = {
  draft:     "text-muted-foreground",
  submitted: "text-[hsl(var(--severity-moderate))]",
  approved:  "text-green-600",
  rejected:  "text-destructive",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("poam_items")
    .select("poam_number")
    .eq("id", id)
    .single();
  const row = data as unknown as { poam_number: string } | null;
  return { title: row?.poam_number ?? "POA&M" };
}

export default async function PoamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: poamRaw, error } = await supabase
    .from("poam_items")
    .select(`
      id, poam_number, weakness_description, source, severity, status,
      sla_status, days_to_sla, identified_date, scheduled_completion,
      actual_completion, milestones, point_of_contact, resources_required,
      created_at, updated_at, finding_id,
      systems ( id, name, short_code ),
      findings ( id, plugin_id, title, affected_asset, cvss_score, severity, first_detected, last_detected, status )
    `)
    .eq("id", id)
    .single();

  if (error || !poamRaw) notFound();

  const poam = poamRaw as unknown as PoamDetail;

  const { data: devsRaw } = await supabase
    .from("deviation_requests")
    .select("id, deviation_type, status, requested_date, review_notes")
    .eq("poam_id", id)
    .order("requested_date", { ascending: false });

  const deviations = (devsRaw as unknown as DeviationRow[] | null) ?? [];

  // Evidence files for this POA&M
  const { data: evidenceRaw } = await supabase
    .from("evidence_files")
    .select("id, file_name, file_path, file_size, mime_type, created_at, users:uploaded_by(full_name)")
    .eq("entity_type", "poam_item")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const evidenceFiles = (evidenceRaw as unknown as Array<{
    id: string; file_name: string; file_path: string;
    file_size: number | null; mime_type: string | null;
    created_at: string; users: { full_name: string } | null;
  }>) ?? [];

  // Get org_id for the upload widget path
  const { data: profileRaw } = await supabase
    .from("users").select("organization_id, role").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").single();
  const orgProfile = profileRaw as { organization_id: string; role: string } | null;

  const milestones = parseMilestones(poam.milestones as unknown as Json);
  const isActive   = poam.status === "open" || poam.status === "ongoing";

  // Pre-bind status update actions for use as form actions
  const setOngoing  = updatePoamStatus.bind(null, id, "ongoing");
  const setComplete = updatePoamStatus.bind(null, id, "completed");
  const setOpen     = updatePoamStatus.bind(null, id, "open");

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/poams" className="hover:underline">POA&amp;Ms</Link>
            {poam.systems && (
              <>
                {" / "}
                <Link href={`/systems/${poam.systems.id}`} className="hover:underline">
                  {poam.systems.name}
                </Link>
              </>
            )}
          </p>
          <h1 className="text-2xl font-semibold font-mono mt-1">{poam.poam_number}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
            {poam.weakness_description}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Link
            href={`/poams/${id}/edit`}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <Edit size={13} aria-hidden="true" />
            Edit
          </Link>
          {isActive && (
            <Link
              href={`/poams/${id}/deviation/new`}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              <GitBranch size={13} aria-hidden="true" />
              Request deviation
            </Link>
          )}
        </div>
      </div>

      {/* SLA alert */}
      {isActive &&
        poam.sla_status !== "not_applicable" &&
        poam.sla_status !== "ok" && (
          <div
            className={`rounded-lg border p-3 flex items-center gap-3 ${
              poam.sla_status === "overdue"
                ? "border-destructive/50 bg-destructive/5"
                : "border-[hsl(var(--severity-moderate))]/50 bg-[hsl(var(--severity-moderate))]/5"
            }`}
          >
            {poam.sla_status === "overdue" ? (
              <AlertCircle size={16} className="text-destructive shrink-0" aria-hidden="true" />
            ) : (
              <Clock size={16} className="text-[hsl(var(--severity-moderate))] shrink-0" aria-hidden="true" />
            )}
            <p className="text-sm">
              {poam.sla_status === "overdue"
                ? `SLA exceeded by ${poam.days_to_sla !== null ? Math.abs(poam.days_to_sla) : "?"} days. Remediation is overdue.`
                : `SLA deadline in ${poam.days_to_sla} days. Schedule remediation soon.`}
            </p>
          </div>
        )}

      {/* Details */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <Detail label="Source">
            <span className="capitalize">{poam.source.replace(/_/g, " ")}</span>
          </Detail>
          <Detail label="Severity">
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_BADGE[poam.severity] ?? ""}`}>
              {poam.severity}
            </span>
          </Detail>
          <Detail label="Status">
            <span className="capitalize">{poam.status.replace(/_/g, " ")}</span>
          </Detail>
          <Detail label="Identified">
            {format(new Date(poam.identified_date), "MMM d, yyyy")}
          </Detail>
          <Detail label="Sched. Completion">
            {format(new Date(poam.scheduled_completion), "MMM d, yyyy")}
          </Detail>
          {poam.actual_completion && (
            <Detail label="Actual Completion">
              {format(new Date(poam.actual_completion), "MMM d, yyyy")}
            </Detail>
          )}
          {poam.point_of_contact && (
            <Detail label="Point of Contact">{poam.point_of_contact}</Detail>
          )}
          {poam.resources_required && (
            <div className="col-span-2 sm:col-span-3">
              <Detail label="Resources Required">{poam.resources_required}</Detail>
            </div>
          )}
        </div>

        {/* Status actions */}
        <div className="flex gap-2 pt-2 border-t border-border flex-wrap">
          {poam.status === "open" && (
            <form action={setOngoing}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              >
                Mark as Ongoing
              </button>
            </form>
          )}
          {(poam.status === "open" || poam.status === "ongoing") && (
            <form action={setComplete}>
              <button
                type="submit"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Mark as Completed
              </button>
            </form>
          )}
          {(poam.status === "completed" || poam.status === "risk_accepted") && (
            <form action={setOpen}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              >
                Reopen
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Linked finding */}
      {poam.findings && (
        <section aria-labelledby="finding-heading">
          <h2 id="finding-heading" className="text-base font-semibold mb-3">
            Linked Finding
          </h2>
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">{poam.findings.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Plugin {poam.findings.plugin_id} &middot; {poam.findings.affected_asset}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {poam.findings.cvss_score !== null && (
                  <span className="text-xs text-muted-foreground">
                    CVSS {poam.findings.cvss_score.toFixed(1)}
                  </span>
                )}
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_BADGE[poam.findings.severity] ?? ""}`}>
                  {poam.findings.severity}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              First detected: {format(new Date(poam.findings.first_detected), "MMM d, yyyy")}
              {" · "}
              Last seen: {format(new Date(poam.findings.last_detected), "MMM d, yyyy")}
            </p>
          </div>
        </section>
      )}

      {/* Milestones */}
      <section aria-labelledby="milestones-heading">
        <h2 id="milestones-heading" className="text-base font-semibold mb-3">
          Milestones
        </h2>
        <div className="space-y-2">
          {milestones.length === 0 && (
            <p className="text-sm text-muted-foreground py-1">
              No milestones yet.{isActive && " Add one below."}
            </p>
          )}
          {milestones.map((m) => (
            <MilestoneItem
              key={m.id}
              poamId={id}
              milestone={m}
              editable={isActive}
            />
          ))}
          {isActive && <AddMilestoneForm poamId={id} />}
        </div>
      </section>

      {/* Deviation requests */}
      <section aria-labelledby="deviations-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="deviations-heading" className="text-base font-semibold">
            Deviation Requests
          </h2>
          {isActive && (
            <Link href={`/poams/${id}/deviation/new`} className="text-sm text-primary hover:underline">
              + New request
            </Link>
          )}
        </div>
        {deviations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No deviation requests for this POA&amp;M.
          </p>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Requested</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Review notes</th>
                </tr>
              </thead>
              <tbody>
                {deviations.map((dev) => (
                  <tr key={dev.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-xs">
                      {DEVIATION_LABEL[dev.deviation_type] ?? dev.deviation_type}
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-medium capitalize ${DEVIATION_STATUS_CLASS[dev.status] ?? ""}`}>
                      {dev.status}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {format(new Date(dev.requested_date), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell max-w-xs truncate">
                      {dev.review_notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Evidence files */}
      <section className="rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Evidence Files</h2>
        <p className="text-xs text-muted-foreground">
          Attach screenshots, reports, or other artifacts supporting this POA&amp;M item.
        </p>
        <EvidenceUploadWidget
          entityType="poam_item"
          entityId={id}
          orgId={orgProfile?.organization_id ?? ""}
          canEdit={["admin", "issm", "isso", "engineer"].includes(orgProfile?.role ?? "")}
          canDelete={["admin", "issm", "isso"].includes(orgProfile?.role ?? "")}
          existingFiles={evidenceFiles}
        />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper component for the detail grid cells
// ---------------------------------------------------------------------------
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        {label}
      </p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}
