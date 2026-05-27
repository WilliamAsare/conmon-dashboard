import { Metadata } from "next";

export const metadata: Metadata = { title: "Systems" };

// Phase 2: full systems list with add/edit flows.
export default function SystemsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Systems</h1>
      <p className="text-muted-foreground text-sm">Coming in Phase 2.</p>
    </div>
  );
}
