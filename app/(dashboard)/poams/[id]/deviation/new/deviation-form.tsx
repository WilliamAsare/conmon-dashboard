"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { submitDeviationRequest, type DeviationState } from "./actions";
import {
  DEVIATION_LABEL,
  DEVIATION_DESCRIPTION,
} from "@/lib/fedramp/deviations";

interface DeviationFormProps {
  poamId:   string;
  severity: string;
}

type DeviationType = "RA" | "FP" | "OR";

const TYPES: DeviationType[] = ["RA", "FP", "OR"];

export function DeviationForm({ poamId, severity }: DeviationFormProps) {
  const [selectedType, setSelectedType] = useState<DeviationType | null>(null);

  const boundAction = submitDeviationRequest.bind(null, poamId);
  const [state, formAction, isPending] = useActionState<DeviationState, FormData>(
    boundAction,
    { status: "idle" }
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.status === "error" && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.message}
        </div>
      )}

      {/* Deviation type selection */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          Deviation type <span className="text-destructive" aria-hidden="true">*</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES.map((type) => (
            <label
              key={type}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                selectedType === type
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <input
                type="radio"
                name="deviation_type"
                value={type}
                required
                checked={selectedType === type}
                onChange={() => setSelectedType(type)}
                className="sr-only"
              />
              <span className="text-sm font-medium">
                {type} — {DEVIATION_LABEL[type]}
              </span>
              <span className="text-xs text-muted-foreground">
                {DEVIATION_DESCRIPTION[type]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* RA fields */}
      {selectedType === "RA" && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">Risk Adjustment justification</h3>
          <Textarea
            id="operational_context"
            name="operational_context"
            label="Operational context"
            required
            hint={`Explain why the operational context reduces actual risk below the CVSS ${severity} score.`}
            minLength={50}
            maxLength={2000}
          />
          <Textarea
            id="compensating_controls"
            name="compensating_controls"
            label="Compensating controls"
            required
            hint="Describe the compensating controls that mitigate this risk."
            minLength={50}
            maxLength={2000}
          />
          <Textarea
            id="residual_risk_statement"
            name="residual_risk_statement"
            label="Residual risk statement"
            required
            hint="State the residual risk that remains after compensating controls."
            minLength={20}
            maxLength={1000}
            rows={3}
          />
        </div>
      )}

      {/* FP fields */}
      {selectedType === "FP" && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">False Positive justification</h3>
          <Textarea
            id="technical_justification"
            name="technical_justification"
            label="Technical justification"
            required
            hint="Explain why the scanner finding does not apply to this asset."
            minLength={50}
            maxLength={2000}
          />
          <div className="space-y-1.5">
            <label htmlFor="evidence_description" className="text-sm font-medium">
              Evidence description <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              type="text"
              id="evidence_description"
              name="evidence_description"
              required
              minLength={10}
              maxLength={500}
              placeholder="e.g. Screenshot of patched package version, configuration export"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Evidence file uploads are managed by your ISSO after submission.
            </p>
          </div>
        </div>
      )}

      {/* OR fields */}
      {selectedType === "OR" && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">Operational Requirement justification</h3>
          <Textarea
            id="business_justification"
            name="business_justification"
            label="Business justification"
            required
            hint="Explain why remediation cannot occur — mission or business necessity."
            minLength={50}
            maxLength={2000}
          />
          <Textarea
            id="impact_if_remediated"
            name="impact_if_remediated"
            label="Impact if remediated"
            required
            hint="What would break or be disrupted if this vulnerability were patched?"
            minLength={20}
            maxLength={1000}
            rows={3}
          />
          <Textarea
            id="compensating_controls"
            name="compensating_controls"
            label="Compensating controls"
            required
            hint="Describe the compensating controls in place while the deviation is active."
            minLength={50}
            maxLength={2000}
          />
          <div className="space-y-1.5">
            <label htmlFor="expected_resolution_date" className="text-sm font-medium">
              Expected resolution date
              <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
            </label>
            <input
              type="date"
              id="expected_resolution_date"
              name="expected_resolution_date"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Target date for resolving the operational requirement, if known.
            </p>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending || !selectedType}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Submitting…" : "Submit request"}
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

// ---------------------------------------------------------------------------
// Internal textarea helper
// ---------------------------------------------------------------------------
function Textarea({
  id,
  name,
  label,
  required,
  hint,
  rows = 4,
  minLength,
  maxLength,
}: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  rows?: number;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <textarea
        id={id}
        name={name}
        required={required}
        rows={rows}
        minLength={minLength}
        maxLength={maxLength}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
      />
    </div>
  );
}
