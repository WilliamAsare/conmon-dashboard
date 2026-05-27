import { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SystemCard } from "@/components/system-card";
import type { Database } from "@/types/supabase";

export const metadata: Metadata = {
  title: "Dashboard",
};

// Explicit types for the dashboard query result.
// The Supabase client can't infer nested join types from the placeholder type file;
// this will be replaced by the generated inference once `supabase gen types` runs.
type SystemRow = Database["public"]["Tables"]["systems"]["Row"];
type ScanRow = Database["public"]["Tables"]["scans"]["Row"];
type PoamRow = Database["public"]["Tables"]["poam_items"]["Row"];

type DashboardSystem = Pick<
  SystemRow,
  "id" | "name" | "short_code" | "fedramp_level" | "ato_expiration" | "agency_sponsor" | "status"
> & {
  scans: Pick<ScanRow, "scan_type" | "scan_date">[];
  poam_items: Pick<
    PoamRow,
    "id" | "severity" | "status" | "sla_status" | "scheduled_completion"
  >[];
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  // The `as unknown as` cast is intentional here: the placeholder types/supabase.ts
  // does not include relationship definitions (Relationships[]), so the Supabase
  // client cannot infer nested join shapes. The cast is safe because the select
  // string exactly matches the DashboardSystem shape above.
  // This cast is removed once `supabase gen types typescript` runs against the
  // live database and replaces types/supabase.ts.
  const { data, error } = await supabase
    .from("systems")
    .select(`
      id,
      name,
      short_code,
      fedramp_level,
      ato_expiration,
      agency_sponsor,
      status,
      scans (
        scan_type,
        scan_date
      ),
      poam_items (
        id,
        severity,
        status,
        sla_status,
        scheduled_completion
      )
    `)
    .eq("status", "active")
    .order("name");

  const systems = data as unknown as DashboardSystem[] | null;

  if (error) {
    throw new Error(`Failed to load systems: ${error.message}`);
  }

  if (!systems || systems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <h2 className="text-xl font-semibold">No systems yet</h2>
        <p className="text-muted-foreground max-w-sm">
          Add your first FedRAMP-authorized system to start tracking its
          continuous monitoring posture.
        </p>
        <a
          href="/systems/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Add system
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Compliance posture across all active systems
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {systems.map((system) => (
          <SystemCard key={system.id} system={system} />
        ))}
      </div>
    </div>
  );
}
