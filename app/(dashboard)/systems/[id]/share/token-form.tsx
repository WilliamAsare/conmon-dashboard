"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createShareToken, type CreateTokenState } from "./actions";

export function CreateTokenForm({ systemId }: { systemId: string }) {
  const [state, action, pending] = useActionState<CreateTokenState, FormData>(
    createShareToken,
    { status: "idle" }
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      setRevealed(state.token);
      formRef.current?.reset();
    }
  }, [state]);

  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "";

  return (
    <div className="space-y-4">
      {/* New token revealed */}
      {revealed && (
        <div className="rounded-lg border border-green-600/40 bg-green-600/10 p-4 space-y-2">
          <p className="text-sm font-medium text-green-400">Token created — copy it now. It won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-black/30 rounded px-3 py-2 text-green-300 break-all">
              {appUrl}/portal/{revealed}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(`${appUrl}/portal/${revealed}`);
              }}
              className="shrink-0 text-xs px-3 py-2 rounded border border-green-600/40 text-green-400 hover:bg-green-600/10"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRevealed(null)}
            className="text-xs text-muted-foreground hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <form ref={formRef} action={action} className="space-y-3">
        <input type="hidden" name="system_id" value={systemId} />

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Label
          </label>
          <input
            name="label"
            type="text"
            placeholder="e.g. Agency Sponsor Review"
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Expires
          </label>
          <select
            name="expires_in"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="30">30 days</option>
            <option value="90" defaultValue="90">90 days</option>
            <option value="365">1 year</option>
            <option value="never">Never</option>
          </select>
        </div>

        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create Share Link"}
        </button>
      </form>
    </div>
  );
}
