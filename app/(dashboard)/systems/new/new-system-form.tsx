"use client";

import { useActionState } from "react";
import { createSystem } from "./actions";
import type { NewSystemState } from "./actions";

const initial: NewSystemState = { status: "idle" };

export function NewSystemForm() {
  const [state, action, pending] = useActionState(createSystem, initial);

  return (
    <form action={action} className="space-y-5">
      {/* System name */}
      <Field id="name" label="System name" required>
        <input
          id="name" name="name" type="text" required
          placeholder="Acme SaaS Platform"
          className={inputClass}
        />
      </Field>

      {/* Short code */}
      <Field
        id="short_code"
        label="Short code"
        hint="2-10 uppercase letters and digits. Used in POA&M numbers: V-ACME-0001"
        required
      >
        <input
          id="short_code" name="short_code" type="text" required
          placeholder="ACME"
          maxLength={10}
          className={`${inputClass} uppercase`}
          onInput={(e) => {
            const el = e.currentTarget;
            el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
          }}
        />
      </Field>

      {/* FedRAMP level */}
      <Field id="fedramp_level" label="FedRAMP impact level" required>
        <select id="fedramp_level" name="fedramp_level" required className={inputClass}>
          <option value="">Select level</option>
          <option value="Low">Low</option>
          <option value="Moderate">Moderate</option>
          <option value="High">High</option>
        </select>
      </Field>

      {/* Authorization date */}
      <Field id="authorization_date" label="Authorization date">
        <input
          id="authorization_date" name="authorization_date" type="date"
          className={inputClass}
        />
      </Field>

      {/* ATO expiration */}
      <Field id="ato_expiration" label="ATO expiration date">
        <input
          id="ato_expiration" name="ato_expiration" type="date"
          className={inputClass}
        />
      </Field>

      {/* Agency sponsor */}
      <Field id="agency_sponsor" label="Agency sponsor">
        <input
          id="agency_sponsor" name="agency_sponsor" type="text"
          placeholder="Department of Commerce"
          className={inputClass}
        />
      </Field>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? "Creating..." : "Create system"}
        </button>
        <a
          href="/systems"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({
  id, label, hint, required, children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
