import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDistanceToNow } from "date-fns";
import { Bell, AlertCircle, Clock, Shield, ScanLine, GitBranch } from "lucide-react";
import type { Database } from "@/types/supabase";
import { markAllRead, markNotificationRead } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

type NotifRow = Pick<
  Database["public"]["Tables"]["notifications"]["Row"],
  "id" | "type" | "title" | "body" | "entity_type" | "entity_id" | "read_at" | "created_at"
>;

const TYPE_CONFIG: Record<
  string,
  { icon: typeof Bell; className: string }
> = {
  sla_overdue:          { icon: AlertCircle, className: "text-destructive" },
  sla_warning:          { icon: Clock,       className: "text-[hsl(var(--severity-moderate))]" },
  deviation_submitted:  { icon: GitBranch,   className: "text-primary" },
  deviation_reviewed:   { icon: Shield,      className: "text-green-600" },
  scan_uploaded:        { icon: ScanLine,    className: "text-primary" },
};

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  if (entityType === "poam_item")         return `/poams/${entityId}`;
  if (entityType === "deviation_request") return `/deviations/${entityId}`;
  if (entityType === "scan")              return `/scans`;
  return null;
}

export default async function NotificationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: notifsRaw } = await supabase
    .from("notifications")
    .select("id, type, title, body, entity_type, entity_id, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const notifications = (notifsRaw as unknown as NotifRow[] | null) ?? [];
  const unreadCount   = notifications.filter((n) => !n.read_at).length;

  // Pre-bind mark-all-read as a form action (takes _formData, returns void)
  const markAllReadAction = markAllRead;

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "All caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <form action={markAllReadAction}>
            <button
              type="submit"
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              Mark all read
            </button>
          </form>
        )}
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <Bell size={32} className="mx-auto text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            SLA alerts and review updates will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map((notif) => {
            const config   = TYPE_CONFIG[notif.type] ?? { icon: Bell, className: "text-muted-foreground" };
            const Icon     = config.icon;
            const href     = entityHref(notif.entity_type, notif.entity_id);
            const isUnread = !notif.read_at;
            const markRead = markNotificationRead.bind(null, notif.id);

            return (
              <div
                key={notif.id}
                className={`flex gap-3 rounded-lg border p-4 transition-colors ${
                  isUnread
                    ? "border-primary/20 bg-primary/5"
                    : "border-border hover:bg-muted/30"
                }`}
              >
                {/* Icon */}
                <div className={`mt-0.5 shrink-0 ${config.className}`}>
                  <Icon size={16} aria-hidden="true" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug ${isUnread ? "font-medium" : ""}`}>
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {notif.title}
                        </Link>
                      ) : (
                        notif.title
                      )}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {notif.body}
                  </p>
                </div>

                {/* Mark read */}
                {isUnread && (
                  <form action={markRead} className="shrink-0">
                    <button
                      type="submit"
                      aria-label="Mark as read"
                      className="mt-0.5 h-2 w-2 rounded-full bg-primary hover:bg-primary/70 transition-colors"
                      title="Mark as read"
                    />
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
