import { Metadata } from "next";

export const metadata: Metadata = { title: "Notifications" };

// Phase 4: in-app notification center.
export default function NotificationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <p className="text-muted-foreground text-sm">Coming in Phase 4.</p>
    </div>
  );
}
