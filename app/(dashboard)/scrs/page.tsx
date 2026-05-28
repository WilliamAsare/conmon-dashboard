import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import type { Database } from "@/types/supabase";

type ScrRow = Pick<
  Database["public"]["Tables"]["scrs"]["Row"],
  "id" | "title" | "change_type" | "status" | "submitted_date" | "created_at"
> & { systems: { name: string } | null };

const STATUS_COLOR: Record<string, string> = {
  draft:        "text-muted-foreground",
  submitted:    "text-[hsl(var(--severity-moderate))]",
  under_review: "text-[hsl(var(--severity-moderate))]",
  approved:     "text-[hsl(var(--severity-low))]",
  rejected:     "text-destructive",
  withdrawn:    "text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  draft:        "Draft",
  submitted:    "Submitted",
  under_review: "Under Review",
  approved:     "Approved",
  rejected:     "Rejected",
  withdrawn:    "Withdrawn",
};

export default async function ScrsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: scrsRaw } = await supabase
    .from("scrs")
    .select("id, title, change_type, status, submitted_date, created_at, systems(name)")
    .order("created_at", { ascending: false });

  const scrs = (scrsRaw as unknown as ScrRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Significant Change Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track and manage FedRAMP SCRs across all systems.
          </p>
        </div>
        <Link
          href="/scrs/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New SCR
        </Link>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Title", "System", "Change Type", "Status", "Submitted", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scrs.map((scr) => (
              <tr key={scr.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{scr.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{scr.systems?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground capitalize">{scr.change_type}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold uppercase ${STATUS_COLOR[scr.status] ?? ""}`}>
                    {STATUS_LABEL[scr.status] ?? scr.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {scr.submitted_date ? format(new Date(scr.submitted_date), "MMM d, yyyy") : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/scrs/${scr.id}`} className="text-xs text-primary hover:underline">View →</Link>
                </td>
              </tr>
            ))}
            {scrs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No SCRs yet.{" "}
                  <Link href="/scrs/new" className="text-primary hover:underline">Create the first one →</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
