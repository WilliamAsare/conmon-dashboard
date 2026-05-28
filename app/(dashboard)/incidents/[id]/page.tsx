import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { format, differenceInHours, differenceInMinutes } from "date-fns";
import { updateIncidentStatus } from "../actions";
import { CONTROL_MAP } from "@/lib/fedramp/controls";

type IncidentDetail = {
  id: string;
  title: string;
  description: string;
  severity: "high" | "moderate" | "low";
  status: "open" | "investigating" | "contained" | "resolved" | "closed";
  detected_at: string;
  reported_at: string;
  contained_at: string | null;
  resolved_at: string | null;
  reported_within_sla: boolean;
  affected_controls: string[];
  notes: string | null;
  created_at: string;
  systems: { id: string; name: string } | null;
  users: { full_name: string } | null;
};

const SEV_COLOR: Record<string, string> = {
  high:     "text-red-600 bg-red-50 border-red-200",
  moderate: "text-yellow-700 bg-yellow-50 border-yellow-200",
  low:      "text-blue-600 bg-blue-50 border-blue-200",
};

const STATUS_STEPS: Array<{ key: string; label: string }> = [
  { key: "open",          label: "Open" },
  { key: "investigating", label: "Investigating" },
  { key: "contained",     label: "Contained" },
  { key: "resolved",      label: "Resolved" },
  { key: "closed",        label: "Closed" },
];

type IncidentStatus = "open" | "investigating" | "contained" | "resolved" | "closed";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profileRaw } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  const role = (profileRaw as unknown as { role: string } | null)?.role ?? "";

  const { data: rawInc, error } = await supabase
    .from("incidents")
    .select(`
      id, title, description, severity, status,
      detected_at, reported_at, contained_at, resolved_at,
      reported_within_sla, affected_controls, notes, created_at,
      systems(id, name),
      users:reported_by(full_name)
    `)
    .eq("id", id)
    .single();

  if (error || !rawInc) notFound();

  const inc = rawInc as unknown as IncidentDetail;

  const canEdit = ["admin", "issm", "isso", "engineer"].includes(role);
  const statusIndex = STATUS_STEPS.findIndex((s) => s.key === inc.status);

  const reportingMinutes = differenceInMinutes(
    new Date(inc.reported_at),
    new Date(inc.detected_at)
  );
  const reportingHours = differenceInHours(
    new Date(inc.reported_at),
    new Date(inc.detected_at)
  );

  const NEXT_STATUSES: Partial<Record<IncidentStatus, IncidentStatus>> = {
    open:          "investigating",
    investigating: "contained",
    contained:     "resolved",
    resolved:      "closed",
  };

  const nextStatus = NEXT_STATUSES[inc.status as IncidentStatus];

  const advanceAction = nextStatus
    ? updateIncidentStatus.bind(null, inc.id, nextStatus)
    : null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb + header */}
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/incidents" className="hover:underline">Incidents</Link>
          {inc.systems && (
            <>
              {" / "}
              <Link href={`/systems/${inc.systems.id}`} className="hover:underline">
                {inc.systems.name}
              </Link>
            </>
          )}
        </p>
        <div className="flex items-start justify-between gap-4 mt-1">
          <h1 className="text-2xl font-semibold">{inc.title}</h1>
          <span className={`shrink-0 mt-1 text-xs font-bold px-2 py-0.5 rounded border capitalize ${SEV_COLOR[inc.severity] ?? ""}`}>
            {inc.severity}
          </span>
        </div>
      </div>

      {/* SLA banner */}
      <div className={`rounded-lg p-4 flex items-center gap-3 ${
        inc.reported_within_sla
          ? "bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800"
          : "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800"
      }`}>
        <span className="text-xl">{inc.reported_within_sla ? "✓" : "✗"}</span>
        <div>
          <p className={`font-semibold text-sm ${inc.reported_within_sla ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
            {inc.reported_within_sla
              ? `Reported within SLA — ${reportingMinutes < 60 ? `${reportingMinutes}m` : `${reportingHours}h ${reportingMinutes % 60}m`} after detection`
              : `SLA BREACH — Reported ${reportingHours}h ${reportingMinutes % 60}m after detection (limit: 1 hour)`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            FedRAMP IR-6: incidents must be reported to US-CERT/CISA within 1 hour of detection.
          </p>
        </div>
      </div>

      {/* Status pipeline */}
      <section className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-semibold mb-4">Status Pipeline</h2>
        <ol className="flex items-center gap-0">
          {STATUS_STEPS.map((step, i) => {
            const done    = i <= statusIndex;
            const current = i === statusIndex;
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
                  <span className={`text-xs text-center ${current ? "font-semibold" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 -mt-5 ${i < statusIndex ? "bg-green-600" : "bg-border"}`} />
                )}
              </li>
            );
          })}
        </ol>

        {canEdit && advanceAction && (
          <div className="mt-5 pt-4 border-t border-border">
            <form action={advanceAction}>
              <button type="submit"
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90">
                Mark as {STATUS_STEPS.find((s) => s.key === nextStatus)?.label}
              </button>
            </form>
          </div>
        )}
      </section>

      {/* Details grid */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <Detail label="System">
            {inc.systems
              ? <Link href={`/systems/${inc.systems.id}`} className="text-primary hover:underline">{inc.systems.name}</Link>
              : "—"}
          </Detail>
          <Detail label="Reported by">{inc.users?.full_name ?? "System"}</Detail>
          <Detail label="Detected">
            {format(new Date(inc.detected_at), "MMM d, yyyy HH:mm")}
          </Detail>
          <Detail label="Reported">
            {format(new Date(inc.reported_at), "MMM d, yyyy HH:mm")}
          </Detail>
          {inc.contained_at && (
            <Detail label="Contained">
              {format(new Date(inc.contained_at), "MMM d, yyyy HH:mm")}
            </Detail>
          )}
          {inc.resolved_at && (
            <Detail label="Resolved">
              {format(new Date(inc.resolved_at), "MMM d, yyyy HH:mm")}
            </Detail>
          )}
        </div>

        {inc.description && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">Description</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{inc.description}</p>
          </div>
        )}

        {inc.notes && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">Notes</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{inc.notes}</p>
          </div>
        )}
      </section>

      {/* Affected controls */}
      {inc.affected_controls.length > 0 && (
        <section className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-3">Affected Controls</h2>
          <div className="flex flex-wrap gap-2">
            {inc.affected_controls.map((ctrl) => {
              const info = CONTROL_MAP.get(ctrl);
              return (
                <span
                  key={ctrl}
                  title={info?.title ?? ctrl}
                  className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-mono font-medium border border-border"
                >
                  {ctrl}
                  {info && <span className="ml-1.5 font-sans font-normal text-muted-foreground">{info.title}</span>}
                </span>
              );
            })}
          </div>
        </section>
      )}
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
