"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePoamDetails, type UpdatePoamState } from "../actions";

interface EditPoamFormProps {
  poamId: string;
  defaultValues: {
    weakness_description: string;
    point_of_contact:     string;
    resources_required:   string;
    scheduled_completion: string;
  };
}

export function EditPoamForm({ poamId, defaultValues }: EditPoamFormProps) {
  // Bind poamId so signature matches (prevState, formData) => State
  const boundAction = updatePoamDetails.bind(null, poamId);
  const [state, formAction, isPending] = useActionState<UpdatePoamState, FormData>(
    boundAction,
    { status: "idle" }
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.message}
        </div>
      )}

      {/* Weakness description */}
      <div className="space-y-1.5">
        <label htmlFor="weakness_description" className="text-sm font-medium">
          Weakness description <span className="text-destructive" aria-hidden="true">*</span>
        </label>
        <textarea
          id="weakness_description"
          name="weakness_description"
          required
          rows={4}
          maxLength={2000}
          defaultValue={defaultValues.weakness_description}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>

      {/* Point of contact */}
      <div className="space-y-1.5">
        <label htmlFor="point_of_contact" className="text-sm font-medium">
          Point of contact
        </label>
        <input
          type="text"
          id="point_of_contact"
          name="point_of_contact"
          maxLength={200}
          defaultValue={defaultValues.point_of_contact}
          placeholder="e.g. Jane Smith, Security Team"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Resources required */}
      <div className="space-y-1.5">
        <label htmlFor="resources_required" className="text-sm font-medium">
          Resources required
        </label>
        <textarea
          id="resources_required"
          name="resources_required"
          rows={3}
          maxLength={1000}
          defaultValue={defaultValues.resources_required}
          placeholder="e.g. 8 developer hours, system downtime window"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>

      {/* Scheduled completion */}
      <div className="space-y-1.5">
        <label htmlFor="scheduled_completion" className="text-sm font-medium">
          Scheduled completion <span className="text-destructive" aria-hidden="true">*</span>
        </label>
        <input
          type="date"
          id="scheduled_completion"
          name="scheduled_completion"
          required
          defaultValue={defaultValues.scheduled_completion}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Extending past the SLA deadline requires an approved deviation.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <Link
          href={`/poams/${poamId}`}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
