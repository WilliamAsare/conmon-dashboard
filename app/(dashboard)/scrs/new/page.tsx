"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createScr, type ScrFormState } from "./actions";

const CHANGE_TYPES = [
  "Hardware",
  "Software",
  "Firmware",
  "Network",
  "Configuration",
  "Operational Procedure",
  "Other",
];

export default function NewScrPage() {
  const [state, action, pending] = useActionState<ScrFormState, FormData>(
    createScr,
    { status: "idle" }
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/scrs" className="hover:underline">SCRs</Link> / New
        </p>
        <h1 className="text-2xl font-semibold mt-1">New Significant Change Request</h1>
      </div>

      <form action={action} className="space-y-4 rounded-lg border border-border p-5">
        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            System <span className="text-destructive">*</span>
          </label>
          <input
            name="system_id"
            type="text"
            placeholder="System UUID"
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Paste the system ID from the Systems page.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Title <span className="text-destructive">*</span>
          </label>
          <input
            name="title"
            type="text"
            placeholder="Brief title of the change"
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Change Type <span className="text-destructive">*</span>
          </label>
          <select
            name="change_type"
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Select type…</option>
            {CHANGE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Description <span className="text-destructive">*</span>
          </label>
          <textarea
            name="description"
            rows={5}
            required
            placeholder="Describe the change, its purpose, and impact on the system boundary…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            NIST 800-53 Controls Impacted
          </label>
          <input
            name="controls_impacted"
            type="text"
            placeholder="e.g. CM-3, CM-6, SA-10"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Comma-separated control IDs.</p>
        </div>

        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="px-5 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create SCR"}
          </button>
          <Link
            href="/scrs"
            className="px-5 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
