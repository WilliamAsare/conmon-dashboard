"use client";

import { useActionState } from "react";
import { updateOrgName } from "./actions";
import type { OrgActionState } from "./actions";

const initialState: OrgActionState = { status: "idle" };

export function OrgNameForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState(updateOrgName, initialState);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="org-name" className="text-sm font-medium">
          Organization name
        </label>
        <input
          id="org-name"
          name="name"
          type="text"
          required
          defaultValue={currentName}
          maxLength={200}
          className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && (
        <p className="text-sm text-green-600">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
