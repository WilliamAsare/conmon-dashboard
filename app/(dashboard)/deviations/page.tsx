import { Metadata } from "next";

export const metadata: Metadata = { title: "Deviation Requests" };

// Phase 3: deviation request form and reviewer queue.
export default function DeviationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Deviation Requests</h1>
      <p className="text-muted-foreground text-sm">Coming in Phase 3.</p>
    </div>
  );
}
