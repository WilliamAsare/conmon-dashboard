/**
 * /inventory — Hardware and software inventory.
 * FedRAMP CM-8 requirement: maintain an inventory of system components.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { AddInventoryForm } from "./add-form";
import { deleteInventoryItem } from "./actions";
import type { Database } from "@/types/supabase";

type ItemRow = Pick<
  Database["public"]["Tables"]["inventory_items"]["Row"],
  "id" | "item_type" | "name" | "vendor" | "version" | "asset_tag" | "ip_address" | "status" | "created_at"
> & { systems: { name: string } | null };

type SystemOption = { id: string; name: string };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type: typeFilter } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  const role = (profileRaw as unknown as { role: string } | null)?.role ?? "";

  let query = supabase
    .from("inventory_items")
    .select("id, item_type, name, vendor, version, asset_tag, ip_address, status, created_at, systems(name)")
    .order("item_type")
    .order("name");

  if (typeFilter === "hardware" || typeFilter === "software") {
    query = query.eq("item_type", typeFilter);
  }

  const [{ data: itemsRaw }, { data: systemsRaw }] = await Promise.all([
    query,
    supabase.from("systems").select("id, name").order("name"),
  ]);

  const items   = (itemsRaw   as unknown as ItemRow[]       | null) ?? [];
  const systems = (systemsRaw as unknown as SystemOption[]  | null) ?? [];

  const canEdit = ["admin", "issm", "isso", "engineer"].includes(role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hardware and software components — CM-8 compliance.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {[
            { label: "All",      value: "" },
            { label: "Hardware", value: "hardware" },
            { label: "Software", value: "software" },
          ].map(({ label, value }) => (
            <a
              key={label}
              href={value ? `/inventory?type=${value}` : "/inventory"}
              className={`px-3 py-1.5 rounded-full border transition-colors ${
                (typeFilter ?? "") === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {canEdit && <AddInventoryForm systems={systems} />}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Type", "Name", "Vendor / Version", "System", "Asset Tag / IP", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-bold uppercase ${item.item_type === "hardware" ? "text-blue-600" : "text-purple-600"}`}>
                    {item.item_type}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium">{item.name}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {[item.vendor, item.version].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.systems?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                  {item.asset_tag ?? item.ip_address ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold capitalize ${
                    item.status === "active" ? "text-green-600" :
                    item.status === "inactive" ? "text-yellow-600" : "text-muted-foreground"
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {canEdit && (
                    <form action={deleteInventoryItem}>
                      <input type="hidden" name="item_id" value={item.id} />
                      <button type="submit" className="text-xs text-destructive hover:underline">Remove</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No inventory items yet. Add hardware and software components above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
