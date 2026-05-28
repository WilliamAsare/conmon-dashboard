"use client";

import { useActionState } from "react";
import { createAssessment, type AssessmentState } from "../actions";
import Link from "next/link";

type SystemOption = { id: string; name: string };

export function NewAssessmentForm({ systems }: { systems: SystemOption[] }) {
  const [state, action, pending] = useActionState<AssessmentState, FormData>(
    createAssessment,
    { status: "idle" }
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/assessments" className="hover:underline">Assessments</Link>
          {" / New"}
        </p>
        <h1 className="text-2xl font-semibold mt-1">Schedule Assessment</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          CA-2: Annual 3PAO assessments and focused reviews are required for FedRAMP authorization maintenance.
        </p>
      </div>

      <form action={action} className="rounded-lg border border-border p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">System *</label>
            <select name="system_id" required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
              <option value="">Select system…</option>
              {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Assessment Type *</label>
            <select name="assessment_type" required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
              <option value="annual">Annual (3PAO)</option>
              <option value="significant_change">Significant Change</option>
              <option value="focused">Focused Assessment</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Assessor / 3PAO Name *</label>
            <input name="assessor_name" required
              placeholder="e.g. Coalfire Systems, Schellman & Company"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Planned Start *</label>
            <input type="date" name="planned_start" required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Planned End *</label>
            <input type="date" name="planned_end" required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
            <textarea name="notes" rows={3}
              placeholder="Scope, objectives, pre-requisites…"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm resize-none" />
          </div>
        </div>

        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={pending}
            className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
            {pending ? "Scheduling…" : "Schedule Assessment"}
          </button>
          <Link href="/assessments"
            className="px-5 py-2 rounded-md border border-border text-sm hover:bg-accent">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
