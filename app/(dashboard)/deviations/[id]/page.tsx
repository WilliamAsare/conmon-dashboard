import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import type { Database } from "@/types/supabase";
import { ReviewForm } from "./review-form";
import {
  DEVIATION_LABEL,
  DEVIATION_DESCRIPTION,
} from "@/lib/fedramp/deviations";

export const metadata: Metadata = { title: "Deviation Request" };

// Local row types.
// `as unknown as` casts required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference.
type DeviationDetail = Pick<
  Database["public"]["Tables"]["deviation_requests"]["Row"],
  | "id"
  | "deviation_type"
  | "justification"
  | "status"
  | "requested_date"
  | "review_date"
  | "review_notes"
> & {
  poam_items: (Pick<
    Database["public"]["Tables"]["poam_items"]["Row"],
    "id" | "poam_number" | "weakness_description" | "severity"
  > & {
    systems: Pick<
      Database["public"]["Tables"]["systems"]["Row"],
      "id" | "name"
    > | null;
  }) | null;
  requester: { id: string; full_name: string } | null;
  reviewer:  { id: string; full_name: string } | null;
};

type UserRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "role"
>;

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle; className: string }
> = {
  draft:     { label: "Draft",     icon: Clock,        className: "text-muted-foreground" },
  submitted: { label: "Submitted", icon: Clock,        className: "text-[hsl(var(--severity-moderate))]" },
  approved:  { label: "Approved",  icon: CheckCircle,  className: "text-green-600" },
  rejected:  { label: "Rejected",  icon: XCircle,      className: "text-destructive" },
};

const SEVERITY_BADGE: Record<string, string> = {
  high:          "bg-[hsl(var(--severity-high))]/15 text-[hsl(var(--severity-high))] border-[hsl(var(--severity-high))]/30",
  moderate:      "bg-[hsl(var(--severity-moderate))]/15 text-[hsl(var(--severity-moderate))] border-[hsl(var(--severity-moderate))]/30",
  low:           "bg-[hsl(var(--severity-low))]/15 text-[hsl(var(--severity-low))] border-[hsl(var(--severity-low))]/30",
  informational: "bg-muted text-muted-foreground border-border",
};

export default async function DeviationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: profileRaw } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserRow | null;

  const { data: devRaw, error } = await supabase
    .from("deviation_requests")
    .select(`
      id, deviation_type, justification, status,
      requested_date, review_date, review_notes,
      poam_items (
        id, poam_number, weakness_description, severity,
        systems ( id, name )
      ),
      requester:users!requested_by ( id, full_name ),
      reviewer:users!reviewer_id ( id, full_name )
    `)
    .eq("id", id)
    .single();

  if (error || !devRaw) notFound();

  const dev = devRaw as unknown as DeviationDetail;

  const statusConfig = STATUS_CONFIG[dev.status] ?? STATUS_CONFIG["submitted"]!;
  const StatusIcon   = statusConfig.icon;

  // Only ISSM/admin can review; only review submitted requests
  const canReview =
    !!profile &&
    ["admin", "issm"].includes(profile.role) &&
    dev.status === "submitted";

  // Render justification fields based on deviation type
  const justification = dev.justification as Record<string, string> | null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/deviations" className="hover:underline">
            Deviations
          </Link>
          {dev.poam_items?.systems && (
            <>
              {" / "}
              <Link
                href={`/systems/${dev.poam_items.systems.id}`}
                className="hover:underline"
              >
                {dev.poam_items.systems.name}
              </Link>
            </>
          )}
        </p>
        <h1 className="text-2xl font-semibold mt-1">
          {DEVIATION_LABEL[dev.deviation_type] ?? dev.deviation_type} Request
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {DEVIATION_DESCRIPTION[dev.deviation_type as "RA" | "FP" | "OR"]}
        </p>
      </div>

      {/* Status banner */}
      <div
        className={`rounded-lg border p-3 flex items-center gap-3 ${
          dev.status === "approved"
            ? "border-green-600/30 bg-green-50"
            : dev.status === "rejected"
            ? "border-destructive/30 bg-destructive/5"
            : "border-[hsl(var(--severity-moderate))]/30 bg-[hsl(var(--severity-moderate))]/5"
        }`}
      >
        <StatusIcon size={16} className={`shrink-0 ${statusConfig.className}`} aria-hidden="true" />
        <div>
          <p className={`text-sm font-medium ${statusConfig.className}`}>
            {statusConfig.label}
          </p>
          {dev.review_date && (
            <p className="text-xs text-muted-foreground">
              Reviewed {format(new Date(dev.review_date), "MMMM d, yyyy")}
              {dev.reviewer && ` by ${dev.reviewer.full_name}`}
            </p>
          )}
          {dev.review_notes && (
            <p className="text-xs text-muted-foreground mt-0.5 italic">
              &ldquo;{dev.review_notes}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Context */}
      <section className="rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Context</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {dev.poam_items && (
            <>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">POA&amp;M</p>
                <Link
                  href={`/poams/${dev.poam_items.id}`}
                  className="mt-0.5 font-mono text-sm text-primary hover:underline"
                >
                  {dev.poam_items.poam_number}
                </Link>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Weakness</p>
                <p className="mt-0.5 text-sm line-clamp-2">{dev.poam_items.weakness_description}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Severity</p>
                <span className={`mt-0.5 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_BADGE[dev.poam_items.severity] ?? ""}`}>
                  {dev.poam_items.severity}
                </span>
              </div>
            </>
          )}
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Requested by</p>
            <p className="mt-0.5">{dev.requester?.full_name ?? "Unknown"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Requested on</p>
            <p className="mt-0.5">{format(new Date(dev.requested_date), "MMM d, yyyy")}</p>
          </div>
        </div>
      </section>

      {/* Justification */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <h2 className="text-sm font-semibold">
          Justification — {DEVIATION_LABEL[dev.deviation_type] ?? dev.deviation_type}
        </h2>

        {dev.deviation_type === "RA" && justification && (
          <>
            <JustificationField label="Operational context" value={justification["operational_context"]} />
            <JustificationField label="Compensating controls" value={justification["compensating_controls"]} />
            <JustificationField label="Residual risk statement" value={justification["residual_risk_statement"]} />
          </>
        )}

        {dev.deviation_type === "FP" && justification && (
          <>
            <JustificationField label="Technical justification" value={justification["technical_justification"]} />
            <JustificationField label="Evidence description" value={justification["evidence_description"]} />
          </>
        )}

        {dev.deviation_type === "OR" && justification && (
          <>
            <JustificationField label="Business justification" value={justification["business_justification"]} />
            <JustificationField label="Impact if remediated" value={justification["impact_if_remediated"]} />
            <JustificationField label="Compensating controls" value={justification["compensating_controls"]} />
            {justification["expected_resolution_date"] && (
              <JustificationField
                label="Expected resolution date"
                value={format(new Date(justification["expected_resolution_date"]), "MMMM d, yyyy")}
              />
            )}
          </>
        )}
      </section>

      {/* Review form */}
      <ReviewForm deviationId={id} canReview={canReview} />
    </div>
  );
}

function JustificationField({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}
