import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { Upload, ScanLine } from "lucide-react";

export const metadata: Metadata = { title: "Scans" };

export default async function ScansPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  // Fetch scans for all systems in this org
  const { data: scans } = await supabase
    .from("scans")
    .select(`
      id, scan_type, scanner_name, scan_date, total_findings, created_at,
      systems ( id, name, short_code )
    `)
    .order("scan_date", { ascending: false })
    .limit(100);

  // Safe cast — supabase types lack nested relationship inference in placeholder types
  type ScanRow = {
    id: string;
    scan_type: string;
    scanner_name: string;
    scan_date: string;
    total_findings: number;
    created_at: string;
    systems: { id: string; name: string; short_code: string } | null;
  };

  const rows = (scans ?? []) as unknown as ScanRow[];

  const SCAN_TYPE_LABEL: Record<string, string> = {
    os: "OS / Host",
    webapp: "Web Application",
    database: "Database",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All vulnerability scan uploads across your systems.
          </p>
        </div>
        <Link
          href="/scans/new"
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Upload size={15} aria-hidden="true" />
          Upload scan
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <ScanLine size={32} className="mx-auto text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm font-medium">No scans uploaded yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a Nessus or Qualys VMDR export to get started.
          </p>
          <Link
            href="/scans/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Upload size={14} aria-hidden="true" />
            Upload first scan
          </Link>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium">System</th>
                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                <th className="text-left px-4 py-2.5 font-medium">Scanner</th>
                <th className="text-left px-4 py-2.5 font-medium">Scan date</th>
                <th className="text-right px-4 py-2.5 font-medium">Findings</th>
                <th className="text-left px-4 py-2.5 font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(scan => (
                <tr key={scan.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    {scan.systems ? (
                      <Link
                        href={`/systems/${scan.systems.id}`}
                        className="font-medium hover:underline"
                      >
                        {scan.systems.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {SCAN_TYPE_LABEL[scan.scan_type] ?? scan.scan_type}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{scan.scanner_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {format(new Date(scan.scan_date), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{scan.total_findings}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {format(new Date(scan.created_at), "MMM d, yyyy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
