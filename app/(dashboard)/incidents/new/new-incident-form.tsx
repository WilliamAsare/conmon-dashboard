"use client";

import { useActionState, useEffect, useState } from "react";
import { createIncident, type IncidentState } from "../actions";
import Link from "next/link";

type SystemOption = { id: string; name: string };

export function NewIncidentForm({ systems }: { systems: SystemOption[] }) {
  const [state, action, pending] = useActionState<IncidentState, FormData>(
    createIncident,
    { status: "idle" }
  );

  // Default detected_at to current local datetime
  const [detectedAt, setDetectedAt] = useState("");
  useEffect(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setDetectedAt(local);
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/incidents" className="hover:underline">Incidents</Link>
          {" / New"}
        </p>
        <h1 className="text-2xl font-semibold mt-1">Report Security Incident</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          FedRAMP IR-6 requires reporting to US-CERT/CISA within 1 hour of detection.
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
            <label className="block text-xs font-medium text-muted-foreground mb-1">Severity *</label>
            <select name="severity" required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
              <option value="high">High</option>
              <option value="moderate">Moderate</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
            <input name="title" required
              placeholder="e.g. Unauthorized access attempt on production DB"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Detected At *
              <span className="ml-1 font-normal text-muted-foreground">(local time)</span>
            </label>
            <input
              type="datetime-local"
              name="detected_at"
              required
              value={detectedAt}
              onChange={(e) => setDetectedAt(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Affected Controls
              <span className="ml-1 font-normal">(comma-separated, e.g. IR-6, AC-2)</span>
            </label>
            <input name="affected_controls" placeholder="IR-6, AC-2, SI-4"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm font-mono" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description *</label>
            <textarea name="description" required rows={4}
              placeholder="Describe the incident: what happened, what was affected, initial triage…"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm resize-none" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
            <textarea name="notes" rows={2}
              placeholder="Additional notes, response actions taken…"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm resize-none" />
          </div>
        </div>

        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={pending}
            className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
            {pending ? "Reporting…" : "Report Incident"}
          </button>
          <Link href="/incidents"
            className="px-5 py-2 rounded-md border border-border text-sm hover:bg-accent">
            Cancel
          </Link>
        </div>
      </form>

      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm">
        <p className="font-semibold text-amber-800 dark:text-amber-200">FedRAMP IR-6 Reminder</p>
        <p className="text-amber-700 dark:text-amber-300 mt-1">
          High and moderate severity incidents must be reported to US-CERT/CISA within{" "}
          <strong>1 hour</strong> of detection. The SLA timer starts at the detected time above.
          Submitting this form records the report timestamp automatically.
        </p>
      </div>
    </div>
  );
}
