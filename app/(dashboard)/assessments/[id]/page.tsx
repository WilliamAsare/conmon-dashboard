import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { format, differenceInDays } from "date-fns";
import { updateAssessmentStatus } from "../actions";
import type { Database } from "@/types/supabase";
import { EvidenceUploadWidget } from "@/app/(dashboard)/evidence/upload-widget";

type AssessmentDetail = {
  id: string;
  assessment_type: "annual" | "significant_change" | "focused";
  assessor_name: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  findings_count: number;
  report_url: string | null;
  notes: string | null;
  created_at: string;
  systems: { id: string; name: string; fedramp_level: string } | null;
  creator: { full_name: string } | null;
};

type AssessmentStatus = Database["public"]["Tables"]["assessments"]["Row"]["status"];

const TYPE_LABEL: Record<string, string> = {
  annual:             "Annual (3PAO)",
  significant_change: "Significant Change",
  focused:            "Focused Assessment",
};

const STATUS_STEPS: Array<{ key: string; label: string }> = [
  { key: "planned",     label: "Planned" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed",   label: "Completed" },
];

const NEXT_STATUS: Partial<Record<AssessmentStatus, AssessmentStatus>> = {
  planned:     "in_progress",
  in_progress: "completed",
};

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profileRaw } = await supabase
    .from("users").select("organization_id, role").eq("id", user.id).single();
  const orgProfile = profileRaw as { organization_id: string; role: string } | null;
  const role = orgProfile?.role ?? "";

  const { data: evidenceRaw } = await supabase
    .from("evidence_files")
    .select("id, file_name, file_path, file_size, mime_type, created_at, users:uploaded_by(full_name)")
    .eq("entity_type", "assessment")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const evidenceFiles = (evidenceRaw as unknown as Array<{
    id: string; file_name: string; file_path: string;
    file_size: number | null; mime_type: string | null;
    created_at: string; users: { full_name: string } | null;
  }>) ?? [];

  const { data: rawA, error } = await supabase
    .from("assessments")
    .select(`
      id, assessment_type, assessor_name, status,
      planned_start, planned_end, actual_start, actual_end,
      findings_count, report_url, notes, created_at,
      systems(id, name, fedramp_level),
      creator:created_by(full_name)
    `)
    .eq("id", id)
    .single();

  if (error || !rawA) notFound();

  const assessment = rawA as unknown as AssessmentDetail;
  const canEdit = ["admin", "issm", "isso"].includes(role);

  const nextStatus = NEXT_STATUS[assessment.status];
  const advanceAction = nextStatus
    ? updateAssessmentStatus.bind(null, assessment.id, nextStatus)
    : null;
  const cancelAction = assessment.status !== "completed" && assessment.status !== "cancelled"
    ? updateAssessmentStatus.bind(null, assessment.id, "cancelled" as AssessmentStatus)
    : null;

  // Which step are we on? (cancelled shows as planned step)
  const displayStatus = assessment.status === "cancelled" ? "planned" : assessment.status;
  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === displayStatus);

  const plannedDays = differenceInDays(
    new Date(assessment.planned_end),
    new Date(assessment.planned_start)
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/assessments" className="hover:underline">Assessments</Link>
          {assessment.systems && (
            <>
              {" / "}
              <Link href={`/systems/${assessment.systems.id}`} className="hover:underline">
                {assessment.systems.name}
              </Link>
            </>
          )}
        </p>
        <div className="flex items-start justify-between gap-4 mt-1">
          <h1 className="text-2xl font-semibold">
            {TYPE_LABEL[assessment.assessment_type] ?? assessment.assessment_type}
          </h1>
          {assessment.status === "cancelled" && (
            <span className="shrink-0 mt-1 text-xs font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              Cancelled
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Assessor: <span className="font-medium">{assessment.assessor_name}</span>
          {assessment.systems && (
            <> · {assessment.systems.name} ({assessment.systems.fedramp_level})</>
          )}
        </p>
      </div>

      {/* Status pipeline */}
      {assessment.status !== "cancelled" && (
        <section className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Progress</h2>
          <ol className="flex items-center gap-0">
            {STATUS_STEPS.map((step, i) => {
              const done    = i <= stepIndex;
              const current = i === stepIndex;
              return (
                <li key={step.key} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                      current ? "bg-primary text-primary-foreground border-primary" :
                      done    ? "bg-green-600 text-white border-green-600" :
                                "bg-muted text-muted-foreground border-border"
                    }`}>
                      {done && !current ? "✓" : i + 1}
                    </div>
                    <span className={`text-xs ${current ? "font-semibold" : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 -mt-5 ${i < stepIndex ? "bg-green-600" : "bg-border"}`} />
                  )}
                </li>
              );
            })}
          </ol>

          {canEdit && (advanceAction || cancelAction) && (
            <div className="mt-5 pt-4 border-t border-border flex gap-2">
              {advanceAction && (
                <form action={advanceAction}>
                  <button type="submit"
                    className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90">
                    Mark as {nextStatus === "in_progress" ? "In Progress" : "Completed"}
                  </button>
                </form>
              )}
              {cancelAction && (
                <form action={cancelAction}>
                  <button type="submit"
                    className="px-4 py-1.5 rounded-md border border-border text-sm hover:bg-accent text-destructive hover:text-destructive">
                    Cancel Assessment
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      )}

      {/* Details */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <Detail label="Planned Window">
            {format(new Date(assessment.planned_start), "MMM d")}
            {" – "}
            {format(new Date(assessment.planned_end), "MMM d, yyyy")}
            <span className="ml-1.5 text-xs text-muted-foreground">({plannedDays}d)</span>
          </Detail>

          {assessment.actual_start && (
            <Detail label="Actual Start">
              {format(new Date(assessment.actual_start), "MMM d, yyyy")}
            </Detail>
          )}
          {assessment.actual_end && (
            <Detail label="Actual End">
              {format(new Date(assessment.actual_end), "MMM d, yyyy")}
            </Detail>
          )}

          <Detail label="Findings">{assessment.findings_count}</Detail>
          <Detail label="Created">{format(new Date(assessment.created_at), "MMM d, yyyy")}</Detail>
          {assessment.creator && (
            <Detail label="Created by">{assessment.creator.full_name}</Detail>
          )}
        </div>

        {assessment.report_url && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">
              Assessment Report (SAR)
            </p>
            <a
              href={assessment.report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {assessment.report_url}
            </a>
          </div>
        )}

        {assessment.notes && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">Notes</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {assessment.notes}
            </p>
          </div>
        )}
      </section>

      {/* Evidence files (SAR, supporting docs) */}
      <section className="rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Assessment Documents</h2>
        <p className="text-xs text-muted-foreground">
          Attach the SAP, SAR, or supporting evidence for this assessment.
        </p>
        <EvidenceUploadWidget
          entityType="assessment"
          entityId={id}
          orgId={orgProfile?.organization_id ?? ""}
          canEdit={["admin", "issm", "isso"].includes(orgProfile?.role ?? "")}
          canDelete={["admin", "issm", "isso"].includes(orgProfile?.role ?? "")}
          existingFiles={evidenceFiles}
        />
      </section>

      {/* FedRAMP guidance */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-1">
        <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
          CA-2 Compliance Notes
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 mt-2 list-disc list-inside">
          <li>Annual assessments must be performed by an accredited 3PAO</li>
          <li>Significant changes require an impact analysis and potentially a focused assessment</li>
          <li>Assessment results must feed into POA&M items within 30 days of completion</li>
          <li>SAR (Security Assessment Report) must be submitted to FedRAMP PMO</li>
        </ul>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}
