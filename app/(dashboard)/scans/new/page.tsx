import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";
import type { Database } from "@/types/supabase";

export const metadata: Metadata = { title: "Upload Scan" };

// Local row types.
// `as unknown as` casts required because placeholder types/supabase.ts lacks
// Relationships needed for Supabase select-string type inference.
type UserProfile = Pick<Database["public"]["Tables"]["users"]["Row"], "organization_id">;
type SystemRow = Pick<Database["public"]["Tables"]["systems"]["Row"], "id" | "name">;

export default async function NewScanPage(
  { searchParams }: { searchParams: Promise<{ system?: string }> }
) {
  const { system: systemId } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: profileRaw } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserProfile | null;
  if (!profile) return notFound();

  // If a system was pre-selected, validate it exists in this org
  let preselectedSystem: SystemRow | null = null;
  if (systemId) {
    const { data } = await supabase
      .from("systems")
      .select("id, name")
      .eq("id", systemId)
      .eq("organization_id", profile.organization_id)
      .single();
    preselectedSystem = (data as unknown as SystemRow | null) ?? null;
  }

  // If a system ID was provided but invalid/unauthorized, 404
  if (systemId && !preselectedSystem) return notFound();

  // If no system was pre-selected, fetch the list for the org
  let systems: SystemRow[] = [];
  if (!preselectedSystem) {
    const { data } = await supabase
      .from("systems")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .eq("status", "active")
      .order("name");
    systems = (data as unknown as SystemRow[] | null) ?? [];
  }

  // If there's exactly one system and none pre-selected, auto-pick it
  const resolvedSystem = preselectedSystem ?? (systems.length === 1 ? systems[0]! : null);

  return (
    <div className="space-y-6 max-w-xl">
      {/* Breadcrumb */}
      <div>
        <p className="text-sm text-muted-foreground">
          {resolvedSystem ? (
            <>
              <Link href="/systems" className="hover:underline">Systems</Link>
              {" / "}
              <Link href={`/systems/${resolvedSystem.id}`} className="hover:underline">
                {resolvedSystem.name}
              </Link>
              {" / "}
            </>
          ) : (
            <>
              <Link href="/scans" className="hover:underline">Scans</Link>
              {" / "}
            </>
          )}
        </p>
        <h1 className="text-2xl font-semibold mt-1">Upload Scan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ingest a Nessus or Qualys VMDR export to update findings and POA&amp;Ms.
        </p>
      </div>

      {resolvedSystem ? (
        <UploadForm systemId={resolvedSystem.id} systemName={resolvedSystem.name} />
      ) : (
        <SystemPickerForm systems={systems} />
      )}
    </div>
  );
}

/**
 * When no system is pre-selected and there are multiple systems,
 * show a simple picker that reloads the page with ?system=<id>.
 */
function SystemPickerForm({ systems }: { systems: SystemRow[] }) {
  if (systems.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        No active systems found.{" "}
        <Link href="/systems/new" className="text-primary hover:underline">
          Create a system
        </Link>{" "}
        before uploading a scan.
      </div>
    );
  }

  return (
    <form method="GET" className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="system" className="text-sm font-medium">
          Select system <span className="text-destructive" aria-hidden="true">*</span>
        </label>
        <select
          id="system"
          name="system"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Choose a system…</option>
          {systems.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Continue
      </button>
    </form>
  );
}
