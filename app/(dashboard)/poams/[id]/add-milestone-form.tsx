"use client";

import { useActionState, useRef } from "react";
import { addMilestone, type AddMilestoneState } from "./actions";
import { PlusCircle } from "lucide-react";

export function AddMilestoneForm({ poamId }: { poamId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  // Bind poamId so the action signature matches (prevState, formData) => State
  const boundAction = addMilestone.bind(null, poamId);
  const [state, formAction, isPending] = useActionState<AddMilestoneState, FormData>(
    boundAction,
    { status: "idle" }
  );

  // Clear form after successful add
  if (state.status === "success" && formRef.current) {
    formRef.current.reset();
  }

  return (
    <form ref={formRef} action={formAction} className="mt-3">
      {state.status === "error" && (
        <p className="text-xs text-destructive mb-2">{state.message}</p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          name="description"
          placeholder="Milestone description…"
          required
          maxLength={500}
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          type="date"
          name="target_date"
          required
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <PlusCircle size={13} aria-hidden="true" />
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
