"use client";

import { useActionState } from "react";
import { inviteUser } from "./actions";
import type { TeamActionState } from "./actions";

const initialState: TeamActionState = { status: "idle" };

const ROLES = [
  { value: "isso",     label: "ISSO" },
  { value: "issm",     label: "ISSM" },
  { value: "engineer", label: "Engineer" },
  { value: "auditor",  label: "Auditor" },
  { value: "admin",    label: "Admin" },
];

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteUser, initialState);

  return (
    <form action={action} className="flex flex-col sm:flex-row gap-2">
      <input
        name="email"
        type="email"
        required
        placeholder="colleague@company.com"
        className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <select
        name="role"
        defaultValue="isso"
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? "Sending…" : "Send invite"}
      </button>

      {state.status === "error" && (
        <p className="text-xs text-destructive sm:col-span-3 mt-1">{state.message}</p>
      )}
      {state.status === "success" && (
        <p className="text-xs text-green-600 sm:col-span-3 mt-1">{state.message}</p>
      )}
    </form>
  );
}
