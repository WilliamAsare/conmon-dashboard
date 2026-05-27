import Link from "next/link";
import { differenceInDays } from "date-fns";
import { AlertTriangle, CheckCircle, Clock, AlertCircle } from "lucide-react";
import type { getSlaStatus } from "@/lib/fedramp/sla";

type SlaStatus = ReturnType<typeof getSlaStatus>;

type SystemCardProps = {
  system: {
    id: string;
    name: string;
    short_code: string;
    fedramp_level: string;
    ato_expiration: string | null;
    agency_sponsor: string | null;
    scans: Array<{ scan_type: string; scan_date: string }>;
    poam_items: Array<{
      id: string;
      severity: string;
      status: string;
      sla_status: SlaStatus | null;
      scheduled_completion: string;
    }>;
  };
};

export function SystemCard({ system }: SystemCardProps) {
  const today = new Date();

  const daysUntilAto = system.ato_expiration
    ? differenceInDays(new Date(system.ato_expiration), today)
    : null;

  const openPoams = system.poam_items.filter(
    (p) => p.status === "open" || p.status === "ongoing"
  );

  const counts = {
    high: openPoams.filter((p) => p.severity === "high").length,
    moderate: openPoams.filter((p) => p.severity === "moderate").length,
    low: openPoams.filter((p) => p.severity === "low").length,
  };

  const atRisk = openPoams.filter((p) => p.sla_status === "warning").length;
  const overdue = openPoams.filter((p) => p.sla_status === "overdue").length;

  // Most recent scan date per type.
  const latestScans = system.scans.reduce<Record<string, string>>(
    (acc, scan) => {
      const existing = acc[scan.scan_type];
      if (!existing || scan.scan_date > existing) {
        acc[scan.scan_type] = scan.scan_date;
      }
      return acc;
    },
    {}
  );

  const staleThreshold = 30;
  const staleScanTypes = (["os", "webapp", "database"] as const).filter(
    (type) => {
      const latest = latestScans[type];
      if (!latest) return true;
      return differenceInDays(today, new Date(latest)) > staleThreshold;
    }
  );

  return (
    <Link
      href={`/systems/${system.id}`}
      className="block rounded-lg border border-border bg-card p-5 hover:border-primary/50 transition-colors space-y-4"
      aria-label={`${system.name} system status`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold leading-tight">{system.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {system.fedramp_level} &middot; {system.short_code}
          </p>
        </div>
        {daysUntilAto !== null && (
          <AtoCountdown days={daysUntilAto} />
        )}
      </div>

      {/* POA&M summary */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          Open POA&Ms
        </p>
        <div className="flex gap-3">
          <SeverityBadge label="High" count={counts.high} severity="high" />
          <SeverityBadge label="Mod" count={counts.moderate} severity="moderate" />
          <SeverityBadge label="Low" count={counts.low} severity="low" />
        </div>
      </div>

      {/* At-risk / overdue */}
      {(atRisk > 0 || overdue > 0) && (
        <div className="flex gap-3 text-xs">
          {overdue > 0 && (
            <span className="flex items-center gap-1 text-destructive font-medium">
              <AlertCircle size={13} aria-hidden="true" />
              {overdue} overdue
            </span>
          )}
          {atRisk > 0 && (
            <span className="flex items-center gap-1 text-[hsl(var(--severity-moderate))] font-medium">
              <AlertTriangle size={13} aria-hidden="true" />
              {atRisk} at risk
            </span>
          )}
        </div>
      )}

      {/* Scan staleness */}
      {staleScanTypes.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <Clock size={13} aria-hidden="true" />
          <span>
            Stale scans: {staleScanTypes.join(", ")}
          </span>
        </div>
      )}
    </Link>
  );
}

function AtoCountdown({ days }: { days: number }) {
  const isExpired = days < 0;
  const isWarning = days >= 0 && days <= 90;

  const colorClass = isExpired
    ? "text-destructive"
    : isWarning
    ? "text-[hsl(var(--severity-moderate))]"
    : "text-muted-foreground";

  const Icon = isExpired ? AlertCircle : isWarning ? AlertTriangle : CheckCircle;

  return (
    <div className={`flex flex-col items-end text-right shrink-0 ${colorClass}`}>
      <span className="flex items-center gap-1 text-xs font-medium">
        <Icon size={12} aria-hidden="true" />
        ATO
      </span>
      <span className="text-xs">
        {isExpired ? `Expired ${Math.abs(days)}d ago` : `${days}d`}
      </span>
    </div>
  );
}

function SeverityBadge({
  label,
  count,
  severity,
}: {
  label: string;
  count: number;
  severity: "high" | "moderate" | "low";
}) {
  const colorClass = {
    high: "bg-destructive/10 text-destructive",
    moderate: "bg-[hsl(var(--severity-moderate))]/10 text-[hsl(var(--severity-moderate))]",
    low: "bg-[hsl(var(--severity-low))]/10 text-[hsl(var(--severity-low))]",
  }[severity];

  return (
    <div
      className={`flex flex-col items-center rounded px-2 py-1 min-w-[3rem] ${colorClass}`}
      aria-label={`${count} ${label} severity POA&Ms`}
    >
      <span className="text-base font-bold leading-tight">{count}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  );
}
