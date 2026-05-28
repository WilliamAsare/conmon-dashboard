"use client";

import { useActionState, useState } from "react";
import { reviewDeviationRequest, type ReviewState } from "./actions";
import { CheckCircle, XCircle } from "lucide-react";

interface ReviewFormProps {
  deviationId: string;
  canReview:   boolean; // false when already reviewed or user lacks permission
}

export function ReviewForm({ deviationId, canReview }: ReviewFormProps) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");

  const boundAction = reviewDeviationRequest.bind(null, deviationId);
  const [state, formAction, isPending] = useActionState<ReviewState, FormData>(
    boundAction,
    { status: "idle" }
  );

  if (!canReview) return null;

  return (
    <div className="space-y-4 rounded-lg border border-border p-5">
      <h3 className="text-sm font-semibold">Review this request</h3>

      {state.status === "error" && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.message}
        </div>
      )}

      {mode === "idle" && (
        <div className="flex gap-3">
          <button
            onClick={() => setMode("approve")}
            className="flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <CheckCircle size={14} aria-hidden="true" />
            Approve
          </button>
          <button
            onClick={() => setMode("reject")}
            className="flex items-center gap-1.5 rounded-md border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
          >
            <XCircle size={14} aria-hidden="true" />
            Reject
          </button>
        </div>
      )}

      {(mode === "approve" || mode === "reject") && (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="action" value={mode} />

          <div className="space-y-1.5">
            <label htmlFor="review_notes" className="text-sm font-medium">
              Review notes
              {mode === "reject" && (
                <span className="text-destructive ml-1" aria-hidden="true">*</span>
              )}
              {mode === "approve" && (
                <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
              )}
            </label>
            <textarea
              id="review_notes"
              name="review_notes"
              rows={3}
              required={mode === "reject"}
              maxLength={2000}
              placeholder={
                mode === "reject"
                  ? "Explain why this request is being rejected…"
                  : "Any notes for the submitter (optional)…"
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isPending}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors ${
                mode === "approve"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-destructive hover:bg-destructive/90"
              }`}
            >
              {isPending
                ? "Saving…"
                : mode === "approve"
                ? "Confirm approval"
                : "Confirm rejection"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
