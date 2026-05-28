"use client";

import { useActionState } from "react";
import { generateReport, type GenerateReportState } from "./actions";

interface GenerateReportFormProps {
  systems: { id: string; name: string }[];
  defaultStart: string;
  defaultEnd:   string;
}

export function GenerateReportForm({
  systems,
  defaultStart,
  defaultEnd,
}: GenerateReportFormProps) {
  const [state, formAction, isPending] = useActionState<GenerateReportState, FormData>(
    generateReport,
    { status: "idle" }
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.message}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        {/* System */}
        <div className="space-y-1.5">
          <label htmlFor="system_id" className="text-sm font-medium">
            System <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <select
            id="system_id"
            name="system_id"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {systems.length === 1 ? null : (
              <option value="">Choose a system…</option>
            )}
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Period start */}
        <div className="space-y-1.5">
          <label htmlFor="reporting_period_start" className="text-sm font-medium">
            Period start <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            type="date"
            id="reporting_period_start"
            name="reporting_period_start"
            required
            defaultValue={defaultStart}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* Period end */}
        <div className="space-y-1.5">
          <label htmlFor="reporting_period_end" className="text-sm font-medium">
            Period end <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            type="date"
            id="reporting_period_end"
            name="reporting_period_end"
            required
            defaultValue={defaultEnd}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The report reflects the current state of POA&amp;Ms and scan coverage.
        Your browser will download the PDF once generation is complete.
      </p>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Generating PDF…" : "Generate report"}
      </button>
    </form>
  );
}
