/**
 * /admin/organizations — All organizations with per-org stats.
 */

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import type { Database } from "@/types/supabase";

type OrgRow = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  "id" | "name" | "status" | "created_at"
>;

type UserCount  = { organization_id: string };
type SystemRow  = { id: string; organization_id: string };

export default async function AdminOrganizationsPage() {
  const svc = createServiceClient();

  const [
    { data: orgsRaw },
    { data: userCountsRaw },
    { data: systemsRaw },
  ] = await Promise.all([
    svc
      .from("organizations")
      .select("id, name, status, created_at")
      .order("created_at", { ascending: false }),
    svc.from("users").select("organization_id"),
    svc.from("systems").select("id, organization_id"),
  ]);

  const orgs    = (orgsRaw        as unknown as OrgRow[]     | null) ?? [];
  const users   = (userCountsRaw  as unknown as UserCount[]  | null) ?? [];
  const systems = (systemsRaw     as unknown as SystemRow[]  | null) ?? [];

  // Build lookup maps
  const usersByOrg   = new Map<string, number>();
  const systemsByOrg = new Map<string, number>();

  for (const u of users) {
    usersByOrg.set(u.organization_id, (usersByOrg.get(u.organization_id) ?? 0) + 1);
  }
  for (const s of systems) {
    systemsByOrg.set(s.organization_id, (systemsByOrg.get(s.organization_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Organizations</h1>
        <p className="text-sm mt-1" style={{ color: "#A5B4C8" }}>
          {orgs.length} total organization{orgs.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "rgba(165,180,200,.2)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(30,58,95,.6)" }}>
              {["Organization", "Status", "Users", "Systems", "Created", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest"
                  style={{ color: "#A5B4C8" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orgs.map((org, i) => (
              <tr
                key={org.id}
                style={{
                  borderTop: "1px solid rgba(165,180,200,.15)",
                  background: i % 2 === 1 ? "rgba(255,255,255,.02)" : undefined,
                }}
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/organizations/${org.id}`}
                    className="font-medium text-white hover:underline"
                  >
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="text-xs font-bold uppercase"
                    style={{ color: org.status === "active" ? "#2E7D32" : "#CC0000" }}
                  >
                    {org.status}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: "#A5B4C8" }}>
                  {usersByOrg.get(org.id) ?? 0}
                </td>
                <td className="px-4 py-3" style={{ color: "#A5B4C8" }}>
                  {systemsByOrg.get(org.id) ?? 0}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "#A5B4C8" }}>
                  {format(new Date(org.created_at), "MMM d, yyyy")}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/organizations/${org.id}`}
                    className="text-xs hover:underline"
                    style={{ color: "#2B5EA7" }}
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "#6B7280" }}>
                  No organizations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
