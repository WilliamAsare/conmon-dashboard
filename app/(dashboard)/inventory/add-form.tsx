"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { createInventoryItem, type InventoryState } from "./actions";

type SystemOption = { id: string; name: string };

export function AddInventoryForm({ systems }: { systems: SystemOption[] }) {
  const [state, action, pending] = useActionState<InventoryState, FormData>(
    createInventoryItem,
    { status: "idle" }
  );
  const [type, setType] = useState<"hardware" | "software">("hardware");
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.status === "idle" && !pending) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state, pending]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-4 py-2 rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        + Add inventory item
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="rounded-lg border border-border p-5 space-y-3 bg-muted/20">
      <h2 className="text-sm font-semibold">Add Inventory Item</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">System *</label>
          <select name="system_id" required className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
            <option value="">Select…</option>
            {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Type *</label>
          <select
            name="item_type"
            required
            value={type}
            onChange={(e) => setType(e.target.value as "hardware" | "software")}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="hardware">Hardware</option>
            <option value="software">Software</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
          <input name="name" required placeholder="e.g. Apache HTTP Server" className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Vendor</label>
          <input name="vendor" placeholder="e.g. Apache" className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Version</label>
          <input name="version" placeholder="e.g. 2.4.57" className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
        </div>

        {type === "hardware" ? (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Asset Tag</label>
              <input name="asset_tag" className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">IP Address</label>
              <input name="ip_address" placeholder="10.0.0.1" className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">CPE</label>
            <input name="cpe" placeholder="cpe:2.3:a:apache:http_server:2.4.57:*:*:*:*:*:*:*" className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm font-mono text-xs" />
          </div>
        )}
      </div>

      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50">
          {pending ? "Adding…" : "Add Item"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 py-1.5 text-sm rounded-md border border-border hover:bg-accent">
          Cancel
        </button>
      </div>
    </form>
  );
}
