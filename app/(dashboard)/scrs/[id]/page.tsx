import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { updateScrStatus } from "./actions";
import { CONTROL_MAP } from "@/lib/fedramp/controls";
import type { Database } from "@/types/supabase";

type ScrRow = Pick<
  Database["public"]["Tables"]["scrs"]["Row"],
  | "id" | "title" | "description" | "change_type" | "controls_impacted"
  | "status" | "submitted_date" | "approval_date" | "created_at" | "created_by"
> & { systems: { id: string; name: string } | null };

const STATUS_STEPS = ["draft", "submitted", "under_review", "approved"] as const;

export default async function ScrDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  const role = (profileRaw as unknown as { role: string } | null)?.role ?? "";

  const { data: scrRaw, error } = await supabase
    .from("scrs")
    .select("id, title, description, change_type, controls_impacted, status, submitted_date, approval_date, created_at, created_by, systems(id, name)")
    .eq("id", id)
    .single();

  if (error || !scrRaw) notFound();
  const scr = scrRaw as unknown as ScrRow;

  const canSubmit    = scr.status === "draft"        && scr.created_by === user.id;
  const canReview    = scr.status === "submitted"    && ["admin", "issm"].includes(role);
  const canWithdraw  = ["draft", "submitted"].includes(scr.status) && ["admin", "issm", "isso"].includes(role);

  const submitAction    = updateScrStatus.bind(null, id, "submitted");
  const approveAction   = updateScrStatus.bind(null, id, "approved");
  const rejectAction    = updateScrStatus.bind(null, id, "rejected");
  const withdrawAction  = updateScrStatus.bind(null, id, "withdrawn");
  const reviewAction    = updateScrStatus.bind(null, id, "under_review");

  const stepIndex = STATUS_STEPS.indexOf(scr.status as typeof STATUS_STEPS[number]);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/scrs" className="hover:underline">SCRs</Link> / {scr.title}
        </p>
        <h1 className="text-2xl font-semibold mt-1">{scr.title}</h1>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
          <span className="capitalize font-medium">{scr.change_type}</span>
          {scr.systems && (
            <Link href={`/systems/${scr.systems.id}`} className="hover:underline text-primary">
              {scr.systems.name}
            </Link>
          )}
          <span>Created {format(new Date(scr.created_at), "MMM d, yyyy")}</span>
        </div>
      </div>

      {/* Status pipeline */}
      <div className="flex items-center gap-0">
        {STATUS_STEPS.map((step, i) => {
          const past    = stepIndex > i;
          const current = stepIndex === i;
          const rejected = scr.status === "rejected";
          return (
            <div key={step} className="flex items-center flex-1">
              <div className={`flex-1 h-1.5 rounded-full ${
                past || current
                  ? rejected && current ? "bg-destructive" : "bg-primary"
                  : "bg-muted"
              }`} />
              <span className={`text-xs px-1 whitespace-nowrap font-medium ${
                current
                  ? rejected ? "text-destructive" : "text-primary"
                  : past ? "text-foreground" : "text-muted-foreground"
              }`}>
                {step.replace("_", " ")}
              </span>
            </div>
          );
        })}
        {scr.status === "rejected" && (
          <span className="text-xs text-destructive font-bold ml-2">Rejected</span>
        )}
        {scr.status === "withdrawn" && (
          <span className="text-xs text-muted-foreground font-bold ml-2">Withdrawn</span>
        )}
      </div>

      {/* Details */}
      <section className="rounded-lg border border-border p-5 space-y-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Description</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{scr.description}</p>
        </div>

        {scr.controls_impacted.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Controls Impacted</p>
            <div className="flex flex-wrap gap-1.5">
              {scr.controls_impacted.map((cId) => {
                const ctrl = CONTROL_MAP.get(cId);
                return (
                  <span
                    key={cId}
                    title={ctrl?.title}
                    className="text-xs font-mono rounded border border-border px-2 py-0.5 bg-muted"
                  >
                    {cId}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-border">
          {scr.submitted_date && (
            <div>
              <p className="text-xs text-muted-foreground">Submitted</p>
              <p>{format(new Date(scr.submitted_date), "MMM d, yyyy")}</p>
            </div>
          )}
          {scr.approval_date && (
            <div>
              <p className="text-xs text-muted-foreground">Approved</p>
              <p>{format(new Date(scr.approval_date), "MMM d, yyyy")}</p>
            </div>
          )}
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {canSubmit && (
          <form action={submitAction}>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
              Submit for Review
            </button>
          </form>
        )}
        {canReview && (
          <>
            <form action={reviewAction}>
              <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent">
                Mark Under Review
              </button>
            </form>
            <form action={approveAction}>
              <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700">
                Approve
              </button>
            </form>
            <form action={rejectAction}>
              <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10">
                Reject
              </button>
            </form>
          </>
        )}
        {scr.status === "under_review" && ["admin", "issm"].includes(role) && (
          <>
            <form action={approveAction}>
              <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700">
                Approve
              </button>
            </form>
            <form action={rejectAction}>
              <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10">
                Reject
              </button>
            </form>
          </>
        )}
        {canWithdraw && (
          <form action={withdrawAction}>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md border border-border text-muted-foreground hover:bg-accent">
              Withdraw
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
