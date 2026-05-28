import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { differenceInDays } from "date-fns";
import { Plus, AlertCircle, CheckCircle, Clock } from "lucide-react";
import type { Database } from "@/types/supabase";

export const metadata: Metadata = { title: "Systems" };

// Local row type.
// `as unknown as` cast is required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference. Removed once
// `supabase gen types` runs against the live database.
type SystemRow = Pick<
  Database["public"]["Tables"]["systems"]["Row"],
  "id" | "name" | "short_code" | "fedramp_level" | "ato_expiration" | "agency_sponsor" | "status"
>;

export default async function SystemsPage() {
  const supabase = await createClient();

  const { data: systemsRaw, error } = await supabase
    .from("systems")
    .select("id, name, short_code, fedramp_level, ato_expiration, agency_sponsor, status")
    .order("name");

  if (error) {
    throw new Error(`Failed to load systems: ${error.message}`);
  }

  const systems = systemsRaw as unknown as SystemRow[] | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Systems</h1>
          <p className="text-muted-foreground text-sm mt-1">
            FedRAMP-authorized systems under continuous monitoring
          </p>
        </div>
        <Link
          href="/systems/new"
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} aria-hidden="true" />
          Add system
        </Link>
      </div>

      {!systems || systems.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
          <p className="text-muted-foreground">No systems yet.</p>
          <Link
            href="/systems/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Add your first system
          </Link>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">System</th>
                <th className="text-left px-4 py-3 font-medium">Level</th>
                <th className="text-left px-4 py-3 font-medium">Agency</th>
                <th className="text-left px-4 py-3 font-medium">ATO expiration</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((system) => {
                const daysLeft = system.ato_expiration
                  ? differenceInDays(new Date(system.ato_expiration), new Date())
                  : null;

                return (
                  <tr key={system.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/systems/${system.id}`} className="font-medium hover:underline">
                        {system.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{system.short_code}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{system.fedramp_level}</td>
                    <td className="px-4 py-3 text-muted-foreground">{system.agency_sponsor ?? "—"}</td>
                    <td className="px-4 py-3">
                      {daysLeft === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : daysLeft < 0 ? (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertCircle size={13} aria-hidden="true" />
                          Expired
                        </span>
                      ) : daysLeft <= 90 ? (
                        <span className="flex items-center gap-1 text-[hsl(var(--severity-moderate))]">
                          <Clock size={13} aria-hidden="true" />
                          {daysLeft}d
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <CheckCircle size={13} aria-hidden="true" />
                          {system.ato_expiration}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        system.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {system.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
