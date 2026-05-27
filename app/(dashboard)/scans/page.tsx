import { Metadata } from "next";

export const metadata: Metadata = { title: "Scans" };

// Phase 2: scan upload and findings list.
export default function ScansPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Scans</h1>
      <p className="text-muted-foreground text-sm">Coming in Phase 2.</p>
    </div>
  );
}
